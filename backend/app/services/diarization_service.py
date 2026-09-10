"""Speaker diarization via pyannote.audio — identifies *when* each distinct
speaker talks (speaker turns), which is then merged with the ASR service's
word-level timestamps (see merge_with_transcript below) to produce a
speaker-labeled transcript.

This does NOT identify *who* a speaker is (dentist vs. patient) — pyannote
only distinguishes "speaker A" from "speaker B" by voice, with no idea of
identity. As a simple, honest heuristic, the speaker who talks first is
assumed to be the dentist (SPEAKER_00 -> settings.SPEAKER_LABEL_MAP), since
in practice the dentist almost always opens the visit ("Hi, how are you
doing today?"). This is a real assumption, not a guarantee — it will be
wrong on recordings where the patient speaks first.

The pipeline is loaded once per process (~seconds on CPU) and reused across
requests rather than reloaded per call.
"""
import logging
import warnings
from functools import lru_cache

from app.core.config import settings

logger = logging.getLogger(__name__)

# pyannote emits a noisy UserWarning about torchcodec on every import/call
# on machines without the optional torchcodec backend installed — harmless
# (it falls back to torchaudio/soundfile), but drowns out real logs.
warnings.filterwarnings(
    "ignore",
    category=UserWarning,
    module=r"pyannote\.audio\.core\.io",
    message=r".*(torchcodec is not installed correctly|Could not load libtorchcodec).*",
)


class DiarizationUnavailable(Exception):
    """Raised when the diarization pipeline can't be loaded or run — e.g.
    no HF_TOKEN configured, or the model license wasn't accepted. Callers
    should treat this as "diarization skipped," not a hard failure of the
    whole recording pipeline (transcription/extraction already succeeded
    by the time diarization runs)."""


@lru_cache(maxsize=1)
def _load_pipeline():
    if not settings.HF_TOKEN:
        raise DiarizationUnavailable(
            "HF_TOKEN is not configured — set it in .env to enable diarization."
        )

    from pyannote.audio import Pipeline

    try:
        pipeline = Pipeline.from_pretrained(settings.PYANNOTE_MODEL, token=settings.HF_TOKEN)
    except Exception as exc:
        msg = str(exc).lower()
        if "gated" in msg or "401" in msg or "unauthorized" in msg:
            raise DiarizationUnavailable(
                f"Cannot access gated model '{settings.PYANNOTE_MODEL}'. Confirm the "
                "HF_TOKEN is valid and the model license was accepted on huggingface.co "
                "for this account (both speaker-diarization-3.1 and segmentation-3.0)."
            ) from exc
        raise DiarizationUnavailable(f"Failed to load diarization pipeline: {exc}") from exc

    if pipeline is None:
        raise DiarizationUnavailable(
            f"Pipeline.from_pretrained('{settings.PYANNOTE_MODEL}') returned None — "
            "usually means the model license wasn't accepted for this HF account."
        )
    return pipeline


def _decode_to_waveform(audio_path: str, sample_rate: int = 16000):
    """Decode any audio file pyannote needs to a mono waveform tensor via
    the ffmpeg CLI, rather than handing pyannote a file path directly.

    pyannote.audio 4.x reads files through torchcodec, whose native
    decoder libraries must exactly match one specific installed FFmpeg
    build (with shared DLLs) — a fragile pairing to keep working across a
    dev machine and a deploy server, and prone to breaking on FFmpeg
    upgrades. Shelling out to the `ffmpeg` binary directly (already a
    project dependency for other reasons) and handing pyannote a raw
    waveform via its {"waveform": tensor, "sample_rate": ...} input form
    sidesteps torchcodec entirely."""
    import subprocess

    import numpy as np
    import torch

    proc = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-i", audio_path,
            "-f", "f32le", "-ac", "1", "-ar", str(sample_rate), "-",
        ],
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0 or not proc.stdout:
        raise DiarizationUnavailable(
            f"ffmpeg failed to decode audio for diarization: {proc.stderr.decode(errors='replace')[:500]}"
        )

    samples = np.frombuffer(proc.stdout, dtype=np.float32).copy()
    waveform = torch.from_numpy(samples).unsqueeze(0)  # shape: (1 channel, n_samples)
    return {"waveform": waveform, "sample_rate": sample_rate}


