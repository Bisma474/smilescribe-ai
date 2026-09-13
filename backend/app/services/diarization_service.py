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

    try:
        proc = subprocess.run(
            [
                "ffmpeg", "-v", "error", "-i", audio_path,
                "-f", "f32le", "-ac", "1", "-ar", str(sample_rate), "-",
            ],
            capture_output=True,
            check=False,
            timeout=30,
        )
    except subprocess.TimeoutExpired as e:
        raise DiarizationUnavailable("ffmpeg timed out decoding audio for diarization") from e
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

    # Run with a hard wall-clock timeout — a hung or unexpectedly slow CPU
    # inference call here must not be able to leave the whole recording
    # stuck at "processing" forever with nothing saved. Live-tested: this
    # DID happen (see session_pipeline.py's commit history) before the
    # transcript-persisted-before-diarization ordering fix; this timeout
    # is the second, independent guard against the same failure mode.
    from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError

    def _run():
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", category=UserWarning)
            return pipeline(audio_input)

    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(_run)
        try:
            result = future.result(timeout=120)
        except FutureTimeoutError as e:
            # The underlying thread keeps running to completion in the
            # background (Python can't forcibly kill a thread) and its
            # result is simply discarded — acceptable: it's daemon-less
            # but bounded CPU work, not a resource leak that compounds.
            raise DiarizationUnavailable(
                "Diarization exceeded the 120s timeout — audio may be unusually long, "
                "or the CPU is under heavy load."
            ) from e

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


MIN_TURN_DURATION = 0.35  # seconds — shorter turns are almost always a
# pyannote misfire (a cough, a breath, cross-talk bleed) rather than a
# genuine third speaker, and left unfiltered they cause the merged
# transcript to flip speaker line-by-line for single words.


def _smooth_turns(turns: list[dict]) -> list[dict]:
    """Clean up raw diarization turns before they're used to label words:

    1. Drop turns shorter than MIN_TURN_DURATION by reassigning them to
       whichever neighboring turn they're closest to in time, instead of
       letting them stand as their own (often spurious) speaker turn.
    2. Merge consecutive turns left with the same speaker (which step 1
       often produces, and which also happens natively when pyannote
       emits back-to-back turns for one speaker with only a tiny gap).

    Without this, a normal conversation produces dozens of sub-second
    turns from breath noise/cross-talk, and the merged transcript reads
    as "Dentist: Good Patient: morning Dentist: how are you..." instead
    of one coherent line per speaker turn.
    """
    if not turns:
        return []

    ordered = sorted(turns, key=lambda t: t["start"])

    # Pass 1: reassign turns under the minimum duration to the nearer
    # neighbor's speaker, unless every turn is that short (a very short
    # clip) — in which case there's nothing sensible to reassign to.
    if any((t["end"] - t["start"]) >= MIN_TURN_DURATION for t in ordered):
        for i, t in enumerate(ordered):
            if (t["end"] - t["start"]) >= MIN_TURN_DURATION:
                continue
            prev_t = ordered[i - 1] if i > 0 else None
            next_t = ordered[i + 1] if i + 1 < len(ordered) else None
            if prev_t and next_t:
                dist_prev = t["start"] - prev_t["end"]
                dist_next = next_t["start"] - t["end"]
                t["speaker"] = prev_t["speaker"] if dist_prev <= dist_next else next_t["speaker"]
            elif prev_t:
                t["speaker"] = prev_t["speaker"]
            elif next_t:
                t["speaker"] = next_t["speaker"]

    # Pass 2: merge consecutive same-speaker turns into one.
    merged: list[dict] = []
    for t in ordered:
        if merged and merged[-1]["speaker"] == t["speaker"]:
            merged[-1]["end"] = max(merged[-1]["end"], t["end"])
        else:
            merged.append(dict(t))
    return merged


