-- ═══════════════════════════════════════════════════
-- BCBA — lock trial/behavior inserts on cosigned sessions
-- 2026-07-14
-- Backlog #17: a cosigned session is signed-off and clinically immutable, but the insert
-- policies had no status guard, so the offline queue could still POST trials/behaviors into
-- a completed-and-cosigned session and silently mutate a locked record.
--
-- Gate INSERT on `status <> 'cosigned'` only (NOT 'completed'): a late offline sync into a
-- completed-but-not-yet-cosigned session is legitimate data and must still land.
--
-- PREREQUISITE (already shipped in app.html): mvOffline.flush() now treats a 42501 RLS block
-- as permanent (holds it in failedOps) instead of retrying forever. Without that, a blocked
-- insert would jam the sync queue behind it — do not apply this migration against an older
-- app build.
-- ═══════════════════════════════════════════════════

DROP POLICY IF EXISTS "Members insert trials" ON public.trials;
CREATE POLICY "Members insert trials" ON public.trials
  FOR INSERT WITH CHECK (
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

DROP POLICY IF EXISTS "Members insert recordings" ON public.behavior_recordings;
CREATE POLICY "Members insert recordings" ON public.behavior_recordings
  FOR INSERT WITH CHECK (
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
