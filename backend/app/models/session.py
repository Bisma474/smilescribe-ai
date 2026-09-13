from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, JSON, Boolean, func
from app.db.session import Base

class ClinicalSession(Base):
    __tablename__ = "clinical_sessions"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    status = Column(String, default="done")
    transcript = Column(Text, nullable=True)
    # How speaker labeling turned out for this session's transcript — the
    # UI uses this to show the clinician whether "Dentist:"/"Patient:"
    # labels are present and, if so, whether they're a positional guess
    # that can be swapped. See diarization_service.py for what produces
    # each value:
    #   "success"     - speaker-labeled transcript was produced
    #   "unavailable" - diarization skipped (no HF_TOKEN/model access) or
    #                   there weren't enough distinct speakers to label
    #   "failed"      - diarization was attempted but errored out
    #   "not_run"     - default, before the background job reaches this step
    diarization_status = Column(String, default="not_run")
    # True once the clinician has flipped the Dentist/Patient labels
    # because the first-speaker-is-dentist heuristic guessed wrong for
    # this recording (see PATCH /session/{id}/swap-speakers).
    speakers_swapped = Column(Boolean, default=False)
    perio_data = Column(JSON, nullable=True)
    clinical_entries = Column(JSON, nullable=True)
    summary_report = Column(JSON, nullable=True)
    treatment_opportunities = Column(JSON, nullable=True)
    candidate_procedures = Column(JSON, nullable=True)
    clinician_confirmed_procedures = Column(JSON, nullable=True)
    ai_note = Column(JSON, nullable=True)
    medications_allergies = Column(JSON, nullable=True)
    follow_up_draft = Column(JSON, nullable=True)
    audit_timeline = Column(JSON, nullable=True)
    patient_summary = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    # Set to a fresh random value on every new recording job. The background
    # job only writes its results if this still matches — protects against
    # an older, slower job overwriting a newer recording's results if a
    # patient's session gets re-recorded before the previous job finishes.
    job_token = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
