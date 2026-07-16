-- ═══════════════════════════════════════════════════
-- Admin minimum-necessary (1/3): admin_role() helper + backfill
-- 2026-07-15
-- Every admin RLS policy today is USING(is_admin()) — i.e. ANY admin (marketing,
-- billing, content, sub_admin) can read ALL PHI. To enforce §164.514(d) we need a
-- role we can test in policies. This SECURITY DEFINER helper returns the caller's
-- admin_role (NULL if not an admin). Being DEFINER, it bypasses RLS on profiles,
-- which also avoids the self-referential recursion the inline EXISTS(...) pattern risks.
--
-- Backfill: any is_admin row with a NULL admin_role is currently treated as 'super'
-- client-side (adminRole = profile.admin_role || 'super'), so it already has full
-- access. Making that explicit is status-quo-preserving and prevents a NULL from
-- being read as "no access" once policies switch to admin_role() = 'super'.
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT admin_role FROM public.profiles WHERE id = auth.uid() AND is_admin = true;
$$;

GRANT EXECUTE ON FUNCTION public.admin_role() TO anon, authenticated;

UPDATE public.profiles
  SET admin_role = 'super'
  WHERE is_admin = true AND admin_role IS NULL;

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
