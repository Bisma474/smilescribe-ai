from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.dependencies import get_db, get_current_active_user
from app.models.patient import Patient as PatientModel
from app.models.user import User
from app.models.session import ClinicalSession as SessionModel
from app.schemas.session import ClinicalSessionUpdate, ClinicalSessionOut
from app.services.audit_timeline_service import append_audit_event

router = APIRouter()


@router.put("/session/{session_id}", response_model=ClinicalSessionOut)
def update_session(
    session_id: int,
    body: ClinicalSessionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Scoped by the owning patient's practice_id — this endpoint previously
    # had no ownership check at all, so any authenticated dentist could
    # overwrite any other practice's session (transcript, clinical
    # findings, perio data) just by guessing a session_id.
    session = (
        db.query(SessionModel)
        .join(PatientModel, SessionModel.patient_id == PatientModel.id)
        .filter(SessionModel.id == session_id, PatientModel.practice_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if body.status is not None:
        if session.status == "submitted":
            raise HTTPException(status_code=409, detail="This visit was already submitted and cannot be submitted again.")
        if body.status == "submitted" and not (session.clinician_confirmed_procedures or []):
            raise HTTPException(status_code=422, detail="Add and confirm at least one completed procedure before submitting.")
        session.status = body.status
        if body.status == "submitted":
            append_audit_event(session, "visit_submitted", "Submitted visit for billing.")
    if body.transcript is not None:
        session.transcript = body.transcript
    if body.perio_data is not None:
        session.perio_data = body.perio_data
    if body.clinical_entries is not None:
        session.clinical_entries = body.clinical_entries
    if body.summary_report is not None:
        session.summary_report = body.summary_report
    if body.treatment_opportunities is not None:
        session.treatment_opportunities = body.treatment_opportunities
    if body.candidate_procedures is not None:
        session.candidate_procedures = body.candidate_procedures
    if body.clinician_confirmed_procedures is not None:
        session.clinician_confirmed_procedures = body.clinician_confirmed_procedures
    if body.ai_note is not None:
        session.ai_note = body.ai_note
    if body.patient_summary is not None:
        session.patient_summary = body.patient_summary

    db.commit()
    db.refresh(session)
    return session
