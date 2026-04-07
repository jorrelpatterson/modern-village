-- ═══════════════════════════════════════════════════
-- Email Sequences
-- 2026-04-06
-- ═══════════════════════════════════════════════════

-- Add sequence support to campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS is_sequence boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sequence_steps jsonb DEFAULT '[]';

-- Track which step each lead is on in a sequence
CREATE TABLE IF NOT EXISTS public.sequence_enrollments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  current_step integer DEFAULT 0,
  enrolled_at timestamptz DEFAULT now(),
  last_sent_at timestamptz,
  completed boolean DEFAULT false,
  unsubscribed boolean DEFAULT false,
  UNIQUE(campaign_id, lead_id)
);

ALTER TABLE public.sequence_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage enrollments" ON public.sequence_enrollments FOR ALL USING (public.is_admin());
CREATE INDEX IF NOT EXISTS idx_enrollments_campaign ON public.sequence_enrollments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_active ON public.sequence_enrollments(completed, unsubscribed);
