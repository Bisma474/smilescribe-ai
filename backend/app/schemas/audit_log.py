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

    class Config:
        from_attributes = True
