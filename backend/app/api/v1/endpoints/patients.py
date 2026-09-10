from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List
from app.core.dependencies import get_db, get_current_active_user
from app.models.user import User
from app.models.patient import Patient as PatientModel
from app.models.session import ClinicalSession as SessionModel
from app.schemas.patient import PatientCreate, PatientOut, PatientUpdate
from app.schemas.dashboard import DashboardStats, RecentSession

router = APIRouter()


@router.get("/", response_model=List[PatientOut])
def get_patients(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    patients = (
        db.query(PatientModel)
        .filter(PatientModel.practice_id == current_user.id)
        .order_by(PatientModel.created_at.desc())
        .all()
    )

    # Attach each patient's most recent session's created_at (last_visit_at
    # on the schema — see its docstring for why this exists) with one
    # grouped query rather than one session lookup per patient.
    last_visits = dict(
        db.query(SessionModel.patient_id, func.max(SessionModel.created_at))
        .join(PatientModel, SessionModel.patient_id == PatientModel.id)
        .filter(PatientModel.practice_id == current_user.id)
        .group_by(SessionModel.patient_id)
        .all()
    )
    for p in patients:
        p.last_visit_at = last_visits.get(p.id)

    return patients


@router.post("/", response_model=PatientOut, status_code=201)
def create_patient(
    body: PatientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    patient = PatientModel(**body.model_dump(), practice_id=current_user.id)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


@router.get("/dashboard-stats", response_model=DashboardStats)
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Real, honestly-computable aggregates for the Dashboard home page —
    replaces the previous hardcoded stats/schedule. Declared ahead of
    GET /{patient_id} so FastAPI doesn't try to parse "dashboard-stats" as
    a patient_id path param."""
    sessions = (
        db.query(SessionModel, PatientModel)
        .join(PatientModel, SessionModel.patient_id == PatientModel.id)
        .filter(PatientModel.practice_id == current_user.id)
        .order_by(SessionModel.created_at.desc())
        .all()
    )

    today = datetime.now(timezone.utc).date()
    today_visits = sum(1 for s, _ in sessions if s.created_at and s.created_at.date() == today)

    # "Pending Review" = visits the AI has finished processing and produced
    # at least one CDT suggestion for, which the dentist hasn't acted on
    # yet — NOT sessions still mid-transcription (those are "processing",
    # a different state, not something to "review").
    pending_review = 0
    revenue_suggested = 0
    for s, _ in sessions:
        # Only count fees from sessions the pipeline actually finished —
        # a session mid-processing or that errored out can still carry a
        # stale summary_report from an earlier successful run, which would
        # otherwise inflate this total with numbers that don't reflect the
        # session's current state.
        if s.status != "complete":
            continue
        recommendations = (s.summary_report or {}).get("recommendations") or []
        if recommendations:
            pending_review += 1
        revenue_suggested += sum(r.get("fee") or 0 for r in recommendations)

    active_patients = (
        db.query(func.count(PatientModel.id))
        .filter(PatientModel.practice_id == current_user.id, PatientModel.is_active.is_(True))
        .scalar()
    )

    recent_sessions = [
        RecentSession(
            patient_id=p.id,
            patient_name=f"{p.first_name} {p.last_name}".strip(),
            status=s.status,
            created_at=s.created_at,
        )
        for s, p in sessions[:5]
    ]

    return DashboardStats(
        today_visits=today_visits,
        pending_review=pending_review,
        revenue_suggested=revenue_suggested,
        active_patients=active_patients or 0,
        recent_sessions=recent_sessions,
    )


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient_by_id(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    patient = (
        db.query(PatientModel)
        .filter(PatientModel.id == patient_id, PatientModel.practice_id == current_user.id)
        .first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@router.put("/{patient_id}", response_model=PatientOut)
def update_patient(
    patient_id: int,
    body: PatientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    patient = (
        db.query(PatientModel)
        .filter(PatientModel.id == patient_id, PatientModel.practice_id == current_user.id)
        .first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(patient, field, value)
    db.commit()
    db.refresh(patient)
    return patient
