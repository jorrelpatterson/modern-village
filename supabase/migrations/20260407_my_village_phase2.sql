-- ═══════════════════════════════════════════════════
-- My Village Phase 2 — Messaging, Event Comments, Resources
-- 2026-04-07
-- ═══════════════════════════════════════════════════

-- 1. Village Connections (required before messaging)
CREATE TABLE IF NOT EXISTS public.village_connections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status text DEFAULT 'pending',  -- 'pending', 'accepted', 'blocked'
  created_at timestamptz DEFAULT now(),
  UNIQUE(requester_id, receiver_id)
);

ALTER TABLE public.village_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own connections"
  ON public.village_connections FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

CREATE POLICY "Users create connections"
  ON public.village_connections FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Users update own connections"
  ON public.village_connections FOR UPDATE
  USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

CREATE POLICY "Users delete own connections"
  ON public.village_connections FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

-- 2. Village Messages (text-only, requires accepted connection)
CREATE TABLE IF NOT EXISTS public.village_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,  -- max 1000 chars, enforced client-side
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.village_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own messages"
  ON public.village_messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users send messages"
  ON public.village_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users update own received messages"
  ON public.village_messages FOR UPDATE
  USING (auth.uid() = receiver_id);

-- 3. Village Event Comments
CREATE TABLE IF NOT EXISTS public.village_event_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid REFERENCES public.village_events(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,  -- max 500 chars
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.village_event_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read event comments"
  ON public.village_event_comments FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users post event comments"
  ON public.village_event_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own event comments"
  ON public.village_event_comments FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Village Resources (crowdsourced, moderated)
CREATE TABLE IF NOT EXISTS public.village_resources (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  category text NOT NULL,  -- 'aba_therapy', 'occupational_therapy', 'speech_therapy', 'sensory_friendly', 'parks', 'support_groups', 'attorneys', 'respite', 'afterschool', 'pediatric', 'other'
  description text,  -- max 500 chars
  address text,
  city text,
  state text,
  zip text,
  phone text,
  website text,
  tags text[] DEFAULT '{}',
  avg_rating decimal(2,1) DEFAULT 0,
  review_count integer DEFAULT 0,
  verified boolean DEFAULT false,
  status text DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.village_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read approved resources"
  ON public.village_resources FOR SELECT
  USING (auth.uid() IS NOT NULL AND status = 'approved');

CREATE POLICY "Users submit resources"
  ON public.village_resources FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage resources"
  ON public.village_resources FOR ALL
  USING (public.is_admin());

-- 5. Village Resource Reviews
CREATE TABLE IF NOT EXISTS public.village_reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  resource_id uuid REFERENCES public.village_resources(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text text,  -- max 500 chars
  created_at timestamptz DEFAULT now(),
  UNIQUE(resource_id, user_id)
);

ALTER TABLE public.village_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read reviews"
  ON public.village_reviews FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users create reviews"
  ON public.village_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own reviews"
  ON public.village_reviews FOR UPDATE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_village_connections_requester ON public.village_connections(requester_id);
CREATE INDEX IF NOT EXISTS idx_village_connections_receiver ON public.village_connections(receiver_id);
CREATE INDEX IF NOT EXISTS idx_village_messages_sender ON public.village_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_village_messages_receiver ON public.village_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_village_messages_read ON public.village_messages(receiver_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_village_event_comments_event ON public.village_event_comments(event_id);
CREATE INDEX IF NOT EXISTS idx_village_resources_status ON public.village_resources(status);
CREATE INDEX IF NOT EXISTS idx_village_resources_category ON public.village_resources(category);
CREATE INDEX IF NOT EXISTS idx_village_reviews_resource ON public.village_reviews(resource_id);
