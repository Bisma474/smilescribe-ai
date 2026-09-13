-- ============================================================
-- Migration: 007_add_session_job_token
-- Description: Add job_token to clinical_sessions so a stale background
--              transcription job (from a re-recorded session) can detect
--              it's been superseded and avoid overwriting newer results.
-- ============================================================

ALTER TABLE clinical_sessions
    ADD COLUMN IF NOT EXISTS job_token TEXT;

COMMENT ON COLUMN clinical_sessions.job_token IS 'Set to a fresh random value on every new recording job; the background job only writes results if this still matches.';
