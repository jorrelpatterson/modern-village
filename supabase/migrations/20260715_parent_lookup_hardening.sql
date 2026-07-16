-- ═══════════════════════════════════════════════════
-- HIPAA §164.514(d) — Harden lookup_parent_by_email against cross-practice enumeration
-- 2026-07-15
-- The original RPC (20260526) let ANY active practice member (including every RBT
-- at every practice) resolve ANY Modern Village parent by exact email and receive
-- that parent's children with names, ages, and diagnoses — cross-practice, no
-- relationship required, no logging. That is a parent/child PHI enumeration oracle.
--
-- This migration narrows and instruments it WITHOUT changing the return shape
-- (app.html consumes {id,name,email,children[]}):
--   1. Caller must hold a BCBA-level role (owner_bcba | supervising_bcba) in at
--      least one active practice. Adding/linking a client is a BCBA action; RBTs
--      do not use the Add-Client lookup. This removes RBTs from the attack surface.
--   2. Every call is written to audit_logs (actor + queried email), so a malicious
--      BCBA harvesting emails is now attributable and detectable.
--
-- ⚠️ BEFORE APPLYING: confirm no RBT-facing screen calls this RPC. If RBTs must
--    look up parents, widen the role check below back to active membership and
--    rely on the audit log + a rate limit as the primary control.
--
-- Residual risk (tracked): exact-email probing by an authorized BCBA is reduced +
-- logged here, but not fully eliminated. A rate limit on this action is a follow-up.
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.lookup_parent_by_email(p_email text)
RETURNS TABLE(id uuid, name text, email text, children jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Gate: caller must be an active BCBA-level member of some practice.
  IF NOT EXISTS (
    SELECT 1 FROM public.practice_members pm
    WHERE pm.user_id = auth.uid()
      AND pm.active = true
      AND pm.role IN ('owner_bcba', 'supervising_bcba')
  ) THEN
    RAISE EXCEPTION 'Not authorized: must be an active BCBA-level practice member';
  END IF;

  -- Audit every lookup (who, what email) — audit_logs has RLS with no client
  -- policies, but this SECURITY DEFINER function runs as postgres and bypasses it.
  INSERT INTO public.audit_logs(actor_id, action, target_table, detail)
  VALUES (auth.uid(), 'parent_lookup', 'profiles', jsonb_build_object('email', lower(p_email)));

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
