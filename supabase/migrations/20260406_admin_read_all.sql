-- ═══════════════════════════════════════════════════
-- Allow admin users to read all profiles and related data
-- 2026-04-06
-- ═══════════════════════════════════════════════════

-- Admins can read all profiles
CREATE POLICY "Admins view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.is_admin = true
    )
  );

-- Admins can read all children
CREATE POLICY "Admins view all children"
  ON public.children FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.is_admin = true
    )
  );

-- Admins can read all behavior_logs
CREATE POLICY "Admins view all behavior_logs"
  ON public.behavior_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.is_admin = true
    )
  );

-- Admins can read all conversations
CREATE POLICY "Admins view all conversations"
  ON public.conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.is_admin = true
    )
  );

-- Admins can read all community_posts
CREATE POLICY "Admins view all community_posts"
  ON public.community_posts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.is_admin = true
    )
  );

-- Admins can read all community_comments
CREATE POLICY "Admins view all community_comments"
  ON public.community_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.is_admin = true
    )
  );

-- Admins can read all bookings
CREATE POLICY "Admins view all bookings"
  ON public.bookings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.is_admin = true
    )
  );

-- Admins can read all invites
CREATE POLICY "Admins view all invites"
  ON public.invites FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.is_admin = true
    )
  );

-- Admins can read all child_access
CREATE POLICY "Admins view all child_access"
  ON public.child_access FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.is_admin = true
    )
  );

-- Admins can read all session_notes
CREATE POLICY "Admins view all session_notes"
  ON public.session_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.is_admin = true
    )
  );

-- Admins can read all care_notes
CREATE POLICY "Admins view all care_notes"
  ON public.care_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.is_admin = true
    )
  );

-- Admins can update all profiles (for verification, etc)
CREATE POLICY "Admins update all profiles"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.is_admin = true
    )
  );

-- Admins can delete profiles (for rejecting providers)
CREATE POLICY "Admins delete profiles"
  ON public.profiles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.is_admin = true
    )
  );
