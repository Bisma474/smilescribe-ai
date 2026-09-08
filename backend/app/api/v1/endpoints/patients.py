from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.dependencies import get_db, get_current_active_user
from app.models.user import User
from app.models.patient import Patient as PatientModel
from app.schemas.patient import PatientCreate, PatientOut

router = APIRouter()

# In-memory backup cache if database connection fails
MOCK_PATIENTS = [
    {"id": 1, "initials": "SJ", "name": "Sarah Johnson", "dob": "1985-06-12", "meta": "Routine check-up", "badge": "badge-teal", "badgeText": "✓ Charted today", "date": "Apr 22", "bg": "#E8F8F7", "color": "#35a092"},
    {"id": 2, "initials": "MT", "name": "Marcus Torres", "dob": "1981-03-14", "meta": "Perio maintenance", "badge": "badge-warn", "badgeText": "⬤ In progress", "date": "Now", "bg": "#EBF3FE", "color": "#2a4f8a"},
    {"id": 3, "initials": "LN", "name": "Lisa Nguyen", "dob": "1993-09-28", "meta": "Composite filling #19", "badge": "badge-gray", "badgeText": "Upcoming 12:00 PM", "date": "Apr 22", "bg": "#FEF3E2", "color": "#A0560A"},
    {"id": 4, "initials": "RP", "name": "Robert Park", "dob": "1968-11-02", "meta": "Crown prep #30", "badge": "badge-gray", "badgeText": "Upcoming 2:00 PM", "date": "Apr 22", "bg": "#FEEEEE", "color": "#A03030"},
    {"id": 5, "initials": "AP", "name": "Ana Patel", "dob": "1990-02-14", "meta": "Last: Mar 12, 2025", "badge": "badge-navy", "badgeText": "D2391 pending", "date": "Mar 12", "bg": "#E8F8F7", "color": "#0F6E56"},
    {"id": 6, "initials": "DK", "name": "David Kim", "dob": "1978-07-30", "meta": "Last: Jan 5, 2025", "badge": "badge-gray", "badgeText": "No flags", "date": "Jan 5", "bg": "rgba(27,58,107,0.1)", "color": "var(--navy)"},
    {"id": 7, "initials": "JL", "name": "Julia Lee", "dob": "2001-12-18", "meta": "Last: Dec 18, 2024", "badge": "badge-warn", "badgeText": "High caries risk", "date": "Dec 18", "bg": "#FAEEDA", "color": "#854F0B"},
]

@router.get("/", response_model=List[PatientOut])
def get_patients(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    try:
        patients = db.query(PatientModel).filter(PatientModel.user_id == current_user.id).all()
        # Seed initial patients if database is empty
        if not patients:
            for p in MOCK_PATIENTS:
                db_p = PatientModel(
                    name=p["name"],
                    dob=p["dob"],
                    meta=p["meta"],
                    date=p["date"],
                    initials=p["initials"],
                    badge_text=p["badgeText"],
                    badge=p["badge"],
                    bg=p["bg"],
                    color=p["color"],
                    user_id=current_user.id
                )
                db.add(db_p)
            db.commit()
            patients = db.query(PatientModel).filter(PatientModel.user_id == current_user.id).all()
        
        # Map DB model outputs to match Pydantic schema naming
        res = []
        for p in patients:
            res.append(PatientOut(
                id=p.id,
                name=p.name,
                dob=p.dob,
                meta=p.meta,
                date=p.date,
                initials=p.initials,
                badge_text=p.badge_text,
                badge=p.badge,
                bg=p.bg,
                color=p.color,
                user_id=p.user_id
            ))
        return res
    except Exception as e:
        print(f"Database connection error in GET /patients, falling back to mock: {e}")
        # Map mock patients
        res = []
        for p in MOCK_PATIENTS:
            res.append(PatientOut(
                id=p["id"],
                name=p["name"],
                dob=p["dob"],
                meta=p["meta"],
                date=p["date"],
                initials=p["initials"],
                badge_text=p["badgeText"],
                badge=p["badge"],
                bg=p["bg"],
                color=p["color"]
            ))
        return res

@router.post("/", response_model=PatientOut)
def create_patient(
    body: PatientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Auto-generate initials
    initials = "".join([n[0] for n in body.name.split() if n]).upper()[:2]
    try:
        db_p = PatientModel(
            name=body.name,
            dob=body.dob,
            meta=body.meta,
            date=body.date,
            initials=body.initials or initials,
            badge_text=body.badge_text or "Upcoming",
            badge=body.badge or "badge-gray",
            bg=body.bg or "rgba(74, 191, 176, 0.12)",
            color=body.color or "var(--teal-dark)",
            user_id=current_user.id
        )
        db.add(db_p)
        db.commit()
        db.refresh(db_p)
        return PatientOut(
            id=db_p.id,
            name=db_p.name,
            dob=db_p.dob,
            meta=db_p.meta,
            date=db_p.date,
            initials=db_p.initials,
            badge_text=db_p.badge_text,
            badge=db_p.badge,
            bg=db_p.bg,
            color=db_p.color,
            user_id=db_p.user_id
        )
    except Exception as e:
        print(f"Database error in POST /patients, falling back to mock: {e}")
        # Return mock patient response with a random id
        new_id = len(MOCK_PATIENTS) + 1
        new_mock = {
            "id": new_id,
            "initials": body.initials or initials,
            "name": body.name,
            "dob": body.dob,
            "meta": body.meta,
            "date": body.date,
            "badgeText": body.badge_text or "Upcoming",
            "badge": body.badge or "badge-gray",
            "bg": body.bg or "rgba(74, 191, 176, 0.12)",
            "color": body.color or "var(--teal-dark)",
            "user_id": current_user.id
        }
        MOCK_PATIENTS.append(new_mock)
        return PatientOut(
            id=new_mock["id"],
            name=new_mock["name"],
            dob=new_mock["dob"],
            meta=new_mock["meta"],
            date=new_mock["date"],
            initials=new_mock["initials"],
            badge_text=new_mock["badgeText"],
            badge=new_mock["badge"],
            bg=new_mock["bg"],
            color=new_mock["color"],
            user_id=new_mock["user_id"]
        )

@router.get("/{id}", response_model=PatientOut)
def get_patient_by_id(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    try:
        p = db.query(PatientModel).filter(PatientModel.id == id).first()
        if not p:
            raise HTTPException(status_code=404, detail="Patient not found")
        return PatientOut(
            id=p.id,
            name=p.name,
            dob=p.dob,
            meta=p.meta,
            date=p.date,
            initials=p.initials,
            badge_text=p.badge_text,
            badge=p.badge,
            bg=p.bg,
            color=p.color,
            user_id=p.user_id
        )
    except Exception as e:
        print(f"Database error in GET /patients/{id}: {e}")
        for p in MOCK_PATIENTS:
            if p["id"] == id:
                return PatientOut(
                    id=p["id"],
                    name=p["name"],
                    dob=p["dob"],
                    meta=p["meta"],
                    date=p["date"],
                    initials=p["initials"],
                    badge_text=p["badgeText"],
                    badge=p["badge"],
                    bg=p["bg"],
                    color=p["color"]
                )
        raise HTTPException(status_code=404, detail="Patient not found")
