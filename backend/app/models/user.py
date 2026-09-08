from sqlalchemy import Column, Integer, String, Boolean, DateTime, func
from app.db.session import Base


class User(Base):
    """Profile row for a practice user. Identity/auth lives in Supabase Auth
    (auth.users); this row is linked to it via auth_user_id and holds the
    app-specific profile fields (role, practice info, lockout state, etc.)."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    # Links to Supabase Auth's auth.users(id). Nullable only for legacy/demo
    # rows created before this migration.
    auth_user_id = Column(String, unique=True, nullable=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    # Legacy bcrypt hash — unused for accounts created via Supabase Auth.
    hashed_password = Column(String, nullable=True)
    full_name = Column(String, nullable=True)
    role = Column(String, default="dentist")          # dentist | admin | staff
    practice_name = Column(String, nullable=True)
    license_number = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    failed_login_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
