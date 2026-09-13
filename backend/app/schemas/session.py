from pydantic import BaseModel
from datetime import datetime
from typing import Any, Dict, List

class ClinicalSessionBase(BaseModel):
    patient_id: int
    status: str = "done"
    transcript: str | None = None
    perio_data: Dict[str, Any] | None = None
    clinical_entries: List[Any] | None = None
    summary_report: Dict[str, Any] | None = None

class ClinicalSessionCreate(ClinicalSessionBase):
    pass

class ClinicalSessionUpdate(BaseModel):
    status: str | None = None
    transcript: str | None = None
    perio_data: Dict[str, Any] | None = None
    clinical_entries: List[Any] | None = None
    summary_report: Dict[str, Any] | None = None

class ClinicalSessionOut(ClinicalSessionBase):
    id: int
    error_message: str | None = None
    diarization_status: str = "not_run"  # success | ai_assigned | unavailable | failed | not_run
    speakers_swapped: bool = False
    created_at: datetime

    class Config:
        from_attributes = True
