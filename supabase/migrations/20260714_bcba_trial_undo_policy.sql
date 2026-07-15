-- ═══════════════════════════════════════════════════
-- BCBA — allow "undo last trial" (scoped trials UPDATE policy)
-- 2026-07-14
-- Backlog #10: trials had NO UPDATE policy, so all updates were blocked by default RLS
-- and the app could never void a mis-tapped trial. The in-session "undo" action voids a
-- trial by setting superseded_by (self-reference), which excludes it from every
-- `superseded_by IS NULL` query (summaries, graphs, mastery, probes).
--
-- Scope: a practice member may update a trial only on a session in THEIR practice that is
-- not yet cosigned. With no WITH CHECK, the USING expression also constrains the new row,
-- so a trial cannot be moved into another practice or a cosigned session. (The column is
-- not RLS-limited to superseded_by — practice members can already insert trial data, so the
-- meaningful guards are practice scope + the cosigned lock, not per-column restriction.)
-- ═══════════════════════════════════════════════════

DROP POLICY IF EXISTS "Members update trials" ON public.trials;

CREATE POLICY "Members update trials" ON public.trials
  FOR UPDATE
  USING (
    (
      public.is_practice_member((
        SELECT pc.practice_id FROM public.sessions s
        JOIN public.practice_clients pc ON pc.id = s.practice_client_id
        WHERE s.id = session_id
      ))
      AND (SELECT s.status FROM public.sessions s WHERE s.id = session_id) IS DISTINCT FROM 'cosigned'
    )
    OR public.is_admin()
  );

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
