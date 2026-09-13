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
    # Most recent session's created_at for this patient, or None if they've
    # never been recorded — not a real column, attached in the endpoint via
    # a join so the frontend's "Today" filter can mean "seen today" rather
    # than "profile created today" (a brand-new patient's profile is almost
    # never created the same day they're actually filtered for, since it's
    # usually created once and never touched again).
    last_visit_at: datetime | None = None

    class Config:
        from_attributes = True
