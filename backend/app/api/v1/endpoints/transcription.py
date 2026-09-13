import os
import sys
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_current_active_user
from app.models.patient import Patient as PatientModel
from app.models.session import ClinicalSession as SessionModel
from app.models.user import User
from app.schemas.session import ClinicalSessionCreate, ClinicalSessionOut, ClinicalSessionUpdate
from app.services.session_pipeline import process_recording

# Ensure root directory is in sys.path so we can import config.py
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../../"))
if root_dir not in sys.path:
    sys.path.append(root_dir)

from app.core.config import settings as config

router = APIRouter()


@router.get("/demo-transcript")
def get_demo_transcript():
    """
    Returns the synthetic dental transcript that was generated in the project.
    Reads from the local final_transcript.txt file.
    """
    try:
        # Construct absolute path in case server is run from the backend/ directory
        transcript_path = os.path.join(root_dir, config.OUTPUT_TRANSCRIPT)
        with open(transcript_path, "r", encoding="utf-8") as f:
            transcript = f.read()
        return {"transcript": transcript}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Demo transcript not found. Please run the local pipeline first.")

MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25 MB
ALLOWED_AUDIO_EXTENSIONS = {"wav", "mp3", "m4a", "webm", "ogg"}


@router.post("/session/{patient_id}/record", response_model=ClinicalSessionOut)
async def start_recording_job(
    patient_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Upload a recorded visit's audio, kick off the real transcribe -> extract
    -> persist pipeline in the background, and return immediately with the
    session in status="processing". The frontend polls GET /session/{id}
    (below) until status becomes "complete" or "error".
    """
    if not config.GROQ_API_KEY:
        # Fail fast and clearly here rather than letting the background job
        # die later with an opaque Groq SDK auth error the user never sees
        # until they poll and get a generic error_message.
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured on the server.")

    patient = (
        db.query(PatientModel)
        .filter(PatientModel.id == patient_id, PatientModel.practice_id == current_user.id)
        .first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    extension = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else ""
    if extension not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format. Allowed: {', '.join(sorted(ALLOWED_AUDIO_EXTENSIONS))}",
        )

    # Read in chunks and abort as soon as the limit is exceeded, rather than
    # buffering an arbitrarily large upload fully into memory before
    # checking its size.
    chunks = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_AUDIO_BYTES:
            raise HTTPException(status_code=413, detail="Audio file too large (max 25 MB)")
        chunks.append(chunk)
    audio_bytes = b"".join(chunks)
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    # Always a new row, never reused — this used to look up and overwrite
    # the patient's single existing session, which meant recording a
    # second visit silently destroyed the first visit's transcript,
    # findings, and chart data. Every recording is now its own session, so
    # a patient's visit history is preserved (see GET /session/{patient_id}
    # /history below).
    session = SessionModel(patient_id=patient_id, status="processing")
    db.add(session)
    # A fresh token per recording job — process_recording only commits its
    # results if this session is still the one it was started for, so an
    # older, still-running job can't clobber a newer recording's results.
    session.job_token = uuid4().hex
    db.commit()
    db.refresh(session)

    background_tasks.add_task(process_recording, session.id, session.job_token, audio_bytes, file.filename)

    return session

def _get_owned_patient_or_404(db: Session, patient_id: int, current_user: User) -> PatientModel:
    patient = (
        db.query(PatientModel)
        .filter(PatientModel.id == patient_id, PatientModel.practice_id == current_user.id)
        .first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@router.get("/session/{patient_id}", response_model=ClinicalSessionOut)
def get_session(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Returns the patient's session, creating an empty one on first access
    so the Chart page always has a session_id to save perio_data against
    before any recording has happened.

    Previously this endpoint had NO ownership check at all — any
    authenticated dentist could read any patient's session by ID — and
    seeded a brand-new patient's "empty" session with a hardcoded demo
    transcript, findings, and $272 in fake billing recommendations
    ("Marcus Torres" perio data), which then rendered as if real on the
    Chart, Billing, and Dashboard pages. Fixed to scope by practice_id and
    to leave real fields null/empty instead of fabricating clinical data.

    A patient can now have many sessions (one per recording — see
    start_recording_job above), so this returns the most recent one, not
    "the" session. Existing callers (Chart/Billing/Processing pages) all
    want "whatever this patient's latest visit is," so their behavior is
    unchanged; to view a specific past visit, use
    GET /session/by-id/{session_id} with an id from the history list."""
    _get_owned_patient_or_404(db, patient_id, current_user)

    session = (
        db.query(SessionModel)
        .filter(SessionModel.patient_id == patient_id, SessionModel.status.in_(["complete", "submitted"]))
        .order_by(SessionModel.created_at.desc())
        .first()
    )
    if not session:
        session = (
            db.query(SessionModel)
            .filter(SessionModel.patient_id == patient_id)
            .order_by(SessionModel.created_at.desc())
            .first()
        )
    if not session:
        session = SessionModel(patient_id=patient_id, status="new")
        db.add(session)
        db.commit()
        db.refresh(session)
    return session


@router.get("/session/{patient_id}/history", response_model=list[ClinicalSessionOut])
def get_session_history(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """All of this patient's past visits/recordings, most recent first —
    powers the patient detail page's recording history list."""
    _get_owned_patient_or_404(db, patient_id, current_user)

    return (
        db.query(SessionModel)
        .filter(SessionModel.patient_id == patient_id)
        .order_by(SessionModel.created_at.desc())
        .all()
    )


@router.get("/session/by-id/{session_id}", response_model=ClinicalSessionOut)
def get_session_by_id(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Fetch one specific past session (e.g. from the history list) rather
    than always the patient's latest one. Scoped by the owning patient's
    practice_id, matching the ownership pattern used by PUT
    /notes/session/{session_id}."""
    session = (
        db.query(SessionModel)
        .join(PatientModel, SessionModel.patient_id == PatientModel.id)
        .filter(SessionModel.id == session_id, PatientModel.practice_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.patch("/session/{session_id}/swap-speakers", response_model=ClinicalSessionOut)
def swap_speakers(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Flip the "Dentist:"/"Patient:" labels throughout this session's
    transcript. Diarization only guesses speaker identity positionally
    (whoever talks first is assumed to be the dentist — see
    diarization_service.py) and has no real way to verify that guess, so
    the clinician needs a one-click way to correct it when it's wrong
    rather than living with a mislabeled transcript. Toggles back and
    forth (calling this twice restores the original labels) and tracks
    speakers_swapped so the UI can show which state it's currently in."""
    session = (
        db.query(SessionModel)
        .join(PatientModel, SessionModel.patient_id == PatientModel.id)
        .filter(SessionModel.id == session_id, PatientModel.practice_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.diarization_status not in {"success", "ai_assigned"} or not session.transcript:
        raise HTTPException(status_code=400, detail="This session has no speaker-labeled transcript to swap.")

    dentist_label = config.SPEAKER_LABEL_MAP.get("SPEAKER_00", "Dentist")
    patient_label = config.SPEAKER_LABEL_MAP.get("SPEAKER_01", "Patient")

    # Line-prefix swap only ("Label: ..." at the start of a line), not a
    # blind string replace — avoids corrupting either label if it ever
    # happens to appear inside the spoken content itself.
    swapped_lines = []
    for line in session.transcript.split("\n"):
        if line.startswith(f"{dentist_label}: "):
            swapped_lines.append(f"{patient_label}: " + line[len(dentist_label) + 2:])
        elif line.startswith(f"{patient_label}: "):
            swapped_lines.append(f"{dentist_label}: " + line[len(patient_label) + 2:])
        else:
            swapped_lines.append(line)

    session.transcript = "\n".join(swapped_lines)
    session.speakers_swapped = not session.speakers_swapped
    db.commit()
    db.refresh(session)
    return session


@router.post("/session", response_model=ClinicalSessionOut)
def create_session(
    body: ClinicalSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    _get_owned_patient_or_404(db, body.patient_id, current_user)

    session = SessionModel(
        patient_id=body.patient_id,
        status=body.status,
        transcript=body.transcript,
        perio_data=body.perio_data,
        clinical_entries=body.clinical_entries,
        summary_report=body.summary_report,
        treatment_opportunities=body.treatment_opportunities,
        candidate_procedures=body.candidate_procedures,
        clinician_confirmed_procedures=body.clinician_confirmed_procedures,
        ai_note=body.ai_note,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session

@router.delete("/session/{session_id}", status_code=204)
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    session = (
        db.query(SessionModel)
        .join(PatientModel, SessionModel.patient_id == PatientModel.id)
        .filter(SessionModel.id == session_id, PatientModel.practice_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Visit not found")
    db.delete(session)
    db.commit()