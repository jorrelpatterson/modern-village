-- ═══════════════════════════════════════════════════
-- BCBA Data Collection — Target Annotations (graph polish)
-- 2026-05-24
-- BCBAs add free-text notes anchored to a date on a target graph.
-- Rendered as small triangle markers on the chart.
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.target_annotations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  target_id uuid REFERENCES public.targets(id) ON DELETE CASCADE NOT NULL,
  occurred_at date NOT NULL,
  note text NOT NULL,
  created_by uuid REFERENCES public.practice_members(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_target_annotations_target
  ON public.target_annotations(target_id, occurred_at);

ALTER TABLE public.target_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read annotations" ON public.target_annotations
  FOR SELECT USING (
    public.is_practice_member((
      SELECT pc.practice_id FROM public.targets t
      JOIN public.programs p ON p.id = t.program_id
      JOIN public.practice_clients pc ON pc.id = p.practice_client_id
      WHERE t.id = target_id
    )) OR public.is_admin()
  );

CREATE POLICY "BCBA writes annotations" ON public.target_annotations
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

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
