-- ═══════════════════════════════════════════════════
-- BCBA Data Collection — Foundation (sub-project #1)
-- 2026-05-18
-- Spec: docs/superpowers/specs/2026-05-18-bcba-data-collection-foundation-design.md
-- ═══════════════════════════════════════════════════

-- ─── PRACTICE TIER ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.practices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  owner_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT NOT NULL,
  group_npi text,
  tax_id text,
  billing_address jsonb,
  stripe_subscription_id text,
  stripe_customer_id text,
  subscription_status text DEFAULT 'trialing',
    -- 'trialing' | 'active' | 'past_due' | 'cancelled'
  trial_ends_at timestamptz DEFAULT (now() + interval '30 days'),
  patient_count int DEFAULT 0,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_practices_owner ON public.practices(owner_id);

CREATE TABLE IF NOT EXISTS public.practice_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  practice_id uuid REFERENCES public.practices(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL,
    -- 'owner_bcba' | 'supervising_bcba' | 'rbt' | 'admin'
  supervisor_id uuid REFERENCES public.practice_members(id) ON DELETE SET NULL,
  credentials jsonb DEFAULT '{}'::jsonb,
    -- {bcba_cert_number, bcba_expires, rbt_cert_number, rbt_expires}
  active boolean DEFAULT true,
  invited_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  invite_token text,
  UNIQUE(practice_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_practice_members_practice ON public.practice_members(practice_id);
CREATE INDEX IF NOT EXISTS idx_practice_members_user ON public.practice_members(user_id) WHERE active = true;

CREATE TABLE IF NOT EXISTS public.practice_clients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  practice_id uuid REFERENCES public.practices(id) ON DELETE CASCADE NOT NULL,
  child_id uuid REFERENCES public.children(id) ON DELETE CASCADE NOT NULL,
  primary_bcba_id uuid REFERENCES public.practice_members(id) ON DELETE SET NULL,
  secondary_bcba_id uuid REFERENCES public.practice_members(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'intake',
    -- 'intake' | 'active' | 'discharged' | 'on_hold'
  service_type text,
    -- '97153' | '97155' | '97156'
  prior_auth_number text,
  prior_auth_start date,
  prior_auth_end date,
  weekly_hours_authorized numeric,
  intake_date date,
  discharge_date date,
  discharge_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(practice_id, child_id)
);

CREATE INDEX IF NOT EXISTS idx_practice_clients_practice ON public.practice_clients(practice_id);
CREATE INDEX IF NOT EXISTS idx_practice_clients_status ON public.practice_clients(practice_id, status);

-- ─── PROGRAMS / TARGETS ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.programs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  practice_client_id uuid REFERENCES public.practice_clients(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
    -- 'skill_acquisition' | 'behavior_reduction'
  domain text,
    -- 'adaptive_living' | 'communication' | 'social' | 'parent_skills' | 'replacement_behaviors'
  description text,
  supervisor_id uuid REFERENCES public.practice_members(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
    -- 'active' | 'mastered' | 'on_hold' | 'archived'
  mastered_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_programs_client ON public.programs(practice_client_id, status);

CREATE TABLE IF NOT EXISTS public.curriculum_libraries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  publisher text,
  license_type text,
    -- 'free' | 'licensed' | 'modern_village_authored'
  version text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.curriculum_targets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  library_id uuid REFERENCES public.curriculum_libraries(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  operational_definition text NOT NULL,
  target_type text NOT NULL,
    -- 'discrete_trial' | 'task_analysis' | 'frequency' | 'duration' | 'interval'
  default_data_collection_config jsonb DEFAULT '{}'::jsonb,
  default_mastery_criteria jsonb DEFAULT '{}'::jsonb,
  domain text,
  suggested_age_min int,
  suggested_age_max int,
  suggested_diagnoses text[],
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_curriculum_targets_library ON public.curriculum_targets(library_id, domain);

CREATE TABLE IF NOT EXISTS public.curriculum_target_steps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  curriculum_target_id uuid REFERENCES public.curriculum_targets(id) ON DELETE CASCADE NOT NULL,
  sequence int NOT NULL,
  name text NOT NULL,
  description text,
  UNIQUE(curriculum_target_id, sequence)
);

CREATE TABLE IF NOT EXISTS public.targets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id uuid REFERENCES public.programs(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  operational_definition text NOT NULL,
  target_type text NOT NULL,
  data_collection_config jsonb DEFAULT '{}'::jsonb,
  mastery_criteria jsonb DEFAULT '{}'::jsonb,
  baseline_criteria jsonb DEFAULT '{}'::jsonb,
  maintenance_criteria jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'baseline',
    -- 'baseline' | 'in_treatment' | 'mastered' | 'in_maintenance' | 'closed'
  promoted_at timestamptz,
  library_source uuid REFERENCES public.curriculum_targets(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_targets_program ON public.targets(program_id, status);

CREATE TABLE IF NOT EXISTS public.target_steps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  target_id uuid REFERENCES public.targets(id) ON DELETE CASCADE NOT NULL,
  sequence int NOT NULL,
  name text NOT NULL,
  description text,
  UNIQUE(target_id, sequence)
);

-- ─── BEHAVIOR DEFINITIONS / LIBRARIES ────────────────

CREATE TABLE IF NOT EXISTS public.behavior_definitions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  practice_client_id uuid REFERENCES public.practice_clients(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  operational_definition text NOT NULL,
  recording_type text NOT NULL,
    -- 'frequency' | 'duration' | 'interval' | 'abc' | 'rate'
  classification text,
    -- 'challenging' | 'replacement'
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_behavior_defs_client ON public.behavior_definitions(practice_client_id, status);

CREATE TABLE IF NOT EXISTS public.behavior_antecedents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  practice_id uuid REFERENCES public.practices(id) ON DELETE CASCADE,
  practice_client_id uuid REFERENCES public.practice_clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CHECK (practice_id IS NOT NULL OR practice_client_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.behavior_consequences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  practice_id uuid REFERENCES public.practices(id) ON DELETE CASCADE,
  practice_client_id uuid REFERENCES public.practice_clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CHECK (practice_id IS NOT NULL OR practice_client_id IS NOT NULL)
);

-- ─── SESSIONS / TRIALS / BEHAVIOR_RECORDINGS (offline-ready) ───

CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  practice_client_id uuid REFERENCES public.practice_clients(id) ON DELETE CASCADE NOT NULL,
  provider_id uuid REFERENCES public.practice_members(id) ON DELETE RESTRICT NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  location text,
    -- 'home' | 'clinic' | 'school' | 'telehealth'
  cpt_code text,
  status text DEFAULT 'in_progress',
    -- 'in_progress' | 'completed' | 'cosigned' | 'cancelled'
  cosigner_id uuid REFERENCES public.practice_members(id) ON DELETE SET NULL,
  cosigned_at timestamptz,
  parent_present boolean DEFAULT false,
  prior_auth_used numeric,
  client_uuid uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_client ON public.sessions(practice_client_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_provider ON public.sessions(provider_id, start_time DESC);

CREATE TABLE IF NOT EXISTS public.trials (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES public.sessions(id) ON DELETE CASCADE NOT NULL,
  target_id uuid REFERENCES public.targets(id) ON DELETE CASCADE NOT NULL,
  target_step_id uuid REFERENCES public.target_steps(id) ON DELETE SET NULL,
  prompt_level text,
    -- 'independent' | 'gestural' | 'verbal' | 'model' | 'partial_physical' | 'full_physical' | 'no_response'
  response text,
    -- 'correct' | 'incorrect' | 'prompted' | 'refused' | 'na'
  trial_index int,
  timestamp timestamptz DEFAULT now(),
  ioa_observer_id uuid REFERENCES public.practice_members(id) ON DELETE SET NULL,
  client_uuid uuid NOT NULL,
  superseded_by uuid REFERENCES public.trials(id) ON DELETE SET NULL,
  UNIQUE(session_id, client_uuid)
);

CREATE INDEX IF NOT EXISTS idx_trials_session ON public.trials(session_id);
CREATE INDEX IF NOT EXISTS idx_trials_target ON public.trials(target_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS public.behavior_recordings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES public.sessions(id) ON DELETE CASCADE NOT NULL,
  behavior_definition_id uuid REFERENCES public.behavior_definitions(id) ON DELETE CASCADE NOT NULL,
  observer_id uuid REFERENCES public.practice_members(id) ON DELETE RESTRICT NOT NULL,
  recording_type text,
  count int,
  duration_seconds int,
  interval_data jsonb,
  antecedent_id uuid REFERENCES public.behavior_antecedents(id) ON DELETE SET NULL,
  consequence_id uuid REFERENCES public.behavior_consequences(id) ON DELETE SET NULL,
  function_category text,
    -- 'tangible' | 'escape' | 'attention' | 'sensory'
  location text,
  notes text,
  timestamp timestamptz DEFAULT now(),
  client_uuid uuid NOT NULL,
  superseded_by uuid REFERENCES public.behavior_recordings(id) ON DELETE SET NULL,
  UNIQUE(session_id, client_uuid)
);

CREATE INDEX IF NOT EXISTS idx_behavior_rec_session ON public.behavior_recordings(session_id);
CREATE INDEX IF NOT EXISTS idx_behavior_rec_def ON public.behavior_recordings(behavior_definition_id, timestamp DESC);

-- ─── ALTER EXISTING TABLES ───────────────────────────

ALTER TABLE public.session_notes
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_session_notes_session ON public.session_notes(session_id);

ALTER TABLE public.child_access
  ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES public.practices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_child_access_practice ON public.child_access(practice_id) WHERE practice_id IS NOT NULL;

-- ─── RLS POLICIES ────────────────────────────────────

-- Helper: is the current user an active member of this practice?
CREATE OR REPLACE FUNCTION public.is_practice_member(p_practice_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.practice_members
    WHERE practice_id = p_practice_id
      AND user_id = auth.uid()
      AND active = true
  );
$$;

-- Helper: does the current user have BCBA-level write access in this practice?
CREATE OR REPLACE FUNCTION public.is_practice_bcba(p_practice_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.practice_members
    WHERE practice_id = p_practice_id
      AND user_id = auth.uid()
      AND active = true
      AND role IN ('owner_bcba', 'supervising_bcba')
  );
$$;

-- practices
ALTER TABLE public.practices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read their practice" ON public.practices
  FOR SELECT USING (public.is_practice_member(id) OR public.is_admin());
CREATE POLICY "Owner updates practice" ON public.practices
  FOR UPDATE USING (owner_id = auth.uid() OR public.is_admin());
CREATE POLICY "Authenticated creates practice" ON public.practices
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- practice_members
ALTER TABLE public.practice_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read same-practice members" ON public.practice_members
  FOR SELECT USING (public.is_practice_member(practice_id) OR public.is_admin());
CREATE POLICY "BCBA writes members" ON public.practice_members
  FOR ALL USING (public.is_practice_bcba(practice_id) OR public.is_admin())
  WITH CHECK (public.is_practice_bcba(practice_id) OR public.is_admin());

-- practice_clients
ALTER TABLE public.practice_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read clients" ON public.practice_clients
  FOR SELECT USING (public.is_practice_member(practice_id) OR public.is_admin());
CREATE POLICY "BCBA writes clients" ON public.practice_clients
  FOR ALL USING (public.is_practice_bcba(practice_id) OR public.is_admin())
  WITH CHECK (public.is_practice_bcba(practice_id) OR public.is_admin());

-- programs
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read programs" ON public.programs
  FOR SELECT USING (
    public.is_practice_member((SELECT practice_id FROM public.practice_clients WHERE id = practice_client_id))
    OR public.is_admin()
  );
CREATE POLICY "BCBA writes programs" ON public.programs
  FOR ALL USING (
    public.is_practice_bcba((SELECT practice_id FROM public.practice_clients WHERE id = practice_client_id))
    OR public.is_admin()
  )
  WITH CHECK (
    public.is_practice_bcba((SELECT practice_id FROM public.practice_clients WHERE id = practice_client_id))
    OR public.is_admin()
  );

-- targets (same pattern: members read, BCBA writes)
ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read targets" ON public.targets
  FOR SELECT USING (
    public.is_practice_member((
      SELECT pc.practice_id FROM public.programs p
      JOIN public.practice_clients pc ON pc.id = p.practice_client_id
      WHERE p.id = program_id
    )) OR public.is_admin()
  );
CREATE POLICY "BCBA writes targets" ON public.targets
  FOR ALL USING (
    public.is_practice_bcba((
      SELECT pc.practice_id FROM public.programs p
      JOIN public.practice_clients pc ON pc.id = p.practice_client_id
      WHERE p.id = program_id
    )) OR public.is_admin()
  )
  WITH CHECK (
    public.is_practice_bcba((
      SELECT pc.practice_id FROM public.programs p
      JOIN public.practice_clients pc ON pc.id = p.practice_client_id
      WHERE p.id = program_id
    )) OR public.is_admin()
  );

-- target_steps (mirror targets)
ALTER TABLE public.target_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read target steps" ON public.target_steps
  FOR SELECT USING (
    public.is_practice_member((
      SELECT pc.practice_id FROM public.targets t
      JOIN public.programs p ON p.id = t.program_id
      JOIN public.practice_clients pc ON pc.id = p.practice_client_id
      WHERE t.id = target_id
    )) OR public.is_admin()
  );
CREATE POLICY "BCBA writes target steps" ON public.target_steps
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

-- behavior_definitions
ALTER TABLE public.behavior_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read behavior defs" ON public.behavior_definitions
  FOR SELECT USING (
    public.is_practice_member((SELECT practice_id FROM public.practice_clients WHERE id = practice_client_id))
    OR public.is_admin()
  );
CREATE POLICY "BCBA writes behavior defs" ON public.behavior_definitions
  FOR ALL USING (
    public.is_practice_bcba((SELECT practice_id FROM public.practice_clients WHERE id = practice_client_id))
    OR public.is_admin()
  )
  WITH CHECK (
    public.is_practice_bcba((SELECT practice_id FROM public.practice_clients WHERE id = practice_client_id))
    OR public.is_admin()
  );

-- behavior_antecedents, behavior_consequences
ALTER TABLE public.behavior_antecedents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read antecedents" ON public.behavior_antecedents
  FOR SELECT USING (
    (practice_id IS NOT NULL AND public.is_practice_member(practice_id))
    OR (practice_client_id IS NOT NULL AND public.is_practice_member((SELECT practice_id FROM public.practice_clients WHERE id = practice_client_id)))
    OR public.is_admin()
  );
CREATE POLICY "BCBA writes antecedents" ON public.behavior_antecedents
  FOR ALL USING (
    (practice_id IS NOT NULL AND public.is_practice_bcba(practice_id))
    OR (practice_client_id IS NOT NULL AND public.is_practice_bcba((SELECT practice_id FROM public.practice_clients WHERE id = practice_client_id)))
    OR public.is_admin()
  )
  WITH CHECK (
    (practice_id IS NOT NULL AND public.is_practice_bcba(practice_id))
    OR (practice_client_id IS NOT NULL AND public.is_practice_bcba((SELECT practice_id FROM public.practice_clients WHERE id = practice_client_id)))
    OR public.is_admin()
  );

ALTER TABLE public.behavior_consequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read consequences" ON public.behavior_consequences
  FOR SELECT USING (
    (practice_id IS NOT NULL AND public.is_practice_member(practice_id))
    OR (practice_client_id IS NOT NULL AND public.is_practice_member((SELECT practice_id FROM public.practice_clients WHERE id = practice_client_id)))
    OR public.is_admin()
  );
CREATE POLICY "BCBA writes consequences" ON public.behavior_consequences
  FOR ALL USING (
    (practice_id IS NOT NULL AND public.is_practice_bcba(practice_id))
    OR (practice_client_id IS NOT NULL AND public.is_practice_bcba((SELECT practice_id FROM public.practice_clients WHERE id = practice_client_id)))
    OR public.is_admin()
  )
  WITH CHECK (
    (practice_id IS NOT NULL AND public.is_practice_bcba(practice_id))
    OR (practice_client_id IS NOT NULL AND public.is_practice_bcba((SELECT practice_id FROM public.practice_clients WHERE id = practice_client_id)))
    OR public.is_admin()
  );

-- sessions
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read sessions" ON public.sessions
  FOR SELECT USING (
    public.is_practice_member((SELECT practice_id FROM public.practice_clients WHERE id = practice_client_id))
    OR public.is_admin()
  );
CREATE POLICY "Provider writes own sessions" ON public.sessions
  FOR ALL USING (
    public.is_practice_member((SELECT practice_id FROM public.practice_clients WHERE id = practice_client_id))
    OR public.is_admin()
  )
  WITH CHECK (
    public.is_practice_member((SELECT practice_id FROM public.practice_clients WHERE id = practice_client_id))
    OR public.is_admin()
  );

-- trials (append-only; updates blocked except superseded_by via BCBA)
ALTER TABLE public.trials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read trials" ON public.trials
  FOR SELECT USING (
    public.is_practice_member((
      SELECT pc.practice_id FROM public.sessions s
      JOIN public.practice_clients pc ON pc.id = s.practice_client_id
      WHERE s.id = session_id
    )) OR public.is_admin()
  );
CREATE POLICY "Members insert trials" ON public.trials
  FOR INSERT WITH CHECK (
    public.is_practice_member((
      SELECT pc.practice_id FROM public.sessions s
      JOIN public.practice_clients pc ON pc.id = s.practice_client_id
      WHERE s.id = session_id
    )) OR public.is_admin()
  );
-- No UPDATE / DELETE policies → updates and deletes blocked by default RLS

-- behavior_recordings (same append-only pattern)
ALTER TABLE public.behavior_recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read recordings" ON public.behavior_recordings
  FOR SELECT USING (
    public.is_practice_member((
      SELECT pc.practice_id FROM public.sessions s
      JOIN public.practice_clients pc ON pc.id = s.practice_client_id
      WHERE s.id = session_id
    )) OR public.is_admin()
  );
CREATE POLICY "Members insert recordings" ON public.behavior_recordings
  FOR INSERT WITH CHECK (
    public.is_practice_member((
      SELECT pc.practice_id FROM public.sessions s
      JOIN public.practice_clients pc ON pc.id = s.practice_client_id
      WHERE s.id = session_id
    )) OR public.is_admin()
  );

-- curriculum_libraries, curriculum_targets, curriculum_target_steps — world-readable to authenticated users
ALTER TABLE public.curriculum_libraries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read libraries" ON public.curriculum_libraries
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins write libraries" ON public.curriculum_libraries
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.curriculum_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read curriculum targets" ON public.curriculum_targets
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins write curriculum targets" ON public.curriculum_targets
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.curriculum_target_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read curriculum steps" ON public.curriculum_target_steps
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins write curriculum steps" ON public.curriculum_target_steps
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ─── PARENT READ VIEWS (flywheel "My BCBA" surface) ──

-- Aggregate target progress for a child (consumed by parent app in sub-project #2)
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
WHERE p.status != 'archived';

-- RLS on view: parent can read if they have child_access to the child
GRANT SELECT ON public.v_child_target_progress TO authenticated;
ALTER VIEW public.v_child_target_progress SET (security_invoker = on);

CREATE POLICY "Parents read practice_clients via child_access" ON public.practice_clients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.child_access ca
      WHERE ca.child_id = practice_clients.child_id
        AND ca.user_id = auth.uid()
        AND ca.access_level = 'full'
        AND ca.revoked_at IS NULL
    )
  );

CREATE POLICY "Parents read programs via child_access" ON public.programs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.practice_clients pc
      JOIN public.child_access ca ON ca.child_id = pc.child_id
      WHERE pc.id = programs.practice_client_id
        AND ca.user_id = auth.uid()
        AND ca.access_level = 'full'
        AND ca.revoked_at IS NULL
    )
  );

CREATE POLICY "Parents read targets via child_access" ON public.targets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.programs p
      JOIN public.practice_clients pc ON pc.id = p.practice_client_id
      JOIN public.child_access ca ON ca.child_id = pc.child_id
      WHERE p.id = targets.program_id
        AND ca.user_id = auth.uid()
        AND ca.access_level = 'full'
        AND ca.revoked_at IS NULL
    )
  );

-- Note: parents do NOT get read access to trials or behavior_recordings.
-- The aggregate view exposes counts only.

-- ─── UPDATED_AT TRIGGERS ─────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER tr_practices_touch BEFORE UPDATE ON public.practices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER tr_practice_clients_touch BEFORE UPDATE ON public.practice_clients
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER tr_programs_touch BEFORE UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER tr_targets_touch BEFORE UPDATE ON public.targets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER tr_behavior_defs_touch BEFORE UPDATE ON public.behavior_definitions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER tr_sessions_touch BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── PATIENT COUNT TRIGGER ───────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_practice_patient_count()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  pid uuid;
BEGIN
  pid := COALESCE(NEW.practice_id, OLD.practice_id);
  UPDATE public.practices
    SET patient_count = (
      SELECT count(*) FROM public.practice_clients
      WHERE practice_id = pid AND status = 'active'
    )
    WHERE id = pid;
  RETURN NEW;
END $$;

CREATE TRIGGER tr_practice_clients_count
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.practice_clients
  FOR EACH ROW EXECUTE FUNCTION public.refresh_practice_patient_count();

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
