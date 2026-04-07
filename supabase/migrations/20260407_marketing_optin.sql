-- ═══════════════════════════════════════════════════
-- Marketing Opt-In & Unsubscribe Infrastructure
-- 2026-04-07
-- ═══════════════════════════════════════════════════

-- Add marketing opt-in to profiles (for existing app users)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_marketing_opted_in boolean DEFAULT true;

-- Add unsubscribe token to leads (for non-user leads like scraped BCBAs)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS unsubscribe_token text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS unsubscribed boolean DEFAULT false;

-- Add marketing consent to screener_leads
-- screener_leads may not exist yet — create it if not
CREATE TABLE IF NOT EXISTS public.screener_leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text,
  parent_name text,
  child_age_months integer,
  score integer,
  risk_level text,
  answers jsonb,
  marketing_consent boolean DEFAULT false,
  enrolled_in_sequence boolean DEFAULT false,
  unsubscribe_token text DEFAULT encode(gen_random_bytes(16), 'hex'),
  unsubscribed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- RLS for screener_leads (public insert, admin read)
ALTER TABLE public.screener_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit screener" 
  ON public.screener_leads FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Admins read screener leads" 
  ON public.screener_leads FOR SELECT 
  USING (public.is_admin());

CREATE POLICY "Admins update screener leads"
  ON public.screener_leads FOR UPDATE
  USING (public.is_admin());

-- Index
CREATE INDEX IF NOT EXISTS idx_screener_leads_email ON public.screener_leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_unsubscribe ON public.leads(unsubscribe_token);
CREATE INDEX IF NOT EXISTS idx_screener_unsubscribe ON public.screener_leads(unsubscribe_token);
