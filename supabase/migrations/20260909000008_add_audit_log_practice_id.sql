-- ============================================================
-- Migration: 008_add_audit_log_practice_id
-- Description: Add practice_id to hipaa_audit_logs. The endpoint serving
--              this table had NO tenant scoping at all — every
--              authenticated dentist could read every other practice's
--              HIPAA access-log entries (which patient's chart was
--              accessed, when, by whom). This column lets reads/writes
--              be scoped by practice_id == current_user.id, matching
--              every other practice-owned table. Nullable because
--              existing rows (including the previous mock-seeded ones)
--              have no real owner.
-- ============================================================

ALTER TABLE hipaa_audit_logs
    ADD COLUMN IF NOT EXISTS practice_id INTEGER REFERENCES users(id);

COMMENT ON COLUMN hipaa_audit_logs.practice_id IS 'The dentist/practice this log entry belongs to. Null on rows created before this column existed.';
