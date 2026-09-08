from pydantic import BaseModel

class PatientBase(BaseModel):
    name: str
    dob: str | None = None
    meta: str | None = None
    date: str = "Now"
    initials: str | None = None
    badge_text: str | None = None
    badge: str | None = None
    bg: str | None = None
    color: str | None = None

class PatientCreate(PatientBase):
    pass

class PatientOut(PatientBase):
    id: int
    user_id: int | None = None

    class Config:
        from_attributes = True
