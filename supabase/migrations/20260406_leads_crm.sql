-- ═══════════════════════════════════════════════════
-- Leads CRM Migration
-- 2026-04-06
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL,
  lead_type text NOT NULL,
  name text,
  first_name text,
  last_name text,
  organization text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  credential text,
  specialty text,
  notes text,
  status text DEFAULT 'new',
  outreach_status text DEFAULT 'not_contacted',
  outreach_notes text,
  last_contacted_at timestamptz,
  tags text[],
  raw_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Only admins can access leads
CREATE POLICY "Admins view all leads"
  ON public.leads FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins insert leads"
  ON public.leads FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins update leads"
  ON public.leads FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins delete leads"
  ON public.leads FOR DELETE
  USING (public.is_admin());

-- Index for searching
CREATE INDEX IF NOT EXISTS idx_leads_type ON public.leads(lead_type);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(outreach_status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON public.leads(source);
