from sqlalchemy import Column, Integer, String, DateTime, func
from app.db.session import Base

class HIPAAAuditLog(Base):
    __tablename__ = "hipaa_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, server_default=func.now())
    action = Column(String, nullable=False) # Access | Auth | Billing | Settings | Compliance
    user_name = Column(String, nullable=False)
    details = Column(String, nullable=False)
