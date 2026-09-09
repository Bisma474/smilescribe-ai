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

    session = db.query(SessionModel).filter(SessionModel.patient_id == patient_id).first()
    if session:
        session.status = "processing"
        session.error_message = None
    else:
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
    to leave real fields null/empty instead of fabricating clinical data."""
    _get_owned_patient_or_404(db, patient_id, current_user)

    session = db.query(SessionModel).filter(SessionModel.patient_id == patient_id).first()
    if not session:
        session = SessionModel(patient_id=patient_id, status="new")
        db.add(session)
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
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session
