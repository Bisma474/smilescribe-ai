-- ============================================================
-- Migration: 002_create_patients_table
-- Description: Patient records for the dental practice
-- ============================================================

CREATE TABLE IF NOT EXISTS patients (
    id              BIGSERIAL PRIMARY KEY,
    practice_id     BIGINT REFERENCES users(id) ON DELETE CASCADE,
    mrn             TEXT,                          -- Medical Record Number
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

-- Dentists can only see their own patients
CREATE POLICY "patients_own_practice" ON patients
    FOR ALL USING (
        practice_id IN (
            SELECT id FROM users WHERE id::text = auth.uid()::text
        )
    );

COMMENT ON TABLE patients IS 'Dental practice patient records';
