"""
Supabase client — for Supabase-specific features:
  - Auth (sign up / sign in / token verification)
  - File storage (audio recordings)
  - Realtime subscriptions
  - Edge functions / RPC calls

For regular DB queries, use SQLAlchemy via get_db() instead.

Both factories return a fresh Client per call rather than a cached
singleton: the auth sub-client is stateful (sign_in_with_password /
refresh_session store a "current session" on the client instance and can
spin up an auto-refresh task), and FastAPI's sync endpoints run on a shared
thread pool — a shared client would let concurrent requests race on that
session state. Client construction is cheap (no network I/O), so creating
one per request is not a meaningful cost.
"""
from supabase import create_client, Client
from app.core.config import settings


def get_supabase() -> Client:
    """Return a new Supabase client (anon key — safe for server use)."""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)


def get_supabase_admin() -> Client:
    """Return a new Supabase client with the service role key.
    USE ONLY IN TRUSTED SERVER CONTEXTS — bypasses Row Level Security."""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
