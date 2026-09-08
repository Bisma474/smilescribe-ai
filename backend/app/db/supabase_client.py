"""
Supabase client — for Supabase-specific features:
  - File storage (audio recordings)
  - Realtime subscriptions
  - Edge functions / RPC calls

For regular DB queries, use SQLAlchemy via get_db() instead.
"""
from supabase import create_client, Client
from app.core.config import settings

_client: Client | None = None


def get_supabase() -> Client:
    """Return a singleton Supabase client (anon key — safe for server use)."""
    global _client
    if _client is None:
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    return _client


def get_supabase_admin() -> Client:
    """Return a Supabase client with the service role key.
    USE ONLY IN TRUSTED SERVER CONTEXTS — bypasses Row Level Security."""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
