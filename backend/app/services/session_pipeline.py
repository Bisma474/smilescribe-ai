"""Background job that turns a recorded audio file into a completed
clinical session: transcribe -> extract findings -> map -> persist.

Runs via FastAPI's BackgroundTasks, scheduled from the
POST /transcription/session/{patient_id}/record endpoint. Because it runs
after the triggering request has already returned, it opens its own DB
session rather than reusing the request-scoped one from get_db().
"""
import logging

from app.db.session import SessionLocal
from app.models.session import ClinicalSession
from app.services.asr_service import transcribe_audio
from app.services.chart_extraction_service import extract_chart
from app.services.chart_mapping import build_summary_report, map_findings_to_clinical_entries

logger = logging.getLogger(__name__)


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
            transcript = asr_result["transcript"]
            # Persist the transcript as soon as we have it — if the next
            # step (chart extraction) fails, the real transcription isn't
            # thrown away along with it. Re-check the job is still current
            # before each write, since extraction can take a while.
            session = _load_current_job()
            if session is None:
                return
            session.transcript = transcript
            db.commit()

            findings = extract_chart(transcript)
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
