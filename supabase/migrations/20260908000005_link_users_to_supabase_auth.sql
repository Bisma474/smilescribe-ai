-- ============================================================
-- Migration: 005_link_users_to_supabase_auth
-- Description: Link the app's `users` (profile) table to Supabase Auth's
--              auth.users table. Password auth now happens via Supabase Auth;
--              hashed_password is retained only for pre-existing rows and is
--              no longer required for new users.
-- ============================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE users
    ALTER COLUMN hashed_password DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users (auth_user_id);

COMMENT ON COLUMN users.auth_user_id IS 'Links this profile row to auth.users(id) — the Supabase Auth identity. Null for legacy/demo rows created before the Supabase Auth migration.';
COMMENT ON COLUMN users.hashed_password IS 'Legacy bcrypt hash — unused for accounts created via Supabase Auth. Kept for pre-migration rows only.';
