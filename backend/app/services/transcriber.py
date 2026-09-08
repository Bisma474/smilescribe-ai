# =============================================================================
# transcriber.py — Whisper transcription with dental vocabulary seeding
# =============================================================================

import whisper
import logging

logger = logging.getLogger(__name__)


def load_whisper_model(model_name: str) -> whisper.Whisper:
    """Load and return the Whisper model."""
    logger.info(f"Loading Whisper model: '{model_name}'...")
    model = whisper.load_model(model_name)
    logger.info("Whisper model loaded successfully.")
    return model


def transcribe_audio(
    model: whisper.Whisper,
    audio_path: str,
    initial_prompt: str,
) -> dict:
    """
    Transcribe the audio file using Whisper.

    Returns the full Whisper result dict, which includes:
      - result["text"]     : full transcript string
      - result["segments"] : list of timed segments with word-level detail
    """
    logger.info(f"Transcribing: {audio_path}")
    logger.info("Initial prompt is active — dental vocabulary seeding enabled.")

    result = model.transcribe(
        audio_path,
        word_timestamps=True,          # needed for fine-grained alignment
        initial_prompt=initial_prompt,
        verbose=False,
    )

    logger.info(
        f"Transcription complete. "
        f"{len(result['segments'])} segments detected."
    )
    return result


def print_raw_transcript(result: dict) -> None:
    """Pretty-print the raw Whisper transcript to stdout."""
    print("\n" + "=" * 60)
    print("RAW WHISPER TRANSCRIPT")
    print("=" * 60)
    print(result["text"].strip())
    print("=" * 60 + "\n")
