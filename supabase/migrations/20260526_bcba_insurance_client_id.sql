-- ═══════════════════════════════════════════════════
-- BCBA Data Collection — Insurance Client ID
-- 2026-05-26
-- Per Ariana: every insurance assigns a Client ID (subscriber/member ID)
-- to the patient. Different from the prior_auth_number. BOTH appear on
-- every claim, SOAP note, and authorization document.
-- ═══════════════════════════════════════════════════

ALTER TABLE public.practice_clients
  ADD COLUMN IF NOT EXISTS insurance_client_id text,
  ADD COLUMN IF NOT EXISTS payer_name text;

CREATE INDEX IF NOT EXISTS idx_practice_clients_insurance_client_id
  ON public.practice_clients(insurance_client_id)
  WHERE insurance_client_id IS NOT NULL;

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
