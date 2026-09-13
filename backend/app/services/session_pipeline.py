"""Background job that turns a recorded audio file into a completed
clinical session: transcribe -> extract findings -> map -> persist.

Runs via FastAPI's BackgroundTasks, scheduled from the
POST /transcription/session/{patient_id}/record endpoint. Because it runs
after the triggering request has already returned, it opens its own DB
session rather than reusing the request-scoped one from get_db().
"""
import logging
import os
import tempfile

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.session import ClinicalSession
from app.services.asr_service import transcribe_audio
from app.services.chart_extraction_service import extract_chart
from app.services.chart_mapping import build_summary_report, map_findings_to_clinical_entries
from app.services.diarization_service import DiarizationUnavailable, diarize_audio, merge_with_transcript
from app.services.speaker_label_service import label_transcript_roles

logger = logging.getLogger(__name__)


def _word_coverage(candidate: str, source_words: list[dict]) -> float:
    expected = [str(word.get("word", "")).strip().lower() for word in source_words]
    expected = [word for word in expected if word]
    if not expected:
        return 0.0
    lowered_candidate = candidate.lower()
    return sum(word in lowered_candidate for word in expected) / len(expected)


def _diarize_transcript(audio_bytes: bytes, filename: str, words: list[dict], plain_transcript: str) -> tuple[str, str]:
    """Best-effort speaker-labeled transcript. Diarization is treated as
    enhancement, not a required step — if it's unavailable (no HF_TOKEN,
    model license not accepted), only one speaker was detected, or it
    fails for any reason, the plain transcript from ASR is used instead
    rather than failing the whole recording. Audio is written to a temp
    file (not kept) since pyannote needs a real file path to decode
    non-WAV formats via ffmpeg.

    Returns (transcript, diarization_status) — status is one of
    "success", "unavailable", or "failed" (see ClinicalSession.diarization_status
    for what each means), so the caller can tell the clinician whether
    missing speaker labels mean "diarization wasn't attempted/didn't
    apply" versus "diarization broke."""
    if not words:
        return plain_transcript, "unavailable"

    suffix = "." + (filename.rsplit(".", 1)[-1].lower() if "." in filename else "webm")
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        turns = diarize_audio(tmp_path)
        diarized, speaker_count = merge_with_transcript(turns, words)
        # Pyannote can produce valid turns while ASR word timestamps are
        # incomplete. Keep the complete Whisper transcript in that case.
        if diarized and _word_coverage(diarized, words) >= 0.95:
            return diarized, "success"
        if diarized:
            logger.warning("Discarding partial diarized transcript; retaining Whisper transcript")
        return plain_transcript, "unavailable"
    except DiarizationUnavailable as e:
        logger.info("Diarization unavailable, using plain transcript: %s", e)
        return plain_transcript, "unavailable"
    except Exception:
        logger.exception("Diarization failed, falling back to plain transcript")
        return plain_transcript, "failed"
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


def _label_for_display(audio_bytes: bytes, filename: str, words: list[dict], plain_transcript: str) -> tuple[str, str]:
    """Choose audio labels, text-only labels, or plain ASR from configuration."""
    mode = settings.SPEAKER_LABELING_MODE.strip().lower()
    if mode not in {"audio", "text", "off"}:
        logger.warning("Unknown SPEAKER_LABELING_MODE=%r; using audio", mode)
        mode = "audio"
    if mode == "off":
        return plain_transcript, "unavailable"

    status = "unavailable"
    if mode == "audio":
        diarized, status = _diarize_transcript(audio_bytes, filename, words, plain_transcript)
        if status == "success":
            return diarized, status

    try:
        text_labeled = label_transcript_roles(plain_transcript)
    except Exception:
        logger.exception("Text-only speaker role labeling failed")
        text_labeled = None
    if text_labeled:
        return text_labeled, "ai_assigned"
    return plain_transcript, status


def process_recording(session_id: int, job_token: str, audio_bytes: bytes, filename: str) -> None:
    db = SessionLocal()

    def _load_current_job():
        """Re-fetch the session and confirm this job is still the most
        recent one for it. If the patient was re-recorded while this job
        was running, job_token will have moved on — in that case this
        (now-stale) job must not write its results."""
        s = db.query(ClinicalSession).filter(ClinicalSession.id == session_id).first()
        if s is None:
            logger.error("process_recording: session %s not found", session_id)
            return None
        if s.job_token != job_token:
            logger.info("process_recording: session %s superseded by a newer job, discarding stale result", session_id)
            return None
        return s

    try:
        try:
            session = _load_current_job()
            if session is None:
                return

            asr_result = transcribe_audio(audio_bytes, filename)
            plain_transcript = asr_result["transcript"]
            # Persist the transcript as soon as we have it — if either of
            # the next steps (diarization, chart extraction) fails, the
            # real transcription isn't thrown away along with it.
            # Re-check the job is still current before each write, since
            # both steps can take a while.
            session = _load_current_job()
            if session is None:
                return
            session.transcript = plain_transcript
            db.commit()

            # Diarization runs BEFORE extraction (not after, and not
            # skipped) so that chart extraction can see who said what —
            # e.g. distinguishing a symptom the patient reported from an
            # observation the dentist stated. It's still best-effort: on
            # failure/timeout/a single detected speaker, extraction just
            # falls back to the plain transcript. chart_extraction_service's
            # verbatim-quote validation (transcript.find(quote)) works
            # against either form, since it only requires the quote to
            # appear somewhere in whichever transcript text is passed in —
            # it doesn't require the offsets the LLM guesses to be exact.
            display_transcript, diarization_status = _label_for_display(
                audio_bytes, filename, asr_result.get("words") or [], plain_transcript
            )
            session = _load_current_job()
            if session is None:
                return
            session.transcript = display_transcript
            session.diarization_status = diarization_status
            db.commit()

            # Clinical extraction uses Whisper's untouched text. Labeling is
            # only a display aid and must never alter clinical evidence.
            findings = extract_chart(plain_transcript)
            clinical_entries = map_findings_to_clinical_entries(findings)
            summary_report = build_summary_report(clinical_entries)

            session = _load_current_job()
            if session is None:
                return
            session.clinical_entries = clinical_entries
            session.summary_report = summary_report
            session.status = "complete"
            session.error_message = None
            db.commit()
        except Exception as e:  # noqa: BLE001 — any failure anywhere in the pipeline
            # (including re-fetching the session itself) must leave the
            # session in a terminal "error" state, not stuck at
            # "processing" forever with no way for the UI to recover.
            logger.exception("process_recording failed for session %s", session_id)
            try:
                db.rollback()
                session = db.query(ClinicalSession).filter(ClinicalSession.id == session_id).first()
                if session is not None and session.job_token == job_token:
                    session.status = "error"
                    session.error_message = str(e)
                    db.commit()
            except Exception:
                logger.exception("process_recording: failed to record error state for session %s", session_id)
    finally:
        db.close()
