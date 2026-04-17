-- ═══════════════════════════════════════════════════
-- Marketing AutoResearch Framework — core schema
-- 2026-04-17
-- Spec: docs/superpowers/specs/2026-04-17-marketing-autoresearch-framework-design.md
-- ═══════════════════════════════════════════════════

-- ─── experiment_slots: registry of testable elements ───
CREATE TABLE IF NOT EXISTS public.experiment_slots (
  id text PRIMARY KEY,
  description text,
  field_type text NOT NULL CHECK (field_type IN ('text', 'image_url', 'html_fragment')),
  deploy_mode text NOT NULL CHECK (deploy_mode IN ('auto', 'approval')),
  reward_metric jsonb NOT NULL,
  challenger_prompt text NOT NULL,
  min_sends_per_variant integer DEFAULT 50,
  confidence_threshold real DEFAULT 0.90 CHECK (confidence_threshold BETWEEN 0.5 AND 0.999),
  variant_stats jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'retired')),
  created_at timestamptz DEFAULT now(),
  last_optimized_at timestamptz
);
ALTER TABLE public.experiment_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage slots" ON public.experiment_slots
  FOR ALL USING (public.is_admin());
CREATE POLICY "Public read active slots" ON public.experiment_slots
  FOR SELECT USING (status = 'active');

-- ─── experiment_variants: the actual testable content ───
CREATE TABLE IF NOT EXISTS public.experiment_variants (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slot_id text REFERENCES public.experiment_slots(id) ON DELETE CASCADE NOT NULL,
  variant_key text NOT NULL,
  content text NOT NULL,
  generated_by text DEFAULT 'human' CHECK (generated_by IN ('human', 'claude', 'seed')),
  generated_from_variant text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'retired', 'pending_approval')),
  created_at timestamptz DEFAULT now(),
  activated_at timestamptz,
  retired_at timestamptz,
  UNIQUE(slot_id, variant_key)
);
ALTER TABLE public.experiment_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage variants" ON public.experiment_variants
  FOR ALL USING (public.is_admin());
CREATE POLICY "Public read active variants" ON public.experiment_variants
  FOR SELECT USING (status = 'active');

CREATE INDEX IF NOT EXISTS idx_variants_slot_active ON public.experiment_variants(slot_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_variants_pending_approval ON public.experiment_variants(slot_id, created_at) WHERE status = 'pending_approval';

-- ─── experiment_assignments: sticky per-session variant mapping ───
CREATE TABLE IF NOT EXISTS public.experiment_assignments (
  session_id text NOT NULL,
  slot_id text REFERENCES public.experiment_slots(id) ON DELETE CASCADE NOT NULL,
  variant_key text NOT NULL,
  user_id uuid REFERENCES public.profiles(id),
  initial_utm jsonb,
  assigned_at timestamptz DEFAULT now(),
  PRIMARY KEY (session_id, slot_id)
);
ALTER TABLE public.experiment_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read assignments" ON public.experiment_assignments
  FOR SELECT USING (public.is_admin());
-- Writes happen via worker service key, which bypasses RLS

CREATE INDEX IF NOT EXISTS idx_assignments_user ON public.experiment_assignments(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assignments_slot ON public.experiment_assignments(slot_id, assigned_at);

-- ─── experiment_events: outcomes firehose ───
CREATE TABLE IF NOT EXISTS public.experiment_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slot_id text REFERENCES public.experiment_slots(id) ON DELETE CASCADE,
  variant_key text,
  session_id text,
  user_id uuid REFERENCES public.profiles(id),
  event_type text NOT NULL,
  event_data jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.experiment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read events" ON public.experiment_events
  FOR SELECT USING (public.is_admin());
-- Writes via worker service key

CREATE INDEX IF NOT EXISTS idx_events_slot_variant_type ON public.experiment_events(slot_id, variant_key, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_events_session ON public.experiment_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_user ON public.experiment_events(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_type_created ON public.experiment_events(event_type, created_at);
