from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.core.dependencies import get_db, get_current_active_user
from app.models.patient import Patient
from app.models.session import ClinicalSession
from app.models.user import User
from app.services.coding_service import search_catalog, validate_confirmed_procedure
from app.services.ai_note_service import generate_visit_note
from app.services.follow_up_service import build_follow_up_draft
from app.services.risk_flag_service import derive_risk_flags
from app.services.audit_timeline_service import append_audit_event
from app.services.patient_summary_service import build_patient_summary

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
    append_audit_event(session, "procedures_confirmed", f"Confirmed {len(procedures)} completed procedure(s).")
    db.commit()
    db.refresh(session)
    return session

@router.put("/session/{session_id}/ai-note")
def save_ai_note(session_id: int, note: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    session = _owned_session(db, session_id, current_user)
    if not isinstance(note.get("sections", {}), dict):
        raise HTTPException(422, "AI note requires structured sections")
    session.ai_note = note
    append_audit_event(session, "ai_note_saved", "Saved an AI visit note.")
    db.commit()
    db.refresh(session)
    return session
@router.post("/session/{session_id}/generate-ai-note")
def generate_ai_note(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    session = _owned_session(db, session_id, current_user)
    note = generate_visit_note(session.transcript or "", session.clinical_entries or [])
    session.ai_note = note
    append_audit_event(session, "ai_note_generated", "Generated an AI visit note draft.")
    db.commit()
    db.refresh(session)
    return session
@router.get("/review-tasks")
def review_tasks(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    rows = db.query(ClinicalSession, Patient).join(Patient).filter(Patient.practice_id == current_user.id, ClinicalSession.status.in_(["complete", "submitted"])).order_by(ClinicalSession.created_at.desc()).all()
    tasks = []
    for session, patient in rows:
        if session.status == "submitted":
            continue
        name = f"{patient.first_name} {patient.last_name}".strip()
        if session.diarization_status in {"success", "ai_assigned"}:
            tasks.append({"session_id": session.id, "patient_id": patient.id, "patient_name": name, "task": "Verify speaker labels", "action": "transcript"})
        if (session.ai_note or {}).get("status") != "approved":
            tasks.append({"session_id": session.id, "patient_id": patient.id, "patient_name": name, "task": "Review AI visit note", "action": "note"})
        if not (session.clinician_confirmed_procedures or []):
            tasks.append({"session_id": session.id, "patient_id": patient.id, "patient_name": name, "task": "Select completed procedures", "action": "billing"})
    return tasks[:50]
@router.post("/session/{session_id}/generate-follow-up")
def generate_follow_up(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    session = _owned_session(db, session_id, current_user)
    patient = db.query(Patient).filter(Patient.id == session.patient_id).first()
    session.follow_up_draft = build_follow_up_draft(f"{patient.first_name} {patient.last_name}".strip(), session.treatment_opportunities or [])
    append_audit_event(session, "follow_up_generated", "Generated an appointment follow-up draft.")
    db.commit()
    db.refresh(session)
    return session
@router.get("/session/{session_id}/comparison")
def compare_visits(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    current = _owned_session(db, session_id, current_user)
    previous = db.query(ClinicalSession).filter(ClinicalSession.patient_id == current.patient_id, ClinicalSession.created_at < current.created_at, ClinicalSession.status.in_(["complete", "submitted"])).order_by(ClinicalSession.created_at.desc()).first()
    if not previous:
        return {"previous_session_id": None, "new_findings": current.clinical_entries or [], "resolved_findings": [], "perio_change": "No prior completed visit available."}
    current_labels = {str(item.get("label") or "") for item in (current.clinical_entries or [])}
    previous_labels = {str(item.get("label") or "") for item in (previous.clinical_entries or [])}
    return {
        "previous_session_id": previous.id,
        "new_findings": [item for item in (current.clinical_entries or []) if str(item.get("label") or "") not in previous_labels],
        "resolved_findings": [item for item in (previous.clinical_entries or []) if str(item.get("label") or "") not in current_labels],
        "perio_change": "Compare periodontal measurements in the selected visit charts.",
    }
@router.get("/session/{session_id}/risk-flags")
def risk_flags(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    session = _owned_session(db, session_id, current_user)
    return derive_risk_flags(session.clinical_entries or [], session.medications_allergies or {})
@router.get("/session/{session_id}/timeline")
def audit_timeline(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    session = _owned_session(db, session_id, current_user)
    return session.audit_timeline or []

@router.post("/session/{session_id}/generate-patient-summary")
def generate_patient_summary(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    session = _owned_session(db, session_id, current_user)
    session.patient_summary = build_patient_summary(session.ai_note or {}, session.follow_up_draft or {}, session.treatment_opportunities or [])
    append_audit_event(session, "patient_summary_generated", "Generated a patient-friendly after-visit summary draft.")
    db.commit()
    db.refresh(session)
    return session
@router.get("/analytics")
def practice_analytics(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    sessions = db.query(ClinicalSession).join(Patient).filter(Patient.practice_id == current_user.id, ClinicalSession.status.in_(["complete", "submitted"])).all()
    submitted = [session for session in sessions if session.status == "submitted"]
    notes_approved = [session for session in sessions if (session.ai_note or {}).get("status") == "approved"]
    summaries_approved = [session for session in sessions if (session.patient_summary or {}).get("status") == "approved"]
    procedures_confirmed = sum(len(session.clinician_confirmed_procedures or []) for session in sessions)
    return {
        "completed_visits": len(sessions),
        "submitted_visits": len(submitted),
        "approved_notes": len(notes_approved),
        "approved_patient_summaries": len(summaries_approved),
        "confirmed_procedures": procedures_confirmed,
        "note_approval_rate": round((len(notes_approved) / len(sessions)) * 100) if sessions else 0,
    }