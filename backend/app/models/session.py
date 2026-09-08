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
    created_at = Column(DateTime, server_default=func.now())
