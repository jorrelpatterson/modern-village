-- ═══════════════════════════════════════════════════
-- Email Campaigns + Tracking
-- 2026-04-06
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  subject_a text NOT NULL,
  subject_b text,
  body_html text NOT NULL,
  body_html_b text,
  lead_filter jsonb,
  total_sent integer DEFAULT 0,
  total_opened integer DEFAULT 0,
  total_clicked integer DEFAULT 0,
  total_bounced integer DEFAULT 0,
  status text DEFAULT 'draft',
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campaign_sends (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  resend_id text,
  email text NOT NULL,
  variant text DEFAULT 'a',
  status text DEFAULT 'sent',
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage campaigns" ON public.campaigns FOR ALL USING (public.is_admin());
CREATE POLICY "Admins manage sends" ON public.campaign_sends FOR ALL USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_sends_campaign ON public.campaign_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sends_resend ON public.campaign_sends(resend_id);
