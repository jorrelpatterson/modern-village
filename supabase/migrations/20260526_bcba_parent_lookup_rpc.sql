-- ═══════════════════════════════════════════════════
-- BCBA Data Collection — Parent lookup RPC
-- 2026-05-26
-- profiles + children have user-scoped RLS so a BCBA can't read
-- another user's profile/children directly. This SECURITY DEFINER
-- function lets practice members look up a parent by email + their
-- children for the Add Client flow.
--
-- Authorization: caller must be an active practice_members row.
-- Returns: at most one matching parent profile with their children.
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.lookup_parent_by_email(p_email text)
RETURNS TABLE(id uuid, name text, email text, children jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Gate: only authenticated practice members can use this lookup
  -- (prevents random users from enumerating emails)
  IF NOT EXISTS (
    SELECT 1 FROM public.practice_members pm
    WHERE pm.user_id = auth.uid() AND pm.active = true
  ) THEN
    RAISE EXCEPTION 'Not authorized: must be an active practice member';
  END IF;
  RETURN QUERY
  SELECT p.id, p.name, p.email,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object('id', c.id, 'name', c.name, 'age', c.age, 'diagnosis', c.diagnosis)
        ORDER BY c.created_at
      ) FROM public.children c WHERE c.user_id = p.id),
      '[]'::jsonb
    ) AS children
  FROM public.profiles p
  WHERE lower(p.email) = lower(p_email)
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_parent_by_email(text) TO authenticated;

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
