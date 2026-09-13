from datetime import datetime
from pydantic import BaseModel


class RecentSession(BaseModel):
    patient_id: int
    patient_name: str
    status: str
    created_at: datetime


class DashboardStats(BaseModel):
    today_visits: int
    pending_review: int
    revenue_suggested: int
    active_patients: int
    recent_sessions: list[RecentSession]
