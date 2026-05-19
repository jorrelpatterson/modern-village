-- ═══════════════════════════════════════════════════
-- BCBA Data Collection — Per-CPT Authorizations
-- 2026-05-27
-- Per Ariana: one client usually has multiple active CPT codes
-- simultaneously (97151 assessment + 97153 tech + 97155 BCBA supervision
-- + 97156 family guidance), and each code has its own weekly-hour cap on
-- the insurance authorization letter.
--
-- Replaces the single practice_clients.service_type + .weekly_hours_authorized
-- with a child table. Old columns stay for legacy reads; new flow writes here.
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.practice_client_authorizations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  practice_client_id uuid REFERENCES public.practice_clients(id) ON DELETE CASCADE NOT NULL,
  cpt_code text NOT NULL,
  weekly_hours_authorized numeric NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (practice_client_id, cpt_code)
);

CREATE INDEX IF NOT EXISTS idx_pca_client
  ON public.practice_client_authorizations(practice_client_id);

ALTER TABLE public.practice_client_authorizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read authorizations" ON public.practice_client_authorizations
  FOR SELECT USING (
    public.is_practice_member((
      SELECT pc.practice_id FROM public.practice_clients pc WHERE pc.id = practice_client_id
    )) OR public.is_admin()
  );

CREATE POLICY "BCBA writes authorizations" ON public.practice_client_authorizations
  FOR ALL USING (
    public.is_practice_bcba((
      SELECT pc.practice_id FROM public.practice_clients pc WHERE pc.id = practice_client_id
    )) OR public.is_admin()
  )
  WITH CHECK (
    public.is_practice_bcba((
      SELECT pc.practice_id FROM public.practice_clients pc WHERE pc.id = practice_client_id
    )) OR public.is_admin()
  );

-- Seed from legacy single-CPT data so existing clients keep working
INSERT INTO public.practice_client_authorizations (practice_client_id, cpt_code, weekly_hours_authorized)
SELECT id, service_type, COALESCE(weekly_hours_authorized, 0)
FROM public.practice_clients
WHERE service_type IS NOT NULL
ON CONFLICT (practice_client_id, cpt_code) DO NOTHING;

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
