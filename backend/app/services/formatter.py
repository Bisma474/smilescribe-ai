# =============================================================================
# formatter.py — Format the merged transcript for display and output
# =============================================================================

import json
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


def format_transcript(
    segments: List[Dict[str, Any]],
    speaker_map: Dict[str, str],
) -> str:
    """
    Convert merged segments into a readable, labelled transcript string.

    Example output:
        [Dentist]: Okay, let me take a look at tooth fourteen.
        [Patient]: It's been sensitive to cold.
        [Dentist]: I can see decay on the mesial surface...
    """
    lines = []
    for seg in segments:
        raw_label   = seg["speaker"]
        label       = speaker_map.get(raw_label, raw_label)
        timestamp   = f"{seg['start']:.1f}s"
        lines.append(f"[{label} @ {timestamp}]: {seg['text']}")

    return "\n".join(lines)


def save_transcript(text: str, path: str) -> None:
    """Write the formatted transcript to a .txt file."""
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    logger.info(f"Transcript saved → {path}")


def save_segments_json(
    segments: List[Dict[str, Any]],
    speaker_map: Dict[str, str],
    path: str,
) -> None:
    """
    Save the full segment list (with speaker labels resolved) as JSON.
    This JSON is ready to pipe into Phase 3 — the LLM charting pipeline.
    """
    output = []
    for seg in segments:
        output.append({
            "speaker": speaker_map.get(seg["speaker"], seg["speaker"]),
            "start":   seg["start"],
            "end":     seg["end"],
            "text":    seg["text"],
        })

    with open(path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    logger.info(f"Segment JSON saved → {path}")


def print_final_transcript(text: str) -> None:
    """Print the formatted transcript to stdout."""
    print("\n" + "=" * 60)
    print("FINAL FORMATTED TRANSCRIPT")
    print("=" * 60)
    print(text)
    print("=" * 60 + "\n")
