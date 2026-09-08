from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from supabase_auth.errors import AuthApiError
from sqlalchemy.orm import Session
from app.core.profile_sync import get_or_create_profile, UnclaimedLegacyAccountError
from app.db.session import get_db
from app.db.supabase_client import get_supabase
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    supabase = get_supabase()
    try:
        result = supabase.auth.get_user(token)
    except AuthApiError:
        raise credentials_exc

    if result is None or result.user is None:
        raise credentials_exc

    auth_user = result.user
    # Self-heal: create a local profile row for this Supabase Auth identity
    # if it doesn't have one yet (e.g. a user created directly via the
    # Supabase dashboard). Deliberately does NOT auto-link to an existing
    # unclaimed row by email — see UnclaimedLegacyAccountError.
    try:
        user = get_or_create_profile(db, auth_user.id, auth_user.email)
    except UnclaimedLegacyAccountError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email is linked to an existing account. Please contact support to migrate it.",
        )

    if not user.is_active:
        raise credentials_exc
    return user


def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user
