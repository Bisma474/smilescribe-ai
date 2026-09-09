from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.core.dependencies import get_db, get_current_active_user
from app.models.user import User
from app.models.audit_log import HIPAAAuditLog as AuditLogModel
from app.schemas.audit_log import HIPAAAuditLogCreate, HIPAAAuditLogOut

router = APIRouter()


@router.get("/", response_model=List[HIPAAAuditLogOut])
def get_audit_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Scoped to the current practice — this endpoint previously had no
    # scoping at all, so every dentist could read every other practice's
    # HIPAA access-log entries (who accessed which patient's chart, and
    # when). Rows created before practice_id existed (practice_id IS NULL)
    # are intentionally excluded rather than shown to everyone.
    return (
        db.query(AuditLogModel)
        .filter(AuditLogModel.practice_id == current_user.id)
        .order_by(AuditLogModel.timestamp.desc())
        .all()
    )


@router.post("/", response_model=HIPAAAuditLogOut, status_code=201)
def create_audit_log(
    body: HIPAAAuditLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    db_l = AuditLogModel(
        action=body.action,
        user_name=body.user_name,
        details=body.details,
        practice_id=current_user.id,
    )
    db.add(db_l)
    db.commit()
    db.refresh(db_l)
    return db_l
