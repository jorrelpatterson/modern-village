-- ═══════════════════════════════════════════════════
-- Fix RLS Recursion — child_access + children + dependent tables
-- 2026-04-07
-- ═══════════════════════════════════════════════════
-- ROOT CAUSE: "Parents view child access" policy on child_access
-- queries child_access from WITHIN child_access → infinite recursion.
-- All policies on other tables that JOIN child_access inherit this loop.
--
-- FIX: Use SECURITY DEFINER functions to bypass RLS when checking
-- child_access from within other table policies.
-- ═══════════════════════════════════════════════════

-- ─── 1. SECURITY DEFINER helpers (bypass RLS internally) ───

-- Check if user has any access to a child (by child_id)
CREATE OR REPLACE FUNCTION public.user_has_child_access(p_child_id uuid, p_user_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.child_access
    WHERE child_id = p_child_id
    AND user_id = p_user_id
    AND revoked_at IS NULL
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if user has specific access level to a child (by child_id)
CREATE OR REPLACE FUNCTION public.user_has_child_access_level(p_child_id uuid, p_user_id uuid, p_levels text[])
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.child_access
    WHERE child_id = p_child_id
    AND user_id = p_user_id
    AND access_level = ANY(p_levels)
    AND revoked_at IS NULL
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if user has access to a child (by child's parent user_id)
CREATE OR REPLACE FUNCTION public.user_connected_to_parent(p_parent_user_id uuid, p_user_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.child_access ca
    JOIN public.children ch ON ch.id = ca.child_id
    WHERE ch.user_id = p_parent_user_id
    AND ca.user_id = p_user_id
    AND ca.revoked_at IS NULL
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if user has specific access level (by child's parent user_id)
CREATE OR REPLACE FUNCTION public.user_connected_to_parent_level(p_parent_user_id uuid, p_user_id uuid, p_levels text[])
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.child_access ca
    JOIN public.children ch ON ch.id = ca.child_id
    WHERE ch.user_id = p_parent_user_id
    AND ca.user_id = p_user_id
    AND ca.access_level = ANY(p_levels)
    AND ca.revoked_at IS NULL
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── 2. FIX child_access policies ───

DROP POLICY IF EXISTS "Parents view child access" ON public.child_access;
DROP POLICY IF EXISTS "Users view own access" ON public.child_access;

-- Simple non-recursive policy: see rows where you are the user OR you are the parent who granted
CREATE POLICY "Users view own access"
  ON public.child_access FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = granted_by);

-- ─── 3. FIX children policies ───

DROP POLICY IF EXISTS "Connected users view children" ON public.child_access;
DROP POLICY IF EXISTS "Connected users view children" ON public.children;

-- Parents see own children, connected users see children they have access to
CREATE POLICY "Users view accessible children"
  ON public.children FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.user_has_child_access(id, auth.uid())
  );

-- ─── 4. FIX behavior_logs policies ───

DROP POLICY IF EXISTS "Connected users view child logs" ON public.behavior_logs;

CREATE POLICY "Connected users view child logs"
  ON public.behavior_logs FOR SELECT
  USING (
    auth.uid() = user_id
    OR auth.uid() = logged_by
    OR public.user_connected_to_parent(user_id, auth.uid())
  );

-- Fix INSERT policy too
DROP POLICY IF EXISTS "Caregivers and teachers log behaviors" ON public.behavior_logs;

CREATE POLICY "Caregivers and teachers log behaviors"
  ON public.behavior_logs FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR public.user_connected_to_parent_level(user_id, auth.uid(), ARRAY['full', 'daily', 'school', 'clinical'])
  );

-- ─── 5. FIX saved_strategies policies ───

DROP POLICY IF EXISTS "Connected users view strategies" ON public.saved_strategies;

CREATE POLICY "Connected users view strategies"
  ON public.saved_strategies FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.user_connected_to_parent_level(user_id, auth.uid(), ARRAY['full', 'clinical', 'daily'])
  );

-- ─── 6. FIX care_notes policies ───

DROP POLICY IF EXISTS "Connected users view notes" ON public.care_notes;

CREATE POLICY "Connected users view notes"
  ON public.care_notes FOR SELECT
  USING (
    auth.uid() = author_id
    OR public.user_has_child_access(child_id, auth.uid())
  );

DROP POLICY IF EXISTS "Connected users create notes" ON public.care_notes;

CREATE POLICY "Connected users create notes"
  ON public.care_notes FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND public.user_has_child_access(child_id, auth.uid())
  );

-- ─── 7. FIX care_note_comments policies ───

DROP POLICY IF EXISTS "Connected users view note comments" ON public.care_note_comments;

CREATE POLICY "Connected users view note comments"
  ON public.care_note_comments FOR SELECT
  USING (
    auth.uid() = author_id
    OR EXISTS (
      SELECT 1 FROM public.care_notes cn
      WHERE cn.id = care_note_comments.note_id
      AND public.user_has_child_access(cn.child_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Connected users create note comments" ON public.care_note_comments;

CREATE POLICY "Connected users create note comments"
  ON public.care_note_comments FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.care_notes cn
      WHERE cn.id = care_note_comments.note_id
      AND public.user_has_child_access(cn.child_id, auth.uid())
    )
  );

-- ─── 8. FIX child_checkins policies ───

DROP POLICY IF EXISTS "Connected users view child checkins" ON public.child_checkins;

CREATE POLICY "Connected users view child checkins"
  ON public.child_checkins FOR SELECT
  USING (
    public.user_has_child_access(child_id, auth.uid())
  );

DROP POLICY IF EXISTS "Connected users create child checkins" ON public.child_checkins;

CREATE POLICY "Connected users create child checkins"
  ON public.child_checkins FOR INSERT
  WITH CHECK (
    public.user_has_child_access(child_id, auth.uid())
  );

-- ─── 9. FIX session_notes parent view policy ───

DROP POLICY IF EXISTS "Parents view shared session notes" ON public.session_notes;

CREATE POLICY "Parents view shared session notes"
  ON public.session_notes FOR SELECT
  USING (
    shared_with_parent = true
    AND public.user_has_child_access_level(child_id, auth.uid(), ARRAY['full'])
  );

-- ─── 10. FIX routines connected policy ───

DROP POLICY IF EXISTS "Connected users view routines" ON public.routines;

CREATE POLICY "Connected users view routines"
  ON public.routines FOR SELECT
  USING (
    auth.uid() = user_id
    OR (child_id IS NOT NULL AND public.user_has_child_access(child_id, auth.uid()))
  );

-- ─── 11. FIX child_access UPDATE policy ───

DROP POLICY IF EXISTS "Parents revoke access" ON public.child_access;

CREATE POLICY "Parents update access"
  ON public.child_access FOR UPDATE
  USING (auth.uid() = granted_by);
