ALTER TABLE clinical_sessions
  ADD COLUMN IF NOT EXISTS treatment_opportunities JSONB,
  ADD COLUMN IF NOT EXISTS candidate_procedures JSONB,
  ADD COLUMN IF NOT EXISTS clinician_confirmed_procedures JSONB,
  ADD COLUMN IF NOT EXISTS ai_note JSONB;