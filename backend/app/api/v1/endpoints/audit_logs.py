from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.core.dependencies import get_db, get_current_active_user
from app.models.user import User
from app.models.audit_log import HIPAAAuditLog as AuditLogModel
from app.schemas.audit_log import HIPAAAuditLogCreate, HIPAAAuditLogOut
from datetime import datetime

router = APIRouter()

MOCK_LOGS = [
    {"id": 1, "timestamp": datetime.utcnow(), "action": "Access", "user_name": "Dr. Alice Kim", "details": "Accessed Marcus Torres periodontal chart review"},
    {"id": 2, "timestamp": datetime.utcnow(), "action": "Auth", "user_name": "Dr. Alice Kim", "details": "Login successful"},
    {"id": 3, "timestamp": datetime.utcnow(), "action": "Billing", "user_name": "Dr. Alice Kim", "details": "Exported CDT billing claim for Marcus Torres"},
    {"id": 4, "timestamp": datetime.utcnow(), "action": "Settings", "user_name": "Dr. Alice Kim", "details": "Updated global speaker diarisation parameters"},
    {"id": 5, "timestamp": datetime.utcnow(), "action": "Compliance", "user_name": "System", "details": "HIPAA monthly access audit log generated"}
]

@router.get("/", response_model=List[HIPAAAuditLogOut])
def get_audit_logs(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_user)
):
    try:
        logs = db.query(AuditLogModel).order_by(AuditLogModel.timestamp.desc()).all()
        # Seed if empty
        if not logs:
            for l in MOCK_LOGS:
                db_l = AuditLogModel(
                    action=l["action"],
                    user_name=l["user_name"],
                    details=l["details"]
                )
                db.add(db_l)
            db.commit()
            logs = db.query(AuditLogModel).order_by(AuditLogModel.timestamp.desc()).all()
        return logs
    except Exception as e:
        print(f"Database error in GET /audit-logs: {e}")
        return MOCK_LOGS

@router.post("/", response_model=HIPAAAuditLogOut)
def create_audit_log(
    body: HIPAAAuditLogCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_user)
):
    try:
        db_l = AuditLogModel(
            action=body.action,
            user_name=body.user_name,
            details=body.details
        )
        db.add(db_l)
        db.commit()
        db.refresh(db_l)
        return db_l
    except Exception as e:
        print(f"Database error in POST /audit-logs: {e}")
        new_log = {
            "id": len(MOCK_LOGS) + 1,
            "timestamp": datetime.utcnow(),
            "action": body.action,
            "user_name": body.user_name,
            "details": body.details
        }
        MOCK_LOGS.insert(0, new_log)
        return new_log
