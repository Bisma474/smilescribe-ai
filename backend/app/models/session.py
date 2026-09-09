from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, JSON, func
from app.db.session import Base

class ClinicalSession(Base):
    __tablename__ = "clinical_sessions"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    status = Column(String, default="done")
    transcript = Column(Text, nullable=True)
    perio_data = Column(JSON, nullable=True)
    clinical_entries = Column(JSON, nullable=True)
    summary_report = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    # Set to a fresh random value on every new recording job. The background
    # job only writes its results if this still matches — protects against
    # an older, slower job overwriting a newer recording's results if a
    # patient's session gets re-recorded before the previous job finishes.
    job_token = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
