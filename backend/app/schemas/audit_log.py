from pydantic import BaseModel
from datetime import datetime

class HIPAAAuditLogBase(BaseModel):
    action: str
    user_name: str
    details: str

class HIPAAAuditLogCreate(HIPAAAuditLogBase):
    pass

class HIPAAAuditLogOut(HIPAAAuditLogBase):
    id: int
    timestamp: datetime
    practice_id: int | None = None

    class Config:
        from_attributes = True
