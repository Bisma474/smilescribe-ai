-- ============================================================
-- Migration: 001_create_users_table
-- Description: Core users table for DentXcribe AI auth
-- ============================================================

-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    id                    BIGSERIAL PRIMARY KEY,
    email                 TEXT NOT NULL UNIQUE,
    hashed_password       TEXT NOT NULL,
    full_name             TEXT,
    role                  TEXT NOT NULL DEFAULT 'dentist'
                              CHECK (role IN ('dentist','admin','staff')),
    practice_name         TEXT,
    license_number        TEXT,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified           BOOLEAN NOT NULL DEFAULT FALSE,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email    ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active);

-- Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: users can only read their own row
CREATE POLICY "users_select_own" ON users
    FOR SELECT USING (id::text = auth.uid()::text);

-- Policy: backend service role can do everything (used by FastAPI)
CREATE POLICY "service_role_all" ON users
    TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);

COMMENT ON TABLE users IS 'Practice users — dentists, admins, staff';
COMMENT ON COLUMN users.role IS 'dentist | admin | staff';
COMMENT ON COLUMN users.locked_until IS 'Account locked until this time after too many failed logins';
