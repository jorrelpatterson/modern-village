-- ═══════════════════════════════════════════════════
-- BCBA Data Collection — SOAP Auto-fill (sub-project #5)
-- 2026-05-22
-- Adds structured SOAP fields + signature columns to session_notes.
-- Existing free-text fields (interventions, client_response, next_steps,
-- ai_narrative) remain for backward compat with the pre-Foundation flow.
-- ═══════════════════════════════════════════════════

ALTER TABLE public.session_notes
  ADD COLUMN IF NOT EXISTS soap_subjective text,
  ADD COLUMN IF NOT EXISTS soap_objective text,
  ADD COLUMN IF NOT EXISTS soap_assessment text,
  ADD COLUMN IF NOT EXISTS soap_plan text,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_by_name text,
  ADD COLUMN IF NOT EXISTS signed_by_role text;

-- Fast lookup of unsigned SOAP notes for a session
CREATE INDEX IF NOT EXISTS idx_session_notes_unsigned
  ON public.session_notes(session_id)
  WHERE signed_at IS NULL AND session_id IS NOT NULL;

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
