from datetime import date as date_type, datetime
from pydantic import BaseModel


class PatientBase(BaseModel):
    first_name: str
    last_name: str
    dob: date_type | None = None
    email: str | None = None
    phone: str | None = None
    mrn: str | None = None
    insurance_id: str | None = None
    insurance_plan: str | None = None
    risk_level: str | None = None
    notes: str | None = None


class PatientCreate(PatientBase):
    pass


class PatientUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    dob: date_type | None = None
    email: str | None = None
    phone: str | None = None
    mrn: str | None = None
    insurance_id: str | None = None
    insurance_plan: str | None = None
    risk_level: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class PatientOut(PatientBase):
    id: int
    practice_id: int | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
