-- ═══════════════════════════════════════════════════
-- Role System Migration
-- 2026-04-06
-- ═══════════════════════════════════════════════════

-- 1. ADD role columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'parent',
  ADD COLUMN IF NOT EXISTS npi_number text,
  ADD COLUMN IF NOT EXISTS license_type text,
  ADD COLUMN IF NOT EXISTS license_state text,
  ADD COLUMN IF NOT EXISTS license_number text,
  ADD COLUMN IF NOT EXISTS cpt_codes text[],
  ADD COLUMN IF NOT EXISTS provider_verified boolean DEFAULT false;

-- 2. CREATE child_access table
CREATE TABLE IF NOT EXISTS public.child_access (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id uuid REFERENCES public.children(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL,
  access_level text NOT NULL DEFAULT 'full',
  granted_by uuid REFERENCES public.profiles(id) NOT NULL,
  granted_at timestamptz DEFAULT now(),
  revoked_at timestamptz
);

ALTER TABLE public.child_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own access"
  ON public.child_access FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Parents view child access"
  ON public.child_access FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.child_access ca
      WHERE ca.child_id = child_access.child_id
      AND ca.user_id = auth.uid()
      AND ca.access_level = 'full'
      AND ca.revoked_at IS NULL
    )
  );

CREATE POLICY "Parents grant access"
  ON public.child_access FOR INSERT
  WITH CHECK (auth.uid() = granted_by);

CREATE POLICY "Parents revoke access"
  ON public.child_access FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.child_access ca
      WHERE ca.child_id = child_access.child_id
      AND ca.user_id = auth.uid()
      AND ca.access_level = 'full'
      AND ca.revoked_at IS NULL
    )
  );

-- 3. CREATE invites table
CREATE TABLE IF NOT EXISTS public.invites (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invited_by uuid REFERENCES public.profiles(id) NOT NULL,
  email text NOT NULL,
  role text NOT NULL,
  child_id uuid REFERENCES public.children(id) ON DELETE CASCADE NOT NULL,
  token text UNIQUE NOT NULL,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES public.profiles(id)
);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own invites"
  ON public.invites FOR SELECT
  USING (auth.uid() = invited_by);

CREATE POLICY "Users create invites"
  ON public.invites FOR INSERT
  WITH CHECK (auth.uid() = invited_by);

CREATE POLICY "Users update own invites"
  ON public.invites FOR UPDATE
  USING (auth.uid() = invited_by);

CREATE POLICY "Anyone reads invite by token"
  ON public.invites FOR SELECT
  USING (true);

-- 4. ADD connected-user SELECT policies to existing tables

CREATE POLICY "Connected users view child logs"
  ON public.behavior_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.child_access ca
      JOIN public.children ch ON ch.id = ca.child_id
      WHERE ch.user_id = behavior_logs.user_id
      AND ca.user_id = auth.uid()
      AND ca.revoked_at IS NULL
    )
  );

CREATE POLICY "Caregivers log behaviors"
  ON public.behavior_logs FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.child_access ca
      JOIN public.children ch ON ch.id = ca.child_id
      WHERE ch.user_id = behavior_logs.user_id
      AND ca.user_id = auth.uid()
      AND ca.access_level IN ('full', 'daily')
      AND ca.revoked_at IS NULL
    )
  );

CREATE POLICY "Connected users view strategies"
  ON public.saved_strategies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.child_access ca
      JOIN public.children ch ON ch.id = ca.child_id
      WHERE ch.user_id = saved_strategies.user_id
      AND ca.user_id = auth.uid()
      AND ca.revoked_at IS NULL
      AND ca.access_level IN ('full', 'clinical', 'daily')
    )
  );

CREATE POLICY "Connected users view routines"
  ON public.routines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.child_access ca
      WHERE ca.child_id = routines.child_id
      AND ca.user_id = auth.uid()
      AND ca.revoked_at IS NULL
    )
  );

-- 5. AUTO-INSERT child_access for parents when they create a child
CREATE OR REPLACE FUNCTION public.auto_grant_parent_access()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.child_access (child_id, user_id, role, access_level, granted_by)
  VALUES (NEW.id, NEW.user_id, 'parent', 'full', NEW.user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_parent_access ON public.children;
CREATE TRIGGER trg_auto_parent_access
  AFTER INSERT ON public.children
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_grant_parent_access();

-- 6. BACKFILL child_access for existing parent-child relationships
INSERT INTO public.child_access (child_id, user_id, role, access_level, granted_by)
SELECT c.id, c.user_id, 'parent', 'full', c.user_id
FROM public.children c
WHERE NOT EXISTS (
  SELECT 1 FROM public.child_access ca
  WHERE ca.child_id = c.id AND ca.user_id = c.user_id
);
