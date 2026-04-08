-- ═══════════════════════════════════════════════════
-- Autoresearch: Strategy Rankings + Email Optimization
-- 2026-04-07
-- ═══════════════════════════════════════════════════

-- 1. Strategy Rankings — computed nightly from aggregate behavior_logs
-- Stores what strategies work best for each diagnosis × age × trigger combination
CREATE TABLE IF NOT EXISTS public.strategy_rankings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  diagnosis_category text NOT NULL,      -- 'Autism', 'ADHD', 'Both', 'Other'
  age_range text NOT NULL,               -- '0-2', '3-5', '6-9', '10-13', '14-17'
  trigger_type text NOT NULL,            -- 'Tangible', 'Escape', 'Attention', 'Sensory', 'Unknown'
  strategy text NOT NULL,                -- the strategy name/description
  times_used integer DEFAULT 0,
  times_improved integer DEFAULT 0,
  times_no_change integer DEFAULT 0,
  times_escalated integer DEFAULT 0,
  success_rate decimal(5,2) DEFAULT 0,   -- (improved / total) * 100
  avg_duration_minutes decimal(5,1),
  sample_size integer DEFAULT 0,
  confidence text DEFAULT 'low',         -- 'low' (<10 samples), 'medium' (10-50), 'high' (50+)
  rank integer,                          -- 1 = best strategy for this combo
  last_computed_at timestamptz DEFAULT now(),
  UNIQUE(diagnosis_category, age_range, trigger_type, strategy)
);

ALTER TABLE public.strategy_rankings ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read rankings (used by AI Coach)
CREATE POLICY "Authenticated read strategy rankings"
  ON public.strategy_rankings FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only admins can write (computed by cron via service key)
CREATE POLICY "Admins manage strategy rankings"
  ON public.strategy_rankings FOR ALL
  USING (public.is_admin());

-- 2. Strategy Ranking Logs — tracks each nightly computation run
CREATE TABLE IF NOT EXISTS public.strategy_ranking_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  total_logs_analyzed integer,
  total_rankings_computed integer,
  top_finding text,                      -- best discovery of this run (human-readable)
  run_duration_ms integer,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.strategy_ranking_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ranking runs"
  ON public.strategy_ranking_runs FOR ALL
  USING (public.is_admin());

-- 3. Email Optimization Logs — tracks the auto-optimization decisions
CREATE TABLE IF NOT EXISTS public.email_optimization_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid,
  action text NOT NULL,                  -- 'winner_picked', 'new_variant_generated', 'batch_sent'
  details jsonb,                         -- { winner_variant: 'a', open_rate_a: 0.23, open_rate_b: 0.31, new_subject: '...' }
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.email_optimization_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage optimization logs"
  ON public.email_optimization_logs FOR ALL
  USING (public.is_admin());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_strategy_rankings_lookup ON public.strategy_rankings(diagnosis_category, age_range, trigger_type);
CREATE INDEX IF NOT EXISTS idx_strategy_rankings_rank ON public.strategy_rankings(diagnosis_category, age_range, trigger_type, rank);
CREATE INDEX IF NOT EXISTS idx_email_opt_logs_campaign ON public.email_optimization_logs(campaign_id);
