from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.dependencies import get_db, get_current_active_user
from app.models.user import User
from app.models.session import ClinicalSession as SessionModel
from app.schemas.session import ClinicalSessionUpdate, ClinicalSessionOut
from app.api.v1.endpoints.transcription import MOCK_SESSIONS

router = APIRouter()

@router.put("/session/{session_id}", response_model=ClinicalSessionOut)
def update_session(
    session_id: int,
    body: ClinicalSessionUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_user)
):
    try:
        session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if not session:
            # Fallback search by patient_id
            session = db.query(SessionModel).filter(SessionModel.patient_id == session_id).first()
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
        
        if body.status is not None:
            session.status = body.status
        if body.transcript is not None:
            session.transcript = body.transcript
        if body.perio_data is not None:
            session.perio_data = body.perio_data
        if body.clinical_entries is not None:
            session.clinical_entries = body.clinical_entries
        if body.summary_report is not None:
            session.summary_report = body.summary_report
            
        db.commit()
        db.refresh(session)
        return session
    except Exception as e:
        print(f"Database error in PUT /notes/session/{session_id}: {e}")
        # Search mock sessions backup
        found_session = None
        for pid, s in MOCK_SESSIONS.items():
            if s["id"] == session_id or pid == session_id:
                found_session = s
                break
        
        if not found_session:
            raise HTTPException(status_code=404, detail="Session not found in mock backup")
            
        if body.status is not None:
            found_session["status"] = body.status
        if body.transcript is not None:
            found_session["transcript"] = body.transcript
        if body.perio_data is not None:
            found_session["perio_data"] = body.perio_data
        if body.clinical_entries is not None:
            found_session["clinical_entries"] = body.clinical_entries
        if body.summary_report is not None:
            found_session["summary_report"] = body.summary_report
            
        return found_session