def merge_with_transcript(turns: list[dict], words: list[dict]) -> tuple[str, int]:
    """Combine diarization speaker turns with the ASR service's word-level
    timestamps into a speaker-labeled transcript, e.g.:

        Dentist: Good morning, how are you doing today?
        Patient: Pretty good, just some sensitivity on the lower left.

    Each word is assigned to whichever speaker turn contains its start
    time (or the nearest turn if it falls in a small gap between turns —
    pyannote turns rarely cover every millisecond exactly). Consecutive
    words from the same speaker are grouped into one line.

    Turns are smoothed first (see _smooth_turns) to avoid the merged
    transcript flipping speaker on every short misfire. Only the two
    speakers who account for the most total speaking time are mapped to
    Dentist/Patient (first of those two to speak = Dentist, per the
    module docstring's heuristic); any additional distinct voice
    pyannote detects (a hygienist, an assistant, background talk) is
    folded into whichever of the two main speakers its turns sit closest
    to in time, rather than leaking a raw "Speaker 3" label into the
    transcript the clinician reads.

    Returns (transcript, speaker_count) — speaker_count is how many
    distinct voices pyannote actually detected (before folding minor
    speakers into the main two), so the caller can tell "only one
    speaker recorded" (diarization not meaningful) apart from "we
    labeled two speakers."

    If turns or words is empty, returns ("", 0) so the caller can fall
    back to the plain (non-diarized) transcript instead of losing text
    entirely.
    """
    if not turns or not words:
        return "", 0

    smoothed = _smooth_turns(turns)
    distinct_speakers = {t["speaker"] for t in smoothed}
    speaker_count = len(distinct_speakers)

    if speaker_count < 2:
        # Nothing to diarize — one voice for the whole recording (or the
        # smoothing pass collapsed everything into one). Labeling a
        # single speaker as "Dentist" throughout would be a guess with
        # zero evidence behind it, so the caller should treat this as
        # "diarization not meaningful" and keep the plain transcript.
        return "", speaker_count

    # Rank speakers by total speaking time; the two who talk the most are
    # treated as Dentist/Patient. Any further distinct voice is a minor
    # speaker to be folded into the nearer of those two.
    duration_by_speaker: dict[str, float] = {}
    for t in smoothed:
        duration_by_speaker[t["speaker"]] = duration_by_speaker.get(t["speaker"], 0.0) + (t["end"] - t["start"])
    main_speakers = {s for s, _ in sorted(duration_by_speaker.items(), key=lambda kv: kv[1], reverse=True)[:2]}

    def nearest_main_speaker(turn: dict) -> str:
        others = [t for t in smoothed if t["speaker"] in main_speakers]
        closest = min(others, key=lambda o: min(abs(o["start"] - turn["start"]), abs(o["end"] - turn["end"])))
        return closest["speaker"]

    for t in smoothed:
        if t["speaker"] not in main_speakers:
            t["speaker"] = nearest_main_speaker(t)

    # Re-merge now that minor speakers have been folded in — adjacent
    # turns may have become same-speaker again.
    final_turns: list[dict] = []
    for t in smoothed:
        if final_turns and final_turns[-1]["speaker"] == t["speaker"]:
            final_turns[-1]["end"] = max(final_turns[-1]["end"], t["end"])
        else:
            final_turns.append(dict(t))

    label_map = settings.SPEAKER_LABEL_MAP
    # Speakers in order of first appearance — the first to speak is
    # assumed the dentist (see module docstring for why this is a
    # heuristic, not a guarantee). Swappable client-side via
    # PATCH /session/{id}/swap-speakers if this guessed wrong.
    speaker_order = sorted(
        main_speakers, key=lambda s: min(t["start"] for t in final_turns if t["speaker"] == s)
    )
    ordered_raw_labels = sorted(label_map.keys())  # e.g. ["SPEAKER_00", "SPEAKER_01"]

    def resolve_label(raw_speaker: str) -> str:
        try:
            idx = speaker_order.index(raw_speaker)
        except ValueError:
            return raw_speaker
        return label_map.get(ordered_raw_labels[idx], raw_speaker)

    def speaker_for_time(t: float) -> str | None:
        for turn in final_turns:
            if turn["start"] <= t <= turn["end"]:
                return turn["speaker"]
        # Fall back to the closest turn if the timestamp falls in a small
        # gap between turns rather than dropping the word.
        if not final_turns:
            return None
        closest = min(final_turns, key=lambda turn: min(abs(turn["start"] - t), abs(turn["end"] - t)))
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

    return "\n".join(lines), speaker_count
