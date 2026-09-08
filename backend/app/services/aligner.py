# =============================================================================
# aligner.py — Merge Whisper transcript segments with pyannote speaker labels
# =============================================================================

import logging
from typing import List, Dict, Any
from pyannote.core import Annotation
logger = logging.getLogger(__name__)


# def _find_speaker_for_segment(
#     seg_start: float,
#     seg_end: float,
#     diarization,
# ) -> str:
#     """
#     Find the speaker label for a Whisper segment by computing overlap
#     with every diarization turn and returning the speaker with the
#     greatest overlap. Falls back to 'UNKNOWN' if no overlap is found.

#     This is more robust than a simple start-point lookup, especially
#     for fast back-and-forth dental exchanges.
#     """
#     best_speaker = "UNKNOWN"
#     best_overlap = 0.0

#     for turn, _, speaker in diarization.itertracks(yield_label=True):
#         overlap_start = max(seg_start, turn.start)
#         overlap_end   = min(seg_end,   turn.end)
#         overlap       = max(0.0, overlap_end - overlap_start)

#         if overlap > best_overlap:
#             best_overlap  = overlap
#             best_speaker  = speaker

#     return best_speaker

def _find_speaker_for_segment(
    seg_start: float,
    seg_end: float,
    ann: Annotation,       # renamed for clarity
) -> str:
    best_speaker = "UNKNOWN"
    best_overlap = 0.0

    for turn, _, speaker in ann.itertracks(yield_label=True):
        overlap_start = max(seg_start, turn.start)
        overlap_end   = min(seg_end,   turn.end)
        overlap       = max(0.0, overlap_end - overlap_start)

        if overlap > best_overlap:
            best_overlap = overlap
            best_speaker = speaker

    return best_speaker

# def merge_transcript_with_speakers(
#     whisper_result: dict,
#     diarization,
# ) -> List[Dict[str, Any]]:
#     """
#     Align Whisper segment-level timestamps with pyannote speaker segments.

#     Each entry in the returned list has:
#         {
#             "speaker": "SPEAKER_00",
#             "start":   0.0,
#             "end":     4.2,
#             "text":    "Okay let me take a look at tooth fourteen."
#         }
#     """
#     segments = whisper_result.get("segments", [])
#     merged: List[Dict[str, Any]] = []

#     for segment in segments:
#         seg_start = segment["start"]
#         seg_end   = segment["end"]
#         text      = segment["text"].strip()

#         if not text:
#             continue

#         speaker = _find_speaker_for_segment(seg_start, seg_end, diarization)

#         merged.append({
#             "speaker": speaker,
#             "start":   round(seg_start, 2),
#             "end":     round(seg_end,   2),
#             "text":    text,
#         })

#     logger.info(f"Merged {len(merged)} segments with speaker labels.")
#     return merged
# def _unwrap_annotation(diarization) -> Annotation:
#     """Extract pyannote Annotation from whatever the pipeline returns."""
#     if isinstance(diarization, Annotation):
#         return diarization
#     for attr in ("diarization", "annotation", "output"):
#         candidate = getattr(diarization, attr, None)
#         if isinstance(candidate, Annotation):
#             return candidate
#     # Nuclear option: DiarizeOutput is sometimes a namedtuple
#     if hasattr(diarization, "_fields"):
#         for field in diarization._fields:
#             candidate = getattr(diarization, field)
#             if isinstance(candidate, Annotation):
#                 return candidate
#     raise TypeError(
#         f"Cannot extract Annotation from {type(diarization)!r}. "
#         f"Attrs: {[a for a in dir(diarization) if not a.startswith('_')]}"
#     )
def _unwrap_annotation(diarization) -> Annotation:
    """Extract pyannote Annotation from whatever the pipeline returns."""
    if isinstance(diarization, Annotation):
        return diarization
    # Support MagicMock used in unit tests
    if hasattr(diarization, "itertracks"):
        return diarization
    for attr in ("speaker_diarization", "diarization", "annotation", "output"):
        candidate = getattr(diarization, attr, None)
        if isinstance(candidate, Annotation):
            return candidate
    if hasattr(diarization, "_fields"):
        for field in diarization._fields:
            candidate = getattr(diarization, field)
            if isinstance(candidate, Annotation):
                return candidate
    raise TypeError(
        f"Cannot extract Annotation from {type(diarization)!r}. "
        f"Attrs: {[a for a in dir(diarization) if not a.startswith('_')]}"
    )

def merge_transcript_with_speakers(
    whisper_result: dict,
    diarization,
) -> List[Dict[str, Any]]:
    ann = _unwrap_annotation(diarization)   # unwrap once here
    segments = whisper_result.get("segments", [])
    merged: List[Dict[str, Any]] = []

    for segment in segments:
        words = segment.get("words", [])
        if words:
            for w in words:
                w_start = w.get("start")
                w_start = w_start if w_start is not None else segment["start"]
                
                w_end = w.get("end")
                w_end = w_end if w_end is not None else segment["end"]
                
                text    = w.get("word", "").strip()

                if not text:
                    continue

                speaker = _find_speaker_for_segment(w_start, w_end, ann)

                merged.append({
                    "speaker": speaker,
                    "start":   round(w_start, 2),
                    "end":     round(w_end, 2),
                    "text":    text,
                })
        else:
            seg_start = segment["start"]
            seg_end   = segment["end"]
            text      = segment["text"].strip()

            if not text:
                continue

            speaker = _find_speaker_for_segment(seg_start, seg_end, ann)

            merged.append({
                "speaker": speaker,
                "start":   round(seg_start, 2),
                "end":     round(seg_end,   2),
                "text":    text,
            })

    logger.info(f"Merged {len(merged)} segments with speaker labels.")
    return merged

def consolidate_consecutive_speakers(
    segments: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Optional post-processing step: collapse consecutive segments from the
    same speaker into a single block. Reduces output verbosity.
    """
    if not segments:
        return []

    consolidated = [segments[0].copy()]

    for seg in segments[1:]:
        last = consolidated[-1]
        if seg["speaker"] == last["speaker"]:
            last["end"]   = seg["end"]
            last["text"] += " " + seg["text"]
        else:
            consolidated.append(seg.copy())

    logger.info(
        f"Consolidated {len(segments)} segments → {len(consolidated)} blocks."
    )
    return consolidated
