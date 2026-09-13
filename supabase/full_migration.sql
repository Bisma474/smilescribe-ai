-- ============================================================
-- FULL MIGRATION: Run this in Supabase SQL Editor
-- ============================================================

-- ── Migration 001: Users ────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_users_email    ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON users
    FOR SELECT USING (id::text = auth.uid()::text);

CREATE POLICY "service_role_all" ON users
    TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);

COMMENT ON TABLE users IS 'Practice users — dentists, admins, staff';
COMMENT ON COLUMN users.role IS 'dentist | admin | staff';
COMMENT ON COLUMN users.locked_until IS 'Account locked until this time after too many failed logins';

-- ── Migration 002: Patients ─────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
    id              BIGSERIAL PRIMARY KEY,
    practice_id     BIGINT REFERENCES users(id) ON DELETE CASCADE,
    mrn             TEXT,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    dob             DATE,
    email           TEXT,
    phone           TEXT,
    insurance_id    TEXT,
    insurance_plan  TEXT,
    risk_level      TEXT DEFAULT 'normal'
                        CHECK (risk_level IN ('low','normal','high')),
    notes           TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER patients_updated_at
    BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_patients_practice  ON patients (practice_id);
CREATE INDEX IF NOT EXISTS idx_patients_name      ON patients (last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_patients_mrn       ON patients (mrn);

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patients_own_practice" ON patients
    FOR ALL USING (
        practice_id IN (
            SELECT id FROM users WHERE id::text = auth.uid()::text
        )
    );

COMMENT ON TABLE patients IS 'Dental practice patient records';

-- ── Migration 003: Sessions, Charts, Billing ────────────────
CREATE TABLE IF NOT EXISTS sessions (
    id              BIGSERIAL PRIMARY KEY,
    patient_id      BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    dentist_id      BIGINT NOT NULL REFERENCES users(id),
    visit_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    duration_sec    INTEGER,
    audio_path      TEXT,
    transcript_raw  TEXT,
    status          TEXT NOT NULL DEFAULT 'recording'
                        CHECK (status IN ('recording','processing','complete','error')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER sessions_updated_at
    BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_sessions_patient  ON sessions (patient_id);
CREATE INDEX IF NOT EXISTS idx_sessions_dentist  ON sessions (dentist_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date     ON sessions (visit_date DESC);

CREATE TABLE IF NOT EXISTS chart_entries (
    id              BIGSERIAL PRIMARY KEY,
    session_id      BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    tooth_number    TEXT,
    surface         TEXT,
    finding         TEXT NOT NULL,
    detail          TEXT,
    evidence_spans  JSONB,
    source_text     TEXT,
    confidence      NUMERIC(5,2),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chart_session ON chart_entries (session_id);

CREATE TABLE IF NOT EXISTS billing_codes (
    id              BIGSERIAL PRIMARY KEY,
    session_id      BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    cdt_code        TEXT NOT NULL,
    description     TEXT NOT NULL,
    fee_usd         NUMERIC(10,2),
    confidence      NUMERIC(5,2),
    is_confirmed    BOOLEAN DEFAULT FALSE,
    is_submitted    BOOLEAN DEFAULT FALSE,
    chart_entry_id  BIGINT REFERENCES chart_entries(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_session ON billing_codes (session_id);
CREATE INDEX IF NOT EXISTS idx_billing_code    ON billing_codes (cdt_code);

ALTER TABLE sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions_own" ON sessions
    FOR ALL USING (dentist_id IN (
        SELECT id FROM users WHERE id::text = auth.uid()::text
    ));

CREATE POLICY "chart_entries_via_session" ON chart_entries
    FOR ALL USING (
        session_id IN (
            SELECT id FROM sessions WHERE dentist_id IN (
                SELECT id FROM users WHERE id::text = auth.uid()::text
            )
        )
    );

CREATE POLICY "billing_codes_via_session" ON billing_codes
    FOR ALL USING (
        session_id IN (
            SELECT id FROM sessions WHERE dentist_id IN (
                SELECT id FROM users WHERE id::text = auth.uid()::text
            )
        )
    );

COMMENT ON TABLE sessions      IS 'Dental visit recording sessions';
COMMENT ON TABLE chart_entries IS 'AI-extracted clinical chart entries with evidence spans';
COMMENT ON TABLE billing_codes IS 'CDT billing codes assigned per session';

-- ── Migration 004: Demo Seed Data ───────────────────────────
INSERT INTO users (email, hashed_password, full_name, role, practice_name, license_number, is_active, is_verified)
VALUES (
    'dr.kim@brightsmile.com',
    '$2b$12$2Ul6UE.GHKk4BubpPTCf6OYRPkONPPd9tOV27DF8eqp73P6aS.Kbq',
    'Dr. Alice Kim',
    'dentist',
    'Bright Smile Dental',
    'CA-284710',
    TRUE,
    TRUE
)
ON CONFLICT (email) DO NOTHING;

WITH dentist AS (SELECT id FROM users WHERE email = 'dr.kim@brightsmile.com' LIMIT 1)
INSERT INTO patients (practice_id, first_name, last_name, dob, email, phone, risk_level)
SELECT
    dentist.id, p.first_name, p.last_name, p.dob::DATE, p.email, p.phone, p.risk_level
FROM dentist,
(VALUES
    ('Sarah',  'Johnson', '1985-06-12', 'sarah.j@email.com',  '555-0101', 'low'),
    ('Marcus', 'Torres',  '1981-03-14', 'marcus.t@email.com', '555-0102', 'high'),
    ('Lisa',   'Nguyen',  '1993-09-28', 'lisa.n@email.com',   '555-0103', 'normal'),
    ('Robert', 'Park',    '1968-11-02', 'robert.p@email.com', '555-0104', 'normal'),
    ('Ana',    'Patel',   '1990-02-14', 'ana.p@email.com',    '555-0105', 'high'),
    ('Julia',  'Lee',     '2001-12-18', 'julia.l@email.com',  '555-0106', 'high')
) AS p(first_name, last_name, dob, email, phone, risk_level)
ON CONFLICT DO NOTHING;
