-- ═══════════════════════════════════════════════════
-- Push Notification Triggers — Phase 3
-- 2026-04-18
-- Per-type opt-outs + dedup tracking
-- ═══════════════════════════════════════════════════

-- Per-push-type opt-out preferences on profiles.
-- All default to TRUE (opted in). User can toggle any off in settings.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_pref_daily_checkin  boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_pref_morning_routine boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_pref_booking_reminder boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_pref_streak_at_risk boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_pref_milestone boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_pref_weekly_digest boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_pref_community_reply boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_pref_new_strategy boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_badge_count int DEFAULT 0;

-- Master kill-switch. If true, no pushes at all (overrides all individual prefs).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_opted_out boolean DEFAULT false;

-- Dedup table: ensures we don't send the same push type to the same user twice
-- in one day (e.g. cron fires hourly but we only want one morning-routine push/day).
CREATE TABLE IF NOT EXISTS public.push_dedup (
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  push_type text NOT NULL,
  dedup_key text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, push_type, dedup_key)
);

CREATE INDEX IF NOT EXISTS idx_push_dedup_sent_at ON public.push_dedup(sent_at);

ALTER TABLE public.push_dedup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.push_dedup
  FOR ALL USING (false) WITH CHECK (false);
