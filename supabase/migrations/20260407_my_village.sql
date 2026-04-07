-- ═══════════════════════════════════════════════════
-- My Village Phase 1 — Local Community Layer
-- 2026-04-07
-- ═══════════════════════════════════════════════════

-- 1. Village Profiles — parent discovery
CREATE TABLE IF NOT EXISTS public.village_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  visibility text NOT NULL DEFAULT 'city',
  display_name text NOT NULL,
  bio text,
  child_age_range text,
  child_diagnosis_category text,
  interests text[] DEFAULT '{}',
  city text,
  state text,
  zip text,
  lat float,
  lng float,
  last_active timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.village_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read visible village profiles"
  ON public.village_profiles FOR SELECT
  USING (auth.uid() IS NOT NULL AND visibility != 'hidden');

CREATE POLICY "Read own village profile"
  ON public.village_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Create own village profile"
  ON public.village_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Update own village profile"
  ON public.village_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Delete own village profile"
  ON public.village_profiles FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all village profiles"
  ON public.village_profiles FOR SELECT
  USING (public.is_admin());

-- 2. Village Events — meetups and playdates
CREATE TABLE IF NOT EXISTS public.village_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  event_type text NOT NULL DEFAULT 'playdate',
  event_date date NOT NULL,
  start_time time NOT NULL,
  end_time time,
  location_name text NOT NULL,
  location_address text,
  location_city text NOT NULL,
  location_lat float,
  location_lng float,
  max_attendees integer,
  age_range text,
  child_friendly boolean DEFAULT true,
  requires_approval boolean DEFAULT false,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.village_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read active events"
  ON public.village_events FOR SELECT
  USING (auth.uid() IS NOT NULL AND status = 'active');

CREATE POLICY "Read own events"
  ON public.village_events FOR SELECT
  USING (auth.uid() = creator_id);

CREATE POLICY "Create events"
  ON public.village_events FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Update own events"
  ON public.village_events FOR UPDATE
  USING (auth.uid() = creator_id);

CREATE POLICY "Delete own events"
  ON public.village_events FOR DELETE
  USING (auth.uid() = creator_id);

CREATE POLICY "Admins read all events"
  ON public.village_events FOR SELECT
  USING (public.is_admin());

-- 3. Village RSVPs
CREATE TABLE IF NOT EXISTS public.village_rsvps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid REFERENCES public.village_events(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status text DEFAULT 'approved',
  rsvp_at timestamptz DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE public.village_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read RSVPs"
  ON public.village_rsvps FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Create own RSVP"
  ON public.village_rsvps FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Update own RSVP"
  ON public.village_rsvps FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Creator manages RSVPs"
  ON public.village_rsvps FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.village_events
      WHERE id = village_rsvps.event_id
      AND creator_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_village_profiles_user ON public.village_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_village_profiles_visibility ON public.village_profiles(visibility);
CREATE INDEX IF NOT EXISTS idx_village_events_date ON public.village_events(event_date);
CREATE INDEX IF NOT EXISTS idx_village_events_status ON public.village_events(status);
CREATE INDEX IF NOT EXISTS idx_village_events_creator ON public.village_events(creator_id);
CREATE INDEX IF NOT EXISTS idx_village_rsvps_event ON public.village_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_village_rsvps_user ON public.village_rsvps(user_id);
