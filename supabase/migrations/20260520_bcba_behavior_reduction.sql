-- ═══════════════════════════════════════════════════
-- BCBA Data Collection — Behavior Reduction (sub-project #3)
-- 2026-05-20
-- Spec: docs/superpowers/specs/2026-05-19-bcba-behavior-reduction-design.md
-- Depends on: 20260518_bcba_data_collection_foundation.sql + 20260519_bcba_live_data_entry.sql
-- ═══════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_behavior_rec_def_time
  ON public.behavior_recordings(behavior_definition_id, timestamp DESC)
  WHERE superseded_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_behavior_rec_antecedent
  ON public.behavior_recordings(antecedent_id)
  WHERE antecedent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_behavior_rec_consequence
  ON public.behavior_recordings(consequence_id)
  WHERE consequence_id IS NOT NULL;
