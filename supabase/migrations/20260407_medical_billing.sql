-- ═══════════════════════════════════════════════════
-- Medical Billing Module
-- 2026-04-07
-- ═══════════════════════════════════════════════════

-- 1. Claims table — one claim per session note
CREATE TABLE IF NOT EXISTS public.claims (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_note_id uuid REFERENCES public.session_notes(id) ON DELETE CASCADE NOT NULL,
  provider_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  child_id uuid REFERENCES public.children(id) ON DELETE CASCADE NOT NULL,
  payer_name text NOT NULL,
  payer_id text,
  cpt_code text NOT NULL,
  units integer NOT NULL DEFAULT 1,
  amount decimal(10,2),
  status text DEFAULT 'pending',
  submitted_at timestamptz,
  paid_at timestamptz,
  paid_amount decimal(10,2),
  denied_reason text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers view own claims"
  ON public.claims FOR SELECT
  USING (auth.uid() = provider_id);

CREATE POLICY "Providers create claims"
  ON public.claims FOR INSERT
  WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Providers update own claims"
  ON public.claims FOR UPDATE
  USING (auth.uid() = provider_id);

CREATE POLICY "Providers delete own claims"
  ON public.claims FOR DELETE
  USING (auth.uid() = provider_id);

CREATE POLICY "Admins view all claims"
  ON public.claims FOR SELECT
  USING (public.is_admin());

-- 2. Payer enrollments — which insurance companies the BCBA is credentialed with
CREATE TABLE IF NOT EXISTS public.payer_enrollments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  payer_name text NOT NULL,
  payer_id text,
  enrollment_status text DEFAULT 'pending',
  credentialed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.payer_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers view own payers"
  ON public.payer_enrollments FOR SELECT
  USING (auth.uid() = provider_id);

CREATE POLICY "Providers manage own payers"
  ON public.payer_enrollments FOR INSERT
  WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Providers update own payers"
  ON public.payer_enrollments FOR UPDATE
  USING (auth.uid() = provider_id);

CREATE POLICY "Providers delete own payers"
  ON public.payer_enrollments FOR DELETE
  USING (auth.uid() = provider_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_claims_provider ON public.claims(provider_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON public.claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_session ON public.claims(session_note_id);
CREATE INDEX IF NOT EXISTS idx_payer_provider ON public.payer_enrollments(provider_id);
