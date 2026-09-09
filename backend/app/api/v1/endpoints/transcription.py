import os
import sys
from datetime import datetime
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

# Global mock sessions backup
MOCK_SESSIONS = {}

# Default perio data for seeding
DEFAULT_PERIO = {
    "3": {"buccal": [2, 3, 3], "lingual": [3, 3, 3], "bopBuccal": [False, False, False], "bopLingual": [False, True, False], "suppuration": False, "label": "Calculus removal — supragingival scaling", "finding": "Calculus deposits on the lingual. Supragingival scaling performed, all deposits removed."},
    "14": {"buccal": [3, 3, 4], "lingual": [3, 4, 3], "bopBuccal": [False, False, True], "bopLingual": [True, False, True], "suppuration": False, "label": "Periodontal maintenance", "finding": "Periodontal maintenance (D4910). Probing depths 3-4mm. Bleeding on probing (BOP) at mesial & distolingual surfaces."},
    "32": {"buccal": [5, 5, 5], "lingual": [5, 6, 5], "bopBuccal": [True, True, True], "bopLingual": [True, True, True], "suppuration": True, "label": "Deep pocketing — active disease", "finding": "Deep pocketing (5mm+) on multiple sites. BOP positive, suppuration noted. Active periodontal disease. CDT code D4341 recommended."}
}
for i in range(1, 33):
    str_i = str(i)
    if str_i not in DEFAULT_PERIO:
        DEFAULT_PERIO[str_i] = {"buccal": [2, 2, 3], "lingual": [2, 2, 2], "bopBuccal": [False, False, False], "bopLingual": [False, False, False], "suppuration": False}

DEFAULT_ENTRIES = [
    {"tooth": "#14", "label": "Periodontal maintenance", "detail": "Probing: 3-3-4 buccal · 3-4-3 lingual · BOP at mesial & distolingual", "cdt": "D4910", "conf": 97, "fee": 148, "color": "var(--orange-c)", "segments": [3, 4, 6]},
    {"tooth": "#3", "label": "Calculus removal — supragingival scaling", "detail": "Scaling performed, all deposits removed", "cdt": "D1110", "conf": 94, "fee": 95, "color": "var(--teal-dark)", "segments": [7]},
    {"tooth": "ALL", "label": "Fluoride varnish applied", "detail": "5% NaF varnish · all surfaces · post-scaling", "cdt": "D1206", "conf": 99, "fee": 48, "color": "var(--teal-dark)", "segments": [8]},
    {"tooth": "OHI", "label": "Oral hygiene instruction", "detail": "Modified Bass brushing technique · interproximal care reviewed", "cdt": "D1330", "conf": 91, "fee": 29, "color": "var(--teal-dark)", "segments": [8]},
    {"tooth": "#32", "label": "Deep pocketing — active disease", "detail": "Probing: 5-5-5 buccal · 5-6-5 lingual · BOP positive · suppuration noted", "cdt": "D4341", "conf": 88, "fee": 180, "color": "var(--red-c)", "segments": [9, 10]},
]

DEFAULT_SUMMARY = {
    "chief_complaint": "Routine perio maintenance and cleaning. Patient reports flossing more regularly since last visit.",
    "clinical_notes": "Periodontal charting reveals pocket depths stable at 3-4mm in maxillary arch, except for active localized pocketing on #32. Supragingival calculus on lingual of tooth #3 scaling completed. Oral hygiene instructions reinforced.",
    "procedures": [
        {"code": "D4910", "desc": "Periodontal maintenance", "fee": 148, "status": "completed"},
        {"code": "D1110", "desc": "Prophylaxis - cleaning", "fee": 95, "status": "completed"},
        {"code": "D1206", "desc": "Fluoride varnish application", "fee": 48, "status": "completed"},
        {"code": "D1330", "desc": "Oral hygiene instructions", "fee": 29, "status": "completed"},
    ],
    "recommendations": [
        {"code": "D4341", "desc": "Periodontal scaling & root planing - 4+ teeth per quad", "fee": 180, "status": "pending", "tooth": "32"}
    ],
    "est_recovery": 272
}

DEFAULT_TRANSCRIPT = (
    "DR: Marcus, let's get started with the full periodontal charting today. "
    "I'll check your probing depths first at six sites per tooth. "
    "PT: Is that going to be the same as last time? I've been flossing more. "
    "DR: Let's see — tooth fourteen buccal: three, three, four. Mesial four millimeters. "
    "Distolingual is five millimeters at fourteen — I'm noting bleeding on probing there. "
    "PT: Is that bleeding a bad sign? "
    "DR: It indicates active inflammation. Your probing depths have improved from four-to-five down to three-to-four since February — that's real progress from the perio maintenance. "
    "Moving to tooth three — buccal two, three, three. Calculus deposits on the lingual, I'll remove those now. "
    "After we finish scaling I'll apply fluoride varnish on all surfaces, and we'll go over brushing technique — I want to reinforce the modified Bass method. "
    "Oh, look at tooth thirty-two — we have pocket depths of five, five, five on the buccal, and five, six, five on the lingual. There is active bleeding and suppuration here, which indicates active periodontal disease. We will need to plan scaling and root planing. "
    "PT: Okay, let's get that scheduled. I want to make sure we keep my gums healthy."
)

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

@router.get("/session/{patient_id}", response_model=ClinicalSessionOut)
def get_session(
    patient_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_user)
):
    try:
        session = db.query(SessionModel).filter(SessionModel.patient_id == patient_id).first()
        if not session:
            # Seed default session for patient in database
            session = SessionModel(
                patient_id=patient_id,
                status="done",
                transcript=DEFAULT_TRANSCRIPT,
                perio_data=DEFAULT_PERIO,
                clinical_entries=DEFAULT_ENTRIES,
                summary_report=DEFAULT_SUMMARY
            )
            db.add(session)
            db.commit()
            db.refresh(session)
        return session
    except Exception as e:
        print(f"Database error in GET /session/{patient_id}: {e}")
        if patient_id not in MOCK_SESSIONS:
            MOCK_SESSIONS[patient_id] = {
                "id": patient_id * 100,
                "patient_id": patient_id,
                "status": "done",
                "transcript": DEFAULT_TRANSCRIPT,
                "perio_data": DEFAULT_PERIO,
                "clinical_entries": DEFAULT_ENTRIES,
                "summary_report": DEFAULT_SUMMARY,
                "created_at": datetime.utcnow()
            }
        return MOCK_SESSIONS[patient_id]

@router.post("/session", response_model=ClinicalSessionOut)
def create_session(
    body: ClinicalSessionCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_user)
):
    try:
        session = SessionModel(
            patient_id=body.patient_id,
            status=body.status,
            transcript=body.transcript,
            perio_data=body.perio_data or DEFAULT_PERIO,
            clinical_entries=body.clinical_entries or DEFAULT_ENTRIES,
            summary_report=body.summary_report or DEFAULT_SUMMARY
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return session
    except Exception as e:
        print(f"Database error in POST /session: {e}")
        new_session = {
            "id": body.patient_id * 100 + 1,
            "patient_id": body.patient_id,
            "status": body.status,
            "transcript": body.transcript,
            "perio_data": body.perio_data or DEFAULT_PERIO,
            "clinical_entries": body.clinical_entries or DEFAULT_ENTRIES,
            "summary_report": body.summary_report or DEFAULT_SUMMARY,
            "created_at": datetime.utcnow()
        }
        MOCK_SESSIONS[body.patient_id] = new_session
        return new_session
