-- ═══════════════════════════════════════════════════
-- Email Drips + Continual Optimization
-- 2026-04-16
-- Spec: docs/superpowers/specs/2026-04-16-email-drips-and-optimization-design.md
-- ═══════════════════════════════════════════════════

-- ─── campaigns: cohort scoping + bandit state ───
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS cohort text;
  -- 'screener', 're_engage', 'bcba', 'district', 'rc', 'parent_welcome'
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS subdomain text;
  -- e.g., 'bcba.outreach.modernvillage.app'
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS variant_stats jsonb DEFAULT '{}'::jsonb;
  -- per-step Thompson posterior:
  -- { "step_0": { "a": {"alpha": 5, "beta": 12, "sends": 16}, "b": {...} }, ... }
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS daily_cap integer DEFAULT 50;
  -- per-subdomain warmup cap, configurable in admin
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS auto_paused_at timestamptz;
  -- set by bounce-rate guard, cleared manually in admin

CREATE INDEX IF NOT EXISTS idx_campaigns_cohort ON public.campaigns(cohort) WHERE cohort IS NOT NULL;

-- ─── campaign_sends: per-step + reply/conversion + send-time tracking ───
ALTER TABLE public.campaign_sends ADD COLUMN IF NOT EXISTS sequence_step integer;
ALTER TABLE public.campaign_sends ADD COLUMN IF NOT EXISTS replied_at timestamptz;
ALTER TABLE public.campaign_sends ADD COLUMN IF NOT EXISTS converted_at timestamptz;
ALTER TABLE public.campaign_sends ADD COLUMN IF NOT EXISTS conversion_type text;
  -- 'signup', 'booking', 'demo_scheduled', 'subscribed'
ALTER TABLE public.campaign_sends ADD COLUMN IF NOT EXISTS sent_hour smallint;
  -- 0-23, used for send-time analysis

CREATE INDEX IF NOT EXISTS idx_sends_step ON public.campaign_sends(campaign_id, sequence_step);
CREATE INDEX IF NOT EXISTS idx_sends_email_lookup ON public.campaign_sends(email, created_at);
  -- for conversion attribution by email match

-- ─── leads: unsubscribe / bounce / send-time / conversion link ───
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS unsubscribed boolean DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS unsubscribe_token text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS bounced boolean DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS best_open_hour smallint;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS converted_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS converted_user_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS cohort text;
  -- if NULL, lead.lead_type drives cohort selection at enroll time

-- Backfill unsubscribe_token for existing leads
UPDATE public.leads SET unsubscribe_token = encode(gen_random_bytes(16), 'hex')
  WHERE unsubscribe_token IS NULL;

-- ─── screener_leads: track which step in screener follow-up was last sent ───
ALTER TABLE public.screener_leads ADD COLUMN IF NOT EXISTS last_step_sent integer DEFAULT 0;
ALTER TABLE public.screener_leads ADD COLUMN IF NOT EXISTS last_step_sent_at timestamptz;

-- ─── profiles: track multi-touch re-engagement progression ───
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_re_engage_step integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_re_engage_sent_at timestamptz;

-- ─── new table: email_send_queue (warmup-aware pacing) ───
CREATE TABLE IF NOT EXISTS public.email_send_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  cohort text NOT NULL,
  sequence_step integer NOT NULL DEFAULT 0,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  priority integer DEFAULT 100,  -- lower = sent first; admin can bump to 1
  status text DEFAULT 'queued',  -- 'queued', 'sent', 'skipped'
  skipped_reason text,
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  UNIQUE(campaign_id, lead_id, sequence_step)
);

ALTER TABLE public.email_send_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage send queue" ON public.email_send_queue FOR ALL USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_send_queue_due
  ON public.email_send_queue(cohort, scheduled_for, priority)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_send_queue_lead
  ON public.email_send_queue(lead_id);
