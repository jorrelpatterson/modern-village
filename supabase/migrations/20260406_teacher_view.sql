-- ═══════════════════════════════════════════════════
-- Teacher View Migration
-- 2026-04-06
-- ═══════════════════════════════════════════════════

-- Update caregiver behavior log INSERT policy to also allow teachers
DROP POLICY IF EXISTS "Caregivers log behaviors" ON public.behavior_logs;

CREATE POLICY "Caregivers and teachers log behaviors"
  ON public.behavior_logs FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.child_access ca
      JOIN public.children ch ON ch.id = ca.child_id
      WHERE ch.user_id = behavior_logs.user_id
      AND ca.user_id = auth.uid()
      AND ca.access_level IN ('full', 'daily', 'school')
      AND ca.revoked_at IS NULL
    )
  );
