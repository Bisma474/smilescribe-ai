-- ============================================================
-- Migration: 003_create_sessions_and_chart_tables
-- Description: Recording sessions, chart entries, CDT billing
-- ============================================================

-- ── Visit / Recording Sessions ─────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    id              BIGSERIAL PRIMARY KEY,
    patient_id      BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    dentist_id      BIGINT NOT NULL REFERENCES users(id),
    visit_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    duration_sec    INTEGER,                    -- recording length in seconds
    audio_path      TEXT,                       -- Supabase Storage path
    transcript_raw  TEXT,                       -- raw diarized transcript JSON
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

-- ── Periodontal Chart Entries ───────────────────────────────
CREATE TABLE IF NOT EXISTS chart_entries (
    id              BIGSERIAL PRIMARY KEY,
    session_id      BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    tooth_number    TEXT,                        -- e.g. "14", "OHI", "ALL"
    surface         TEXT,                        -- B/L/M/D/O
    finding         TEXT NOT NULL,               -- e.g. "Periodontal maintenance"
    detail          TEXT,
    evidence_spans  JSONB,                       -- [{start,end,text}] from transcript
    source_text     TEXT,                        -- quoted transcript segment
    confidence      NUMERIC(5,2),               -- 0–100
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chart_session ON chart_entries (session_id);

-- ── CDT Billing Codes ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_codes (
    id              BIGSERIAL PRIMARY KEY,
    session_id      BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    cdt_code        TEXT NOT NULL,              -- e.g. "D4910"
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

-- ── Row Level Security ──────────────────────────────────────
ALTER TABLE sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_codes ENABLE ROW LEVEL SECURITY;

-- Sessions: dentists see only their own
CREATE POLICY "sessions_own" ON sessions
    FOR ALL USING (dentist_id IN (
        SELECT id FROM users WHERE id::text = auth.uid()::text
    ));

-- Chart entries inherit from session ownership
CREATE POLICY "chart_entries_via_session" ON chart_entries
    FOR ALL USING (
        session_id IN (
            SELECT id FROM sessions WHERE dentist_id IN (
                SELECT id FROM users WHERE id::text = auth.uid()::text
            )
        )
    );

-- Billing codes same pattern
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
