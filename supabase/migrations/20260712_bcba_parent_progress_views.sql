-- ═══════════════════════════════════════════════════
-- BCBA — fix parent "My BCBA" showing all zeros
-- 2026-07-12
-- Backlog #11: v_child_target_progress and v_child_sessions were security_invoker=on,
-- so their inner count(*) FROM trials / behavior_recordings subqueries ran with the
-- CALLER's RLS. The trials/behavior_recordings policies only grant practice members,
-- so a parent's counts always came back 0 — every target/session showed 0 trials.
--
-- Fix: run the views as owner (security_invoker = off) so the aggregate subqueries
-- can count, and move access control into an explicit WHERE gate using the same
-- helpers the RLS policies use. With invoker RLS off, the WHERE is the ONLY thing
-- protecting these rows, so the gate must exactly mirror who may see a child:
--   • user_has_child_access(child_id, auth.uid())  → parents/caregivers with a grant
--   • is_practice_member(practice_id)              → practice staff
--   • is_admin()                                   → admins
-- No row is emitted unless one of these is true for the calling user.
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_child_target_progress AS
SELECT
  pc.child_id,
  pc.practice_id,
  p.id AS program_id,
  p.name AS program_name,
  p.category AS program_category,
  p.domain AS program_domain,
  t.id AS target_id,
  t.name AS target_name,
  t.target_type,
  t.status AS target_status,
  t.promoted_at,
  (SELECT count(*) FROM public.trials tr WHERE tr.target_id = t.id AND tr.superseded_by IS NULL) AS trial_count,
  (SELECT count(*) FROM public.trials tr WHERE tr.target_id = t.id AND tr.response = 'correct' AND tr.superseded_by IS NULL) AS correct_count
FROM public.practice_clients pc
JOIN public.programs p ON p.practice_client_id = pc.id
JOIN public.targets t ON t.program_id = p.id
WHERE p.status != 'archived'
  AND (
    public.user_has_child_access(pc.child_id, auth.uid())
    OR public.is_practice_member(pc.practice_id)
    OR public.is_admin()
  );

ALTER VIEW public.v_child_target_progress SET (security_invoker = off);
GRANT SELECT ON public.v_child_target_progress TO authenticated;

CREATE OR REPLACE VIEW public.v_child_sessions AS
SELECT
  pc.child_id,
  pc.practice_id,
  s.id AS session_id,
  s.start_time,
  s.end_time,
  s.location,
  s.cpt_code,
  s.status,
  (SELECT count(*) FROM public.trials t WHERE t.session_id = s.id AND t.superseded_by IS NULL) AS trial_count,
  (SELECT count(*) FROM public.behavior_recordings br WHERE br.session_id = s.id AND br.superseded_by IS NULL) AS behavior_count,
  EXTRACT(EPOCH FROM (s.end_time - s.start_time))/60 AS duration_minutes
FROM public.sessions s
JOIN public.practice_clients pc ON pc.id = s.practice_client_id
WHERE s.status IN ('completed','cosigned')
  AND (
    public.user_has_child_access(pc.child_id, auth.uid())
    OR public.is_practice_member(pc.practice_id)
    OR public.is_admin()
  );

ALTER VIEW public.v_child_sessions SET (security_invoker = off);
GRANT SELECT ON public.v_child_sessions TO authenticated;

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
