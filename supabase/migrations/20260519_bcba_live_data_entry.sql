-- ═══════════════════════════════════════════════════
-- BCBA Data Collection — Live Data Entry (sub-project #2)
-- 2026-05-19
-- Spec: docs/superpowers/specs/2026-05-18-bcba-live-data-entry-design.md
-- Depends on: 20260518_bcba_data_collection_foundation.sql
-- ═══════════════════════════════════════════════════

-- ─── PRE-SESSION PLAN ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.session_targets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES public.sessions(id) ON DELETE CASCADE NOT NULL,
  target_id uuid REFERENCES public.targets(id) ON DELETE CASCADE NOT NULL,
  planned_trials int,
  planned_at timestamptz DEFAULT now(),
  planned_by uuid REFERENCES public.practice_members(id),
  UNIQUE(session_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_session_targets_session ON public.session_targets(session_id);

ALTER TABLE public.session_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read session targets" ON public.session_targets
  FOR SELECT USING (
    public.is_practice_member((
      SELECT pc.practice_id FROM public.sessions s
      JOIN public.practice_clients pc ON pc.id = s.practice_client_id
      WHERE s.id = session_id
    )) OR public.is_admin()
  );

CREATE POLICY "Members write session targets" ON public.session_targets
  FOR ALL USING (
    public.is_practice_member((
      SELECT pc.practice_id FROM public.sessions s
      JOIN public.practice_clients pc ON pc.id = s.practice_client_id
      WHERE s.id = session_id
    )) OR public.is_admin()
  )
  WITH CHECK (
    public.is_practice_member((
      SELECT pc.practice_id FROM public.sessions s
      JOIN public.practice_clients pc ON pc.id = s.practice_client_id
      WHERE s.id = session_id
    )) OR public.is_admin()
  );

-- ─── PARENT READ ACCESS to sessions (aggregate-only) ──

CREATE POLICY "Parents read sessions via child_access" ON public.sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.practice_clients pc
      JOIN public.child_access ca ON ca.child_id = pc.child_id
      WHERE pc.id = sessions.practice_client_id
        AND ca.user_id = auth.uid()
        AND ca.access_level = 'full'
        AND ca.revoked_at IS NULL
        AND sessions.status IN ('completed','cosigned')
    )
  );

-- ─── PARENT-VISIBLE AGGREGATE VIEW ──

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
WHERE s.status IN ('completed','cosigned');

GRANT SELECT ON public.v_child_sessions TO authenticated;
ALTER VIEW public.v_child_sessions SET (security_invoker = on);

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
