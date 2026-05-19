-- ═══════════════════════════════════════════════════
-- BCBA Data Collection — Analysis & Reporting (sub-project #4)
-- 2026-05-21
-- Spec: docs/superpowers/specs/2026-05-20-bcba-analysis-reporting-design.md
-- Depends on: 20260518_bcba_data_collection_foundation.sql
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.phase_changes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  target_id uuid REFERENCES public.targets(id) ON DELETE CASCADE NOT NULL,
  occurred_at date NOT NULL,
  label text NOT NULL,
  notes text,
  created_by uuid REFERENCES public.practice_members(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(target_id, occurred_at, label)
);

CREATE INDEX IF NOT EXISTS idx_phase_changes_target ON public.phase_changes(target_id, occurred_at);

ALTER TABLE public.phase_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read phase changes" ON public.phase_changes
  FOR SELECT USING (
    public.is_practice_member((
      SELECT pc.practice_id FROM public.targets t
      JOIN public.programs p ON p.id = t.program_id
      JOIN public.practice_clients pc ON pc.id = p.practice_client_id
      WHERE t.id = target_id
    )) OR public.is_admin()
  );

CREATE POLICY "BCBA writes phase changes" ON public.phase_changes
  FOR ALL USING (
    public.is_practice_bcba((
      SELECT pc.practice_id FROM public.targets t
      JOIN public.programs p ON p.id = t.program_id
      JOIN public.practice_clients pc ON pc.id = p.practice_client_id
      WHERE t.id = target_id
    )) OR public.is_admin()
  )
  WITH CHECK (
    public.is_practice_bcba((
      SELECT pc.practice_id FROM public.targets t
      JOIN public.programs p ON p.id = t.program_id
      JOIN public.practice_clients pc ON pc.id = p.practice_client_id
      WHERE t.id = target_id
    )) OR public.is_admin()
  );

CREATE INDEX IF NOT EXISTS idx_targets_in_treatment
  ON public.targets(program_id, status, promoted_at)
  WHERE status IN ('baseline','in_treatment');
