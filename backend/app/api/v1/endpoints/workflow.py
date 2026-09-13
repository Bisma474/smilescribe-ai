from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.core.dependencies import get_db, get_current_active_user
from app.models.patient import Patient
from app.models.session import ClinicalSession
from app.models.user import User
from app.services.coding_service import search_catalog, validate_confirmed_procedure
from app.services.ai_note_service import generate_visit_note

router = APIRouter()

def _owned_session(db: Session, session_id: int, user: User) -> ClinicalSession:
    session = db.query(ClinicalSession).join(Patient).filter(ClinicalSession.id == session_id, Patient.practice_id == user.id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    return session

@router.get("/cdt-catalog")
def cdt_catalog(q: str = Query(default="", max_length=100), current_user: User = Depends(get_current_active_user)):
    return search_catalog(q)

@router.get("/review-queue")
def review_queue(status: str = Query(default="needs_review"), q: str = Query(default="", max_length=100), db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    query = db.query(ClinicalSession, Patient).join(Patient).filter(Patient.practice_id == current_user.id, ClinicalSession.status != "new").order_by(ClinicalSession.created_at.desc())
    rows = []
    term = q.lower().strip()
    for session, patient in query.all():
        confirmed = session.clinician_confirmed_procedures or []
        note = session.ai_note or {}
        coding_status = "submitted" if session.status == "submitted" else ("ready" if confirmed else "needs_review")
        if status != "all" and coding_status != status:
            continue
        name = f"{patient.first_name} {patient.last_name}".strip()
        if term and term not in name.lower() and term not in str(patient.mrn or "").lower():
            continue
        rows.append({"session_id": session.id, "patient_id": patient.id, "patient_name": name, "mrn": patient.mrn, "created_at": session.created_at, "status": session.status, "diarization_status": session.diarization_status, "note_status": note.get("status", "not_started"), "coding_status": coding_status})
    return rows

@router.put("/session/{session_id}/confirmed-procedures")
def save_confirmed_procedures(session_id: int, procedures: list[dict], db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    session = _owned_session(db, session_id, current_user)
    errors = [error for procedure in procedures for error in validate_confirmed_procedure(procedure)]
    if errors:
        raise HTTPException(422, {"errors": errors})
    session.clinician_confirmed_procedures = [{**p, "status": "confirmed"} for p in procedures]
    db.commit()
    db.refresh(session)
    return session

@router.put("/session/{session_id}/ai-note")
def save_ai_note(session_id: int, note: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    session = _owned_session(db, session_id, current_user)
    if not isinstance(note.get("sections", {}), dict):
        raise HTTPException(422, "AI note requires structured sections")
    session.ai_note = note
    db.commit()
    db.refresh(session)
    return session
@router.post("/session/{session_id}/generate-ai-note")
def generate_ai_note(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    session = _owned_session(db, session_id, current_user)
    note = generate_visit_note(session.transcript or "", session.clinical_entries or [])
    session.ai_note = note
    db.commit()
    db.refresh(session)
    return session