from sqlalchemy.orm import Session
from app.models.user import User


class UnclaimedLegacyAccountError(Exception):
    """Raised when an email matches an existing profile row that has not
    been linked to any Supabase Auth identity yet (a pre-migration legacy
    row). We deliberately do NOT auto-link on email match alone — that
    would let anyone who merely knows a victim's email address claim their
    existing profile (and all data owned by it) by registering a new
    Supabase Auth account with that email. Linking such rows requires an
    explicit, verified migration step (e.g. an admin action), not an
    automatic one triggered by an unauthenticated register/login call."""


def get_or_create_profile(db: Session, auth_user_id: str, email: str, defaults: dict | None = None) -> User:
    """Find the local profile row linked to a Supabase Auth user, creating
    one if this is the first time we've seen this auth identity (e.g. a
    user created directly in the Supabase dashboard).

    Raises UnclaimedLegacyAccountError if the email belongs to an existing
    row that isn't linked to any auth identity yet — see that class's
    docstring for why this is not auto-linked."""
    user = db.query(User).filter(User.auth_user_id == auth_user_id).first()
    if user:
        return user

    if db.query(User).filter(User.email == email).first():
        raise UnclaimedLegacyAccountError(email)

    defaults = defaults or {}
    user = User(
        auth_user_id=auth_user_id,
        email=email,
        full_name=defaults.get("full_name"),
        practice_name=defaults.get("practice_name"),
        license_number=defaults.get("license_number"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
