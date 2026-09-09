-- ============================================================
-- Migration: 006_add_session_error_message
-- Description: Add error_message to clinical_sessions so a failed
--              background transcription/extraction job can report why,
--              instead of leaving the session silently stuck in
--              status="processing".
-- ============================================================

ALTER TABLE clinical_sessions
    ADD COLUMN IF NOT EXISTS error_message TEXT;

COMMENT ON COLUMN clinical_sessions.error_message IS 'Set when status="error" — the exception message from the background transcription/extraction job.';
