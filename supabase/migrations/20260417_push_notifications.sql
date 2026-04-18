-- ═══════════════════════════════════════════════════
-- Push Notifications — iOS (APNs) + Android (FCM)
-- 2026-04-17
-- Phase 2 of iOS Capacitor wrap
-- ═══════════════════════════════════════════════════

-- Device push tokens (one per user per device per platform)
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  token text NOT NULL,
  device_id text,
  app_version text,
  os_version text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  disabled_at timestamptz,
  UNIQUE(user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON public.push_tokens(user_id) WHERE disabled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_push_tokens_platform ON public.push_tokens(platform) WHERE disabled_at IS NULL;

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own push tokens"
  ON public.push_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own push tokens"
  ON public.push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own push tokens"
  ON public.push_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own push tokens"
  ON public.push_tokens FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all push tokens"
  ON public.push_tokens FOR SELECT
  USING (public.is_admin());

-- Per-notification-type user preferences (toggles)
-- push_type values: daily_check_in, morning_routine, booking_reminder, streak_at_risk,
--                   milestone, weekly_digest, community_reply, new_strategy, chat_limit
CREATE TABLE IF NOT EXISTS public.user_push_preferences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  push_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, push_type)
);

CREATE INDEX IF NOT EXISTS idx_user_push_prefs_user ON public.user_push_preferences(user_id);

ALTER TABLE public.user_push_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push preferences"
  ON public.user_push_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins read all push preferences"
  ON public.user_push_preferences FOR SELECT
  USING (public.is_admin());

-- Per-user per-type engagement state (frequency capping + learning)
CREATE TABLE IF NOT EXISTS public.push_engagement (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  push_type text NOT NULL,
  last_sent_at timestamptz,
  last_tapped_at timestamptz,
  last_delivered_at timestamptz,
  consecutive_ignored_count int NOT NULL DEFAULT 0,
  total_sent int NOT NULL DEFAULT 0,
  total_tapped int NOT NULL DEFAULT 0,
  auto_disabled_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, push_type)
);

CREATE INDEX IF NOT EXISTS idx_push_engagement_user ON public.push_engagement(user_id);
CREATE INDEX IF NOT EXISTS idx_push_engagement_last_sent ON public.push_engagement(last_sent_at);

ALTER TABLE public.push_engagement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own engagement"
  ON public.push_engagement FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all engagement"
  ON public.push_engagement FOR SELECT
  USING (public.is_admin());

-- Best-push-hour learning column on profiles (mirrors leads.best_open_hour)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS best_push_hour int CHECK (best_push_hour BETWEEN 0 AND 23);

-- Push send log (audit trail, useful for debugging + admin dashboard)
CREATE TABLE IF NOT EXISTS public.push_send_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  push_type text NOT NULL,
  platform text NOT NULL,
  token_id uuid REFERENCES public.push_tokens(id) ON DELETE SET NULL,
  title text,
  body text,
  payload jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
  error_code text,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_send_log_user ON public.push_send_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_send_log_status ON public.push_send_log(status, created_at DESC);

ALTER TABLE public.push_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read push send log"
  ON public.push_send_log FOR SELECT
  USING (public.is_admin());

-- Updated_at trigger helper (auto-update updated_at column on writes)
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER push_tokens_updated_at BEFORE UPDATE ON public.push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER user_push_preferences_updated_at BEFORE UPDATE ON public.user_push_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER push_engagement_updated_at BEFORE UPDATE ON public.push_engagement
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
