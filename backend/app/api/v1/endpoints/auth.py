from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from supabase_auth.errors import AuthApiError

from app.core.dependencies import get_db, get_current_active_user
from app.core.profile_sync import get_or_create_profile, UnclaimedLegacyAccountError
from app.db.supabase_client import get_supabase, get_supabase_admin
from app.models.user import User
from app.schemas.user import (
    UserRegister, UserLogin, TokenResponse,
    RefreshRequest, UserOut, ChangePasswordRequest, UserUpdate,
)

router = APIRouter()


def _tokens_from_session(session) -> TokenResponse:
    return TokenResponse(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        expires_in=session.expires_in,
    )


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: UserRegister, db: Session = Depends(get_db)):
    supabase = get_supabase()
    try:
        result = supabase.auth.sign_up({
            "email": body.email,
            "password": body.password,
            "options": {"data": {"full_name": body.full_name}},
        })
    except AuthApiError as e:
        raise HTTPException(status_code=400, detail=e.message)

    if result.user is None:
        raise HTTPException(status_code=400, detail="Registration failed")

    try:
        profile = get_or_create_profile(
            db, result.user.id, body.email,
            defaults={
                "full_name": body.full_name,
                "practice_name": body.practice_name,
                "license_number": body.license_number,
            },
        )
    except UnclaimedLegacyAccountError:
        # This email belongs to an existing (pre-migration) profile that
        # isn't linked to any Supabase Auth identity. Undo the just-created
        # auth identity rather than leaving an orphaned account behind, and
        # refuse to silently claim someone else's existing data.
        get_supabase_admin().auth.admin.delete_user(result.user.id)
        raise HTTPException(
            status_code=409,
            detail="This email is linked to an existing account. Please contact support to migrate it.",
        )
    return profile


@router.post("/login", response_model=TokenResponse)
def login(body: UserLogin, db: Session = Depends(get_db)):
    supabase = get_supabase()
    try:
        result = supabase.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
    except AuthApiError:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if result.session is None or result.user is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Ensure a local profile row exists (self-heals for users created
    # directly via Supabase, e.g. through the dashboard). Deliberately does
    # NOT auto-link to an existing unclaimed row by email — see
    # UnclaimedLegacyAccountError.
    try:
        get_or_create_profile(db, result.user.id, body.email)
    except UnclaimedLegacyAccountError:
        raise HTTPException(
            status_code=409,
            detail="This email is linked to an existing account. Please contact support to migrate it.",
        )

    return _tokens_from_session(result.session)


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(body: RefreshRequest):
    supabase = get_supabase()
    try:
        result = supabase.auth.refresh_session(body.refresh_token)
    except AuthApiError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if result.session is None:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    return _tokens_from_session(result.session)


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_active_user)):
    return current_user


@router.post("/change-password", status_code=204)
def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
):
    supabase = get_supabase()
    # Verify the current password by attempting a real sign-in with it.
    try:
        supabase.auth.sign_in_with_password({
            "email": current_user.email,
            "password": body.current_password,
        })
    except AuthApiError:
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    admin = get_supabase_admin()
    try:
        admin.auth.admin.update_user_by_id(current_user.auth_user_id, {"password": body.new_password})
    except AuthApiError as e:
        raise HTTPException(status_code=400, detail=e.message)


@router.post("/logout", status_code=204)
def logout(_: User = Depends(get_current_active_user)):
    # Supabase sessions are verified per-request; the client simply discards
    # its tokens. (A server-side sign-out would require the user's own
    # access token to be forwarded to supabase.auth.sign_out().)
    return


@router.put("/profile", response_model=UserOut)
def update_profile(
    body: UserUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if body.full_name is not None:
        current_user.full_name = body.full_name
    if body.practice_name is not None:
        current_user.practice_name = body.practice_name
    if body.license_number is not None:
        current_user.license_number = body.license_number
    db.commit()
    db.refresh(current_user)
    return current_user
