from sqlalchemy import Column, Integer, String, ForeignKey
from app.db.session import Base

class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    dob = Column(String, nullable=True)
    meta = Column(String, nullable=True)
    date = Column(String, default="Now")
    initials = Column(String, nullable=True)
    badge_text = Column(String, nullable=True)
    badge = Column(String, nullable=True)
    bg = Column(String, nullable=True)
    color = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
