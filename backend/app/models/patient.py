from sqlalchemy import Column, Boolean, Date, DateTime, Integer, String, Text, ForeignKey, func
from app.db.session import Base


class Patient(Base):
    """Matches the real `patients` table created by
    supabase/migrations/20260501000002_create_patients_table.sql.

    NOTE: this model previously declared a completely different set of
    columns (name, dob, meta, date, initials, badge_text, badge, bg, color,
    user_id) that don't exist in the actual table — every ORM query on this
    model was silently failing and falling back to hardcoded mock data
    (see patients.py's except-blocks). This fixes the model to match
    reality; patients.py itself is not yet updated to use these corrected
    field names (that's Phase 3 — real dashboard/patients data) and will
    keep falling back to mock in the meantime, same as before this fix."""
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    practice_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    mrn = Column(String, nullable=True)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    dob = Column(Date, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    insurance_id = Column(String, nullable=True)
    insurance_plan = Column(String, nullable=True)
    risk_level = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