def diarize_audio(audio_path: str) -> list[dict]:
    """Run diarization on an audio file path, returning speaker turns as
    [{start, end, speaker}, ...] sorted by start time, with raw pyannote
    labels ("SPEAKER_00", "SPEAKER_01", ...) — not yet mapped to
    Dentist/Patient (see merge_with_transcript)."""
    pipeline = _load_pipeline()
    audio_input = _decode_to_waveform(audio_path)

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=UserWarning)
        result = pipeline(audio_input)

    # pyannote.audio 4.x wraps the result in a DiarizeOutput dataclass
    # (speaker_diarization / exclusive_speaker_diarization / speaker
    # embeddings) instead of returning the Annotation directly like 3.x
    # did — unwrap it, but stay compatible with either version.
    annotation = getattr(result, "speaker_diarization", result)

    turns = [
        {"start": turn.start, "end": turn.end, "speaker": speaker}
        for turn, _, speaker in annotation.itertracks(yield_label=True)
    ]
    turns.sort(key=lambda t: t["start"])
    return turns


def merge_with_transcript(turns: list[dict], words: list[dict]) -> str:
    """Combine diarization speaker turns with the ASR service's word-level
    timestamps into a speaker-labeled transcript, e.g.:

        Dentist: Good morning, how are you doing today?
        Patient: Pretty good, just some sensitivity on the lower left.

    Each word is assigned to whichever speaker turn contains its start
    time (or the nearest turn if it falls in a small gap between turns —
    pyannote turns rarely cover every millisecond exactly). Consecutive
    words from the same speaker are grouped into one line.

    If turns or words is empty, returns "" so the caller can fall back to
    the plain (non-diarized) transcript instead of losing text entirely.
    """
    if not turns or not words:
        return ""

    label_map = settings.SPEAKER_LABEL_MAP
    # Speakers in order of first appearance — the first to speak is
    # assumed the dentist (see module docstring for why this is a
    # heuristic, not a guarantee).
    speaker_order = sorted({t["speaker"] for t in turns}, key=lambda s: min(t["start"] for t in turns if t["speaker"] == s))
    ordered_raw_labels = sorted(label_map.keys())  # e.g. ["SPEAKER_00", "SPEAKER_01"]

    def resolve_label(raw_speaker: str) -> str:
        try:
            idx = speaker_order.index(raw_speaker)
        except ValueError:
            return raw_speaker
        if idx < len(ordered_raw_labels):
            return label_map.get(ordered_raw_labels[idx], raw_speaker)
        return f"Speaker {idx + 1}"

    def speaker_for_time(t: float) -> str | None:
        for turn in turns:
            if turn["start"] <= t <= turn["end"]:
                return turn["speaker"]
        # Fall back to the closest turn if the timestamp falls in a small
        # gap between turns rather than dropping the word.
        if not turns:
            return None
        closest = min(turns, key=lambda turn: min(abs(turn["start"] - t), abs(turn["end"] - t)))
        return closest["speaker"]

    lines: list[str] = []
    current_speaker = None
    current_words: list[str] = []

    for w in words:
        raw_speaker = speaker_for_time(w["start"])
        if raw_speaker != current_speaker:
            if current_words:
                lines.append(f"{resolve_label(current_speaker)}: {' '.join(current_words)}")
            current_speaker = raw_speaker
            current_words = [w["word"]]
        else:
            current_words.append(w["word"])

    if current_words:
        lines.append(f"{resolve_label(current_speaker)}: {' '.join(current_words)}")

    return "\n".join(lines)
