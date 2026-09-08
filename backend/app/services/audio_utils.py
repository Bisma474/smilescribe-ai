# =============================================================================
# audio_utils.py — Audio validation and preprocessing (no ffmpeg required)
#
# Uses Python's built-in `wave` module for WAV inspection and
# `torchaudio` for resampling — no ffmpeg / ffprobe needed.
# =============================================================================

import os
import wave
import logging
import numpy as np
import torch
import torchaudio

logger = logging.getLogger(__name__)

SUPPORTED_FORMATS = {".wav", ".mp3", ".m4a", ".flac", ".ogg"}
TARGET_SAMPLE_RATE = 16_000   # Hz — optimal for Whisper
TARGET_CHANNELS    = 1        # mono


# ── Validation ────────────────────────────────────────────────────────────────

def validate_audio_file(path: str) -> None:
    """Raise informative errors for missing or unsupported audio files."""
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Audio file not found: '{path}'\n"
            f"Make sure it is in: {os.path.abspath('.')}"
        )
    ext = os.path.splitext(path)[1].lower()
    if ext not in SUPPORTED_FORMATS:
        raise ValueError(
            f"Unsupported audio format: '{ext}'. "
            f"Supported: {', '.join(SUPPORTED_FORMATS)}"
        )


# ── Inspection ────────────────────────────────────────────────────────────────

def inspect_audio(path: str) -> dict:
    """
    Return basic metadata about the audio file.
    Uses Python's built-in `wave` module for .wav files (no ffmpeg needed).
    Falls back to torchaudio for other formats.
    """
    ext = os.path.splitext(path)[1].lower()

    if ext == ".wav":
        try:
            with wave.open(path, "rb") as wf:
                channels    = wf.getnchannels()
                sample_rate = wf.getframerate()
                n_frames    = wf.getnframes()
                duration    = n_frames / float(sample_rate)
            return {
                "path":        path,
                "format":      "wav",
                "duration_s":  duration,
                "sample_rate": sample_rate,
                "channels":    channels,
            }
        except Exception:
            pass  # fall through to torchaudio

    # Fallback: use torchaudio (handles mp3, flac, etc. via soundfile backend)
    try:
        info = torchaudio.info(path, backend="soundfile")
    except Exception as exc:
        raise RuntimeError(
            "Could not inspect non-WAV audio. Convert input to .wav or fix torchaudio backend."
        ) from exc
    return {
        "path":        path,
        "format":      ext.lstrip("."),
        "duration_s":  info.num_frames / info.sample_rate,
        "sample_rate": info.sample_rate,
        "channels":    info.num_channels,
    }


def print_audio_info(info: dict) -> None:
    print("\n" + "=" * 60)
    print("AUDIO FILE INFO")
    print("=" * 60)
    print(f"  File       : {info['path']}")
    print(f"  Format     : {info['format']}")
    print(f"  Duration   : {info['duration_s']:.1f}s  "
          f"({info['duration_s'] / 60:.1f} min)")
    print(f"  Sample rate: {info['sample_rate']} Hz")
    print(f"  Channels   : {info['channels']}")
    print("=" * 60 + "\n")


# ── Preprocessing ─────────────────────────────────────────────────────────────

def _load_wav_with_wave(path: str) -> tuple[torch.Tensor, int]:
    """Load WAV using stdlib only, avoiding torchcodec/ffmpeg."""
    with wave.open(path, "rb") as wf:
        channels = wf.getnchannels()
        sample_rate = wf.getframerate()
        sample_width = wf.getsampwidth()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)

    if sample_width == 1:
        data = np.frombuffer(raw, dtype=np.uint8).astype(np.float32)
        data = (data - 128.0) / 128.0
    elif sample_width == 2:
        data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    elif sample_width == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        data = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
        data = (data ^ 0x800000) - 0x800000  # sign-extend 24-bit PCM
        data = data.astype(np.float32) / 8388608.0
    elif sample_width == 4:
        data = np.frombuffer(raw, dtype=np.int32).astype(np.float32) / 2147483648.0
    else:
        raise ValueError(f"Unsupported WAV sample width: {sample_width} bytes")

    data = data.reshape(-1, channels)
    waveform = torch.from_numpy(data.T.copy())  # (channels, samples)
    return waveform, sample_rate


def _save_wav_with_wave(path: str, waveform: torch.Tensor, sample_rate: int) -> None:
    """Save float tensor audio as 16-bit PCM WAV using stdlib only."""
    if waveform.ndim != 2:
        raise ValueError("Expected waveform shape (channels, samples)")

    pcm16 = (
        waveform.clamp(-1.0, 1.0)
        .transpose(0, 1)
        .contiguous()
        .mul(32767.0)
        .to(torch.int16)
        .cpu()
        .numpy()
    )

    with wave.open(path, "wb") as wf:
        wf.setnchannels(waveform.shape[0])
        wf.setsampwidth(2)  # 16-bit PCM
        wf.setframerate(sample_rate)
        wf.writeframes(pcm16.tobytes())


def load_audio_tensor(path: str) -> tuple[torch.Tensor, int]:
    """
    Load audio as a (channels, samples) torch.Tensor using torchaudio.
    No ffmpeg needed.
    """
    ext = os.path.splitext(path)[1].lower()
    if ext == ".wav":
        return _load_wav_with_wave(path)

    try:
        waveform, sample_rate = torchaudio.load(path, backend="soundfile")
    except Exception as exc:
        raise RuntimeError(
            "Could not decode non-WAV audio. Convert input to .wav or fix torchaudio backend."
        ) from exc
    return waveform, sample_rate


def preprocess_to_tensor(path: str) -> dict:
    """
    Load audio and resample to 16 kHz mono.

    Returns a dict compatible with pyannote's expected input format:
        {"waveform": (1, N) tensor, "sample_rate": 16000}

    Passing this dict to pyannote avoids its internal file-based
    decoder (which needs torchcodec / ffmpeg).
    """
    waveform, sample_rate = load_audio_tensor(path)

    # Convert to mono
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)

    # Resample if needed
    if sample_rate != TARGET_SAMPLE_RATE:
        logger.info(f"Resampling {sample_rate} Hz → {TARGET_SAMPLE_RATE} Hz")
        resampler = torchaudio.transforms.Resample(sample_rate, TARGET_SAMPLE_RATE)
        waveform  = resampler(waveform)
        sample_rate = TARGET_SAMPLE_RATE

    logger.info(
        f"Audio loaded: {waveform.shape[1]} samples "
        f"@ {sample_rate} Hz  ({waveform.shape[1]/sample_rate:.1f}s)"
    )
    return {"waveform": waveform, "sample_rate": sample_rate}


def preprocess_audio(path: str, output_path: str = "audio_preprocessed.wav") -> str:
    """
    Save a 16 kHz mono WAV to disk (used as input for Whisper which
    expects a file path, not a tensor).

    Returns the path to the saved file.
    """
    audio_dict = preprocess_to_tensor(path)
    waveform   = audio_dict["waveform"]
    sr         = audio_dict["sample_rate"]

    # Only write if it differs from the source
    if os.path.abspath(path).lower().endswith(".wav"):
        orig = inspect_audio(path)
        if orig["sample_rate"] == TARGET_SAMPLE_RATE and orig["channels"] == 1:
            logger.info("Audio already 16 kHz mono WAV — skipping conversion.")
            return path

    _save_wav_with_wave(output_path, waveform, sr)
    logger.info(f"Preprocessed audio saved → {output_path}")
    return output_path
