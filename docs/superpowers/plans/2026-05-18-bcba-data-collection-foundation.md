# BCBA Data Collection — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data spine and 8 admin screens that let a BCBA create a practice, invite team members, add clients, define programs/targets, and browse a starter curriculum — laying the foundation for the 5 remaining sub-projects (live data entry, behavior reduction, analysis, documentation, curriculum libraries).

**Architecture:** Additive schema (no destructive migrations). New "Practice" tier above existing `profiles.role='provider'`. New clinical spine (`programs`, `targets`, `sessions`, `trials`, `behavior_recordings`) tied to clients via `practice_clients`. Existing `behavior_logs` and `session_notes` left intact; `session_notes` gains a nullable `session_id` FK. RLS scopes access by `practice_members` membership. Schema offline-ready (client_uuid + append-only) but no sync runtime in this sub-project.

**Tech Stack:** Supabase Postgres + RLS + Auth, Cloudflare Worker (vanilla JS) for invites, vanilla HTML/JS `app.html` for UI (no build system, matches existing pattern: `var`, inline `onclick`, dense one-liner JS).

**Spec:** [docs/superpowers/specs/2026-05-18-bcba-data-collection-foundation-design.md](../specs/2026-05-18-bcba-data-collection-foundation-design.md)

**Verification approach (no test framework in repo):** Each task ends with a verify step using either (a) Supabase SQL editor queries against tables/policies, or (b) manual UI walkthrough using existing test accounts (`testprovider@modernvillage.app` / `TestProvider123!`). Stripe wiring is intentionally out of scope — captured in a separate mini-spec sequenced after Foundation merges.

**Commit cadence:** one commit per task. Every commit message includes `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility | Phase |
|------|---------------|-------|
| `supabase/migrations/20260518_bcba_data_collection_foundation.sql` | All new tables, ALTER existing (session_notes, child_access), RLS policies, parent read views | 1 |
| `supabase/migrations/20260518_bcba_starter_library_seed.sql` | Modern Village Starter Library row + placeholder seed targets (real content drop is a separate task) | 1 |
| `app.html` | New "Practice" sidebar entry, 8 admin overlay pages, supporting JS | 2-8 |
| `worker.js` | `/practice/invite-member` endpoint + accept-invite token handler | 3 |
| `docs/ROADMAP.md` | Mark Foundation status, link plan | 10 |
| `docs/AGENT-CONTEXT.md` | Update in-flight section with BCBA Data Collection state | 10 |
| `docs/TESTING-GUIDE.md` | Add Practice tester walkthrough | 10 |

---

## Phase 1: Schema

### Task 1: Foundation migration — practice tier + clinical spine + RLS

**Files:**
- Create: `supabase/migrations/20260518_bcba_data_collection_foundation.sql`

- [ ] **Step 1: Create the migration file with all new tables, ALTERs, RLS, and parent read views**

```sql
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
-- security_invoker = on causes the view to respect the querying user's RLS,
-- so parent can only see rows where they have child_access to the child_id.
-- The underlying tables (practice_clients, programs, targets) have BCBA-scoped RLS
-- which would normally block parents — so we add an explicit parent read policy:

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
```

- [ ] **Step 2: Apply the migration in Supabase SQL editor**

Open https://supabase.com/dashboard/project/jrsiqjfwvunrjiihnsgc/sql/new, paste the file contents, run.

Expected: "Success. No rows returned." for the whole script.

- [ ] **Step 3: Verify table creation**

Run in SQL editor:

```sql
SELECT tablename FROM pg_tables
WHERE schemaname='public'
  AND tablename IN (
    'practices','practice_members','practice_clients',
    'programs','targets','target_steps',
    'behavior_definitions','behavior_antecedents','behavior_consequences',
    'sessions','trials','behavior_recordings',
    'curriculum_libraries','curriculum_targets','curriculum_target_steps'
  )
ORDER BY tablename;
```

Expected: 15 rows.

- [ ] **Step 4: Verify ALTERs applied**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'session_notes' AND column_name = 'session_id'
UNION ALL
SELECT column_name FROM information_schema.columns
WHERE table_name = 'child_access' AND column_name = 'practice_id';
```

Expected: 2 rows (`session_id`, `practice_id`).

- [ ] **Step 5: Verify RLS helpers exist**

```sql
SELECT proname FROM pg_proc
WHERE proname IN ('is_practice_member', 'is_practice_bcba');
```

Expected: 2 rows.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260518_bcba_data_collection_foundation.sql
git commit -m "$(cat <<'EOF'
feat(bcba): foundation migration — practice tier + clinical spine

Adds 15 new tables (practices, practice_members, practice_clients,
programs, targets, target_steps, behavior_definitions, antecedents,
consequences, sessions, trials, behavior_recordings, curriculum_*),
nullable session_id on session_notes, practice_id on child_access,
RLS scoped by practice_members, parent read views via child_access,
patient_count trigger.

No data migrations. Existing parent-side tables untouched.

Sub-project #1 of 6 (BCBA Data Collection initiative).
Plan: docs/superpowers/plans/2026-05-18-bcba-data-collection-foundation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Starter Library seed migration (scaffolding only)

**Files:**
- Create: `supabase/migrations/20260518_bcba_starter_library_seed.sql`

This task seeds the Modern Village Starter Library row and 5 placeholder targets so the curriculum browser has something to display. Ariana's authored content drop replaces these later.

- [ ] **Step 1: Create the seed file**

```sql
-- ═══════════════════════════════════════════════════
-- Modern Village Starter Library — seed
-- 2026-05-18
-- Placeholder content. Ariana's authored target drop will REPLACE these rows.
-- ═══════════════════════════════════════════════════

INSERT INTO public.curriculum_libraries (id, name, publisher, license_type, version, active)
VALUES (
  '00000000-0000-0000-0000-00000000a000',
  'Modern Village Starter Library',
  'Modern Village',
  'modern_village_authored',
  '0.1-placeholder',
  true
) ON CONFLICT (id) DO NOTHING;

-- 5 placeholder targets across domains. Replace with Ariana's content before launch.
INSERT INTO public.curriculum_targets (
  id, library_id, name, operational_definition, target_type,
  default_data_collection_config, default_mastery_criteria,
  domain, suggested_age_min, suggested_age_max
) VALUES
  (
    '00000000-0000-0000-0000-00000000a001',
    '00000000-0000-0000-0000-00000000a000',
    'Manding for preferred item',
    'When motivation is present (preferred item visible but unavailable), child independently requests the item using 1-3 word vocal mand within 10 seconds.',
    'discrete_trial',
    '{"trials_per_session": 10}'::jsonb,
    '{"response_pct": 80, "consecutive_sessions": 3, "first_trial_independent": true}'::jsonb,
    'communication', 2, 6
  ),
  (
    '00000000-0000-0000-0000-00000000a002',
    '00000000-0000-0000-0000-00000000a000',
    'Brushing teeth — full task analysis',
    'Independently completes all 9 steps of toothbrushing with no prompts from caregiver, ending with rinsing and putting toothbrush back in holder.',
    'task_analysis',
    '{"prompt_levels": ["independent","gestural","verbal","model","partial_physical","full_physical"]}'::jsonb,
    '{"steps_independent_pct": 100, "consecutive_sessions": 2}'::jsonb,
    'adaptive_living', 3, 10
  ),
  (
    '00000000-0000-0000-0000-00000000a003',
    '00000000-0000-0000-0000-00000000a000',
    'Aggression — open-hand hitting toward others',
    'Any instance of open-hand contact with another person''s body with force sufficient to make an audible sound or leave a visible mark. Recorded as frequency count per session.',
    'frequency',
    '{}'::jsonb,
    '{"target_count_per_session": 0, "consecutive_sessions": 5}'::jsonb,
    'replacement_behaviors', 2, 17
  ),
  (
    '00000000-0000-0000-0000-00000000a004',
    '00000000-0000-0000-0000-00000000a000',
    'Tolerating transition between activities',
    'When given a 2-minute warning and a transition cue, child moves to next activity within 30 seconds without protest behavior (vocal protest, dropping to floor, hitting, throwing).',
    'duration',
    '{}'::jsonb,
    '{"max_duration_seconds": 30, "consecutive_trials": 5}'::jsonb,
    'social', 3, 12
  ),
  (
    '00000000-0000-0000-0000-00000000a005',
    '00000000-0000-0000-0000-00000000a000',
    'Parent — using token economy at home',
    'During a 30-minute observation, parent delivers token within 5 seconds of target behavior, with verbal labeling, on at least 80% of opportunities.',
    'interval',
    '{"interval_seconds": 300, "interval_type": "partial"}'::jsonb,
    '{"interval_correct_pct": 80, "consecutive_sessions": 3}'::jsonb,
    'parent_skills', null, null
  )
ON CONFLICT (id) DO NOTHING;

-- Task analysis steps for the toothbrushing target
INSERT INTO public.curriculum_target_steps (curriculum_target_id, sequence, name) VALUES
  ('00000000-0000-0000-0000-00000000a002', 1, 'Pick up toothbrush'),
  ('00000000-0000-0000-0000-00000000a002', 2, 'Wet toothbrush under tap'),
  ('00000000-0000-0000-0000-00000000a002', 3, 'Apply pea-sized toothpaste'),
  ('00000000-0000-0000-0000-00000000a002', 4, 'Brush top teeth (30 sec)'),
  ('00000000-0000-0000-0000-00000000a002', 5, 'Brush bottom teeth (30 sec)'),
  ('00000000-0000-0000-0000-00000000a002', 6, 'Brush tongue (5 sec)'),
  ('00000000-0000-0000-0000-00000000a002', 7, 'Spit into sink'),
  ('00000000-0000-0000-0000-00000000a002', 8, 'Rinse mouth with water'),
  ('00000000-0000-0000-0000-00000000a002', 9, 'Return toothbrush to holder')
ON CONFLICT (curriculum_target_id, sequence) DO NOTHING;
```

- [ ] **Step 2: Apply in Supabase SQL editor**

Same workflow as Task 1.

- [ ] **Step 3: Verify rows seeded**

```sql
SELECT count(*) AS libraries FROM public.curriculum_libraries
WHERE id = '00000000-0000-0000-0000-00000000a000';
-- Expected: 1

SELECT count(*) AS targets FROM public.curriculum_targets
WHERE library_id = '00000000-0000-0000-0000-00000000a000';
-- Expected: 5

SELECT count(*) AS steps FROM public.curriculum_target_steps
WHERE curriculum_target_id = '00000000-0000-0000-0000-00000000a002';
-- Expected: 9
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260518_bcba_starter_library_seed.sql
git commit -m "$(cat <<'EOF'
feat(bcba): seed Modern Village Starter Library (placeholders)

5 placeholder curriculum_targets across all domains + task analysis
steps for toothbrushing. Ariana's authored content will replace these
before launch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: RLS smoke test

Verify that the locked-down policies behave correctly using existing test accounts. **This is a manual verification task — no code change.**

- [ ] **Step 1: Open Supabase SQL editor as `service_role`**

The service_role bypasses RLS. We'll create a test practice + member + client for verification.

```sql
-- Setup test rows (run as service_role)
WITH p AS (
  INSERT INTO public.practices (name, owner_id)
  VALUES ('Test Practice', (SELECT id FROM public.profiles WHERE email = 'testprovider@modernvillage.app'))
  RETURNING id
), m AS (
  INSERT INTO public.practice_members (practice_id, user_id, role, active, accepted_at)
  SELECT p.id, (SELECT id FROM public.profiles WHERE email = 'testprovider@modernvillage.app'),
         'owner_bcba', true, now()
  FROM p
  RETURNING practice_id
), c AS (
  INSERT INTO public.practice_clients (practice_id, child_id, status)
  SELECT m.practice_id,
         (SELECT id FROM public.children WHERE name = 'Maya' LIMIT 1),
         'active'
  FROM m
  RETURNING id
)
SELECT 'setup complete' AS status, c.id AS practice_client_id FROM c;
```

Save the `practice_client_id` output.

- [ ] **Step 2: Verify testprovider sees their practice**

In Supabase Auth UI, copy testprovider's JWT (or use the app + browser devtools to capture an authenticated token). In SQL editor, switch to "Run as: authenticated" using that JWT.

```sql
SELECT id, name FROM public.practices;
```

Expected: 1 row, "Test Practice".

- [ ] **Step 3: Verify testparent CANNOT see another practice's clients**

Same flow as Step 2 but with `testparent@modernvillage.app`'s JWT.

```sql
SELECT id FROM public.practice_clients;
```

Expected: 1 row (Maya's practice_client — because testparent has child_access to Maya). Confirm the row count matches; if testparent has access to multiple children, more rows may appear.

```sql
SELECT id FROM public.trials;
```

Expected: 0 rows (parent CANNOT see trials).

- [ ] **Step 4: Verify RBT cannot write programs**

Insert a test RBT member:

```sql
-- as service_role
INSERT INTO public.practice_members (practice_id, user_id, role, active, accepted_at, supervisor_id)
SELECT
  (SELECT id FROM public.practices WHERE name = 'Test Practice'),
  (SELECT id FROM public.profiles WHERE email = 'testcaregiver@modernvillage.app'),
  'rbt', true, now(),
  (SELECT id FROM public.practice_members WHERE role='owner_bcba' AND practice_id=(SELECT id FROM public.practices WHERE name = 'Test Practice'));
```

As testcaregiver (acting as RBT):

```sql
INSERT INTO public.programs (practice_client_id, name, category)
VALUES ('<practice_client_id from step 1>', 'RBT-attempted program', 'skill_acquisition');
```

Expected: ERROR — "new row violates row-level security policy".

- [ ] **Step 5: Clean up test rows**

```sql
DELETE FROM public.practices WHERE name = 'Test Practice';
-- Cascade clears practice_members, practice_clients, programs.
```

- [ ] **Step 6: Commit a verification note**

No code change in this task. Document the smoke test in `docs/TESTING-GUIDE.md` as part of Task 24. Skip commit here.

---

## Phase 2: Practice sidebar gating + onboarding

### Task 4: Add `S.practiceMember` to session state + sidebar gating

**Files:**
- Modify: `app.html` (loadProfile, sidebar render, S state)

The "Practice" sidebar entry only renders for users with an active `practice_members` row.

- [ ] **Step 1: Read existing loadProfile to find insertion point**

Find `async function loadProfile()` in `app.html`. It currently sets `S.role`, `S.profile`, etc.

- [ ] **Step 2: After `S.role` is set, fetch practice membership**

Add after `S.role = ...` assignment in `loadProfile()`:

```javascript
// Fetch active practice membership (BCBA data collection module)
S.practiceMember = null;
S.practice = null;
if(S.user){
  var pmR = await sb.from('practice_members')
    .select('id,practice_id,role,supervisor_id,credentials,practices(id,name,owner_id,subscription_status,trial_ends_at,patient_count)')
    .eq('user_id', S.user.id)
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  if(pmR.data){
    S.practiceMember = {
      id: pmR.data.id,
      practice_id: pmR.data.practice_id,
      role: pmR.data.role,
      supervisor_id: pmR.data.supervisor_id,
      credentials: pmR.data.credentials
    };
    S.practice = pmR.data.practices;
  }
}
```

- [ ] **Step 3: Add "Practice" sidebar items**

Find `var allItems=[` in the sidebar render function (around line 2465). Add these items to the array (place after the existing `Billing Dashboard` / `My Payers` entries for provider role):

```javascript
{label:"Practice Dashboard", action:"openPracticeDashboard()", roles:['provider'], requiresPractice:true},
{label:"Practice Members", action:"openPracticeMembers()", roles:['provider'], requiresPractice:true},
{label:"Clients (Practice)", action:"openPracticeClients()", roles:['provider'], requiresPractice:true},
{label:"Curriculum Library", action:"openCurriculumBrowser()", roles:['provider'], requiresPractice:true},
{label:"Practice Settings", action:"openPracticeSettings()", roles:['provider'], requiresPractice:true},
{label:"Set up Practice", action:"openPracticeOnboarding()", roles:['provider'], requiresNoPractice:true, highlight:true},
```

- [ ] **Step 4: Update the filter to honor `requiresPractice` / `requiresNoPractice`**

Find the line `var items=allItems.filter(function(item){return !item.roles||item.roles.indexOf(S.role)>=0});`. Replace with:

```javascript
var items=allItems.filter(function(item){
  if(item.roles && item.roles.indexOf(S.role) < 0) return false;
  if(item.requiresPractice && !S.practiceMember) return false;
  if(item.requiresNoPractice && S.practiceMember) return false;
  return true;
});
```

- [ ] **Step 5: Add stub functions so the sidebar links work**

Add near the top of the script section in `app.html`:

```javascript
function openPracticeOnboarding(){ alert('Practice onboarding coming in Task 5'); }
function openPracticeDashboard(){ alert('Practice dashboard coming next'); }
function openPracticeMembers(){ alert('Practice members coming next'); }
function openPracticeClients(){ alert('Practice clients coming next'); }
function openCurriculumBrowser(){ alert('Curriculum browser coming next'); }
function openPracticeSettings(){ alert('Practice settings coming next'); }
```

- [ ] **Step 6: Manual verification**

1. Run `python3 -m http.server 8000` in the repo root.
2. Open http://localhost:8000/app.html and log in as `testprovider@modernvillage.app` / `TestProvider123!`.
3. Open the sidebar (hamburger menu).
4. Expected: "Set up Practice" appears (highlighted), no Practice Dashboard / Members / etc.
5. Log in as `testparent@modernvillage.app`. Sidebar should NOT show any of these items.

- [ ] **Step 7: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba): sidebar gating for Practice module

Loads practice_members on profile load. Adds Practice sidebar entries
that only render for providers with an active practice membership.
Stub onclick handlers; real screens land in subsequent tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Practice onboarding wizard

**Files:**
- Modify: `app.html` (add overlay page + JS)

A simple 2-step wizard: practice name + tax info → invite first member (skippable). On submit, creates `practices` row + `practice_members` (owner_bcba) row. Stripe is intentionally deferred to a post-Foundation mini-spec; the wizard just sets `subscription_status='trialing'` and `trial_ends_at = now() + 30 days` (which the DB default handles).

- [ ] **Step 1: Add the overlay HTML**

Find the last `</div>` before `<script>` in `app.html`. Insert before it:

```html
<div id="practiceOnboardingPage" class="overlay-page">
  <div class="overlay-header">
    <button class="overlay-back" onclick="closeOverlay('practiceOnboardingPage')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D2D2D" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
    <h2 class="overlay-title">Set up your practice</h2>
  </div>
  <div class="overlay-inner" id="practiceOnboardingContent" style="padding-bottom:80px"></div>
</div>
```

- [ ] **Step 2: Replace the `openPracticeOnboarding` stub with the real wizard**

Find the stub `function openPracticeOnboarding(){ alert(...); }` from Task 4. Replace with:

```javascript
var onboardingState = { step: 1, name: '', taxId: '', groupNpi: '' };

function openPracticeOnboarding(){
  if(S.practiceMember){ showToast('You are already part of a practice.'); return; }
  onboardingState = { step: 1, name: '', taxId: '', groupNpi: '' };
  document.getElementById('practiceOnboardingPage').classList.add('open');
  renderOnboardingStep();
}

function renderOnboardingStep(){
  var el = document.getElementById('practiceOnboardingContent');
  if(onboardingState.step === 1){
    el.innerHTML =
      '<div style="max-width:520px;margin:0 auto">'+
      '<div style="font-size:13px;color:var(--warm-gray);font-weight:700;margin-bottom:8px">STEP 1 OF 2</div>'+
      '<h3 style="font-family:Fraunces,serif;font-size:24px;margin-bottom:6px">Tell us about your practice</h3>'+
      '<p style="color:var(--warm-gray);margin-bottom:24px">This unlocks the BCBA data collection module. 30-day free trial.</p>'+
      '<label class="fl">Practice name *</label>'+
      '<input id="onbName" class="fi" placeholder="e.g. Ariana Behavior Services" value="'+esc(onboardingState.name)+'">'+
      '<label class="fl" style="margin-top:14px">Group NPI (optional)</label>'+
      '<input id="onbNpi" class="fi" placeholder="10-digit NPI" value="'+esc(onboardingState.groupNpi)+'">'+
      '<label class="fl" style="margin-top:14px">Tax ID / EIN (optional)</label>'+
      '<input id="onbTax" class="fi" placeholder="XX-XXXXXXX" value="'+esc(onboardingState.taxId)+'">'+
      '<button class="btn btn-p" style="width:100%;margin-top:24px" onclick="onboardingNext()">Continue &rarr;</button>'+
      '</div>';
  } else if(onboardingState.step === 2){
    el.innerHTML =
      '<div style="max-width:520px;margin:0 auto">'+
      '<div style="font-size:13px;color:var(--warm-gray);font-weight:700;margin-bottom:8px">STEP 2 OF 2</div>'+
      '<h3 style="font-family:Fraunces,serif;font-size:24px;margin-bottom:6px">Invite your team (optional)</h3>'+
      '<p style="color:var(--warm-gray);margin-bottom:24px">You can invite BCBAs and RBTs now or later from the Members page.</p>'+
      '<button class="btn btn-p" style="width:100%" onclick="completeOnboarding()">Finish &mdash; I\\x27ll invite later</button>'+
      '<button class="btn btn-s" style="width:100%;margin-top:10px" onclick="completeOnboarding(true)">Finish &amp; go to Members page</button>'+
      '</div>';
  }
}

function onboardingNext(){
  var name = document.getElementById('onbName').value.trim();
  if(!name){ showToast('Practice name is required'); return; }
  onboardingState.name = name;
  onboardingState.groupNpi = document.getElementById('onbNpi').value.trim();
  onboardingState.taxId = document.getElementById('onbTax').value.trim();
  onboardingState.step = 2;
  renderOnboardingStep();
}

async function completeOnboarding(goToMembers){
  var btns = document.querySelectorAll('#practiceOnboardingContent button');
  for(var i=0;i<btns.length;i++) btns[i].disabled = true;
  var pR = await sb.from('practices').insert({
    name: onboardingState.name,
    owner_id: S.user.id,
    group_npi: onboardingState.groupNpi || null,
    tax_id: onboardingState.taxId || null
  }).select().single();
  if(pR.error){ showToast('Could not create practice: '+pR.error.message); for(var i=0;i<btns.length;i++) btns[i].disabled = false; return; }
  var mR = await sb.from('practice_members').insert({
    practice_id: pR.data.id,
    user_id: S.user.id,
    role: 'owner_bcba',
    active: true,
    accepted_at: new Date().toISOString()
  });
  if(mR.error){ showToast('Could not add you as owner: '+mR.error.message); return; }
  auditLog('create_practice', 'practices', pR.data.id, { name: pR.data.name });
  await loadProfile();
  closeOverlay('practiceOnboardingPage');
  if(goToMembers) openPracticeMembers();
  else openPracticeDashboard();
  showToast('Practice created — welcome.');
}
```

- [ ] **Step 3: Manual verification**

1. Start `python3 -m http.server 8000`, open as `testprovider@modernvillage.app`.
2. Open sidebar → click "Set up Practice".
3. Wizard opens at Step 1. Enter "Test Practice — verify wizard" + click Continue.
4. Step 2 shows. Click "Finish — I'll invite later".
5. Wizard closes; toast shows "Practice created — welcome."
6. Reopen sidebar — "Set up Practice" should be gone; Practice Dashboard / Members / Clients / Curriculum / Settings should appear.
7. SQL check:
   ```sql
   SELECT name, subscription_status, trial_ends_at FROM public.practices
   WHERE name = 'Test Practice — verify wizard';
   ```
   Expected: 1 row, status `trialing`, trial_ends_at ~30 days from now.
8. Clean up:
   ```sql
   DELETE FROM public.practices WHERE name = 'Test Practice — verify wizard';
   ```

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba): practice onboarding wizard

Two-step wizard creates a practices row + owner_bcba practice_members
row. 30-day trial via DB default. Stripe wiring deferred to a separate
mini-spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: Members management

### Task 6: Practice Members page UI (list + invite)

**Files:**
- Modify: `app.html` (replace `openPracticeMembers` stub, add overlay)

- [ ] **Step 1: Add the overlay HTML**

Insert near the other practice overlays:

```html
<div id="practiceMembersPage" class="overlay-page">
  <div class="overlay-header">
    <button class="overlay-back" onclick="closeOverlay('practiceMembersPage')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D2D2D" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
    <h2 class="overlay-title">Practice Members</h2>
  </div>
  <div class="overlay-inner" id="practiceMembersContent" style="padding-bottom:80px"></div>
</div>

<div id="inviteMemberModal" class="modal-overlay" style="display:none">
  <div class="modal-content" style="max-width:480px">
    <h3 style="font-family:Fraunces,serif;font-size:22px;margin-bottom:12px">Invite a team member</h3>
    <label class="fl">Email</label>
    <input id="invMemberEmail" class="fi" placeholder="rbt@example.com">
    <label class="fl" style="margin-top:14px">Role</label>
    <select id="invMemberRole" class="fi" onchange="onInviteRoleChange()">
      <option value="rbt">RBT (Registered Behavior Technician)</option>
      <option value="supervising_bcba">Supervising BCBA</option>
      <option value="admin">Practice Admin (no clinical access)</option>
    </select>
    <div id="invSupervisorWrap">
      <label class="fl" style="margin-top:14px">Supervising BCBA</label>
      <select id="invSupervisorId" class="fi"></select>
    </div>
    <div style="display:flex;gap:8px;margin-top:20px">
      <button class="btn btn-s" style="flex:1" onclick="closeInviteModal()">Cancel</button>
      <button class="btn btn-p" style="flex:1" onclick="submitInviteMember()">Send invite</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Replace the `openPracticeMembers` stub**

```javascript
async function openPracticeMembers(){
  if(!S.practiceMember){ showToast('Set up your practice first'); return; }
  document.getElementById('practiceMembersPage').classList.add('open');
  await loadPracticeMembers();
}

async function loadPracticeMembers(){
  var el = document.getElementById('practiceMembersContent');
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--warm-gray)">Loading…</div>';
  var r = await sb.from('practice_members')
    .select('id,role,supervisor_id,credentials,active,invited_at,accepted_at,profiles(id,name,email)')
    .eq('practice_id', S.practiceMember.practice_id)
    .order('invited_at', { ascending: true });
  if(r.error){ el.innerHTML = '<div style="padding:20px;color:var(--terracotta)">Error: '+esc(r.error.message)+'</div>'; return; }
  var members = r.data || [];
  var canInvite = S.practiceMember.role === 'owner_bcba' || S.practiceMember.role === 'supervising_bcba';
  var h = '<div style="max-width:760px;margin:0 auto">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'+
    '<div><div style="font-family:Fraunces,serif;font-size:20px;font-weight:700">'+esc(S.practice.name)+'</div>'+
    '<div style="font-size:13px;color:var(--warm-gray)">'+members.length+' member'+(members.length!==1?'s':'')+'</div></div>'+
    (canInvite ? '<button class="btn btn-p" onclick="openInviteModal()">+ Invite member</button>' : '')+
    '</div>';
  for(var i=0;i<members.length;i++){
    var m = members[i];
    var p = m.profiles || {};
    var roleLabel = {owner_bcba:'Owner BCBA', supervising_bcba:'Supervising BCBA', rbt:'RBT', admin:'Admin'}[m.role] || m.role;
    var statusLabel = m.accepted_at ? 'Active' : 'Pending';
    h += '<div style="border:1px solid var(--sand);border-radius:14px;padding:16px;margin-bottom:10px;background:white">'+
      '<div style="display:flex;justify-content:space-between;align-items:start">'+
      '<div><div style="font-weight:700;font-size:15px">'+esc(p.name || p.email || 'Pending')+'</div>'+
      '<div style="font-size:12px;color:var(--warm-gray);margin-top:2px">'+esc(p.email || '')+'</div>'+
      '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">'+
      '<span class="log-tag" style="background:var(--sage-light);color:var(--sage-dark)">'+roleLabel+'</span>'+
      '<span class="log-tag">'+statusLabel+'</span>'+
      '</div></div>';
    if(canInvite && m.role !== 'owner_bcba'){
      h += '<button class="btn btn-s" onclick="deactivateMember(\\x27'+m.id+'\\x27)" style="padding:6px 10px;font-size:12px">'+(m.active?'Deactivate':'Reactivate')+'</button>';
    }
    h += '</div></div>';
  }
  h += '</div>';
  el.innerHTML = h;
}

function onInviteRoleChange(){
  var role = document.getElementById('invMemberRole').value;
  document.getElementById('invSupervisorWrap').style.display = (role === 'rbt' ? 'block' : 'none');
}

async function openInviteModal(){
  // Load BCBAs for supervisor dropdown
  var r = await sb.from('practice_members')
    .select('id,profiles(name,email)')
    .eq('practice_id', S.practiceMember.practice_id)
    .in('role', ['owner_bcba','supervising_bcba'])
    .eq('active', true);
  var opts = '';
  (r.data || []).forEach(function(m){
    var p = m.profiles || {};
    opts += '<option value="'+m.id+'">'+esc(p.name||p.email||'(BCBA)')+'</option>';
  });
  document.getElementById('invSupervisorId').innerHTML = opts;
  document.getElementById('invMemberEmail').value = '';
  document.getElementById('invMemberRole').value = 'rbt';
  onInviteRoleChange();
  document.getElementById('inviteMemberModal').style.display = 'flex';
}

function closeInviteModal(){
  document.getElementById('inviteMemberModal').style.display = 'none';
}

async function submitInviteMember(){
  var email = document.getElementById('invMemberEmail').value.trim().toLowerCase();
  var role = document.getElementById('invMemberRole').value;
  var supervisorId = role === 'rbt' ? document.getElementById('invSupervisorId').value : null;
  if(!email){ showToast('Email required'); return; }
  // Call worker endpoint (built in Task 7)
  var token = await getAuthToken();
  var r = await fetch(API_URL+'practice/invite-member', {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
    body: JSON.stringify({ email: email, role: role, supervisor_id: supervisorId, practice_id: S.practiceMember.practice_id })
  });
  var j = await r.json();
  if(!r.ok){ showToast(j.error || 'Invite failed'); return; }
  closeInviteModal();
  showToast('Invite sent to '+email);
  loadPracticeMembers();
}

async function deactivateMember(memberId){
  if(!confirm('Toggle member active status?')) return;
  // Fetch current state, flip it
  var r = await sb.from('practice_members').select('active').eq('id', memberId).single();
  if(r.error){ showToast(r.error.message); return; }
  var upd = await sb.from('practice_members').update({ active: !r.data.active }).eq('id', memberId);
  if(upd.error){ showToast(upd.error.message); return; }
  loadPracticeMembers();
}
```

- [ ] **Step 3: Manual verification (UI-only — worker endpoint comes next)**

1. Open as testprovider, open Practice Members.
2. You should see the owner_bcba row (testprovider) with role "Owner BCBA" and status "Active".
3. Click "+ Invite member" — modal opens. Select role = RBT, supervisor dropdown shows the owner BCBA.
4. Submitting will fail at this point (worker endpoint not built) — that's expected for this task.

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba): Practice Members page UI

List, invite modal, supervisor selection for RBTs, deactivate toggle.
Invite submission wires to /practice/invite-member which lands next.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Worker endpoint — `/practice/invite-member`

**Files:**
- Modify: `worker.js`

Mirrors the existing care-team invite pattern. Creates a `practice_members` row with `accepted_at = null` and an `invite_token`, sends an email via Resend, returns success.

- [ ] **Step 1: Find the existing invite handler pattern**

Search `worker.js` for `/invite/send` or care-team invite handler. Use it as the template (same auth, same Resend usage).

- [ ] **Step 2: Add the new route**

Inside the `fetch` handler, after existing routes, add:

```javascript
if(url.pathname === '/practice/invite-member' && request.method === 'POST'){
  var auth = await verifyJwt(request, env);
  if(!auth.ok) return json({ error: auth.error }, 401);
  var body = await request.json();
  if(!body.email || !body.role || !body.practice_id) return json({ error: 'Missing fields' }, 400);
  if(['rbt','supervising_bcba','admin'].indexOf(body.role) < 0) return json({ error: 'Invalid role' }, 400);
  if(body.role === 'rbt' && !body.supervisor_id) return json({ error: 'RBT requires supervisor' }, 400);

  // Verify inviter is owner_bcba or supervising_bcba of the practice
  var mR = await fetch(env.SUPABASE_URL+'/rest/v1/practice_members?practice_id=eq.'+body.practice_id+'&user_id=eq.'+auth.userId+'&active=eq.true', {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer '+env.SUPABASE_SERVICE_KEY }
  });
  var membership = await mR.json();
  if(!membership.length || ['owner_bcba','supervising_bcba'].indexOf(membership[0].role) < 0){
    return json({ error: 'Not authorized to invite' }, 403);
  }

  // Look up invitee profile by email
  var profR = await fetch(env.SUPABASE_URL+'/rest/v1/profiles?email=eq.'+encodeURIComponent(body.email)+'&select=id', {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer '+env.SUPABASE_SERVICE_KEY }
  });
  var profs = await profR.json();
  var inviteeId = profs.length ? profs[0].id : null;

  // Generate invite token
  var token = crypto.randomUUID();

  if(inviteeId){
    // Existing user — create practice_members row directly
    var insertR = await fetch(env.SUPABASE_URL+'/rest/v1/practice_members', {
      method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer '+env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({
        practice_id: body.practice_id,
        user_id: inviteeId,
        role: body.role,
        supervisor_id: body.supervisor_id || null,
        active: false,
        invite_token: token
      })
    });
    if(!insertR.ok){
      var e = await insertR.text();
      return json({ error: 'Could not create invite: '+e }, 500);
    }
  } else {
    return json({ error: 'Invitee must create a Modern Village account first. Ask them to sign up at https://modernvillage.app, then re-invite.' }, 400);
  }

  // Fetch practice name for the email
  var prR = await fetch(env.SUPABASE_URL+'/rest/v1/practices?id=eq.'+body.practice_id+'&select=name', {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer '+env.SUPABASE_SERVICE_KEY }
  });
  var practiceName = (await prR.json())[0].name;

  // Send invite email
  var acceptUrl = 'https://modernvillage.app/app.html?practice_invite='+token;
  var emailBody = '<p>Hi,</p><p>You have been invited to join <strong>'+practiceName+'</strong> on Modern Village as a '+body.role.replace('_',' ')+'.</p><p><a href="'+acceptUrl+'" style="display:inline-block;padding:14px 24px;background:#7A9E7E;color:white;text-decoration:none;border-radius:10px;font-weight:700">Accept invite</a></p><p>Or open this link: '+acceptUrl+'</p><p style="color:#706B65;font-size:12px;margin-top:24px">Modern Village — ABA-powered parenting support</p>';
  var resendR = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer '+env.RESEND_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Modern Village <hello@modernvillage.app>',
      to: body.email,
      subject: 'You are invited to join '+practiceName+' on Modern Village',
      html: emailBody
    })
  });
  if(!resendR.ok){
    var et = await resendR.text();
    return json({ error: 'Email send failed: '+et }, 500);
  }
  return json({ ok: true });
}
```

- [ ] **Step 3: Test locally**

```bash
cd "$(dirname "$(git rev-parse --show-toplevel)")"
# OR cd into repo root:
cd "/Volumes/(626)806-4475/Ai Projects/modern-village"
wrangler dev worker.js --local
```

In another terminal:

```bash
# Get a token by logging into app.html and copy from devtools.
TOKEN="<paste auth token>"
curl -X POST http://localhost:8787/practice/invite-member \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"testcaregiver@modernvillage.app","role":"rbt","supervisor_id":"<owner_bcba member id>","practice_id":"<practice id>"}'
```

Expected: `{"ok":true}` and an email lands at the address (or in Resend logs).

SQL check:
```sql
SELECT id, role, active, invite_token FROM public.practice_members
WHERE practice_id='<practice id>' AND user_id=(SELECT id FROM public.profiles WHERE email='testcaregiver@modernvillage.app');
```
Expected: 1 row, `active=false`, `invite_token` set.

- [ ] **Step 4: Deploy the worker**

```bash
wrangler deploy
```

- [ ] **Step 5: Commit**

```bash
git add worker.js
git commit -m "$(cat <<'EOF'
feat(bcba): /practice/invite-member endpoint

Creates pending practice_members row with invite_token, emails accept
link via Resend. Verifies inviter is owner_bcba or supervising_bcba.
RBT role requires supervisor_id.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Accept-invite flow on app load

**Files:**
- Modify: `app.html` (init flow)

When app loads with `?practice_invite=<token>` in URL, look up the matching `practice_members` row, set `active=true` and `accepted_at=now()`, reload profile, navigate to Practice Dashboard.

- [ ] **Step 1: Find the init function**

Search `app.html` for the post-auth init logic — somewhere after `loadProfile()` is first called on app boot.

- [ ] **Step 2: Add the accept-invite handler**

Add this function:

```javascript
async function handlePracticeInviteToken(){
  var params = new URLSearchParams(window.location.search);
  var token = params.get('practice_invite');
  if(!token || !S.user) return;
  var r = await sb.from('practice_members')
    .select('id,practice_id,user_id,practices(name)')
    .eq('invite_token', token)
    .maybeSingle();
  if(r.error || !r.data){
    showToast('Invite link invalid or expired');
    return;
  }
  if(r.data.user_id !== S.user.id){
    showToast('This invite was for a different account. Sign in with the invited email.');
    return;
  }
  var upd = await sb.from('practice_members')
    .update({ active: true, accepted_at: new Date().toISOString(), invite_token: null })
    .eq('id', r.data.id);
  if(upd.error){ showToast(upd.error.message); return; }
  // Strip token from URL
  window.history.replaceState({}, '', window.location.pathname);
  await loadProfile();
  showToast('Welcome to '+(r.data.practices?.name||'your practice'));
  openPracticeDashboard();
}
```

- [ ] **Step 3: Call it after profile load on app init**

Find where `loadProfile()` is called on initial app boot. Add immediately after:

```javascript
await handlePracticeInviteToken();
```

- [ ] **Step 4: Manual verification**

1. Run the invite curl from Task 7 to create a pending member.
2. In your browser, sign out of testprovider, sign in as `testcaregiver@modernvillage.app` / `TestCaregiver123!`.
3. Open `http://localhost:8000/app.html?practice_invite=<token>` using the token from the SQL check.
4. Expected: toast "Welcome to Test Practice", Practice Dashboard opens (stub for now), URL strips the query param.
5. SQL:
   ```sql
   SELECT active, accepted_at, invite_token FROM public.practice_members
   WHERE user_id=(SELECT id FROM public.profiles WHERE email='testcaregiver@modernvillage.app');
   ```
   Expected: active=true, accepted_at set, invite_token=null.

- [ ] **Step 5: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba): accept practice invite via URL token

Reads ?practice_invite=<token> on app boot, activates the matching
practice_members row, strips the token from URL, navigates to
Practice Dashboard.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: Client roster

### Task 9: Practice Dashboard (landing page)

A simple landing surface that shows practice summary stats and recent activity. Real graphs are sub-project #4 — this is the launch pad.

**Files:**
- Modify: `app.html`

- [ ] **Step 1: Add overlay HTML**

```html
<div id="practiceDashboardPage" class="overlay-page">
  <div class="overlay-header">
    <button class="overlay-back" onclick="closeOverlay('practiceDashboardPage')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D2D2D" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
    <h2 class="overlay-title">Practice Dashboard</h2>
  </div>
  <div class="overlay-inner" id="practiceDashboardContent" style="padding-bottom:80px"></div>
</div>
```

- [ ] **Step 2: Replace the stub**

```javascript
async function openPracticeDashboard(){
  if(!S.practiceMember){ showToast('Set up your practice first'); return; }
  document.getElementById('practiceDashboardPage').classList.add('open');
  var el = document.getElementById('practiceDashboardContent');
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--warm-gray)">Loading…</div>';
  // Counts
  var cR = await sb.from('practice_clients').select('id,status', { count:'exact', head:false }).eq('practice_id', S.practiceMember.practice_id);
  var mR = await sb.from('practice_members').select('id', { count:'exact', head:true }).eq('practice_id', S.practiceMember.practice_id).eq('active', true);
  var sR = await sb.from('sessions').select('id', { count:'exact', head:true }).eq('practice_client_id', '00000000-0000-0000-0000-000000000000');
  // Note: sessions count needs a join; for now skip and show 0 — sessions list is in Task 17.
  var clients = cR.data || [];
  var active = clients.filter(function(c){ return c.status === 'active'; }).length;
  var intake = clients.filter(function(c){ return c.status === 'intake'; }).length;
  var p = S.practice;
  var trialDaysLeft = p.trial_ends_at ? Math.max(0, Math.ceil((new Date(p.trial_ends_at) - new Date()) / 86400000)) : 0;
  var h = '<div style="max-width:760px;margin:0 auto">'+
    '<div style="font-family:Fraunces,serif;font-size:28px;font-weight:700;margin-bottom:4px">'+esc(p.name)+'</div>'+
    '<div style="font-size:13px;color:var(--warm-gray);margin-bottom:20px">'+
      (p.subscription_status === 'trialing' ? trialDaysLeft+' days left in trial' : esc(p.subscription_status))+
      ' &middot; '+(p.patient_count || 0)+' active patients'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:24px">'+
      '<div class="billing-stat"><div class="bs-num">'+active+'</div><div class="bs-lbl">Active clients</div></div>'+
      '<div class="billing-stat"><div class="bs-num">'+intake+'</div><div class="bs-lbl">In intake</div></div>'+
      '<div class="billing-stat"><div class="bs-num">'+(mR.count || 0)+'</div><div class="bs-lbl">Team members</div></div>'+
    '</div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
      '<button class="btn btn-p" onclick="openPracticeClients()">Manage clients</button>'+
      '<button class="btn btn-s" onclick="openPracticeMembers()">Team</button>'+
      '<button class="btn btn-s" onclick="openCurriculumBrowser()">Curriculum library</button>'+
      '<button class="btn btn-s" onclick="openPracticeSettings()">Settings</button>'+
    '</div>'+
    '<div style="margin-top:24px;padding:14px;background:var(--sage-light);border-radius:14px;font-size:13px;color:var(--sage-dark)">Live data entry, graphs, and SOAP auto-fill ship in the next sub-projects. This is the foundation.</div>'+
    '</div>';
  el.innerHTML = h;
}
```

- [ ] **Step 3: Manual verification**

1. Open as testprovider with the Test Practice from earlier.
2. Sidebar → Practice Dashboard.
3. Expected: dashboard with practice name, "30 days left in trial", 0/0/1 stat cards (since no clients yet, 1 member = the owner).

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba): Practice Dashboard landing page

Shows practice name, trial days remaining, active/intake client counts,
member count. Quick links to all eight Practice surfaces.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Client roster page (list + add + discharge)

**Files:**
- Modify: `app.html`

- [ ] **Step 1: Add overlay HTML + add-client modal**

```html
<div id="practiceClientsPage" class="overlay-page">
  <div class="overlay-header">
    <button class="overlay-back" onclick="closeOverlay('practiceClientsPage')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D2D2D" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
    <h2 class="overlay-title">Clients</h2>
  </div>
  <div class="overlay-inner" id="practiceClientsContent" style="padding-bottom:80px"></div>
</div>

<div id="addClientModal" class="modal-overlay" style="display:none">
  <div class="modal-content" style="max-width:520px">
    <h3 style="font-family:Fraunces,serif;font-size:22px;margin-bottom:12px">Add a client</h3>
    <p style="color:var(--warm-gray);font-size:13px;margin-bottom:14px">Add a child whose parent is already on Modern Village (search by parent email), or create a new child and invite the parent.</p>
    <label class="fl">Parent email</label>
    <input id="addClientParentEmail" class="fi" placeholder="parent@example.com" oninput="searchParentByEmail()">
    <div id="addClientChildPicker" style="margin-top:14px;display:none"></div>
    <label class="fl" style="margin-top:14px">Service type</label>
    <select id="addClientService" class="fi">
      <option value="97153">97153 — Adaptive behavior treatment (direct)</option>
      <option value="97155">97155 — Adaptive behavior treatment (supervised by BCBA)</option>
      <option value="97156" selected>97156 — Family adaptive behavior treatment guidance (PC)</option>
    </select>
    <label class="fl" style="margin-top:14px">Primary BCBA</label>
    <select id="addClientPrimary" class="fi"></select>
    <label class="fl" style="margin-top:14px">Weekly hours authorized</label>
    <input id="addClientHours" class="fi" type="number" min="0" step="0.5" placeholder="e.g. 10">
    <label class="fl" style="margin-top:14px">Prior authorization #</label>
    <input id="addClientPa" class="fi" placeholder="optional">
    <div style="display:flex;gap:8px;margin-top:20px">
      <button class="btn btn-s" style="flex:1" onclick="closeAddClientModal()">Cancel</button>
      <button class="btn btn-p" style="flex:1" onclick="submitAddClient()">Add client</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Replace stub + add functions**

```javascript
var addClientState = { parentId: null, childId: null };

async function openPracticeClients(){
  if(!S.practiceMember){ showToast('Set up your practice first'); return; }
  document.getElementById('practiceClientsPage').classList.add('open');
  await loadPracticeClients();
}

async function loadPracticeClients(){
  var el = document.getElementById('practiceClientsContent');
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--warm-gray)">Loading…</div>';
  var r = await sb.from('practice_clients')
    .select('id,status,service_type,prior_auth_number,weekly_hours_authorized,intake_date,children(id,name,age,diagnosis),primary_bcba:practice_members!primary_bcba_id(profiles(name,email))')
    .eq('practice_id', S.practiceMember.practice_id)
    .order('intake_date', { ascending: false, nullsLast: true });
  if(r.error){ el.innerHTML = '<div style="padding:20px;color:var(--terracotta)">'+esc(r.error.message)+'</div>'; return; }
  var rows = r.data || [];
  var canWrite = S.practiceMember.role === 'owner_bcba' || S.practiceMember.role === 'supervising_bcba';
  var h = '<div style="max-width:880px;margin:0 auto">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'+
    '<div style="font-family:Fraunces,serif;font-size:22px;font-weight:700">'+rows.length+' client'+(rows.length!==1?'s':'')+'</div>'+
    (canWrite ? '<button class="btn btn-p" onclick="openAddClientModal()">+ Add client</button>' : '')+
    '</div>';
  if(rows.length === 0){
    h += '<div style="padding:40px;text-align:center;color:var(--warm-gray);border:1px dashed var(--sand);border-radius:14px">No clients yet. Click "Add client" to get started.</div>';
  } else {
    for(var i=0;i<rows.length;i++){
      var c = rows[i];
      var child = c.children || {};
      var statusColor = { active:'var(--sage-light)', intake:'var(--sky)', discharged:'var(--sand)', on_hold:'var(--lavender)' }[c.status] || 'var(--sand)';
      h += '<div class="client-row" onclick="openClientDetailFromRoster(\\x27'+c.id+'\\x27)" style="border:1px solid var(--sand);border-radius:14px;padding:14px 16px;margin-bottom:10px;background:white;cursor:pointer">'+
        '<div style="display:flex;justify-content:space-between;align-items:start;gap:10px">'+
        '<div style="flex:1"><div style="font-weight:700;font-size:16px">'+esc(child.name||'(unnamed)')+'</div>'+
        '<div style="font-size:12px;color:var(--warm-gray);margin-top:2px">Age '+(child.age||'?')+' &middot; '+esc(child.diagnosis||'No diagnosis on file')+'</div>'+
        '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">'+
        '<span class="log-tag" style="background:'+statusColor+'">'+c.status+'</span>'+
        (c.service_type ? '<span class="log-tag">CPT '+c.service_type+'</span>' : '')+
        (c.weekly_hours_authorized ? '<span class="log-tag">'+c.weekly_hours_authorized+'h/wk auth</span>' : '')+
        '</div></div>';
      if(canWrite && c.status !== 'discharged'){
        h += '<button class="btn btn-s" style="padding:6px 10px;font-size:11px" onclick="event.stopPropagation();dischargeClient(\\x27'+c.id+'\\x27)">Discharge</button>';
      }
      h += '</div></div>';
    }
  }
  h += '</div>';
  el.innerHTML = h;
}

async function openAddClientModal(){
  addClientState = { parentId: null, childId: null };
  document.getElementById('addClientParentEmail').value = '';
  document.getElementById('addClientChildPicker').innerHTML = '';
  document.getElementById('addClientChildPicker').style.display = 'none';
  document.getElementById('addClientHours').value = '';
  document.getElementById('addClientPa').value = '';
  // Load BCBA options for primary
  var r = await sb.from('practice_members')
    .select('id,profiles(name,email)')
    .eq('practice_id', S.practiceMember.practice_id)
    .in('role', ['owner_bcba','supervising_bcba'])
    .eq('active', true);
  var opts = '';
  (r.data || []).forEach(function(m){
    var p = m.profiles || {};
    opts += '<option value="'+m.id+'">'+esc(p.name||p.email||'(BCBA)')+'</option>';
  });
  document.getElementById('addClientPrimary').innerHTML = opts;
  document.getElementById('addClientModal').style.display = 'flex';
}

function closeAddClientModal(){
  document.getElementById('addClientModal').style.display = 'none';
}

var searchDebounce = null;
function searchParentByEmail(){
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(doSearchParent, 250);
}

async function doSearchParent(){
  var email = document.getElementById('addClientParentEmail').value.trim().toLowerCase();
  var picker = document.getElementById('addClientChildPicker');
  if(email.length < 3){ picker.style.display = 'none'; return; }
  var r = await sb.from('profiles').select('id,name,email,children(id,name,age,diagnosis)').eq('email', email).maybeSingle();
  if(!r.data){
    picker.innerHTML = '<div style="background:var(--cream);padding:10px;border-radius:10px;font-size:13px;color:var(--warm-gray)">No Modern Village account for that email. Ask the parent to sign up first, then re-add.</div>';
    picker.style.display = 'block';
    addClientState.parentId = null;
    addClientState.childId = null;
    return;
  }
  addClientState.parentId = r.data.id;
  var kids = r.data.children || [];
  if(kids.length === 0){
    picker.innerHTML = '<div style="background:var(--cream);padding:10px;border-radius:10px;font-size:13px;color:var(--warm-gray)">Parent found, but they haven\\x27t added a child yet. Ask them to add a child in their profile, then re-add.</div>';
    picker.style.display = 'block';
    addClientState.childId = null;
    return;
  }
  var h = '<label class="fl">Which child?</label><div style="display:flex;flex-direction:column;gap:6px">';
  kids.forEach(function(k){
    h += '<label style="display:flex;gap:8px;padding:10px;border:1px solid var(--sand);border-radius:10px;cursor:pointer"><input type="radio" name="childPick" value="'+k.id+'" onchange="addClientState.childId=this.value"> <span><strong>'+esc(k.name)+'</strong><span style="color:var(--warm-gray);font-size:12px"> &middot; age '+(k.age||'?')+'</span></span></label>';
  });
  h += '</div>';
  picker.innerHTML = h;
  picker.style.display = 'block';
}

async function submitAddClient(){
  if(!addClientState.parentId){ showToast('Find a parent first'); return; }
  if(!addClientState.childId){ showToast('Pick a child'); return; }
  var service = document.getElementById('addClientService').value;
  var primary = document.getElementById('addClientPrimary').value;
  var hours = parseFloat(document.getElementById('addClientHours').value) || null;
  var pa = document.getElementById('addClientPa').value.trim() || null;
  var ins = await sb.from('practice_clients').insert({
    practice_id: S.practiceMember.practice_id,
    child_id: addClientState.childId,
    primary_bcba_id: primary,
    service_type: service,
    weekly_hours_authorized: hours,
    prior_auth_number: pa,
    status: 'intake',
    intake_date: new Date().toISOString().slice(0,10)
  });
  if(ins.error){ showToast(ins.error.message); return; }
  // Create or extend child_access
  await sb.from('child_access').upsert({
    child_id: addClientState.childId,
    user_id: addClientState.parentId,
    granted_by: S.user.id,
    access_level: 'full',
    practice_id: S.practiceMember.practice_id,
    granted_at: new Date().toISOString()
  }, { onConflict: 'child_id,user_id' });
  closeAddClientModal();
  showToast('Client added — intake status. Set to active when ready.');
  loadPracticeClients();
}

async function dischargeClient(practiceClientId){
  var reason = prompt('Discharge reason (optional):');
  if(reason === null) return; // cancelled
  var upd = await sb.from('practice_clients').update({
    status: 'discharged',
    discharge_date: new Date().toISOString().slice(0,10),
    discharge_reason: reason || null
  }).eq('id', practiceClientId);
  if(upd.error){ showToast(upd.error.message); return; }
  showToast('Client discharged');
  loadPracticeClients();
}

function openClientDetailFromRoster(practiceClientId){
  // Programs tab lives in Task 11
  openPracticeClientDetail(practiceClientId);
}

function openPracticeClientDetail(id){ alert('Client detail (programs tab) coming in Task 11'); }
```

- [ ] **Step 3: Manual verification**

1. As testprovider, open Clients. Empty state shows.
2. Click "+ Add client". Enter `testparent@modernvillage.app` in parent email field.
3. Wait 250ms — child picker appears with Maya and Elijah.
4. Pick Maya, leave service type at 97156, primary BCBA defaults to testprovider, hours = 10, PA blank.
5. Click "Add client". Toast confirms.
6. Roster shows Maya with status "intake" pill, "CPT 97156" pill, "10h/wk auth" pill.
7. SQL check:
   ```sql
   SELECT pc.status, pc.service_type, c.name FROM public.practice_clients pc JOIN public.children c ON c.id = pc.child_id
   WHERE pc.practice_id = (SELECT practice_id FROM public.practice_members WHERE user_id=(SELECT id FROM public.profiles WHERE email='testprovider@modernvillage.app') LIMIT 1);
   ```
8. Verify child_access row created with practice_id set.

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba): Practice Clients roster + add/discharge

List clients with status, CPT, hours-authorized pills. Add-client modal
searches for parent by email, lets BCBA pick which child, sets primary
BCBA + service type + prior auth. Auto-creates child_access row with
practice_id linkage. Discharge captures optional reason.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5: Programs UI

### Task 11: Client detail — Programs tab

**Files:**
- Modify: `app.html`

When you click a client row in the roster, open a client detail overlay with a "Programs" tab (the only tab in Foundation; Behaviors / Sessions / etc. ship in later sub-projects).

- [ ] **Step 1: Add overlay HTML**

```html
<div id="practiceClientDetailPage" class="overlay-page">
  <div class="overlay-header">
    <button class="overlay-back" onclick="closeOverlay('practiceClientDetailPage')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D2D2D" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
    <h2 class="overlay-title" id="pcdTitle">Client</h2>
  </div>
  <div class="overlay-inner" id="practiceClientDetailContent" style="padding-bottom:80px"></div>
</div>

<div id="addProgramModal" class="modal-overlay" style="display:none">
  <div class="modal-content" style="max-width:520px">
    <h3 style="font-family:Fraunces,serif;font-size:22px;margin-bottom:12px">Add a program</h3>
    <label class="fl">Program name *</label>
    <input id="progName" class="fi" placeholder="e.g. Manding Training">
    <label class="fl" style="margin-top:14px">Category *</label>
    <select id="progCategory" class="fi">
      <option value="skill_acquisition">Skill acquisition</option>
      <option value="behavior_reduction">Behavior reduction</option>
    </select>
    <label class="fl" style="margin-top:14px">Domain</label>
    <select id="progDomain" class="fi">
      <option value="communication">Communication</option>
      <option value="adaptive_living">Adaptive Living</option>
      <option value="social">Social</option>
      <option value="parent_skills">Parent Skills</option>
      <option value="replacement_behaviors">Replacement Behaviors</option>
    </select>
    <label class="fl" style="margin-top:14px">Description (optional)</label>
    <textarea id="progDesc" class="fi" rows="3"></textarea>
    <div style="display:flex;gap:8px;margin-top:20px">
      <button class="btn btn-s" style="flex:1" onclick="closeAddProgramModal()">Cancel</button>
      <button class="btn btn-p" style="flex:1" onclick="submitAddProgram()">Create program</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Replace `openPracticeClientDetail` stub**

```javascript
var currentClient = null;

async function openPracticeClientDetail(practiceClientId){
  var r = await sb.from('practice_clients')
    .select('id,status,service_type,children(id,name,age,diagnosis)')
    .eq('id', practiceClientId)
    .single();
  if(r.error){ showToast(r.error.message); return; }
  currentClient = r.data;
  document.getElementById('pcdTitle').textContent = currentClient.children.name;
  document.getElementById('practiceClientDetailPage').classList.add('open');
  await renderClientPrograms();
}

async function renderClientPrograms(){
  var el = document.getElementById('practiceClientDetailContent');
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--warm-gray)">Loading programs…</div>';
  var r = await sb.from('programs')
    .select('id,name,category,domain,description,status,created_at,targets(id,name,status)')
    .eq('practice_client_id', currentClient.id)
    .neq('status', 'archived')
    .order('created_at', { ascending: true });
  if(r.error){ el.innerHTML = '<div style="padding:20px;color:var(--terracotta)">'+esc(r.error.message)+'</div>'; return; }
  var canWrite = S.practiceMember.role === 'owner_bcba' || S.practiceMember.role === 'supervising_bcba';
  var skill = (r.data||[]).filter(function(p){ return p.category === 'skill_acquisition'; });
  var bx = (r.data||[]).filter(function(p){ return p.category === 'behavior_reduction'; });
  var h = '<div style="max-width:880px;margin:0 auto">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="font-family:Fraunces,serif;font-size:18px;font-weight:700">Programs</h3>'+
    (canWrite ? '<button class="btn btn-p" onclick="openAddProgramModal()">+ Add program</button>' : '')+'</div>';
  h += renderProgramGroup('Skill Acquisition', skill, canWrite);
  h += renderProgramGroup('Behavior Reduction', bx, canWrite);
  h += '</div>';
  el.innerHTML = h;
}

function renderProgramGroup(label, list, canWrite){
  var h = '<div class="label" style="margin-top:18px;margin-bottom:8px">'+label+'</div>';
  if(list.length === 0){
    h += '<div style="padding:16px;background:var(--cream);border-radius:12px;color:var(--warm-gray);font-size:13px">No programs in this category yet.</div>';
    return h;
  }
  for(var i=0;i<list.length;i++){
    var p = list[i];
    var tCount = (p.targets||[]).length;
    h += '<div onclick="openTargetsEditor(\\x27'+p.id+'\\x27)" style="border:1px solid var(--sand);border-radius:14px;padding:14px;margin-bottom:8px;background:white;cursor:pointer;display:flex;justify-content:space-between;align-items:center">'+
      '<div><div style="font-weight:700;font-size:15px">'+esc(p.name)+'</div>'+
      '<div style="font-size:12px;color:var(--warm-gray);margin-top:2px">'+(p.domain?esc(p.domain.replace(/_/g,' '))+' &middot; ':'')+tCount+' target'+(tCount!==1?'s':'')+' &middot; '+p.status+'</div></div>'+
      (canWrite ? '<div style="display:flex;gap:4px"><button class="btn btn-s" style="padding:6px 10px;font-size:11px" onclick="event.stopPropagation();archiveProgram(\\x27'+p.id+'\\x27)">Archive</button></div>' : '')+
      '</div>';
  }
  return h;
}

function openAddProgramModal(){
  document.getElementById('progName').value = '';
  document.getElementById('progCategory').value = 'skill_acquisition';
  document.getElementById('progDomain').value = 'communication';
  document.getElementById('progDesc').value = '';
  document.getElementById('addProgramModal').style.display = 'flex';
}

function closeAddProgramModal(){
  document.getElementById('addProgramModal').style.display = 'none';
}

async function submitAddProgram(){
  var name = document.getElementById('progName').value.trim();
  if(!name){ showToast('Program name is required'); return; }
  var ins = await sb.from('programs').insert({
    practice_client_id: currentClient.id,
    name: name,
    category: document.getElementById('progCategory').value,
    domain: document.getElementById('progDomain').value,
    description: document.getElementById('progDesc').value.trim() || null,
    supervisor_id: S.practiceMember.id,
    status: 'active'
  });
  if(ins.error){ showToast(ins.error.message); return; }
  closeAddProgramModal();
  renderClientPrograms();
}

async function archiveProgram(programId){
  if(!confirm('Archive this program? Targets stay but program is hidden.')) return;
  var upd = await sb.from('programs').update({ status: 'archived' }).eq('id', programId);
  if(upd.error){ showToast(upd.error.message); return; }
  renderClientPrograms();
}

function openTargetsEditor(programId){ alert('Targets editor coming in Task 12'); }
```

- [ ] **Step 3: Manual verification**

1. As testprovider, open Clients → click Maya's row.
2. Client detail opens with empty Skill Acquisition / Behavior Reduction sections.
3. Click "+ Add program". Name: "Manding Training", category: skill_acquisition, domain: communication.
4. Save. The program card appears under Skill Acquisition.
5. SQL: `SELECT name, category FROM public.programs WHERE practice_client_id = '<Maya's practice_client id>';`

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba): client detail Programs tab + add/archive

Click client → open detail overlay. Programs grouped by category
(skill_acquisition / behavior_reduction). Add program modal captures
name, category, domain, description. Archive flips status only;
targets and history remain.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6: Targets editor

### Task 12: Targets editor (list + add + edit)

**Files:**
- Modify: `app.html`

This is the most complex screen in Foundation: a target_type picker that conditionally renders different data_collection_config and mastery_criteria forms.

- [ ] **Step 1: Add overlay HTML for the targets editor**

```html
<div id="targetsEditorPage" class="overlay-page">
  <div class="overlay-header">
    <button class="overlay-back" onclick="closeOverlay('targetsEditorPage')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D2D2D" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
    <h2 class="overlay-title" id="teProgramTitle">Targets</h2>
  </div>
  <div class="overlay-inner" id="targetsEditorContent" style="padding-bottom:80px"></div>
</div>

<div id="targetModal" class="modal-overlay" style="display:none">
  <div class="modal-content" style="max-width:640px;max-height:90vh;overflow-y:auto">
    <h3 id="tmTitle" style="font-family:Fraunces,serif;font-size:22px;margin-bottom:12px">New target</h3>
    <label class="fl">Target name *</label>
    <input id="tmName" class="fi" placeholder="e.g. Mand for preferred item">
    <label class="fl" style="margin-top:14px">Operational definition * <span style="color:var(--warm-gray);font-weight:400;font-size:11px">(measurable, observable, specific)</span></label>
    <textarea id="tmOpDef" class="fi" rows="3" placeholder="When MO is present, child independently requests using 1-3 word mand within 10 seconds."></textarea>
    <label class="fl" style="margin-top:14px">Target type *</label>
    <select id="tmType" class="fi" onchange="renderTargetTypeFields()">
      <option value="discrete_trial">Discrete trial (DTT)</option>
      <option value="task_analysis">Task analysis</option>
      <option value="frequency">Frequency count</option>
      <option value="duration">Duration</option>
      <option value="interval">Interval recording</option>
    </select>
    <div id="tmDataConfig" style="margin-top:14px"></div>
    <div class="label" style="margin-top:18px;margin-bottom:6px">Mastery criteria</div>
    <div id="tmMastery"></div>
    <div class="label" style="margin-top:18px;margin-bottom:6px">Baseline criteria</div>
    <div id="tmBaseline"></div>
    <div class="label" style="margin-top:18px;margin-bottom:6px">Maintenance criteria</div>
    <div id="tmMaintenance"></div>
    <div id="tmStepsWrap" style="display:none;margin-top:18px">
      <div class="label" style="margin-bottom:6px">Task analysis steps</div>
      <div id="tmStepsList"></div>
      <button class="btn btn-s" style="margin-top:8px;font-size:12px;padding:6px 10px" onclick="addStep()">+ Add step</button>
    </div>
    <div style="display:flex;gap:8px;margin-top:24px">
      <button class="btn btn-s" style="flex:1" onclick="closeTargetModal()">Cancel</button>
      <button class="btn btn-p" style="flex:1" onclick="submitTarget()">Save target</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Replace `openTargetsEditor` stub + all helpers**

```javascript
var currentProgram = null;
var targetEditing = null; // null = new; populated = edit
var targetSteps = [];

async function openTargetsEditor(programId){
  var r = await sb.from('programs').select('id,name,category,domain,practice_client_id').eq('id', programId).single();
  if(r.error){ showToast(r.error.message); return; }
  currentProgram = r.data;
  document.getElementById('teProgramTitle').textContent = currentProgram.name;
  document.getElementById('targetsEditorPage').classList.add('open');
  await renderTargets();
}

async function renderTargets(){
  var el = document.getElementById('targetsEditorContent');
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--warm-gray)">Loading…</div>';
  var r = await sb.from('targets')
    .select('id,name,operational_definition,target_type,mastery_criteria,status,promoted_at,library_source')
    .eq('program_id', currentProgram.id)
    .order('created_at', { ascending: true });
  if(r.error){ el.innerHTML = '<div style="padding:20px;color:var(--terracotta)">'+esc(r.error.message)+'</div>'; return; }
  var canWrite = S.practiceMember.role === 'owner_bcba' || S.practiceMember.role === 'supervising_bcba';
  var h = '<div style="max-width:760px;margin:0 auto">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'+
    '<div style="font-family:Fraunces,serif;font-size:18px;font-weight:700">'+(r.data||[]).length+' target'+((r.data||[]).length!==1?'s':'')+'</div>'+
    (canWrite ? '<div style="display:flex;gap:6px"><button class="btn btn-s" onclick="openCurriculumBrowserForProgram()">From curriculum</button><button class="btn btn-p" onclick="openTargetModal()">+ New target</button></div>' : '')+
    '</div>';
  if(!r.data || r.data.length === 0){
    h += '<div style="padding:40px;text-align:center;color:var(--warm-gray);border:1px dashed var(--sand);border-radius:14px">No targets yet. Add one custom or import from the curriculum library.</div>';
  } else {
    r.data.forEach(function(t){
      var typeLabel = { discrete_trial:'DTT', task_analysis:'Task Analysis', frequency:'Frequency', duration:'Duration', interval:'Interval' }[t.target_type] || t.target_type;
      h += '<div style="border:1px solid var(--sand);border-radius:14px;padding:14px;margin-bottom:8px;background:white">'+
        '<div style="display:flex;justify-content:space-between;align-items:start;gap:10px">'+
        '<div style="flex:1"><div style="font-weight:700;font-size:15px">'+esc(t.name)+'</div>'+
        '<div style="font-size:12px;color:var(--warm-gray);margin-top:4px">'+esc(t.operational_definition.slice(0,180))+(t.operational_definition.length>180?'…':'')+'</div>'+
        '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">'+
        '<span class="log-tag" style="background:var(--sage-light)">'+typeLabel+'</span>'+
        '<span class="log-tag">'+t.status.replace(/_/g,' ')+'</span>'+
        (t.library_source ? '<span class="log-tag" style="background:var(--lavender)">from library</span>' : '')+
        '</div></div>'+
        (canWrite ? '<button class="btn btn-s" style="padding:6px 10px;font-size:11px" onclick="editTarget(\\x27'+t.id+'\\x27)">Edit</button>' : '')+
        '</div></div>';
    });
  }
  h += '</div>';
  el.innerHTML = h;
}

function openTargetModal(){
  targetEditing = null;
  targetSteps = [];
  document.getElementById('tmTitle').textContent = 'New target';
  document.getElementById('tmName').value = '';
  document.getElementById('tmOpDef').value = '';
  document.getElementById('tmType').value = 'discrete_trial';
  renderTargetTypeFields();
  renderCriteriaFields({});
  document.getElementById('targetModal').style.display = 'flex';
}

async function editTarget(targetId){
  var r = await sb.from('targets').select('*,target_steps(*)').eq('id', targetId).single();
  if(r.error){ showToast(r.error.message); return; }
  targetEditing = r.data;
  targetSteps = (r.data.target_steps||[]).sort(function(a,b){ return a.sequence - b.sequence; }).map(function(s){ return { name: s.name, description: s.description }; });
  document.getElementById('tmTitle').textContent = 'Edit target';
  document.getElementById('tmName').value = r.data.name;
  document.getElementById('tmOpDef').value = r.data.operational_definition;
  document.getElementById('tmType').value = r.data.target_type;
  renderTargetTypeFields(r.data.data_collection_config);
  renderCriteriaFields(r.data);
  document.getElementById('targetModal').style.display = 'flex';
}

function closeTargetModal(){
  document.getElementById('targetModal').style.display = 'none';
}

function renderTargetTypeFields(cfg){
  var type = document.getElementById('tmType').value;
  var el = document.getElementById('tmDataConfig');
  cfg = cfg || {};
  if(type === 'discrete_trial'){
    el.innerHTML = '<label class="fl">Trials per session</label><input id="tmCfg_trials" class="fi" type="number" min="1" value="'+(cfg.trials_per_session||10)+'">';
  } else if(type === 'task_analysis'){
    el.innerHTML = '<div style="font-size:12px;color:var(--warm-gray)">Configure prompt levels and step list below.</div>';
  } else if(type === 'frequency'){
    el.innerHTML = '<label class="fl">Observation window (minutes, optional)</label><input id="tmCfg_window" class="fi" type="number" min="1" placeholder="leave blank for whole-session count" value="'+(cfg.window_minutes||'')+'">';
  } else if(type === 'duration'){
    el.innerHTML = '<div style="font-size:12px;color:var(--warm-gray)">Stopwatch-style. No extra config needed.</div>';
  } else if(type === 'interval'){
    el.innerHTML = '<label class="fl">Interval length (seconds)</label><input id="tmCfg_int" class="fi" type="number" min="1" value="'+(cfg.interval_seconds||10)+'"><label class="fl" style="margin-top:10px">Type</label><select id="tmCfg_intType" class="fi"><option value="whole" '+(cfg.interval_type==='whole'?'selected':'')+'>Whole interval</option><option value="partial" '+(cfg.interval_type==='partial'?'selected':'')+'>Partial interval</option><option value="momentary" '+(cfg.interval_type==='momentary'?'selected':'')+'>Momentary time sampling</option></select>';
  }
  document.getElementById('tmStepsWrap').style.display = (type === 'task_analysis' ? 'block' : 'none');
  if(type === 'task_analysis') renderSteps();
}

function renderCriteriaFields(t){
  var m = (t && t.mastery_criteria) || {};
  var b = (t && t.baseline_criteria) || {};
  var mt = (t && t.maintenance_criteria) || {};
  document.getElementById('tmMastery').innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+
    '<div><label class="fl">% correct</label><input id="tmM_pct" class="fi" type="number" min="0" max="100" value="'+(m.response_pct||80)+'"></div>'+
    '<div><label class="fl">Consecutive sessions</label><input id="tmM_cons" class="fi" type="number" min="1" value="'+(m.consecutive_sessions||3)+'"></div>'+
    '</div>'+
    '<label style="display:flex;gap:8px;margin-top:8px;font-size:13px"><input id="tmM_fti" type="checkbox" '+(m.first_trial_independent?'checked':'')+'> First trial independent required</label>';
  document.getElementById('tmBaseline').innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+
    '<div><label class="fl">Sessions</label><input id="tmB_sess" class="fi" type="number" min="1" value="'+(b.sessions||3)+'"></div>'+
    '<div><label class="fl">Trials per session</label><input id="tmB_trials" class="fi" type="number" min="1" value="'+(b.trials_per_session||5)+'"></div>'+
    '</div>';
  document.getElementById('tmMaintenance').innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+
    '<div><label class="fl">Probe frequency</label><select id="tmMt_freq" class="fi"><option value="weekly" '+(mt.probe_frequency==='weekly'?'selected':'')+'>Weekly</option><option value="biweekly" '+(mt.probe_frequency==='biweekly'?'selected':'')+'>Biweekly</option><option value="monthly" '+(mt.probe_frequency==='monthly'?'selected':'')+'>Monthly</option></select></div>'+
    '<div><label class="fl">Probes required</label><input id="tmMt_probes" class="fi" type="number" min="1" value="'+(mt.probes_required||2)+'"></div>'+
    '</div>';
}

function renderSteps(){
  var el = document.getElementById('tmStepsList');
  if(targetSteps.length === 0){
    el.innerHTML = '<div style="color:var(--warm-gray);font-size:12px;padding:8px">No steps yet. Add one below.</div>';
    return;
  }
  var h = '';
  targetSteps.forEach(function(s, idx){
    h += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">'+
      '<span style="width:24px;font-weight:700;color:var(--warm-gray)">'+(idx+1)+'.</span>'+
      '<input class="fi" style="flex:1;padding:8px 10px;font-size:13px" value="'+esc(s.name)+'" onchange="targetSteps['+idx+'].name=this.value">'+
      '<button class="btn btn-s" style="padding:4px 8px;font-size:11px" onclick="removeStep('+idx+')">×</button>'+
      '</div>';
  });
  el.innerHTML = h;
}

function addStep(){
  targetSteps.push({ name: '', description: null });
  renderSteps();
}

function removeStep(idx){
  targetSteps.splice(idx, 1);
  renderSteps();
}

function readDataConfig(){
  var type = document.getElementById('tmType').value;
  if(type === 'discrete_trial') return { trials_per_session: parseInt(document.getElementById('tmCfg_trials').value, 10) || 10 };
  if(type === 'frequency') return document.getElementById('tmCfg_window').value ? { window_minutes: parseInt(document.getElementById('tmCfg_window').value, 10) } : {};
  if(type === 'interval') return { interval_seconds: parseInt(document.getElementById('tmCfg_int').value, 10) || 10, interval_type: document.getElementById('tmCfg_intType').value };
  return {};
}

async function submitTarget(){
  var name = document.getElementById('tmName').value.trim();
  var opDef = document.getElementById('tmOpDef').value.trim();
  if(!name || !opDef){ showToast('Name and operational definition are required'); return; }
  if(opDef.length < 20){ showToast('Operational definition should be specific (≥20 chars)'); return; }
  var type = document.getElementById('tmType').value;
  var payload = {
    program_id: currentProgram.id,
    name: name,
    operational_definition: opDef,
    target_type: type,
    data_collection_config: readDataConfig(),
    mastery_criteria: {
      response_pct: parseInt(document.getElementById('tmM_pct').value, 10) || 80,
      consecutive_sessions: parseInt(document.getElementById('tmM_cons').value, 10) || 3,
      first_trial_independent: document.getElementById('tmM_fti').checked
    },
    baseline_criteria: {
      sessions: parseInt(document.getElementById('tmB_sess').value, 10) || 3,
      trials_per_session: parseInt(document.getElementById('tmB_trials').value, 10) || 5
    },
    maintenance_criteria: {
      probe_frequency: document.getElementById('tmMt_freq').value,
      probes_required: parseInt(document.getElementById('tmMt_probes').value, 10) || 2
    }
  };
  var saved;
  if(targetEditing){
    var upd = await sb.from('targets').update(payload).eq('id', targetEditing.id).select().single();
    if(upd.error){ showToast(upd.error.message); return; }
    saved = upd.data;
    // Replace steps
    if(type === 'task_analysis'){
      await sb.from('target_steps').delete().eq('target_id', saved.id);
      for(var i=0;i<targetSteps.length;i++){
        var s = targetSteps[i];
        if(s.name.trim()){
          await sb.from('target_steps').insert({ target_id: saved.id, sequence: i+1, name: s.name, description: s.description });
        }
      }
    }
  } else {
    var ins = await sb.from('targets').insert(payload).select().single();
    if(ins.error){ showToast(ins.error.message); return; }
    saved = ins.data;
    if(type === 'task_analysis'){
      for(var i=0;i<targetSteps.length;i++){
        var s = targetSteps[i];
        if(s.name.trim()){
          await sb.from('target_steps').insert({ target_id: saved.id, sequence: i+1, name: s.name, description: s.description });
        }
      }
    }
  }
  closeTargetModal();
  showToast('Target saved');
  renderTargets();
}

function openCurriculumBrowserForProgram(){
  openCurriculumBrowser(true); // pass flag to enable "add to this program"
}
```

- [ ] **Step 3: Manual verification**

1. As testprovider, drill: Clients → Maya → Programs → click "Manding Training" program.
2. Empty target list. Click "+ New target".
3. Modal: name "Mand for cookie", operational definition long-form, type = discrete_trial, trials_per_session = 10. Mastery 80% / 3 consecutive / FTI checked.
4. Save. Target card appears.
5. Click Edit → change type to "task_analysis". Step list appears. Add 3 steps. Save.
6. Reopen — confirm steps persisted (3 rows in target_steps).
7. SQL: `SELECT name, target_type, mastery_criteria FROM public.targets WHERE program_id = '<program id>';`

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba): targets editor — type picker + criteria + task analysis steps

Modal renders different data_collection_config fields per target_type
(DTT trials, frequency window, interval seconds/type). Mastery,
baseline, maintenance criteria forms backed by jsonb. Task analysis
step builder with drag-free reorder via index renumber on save.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7: Curriculum browser

### Task 13: Curriculum browser + "Add to client/program"

**Files:**
- Modify: `app.html`

- [ ] **Step 1: Add overlay HTML**

```html
<div id="curriculumBrowserPage" class="overlay-page">
  <div class="overlay-header">
    <button class="overlay-back" onclick="closeOverlay('curriculumBrowserPage')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D2D2D" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
    <h2 class="overlay-title">Curriculum Library</h2>
  </div>
  <div class="overlay-inner" id="curriculumBrowserContent" style="padding-bottom:80px"></div>
</div>
```

- [ ] **Step 2: Replace `openCurriculumBrowser` stub**

```javascript
var curriculumBrowserContext = null; // when set, "Add to program" is in scope

async function openCurriculumBrowser(fromProgram){
  curriculumBrowserContext = fromProgram && currentProgram ? { programId: currentProgram.id, programCategory: currentProgram.category } : null;
  document.getElementById('curriculumBrowserPage').classList.add('open');
  await renderCurriculumBrowser();
}

async function renderCurriculumBrowser(filterDomain){
  var el = document.getElementById('curriculumBrowserContent');
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--warm-gray)">Loading library…</div>';
  var libR = await sb.from('curriculum_libraries').select('id,name,version,license_type').eq('active', true);
  if(libR.error){ el.innerHTML = '<div style="padding:20px;color:var(--terracotta)">'+esc(libR.error.message)+'</div>'; return; }
  var library = (libR.data||[])[0];
  if(!library){ el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--warm-gray)">No libraries available.</div>'; return; }
  var domains = ['communication','adaptive_living','social','parent_skills','replacement_behaviors'];
  var tgtQ = sb.from('curriculum_targets').select('id,name,operational_definition,target_type,domain,suggested_age_min,suggested_age_max').eq('library_id', library.id);
  if(filterDomain) tgtQ = tgtQ.eq('domain', filterDomain);
  var tgtR = await tgtQ.order('domain');
  var h = '<div style="max-width:920px;margin:0 auto">'+
    '<div style="font-family:Fraunces,serif;font-size:22px;font-weight:700">'+esc(library.name)+'</div>'+
    '<div style="font-size:12px;color:var(--warm-gray);margin-bottom:16px">v'+esc(library.version||'1.0')+' &middot; '+(library.license_type||'').replace(/_/g,' ')+'</div>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">'+
    '<button class="btn btn-s" style="font-size:11px;padding:6px 10px'+(filterDomain?'':';background:var(--sage-dark);color:white')+'" onclick="renderCurriculumBrowser(null)">All</button>';
  domains.forEach(function(d){
    h += '<button class="btn btn-s" style="font-size:11px;padding:6px 10px'+(filterDomain===d?';background:var(--sage-dark);color:white':'')+'" onclick="renderCurriculumBrowser(\\x27'+d+'\\x27)">'+d.replace(/_/g,' ')+'</button>';
  });
  h += '</div>';
  if(!tgtR.data || tgtR.data.length === 0){
    h += '<div style="padding:40px;text-align:center;color:var(--warm-gray)">No targets in this domain.</div>';
  } else {
    tgtR.data.forEach(function(t){
      var typeLabel = { discrete_trial:'DTT', task_analysis:'Task Analysis', frequency:'Frequency', duration:'Duration', interval:'Interval' }[t.target_type] || t.target_type;
      var ageHint = (t.suggested_age_min || t.suggested_age_max) ? 'Ages '+(t.suggested_age_min||'?')+'–'+(t.suggested_age_max||'?') : '';
      h += '<div style="border:1px solid var(--sand);border-radius:14px;padding:14px;margin-bottom:8px;background:white">'+
        '<div style="font-weight:700;font-size:15px">'+esc(t.name)+'</div>'+
        '<div style="font-size:12px;color:var(--warm-gray);margin-top:4px">'+esc(t.operational_definition.slice(0,220))+(t.operational_definition.length>220?'…':'')+'</div>'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">'+
        '<div style="display:flex;gap:6px"><span class="log-tag" style="background:var(--sage-light)">'+typeLabel+'</span>'+(ageHint?'<span class="log-tag">'+ageHint+'</span>':'')+'</div>'+
        (curriculumBrowserContext ? '<button class="btn btn-p" style="padding:6px 14px;font-size:12px" onclick="addCurriculumTarget(\\x27'+t.id+'\\x27)">Add to program</button>' : '<button class="btn btn-s" style="padding:6px 14px;font-size:12px" onclick="showCurriculumDetail(\\x27'+t.id+'\\x27)">Preview</button>')+
        '</div></div>';
    });
  }
  h += '</div>';
  el.innerHTML = h;
}

async function showCurriculumDetail(targetId){
  var r = await sb.from('curriculum_targets').select('*,curriculum_target_steps(*)').eq('id', targetId).single();
  if(r.error){ showToast(r.error.message); return; }
  var t = r.data;
  var stepsHtml = '';
  if(t.target_type === 'task_analysis' && t.curriculum_target_steps && t.curriculum_target_steps.length){
    var sorted = t.curriculum_target_steps.slice().sort(function(a,b){ return a.sequence - b.sequence; });
    stepsHtml = '<div class="label" style="margin-top:12px">Steps</div><ol style="font-size:13px;padding-left:20px">'+sorted.map(function(s){ return '<li>'+esc(s.name)+'</li>'; }).join('')+'</ol>';
  }
  alert(t.name+'\\n\\n'+t.operational_definition+'\\n\\nDefault mastery: '+JSON.stringify(t.default_mastery_criteria)+(stepsHtml?'\\n\\n(Open from a program to import — preview view doesn\\x27t show formatted steps)':''));
}

async function addCurriculumTarget(curriculumTargetId){
  if(!curriculumBrowserContext){ showToast('Open from a program'); return; }
  // Copy the curriculum target into the targets table
  var ctR = await sb.from('curriculum_targets').select('*,curriculum_target_steps(*)').eq('id', curriculumTargetId).single();
  if(ctR.error){ showToast(ctR.error.message); return; }
  var ct = ctR.data;
  var ins = await sb.from('targets').insert({
    program_id: curriculumBrowserContext.programId,
    name: ct.name,
    operational_definition: ct.operational_definition,
    target_type: ct.target_type,
    data_collection_config: ct.default_data_collection_config || {},
    mastery_criteria: ct.default_mastery_criteria || {},
    library_source: ct.id,
    status: 'baseline'
  }).select().single();
  if(ins.error){ showToast(ins.error.message); return; }
  // Copy steps if task analysis
  if(ct.target_type === 'task_analysis' && ct.curriculum_target_steps){
    var sorted = ct.curriculum_target_steps.slice().sort(function(a,b){ return a.sequence - b.sequence; });
    for(var i=0;i<sorted.length;i++){
      await sb.from('target_steps').insert({ target_id: ins.data.id, sequence: i+1, name: sorted[i].name, description: sorted[i].description });
    }
  }
  showToast('Added "'+ct.name+'"');
}
```

- [ ] **Step 3: Manual verification**

1. From sidebar → Curriculum Library. Browse 5 starter targets. Filter by domain. Preview shows operational def + mastery JSON.
2. Drill: Clients → Maya → Manding Training → click "From curriculum" button.
3. Curriculum browser opens; each target now has "Add to program" instead of "Preview".
4. Click "Add to program" on "Manding for preferred item". Toast confirms.
5. Close browser, refresh program. Target should appear with "from library" pill.
6. SQL: `SELECT name, library_source FROM public.targets WHERE library_source IS NOT NULL;`

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba): curriculum browser + add-to-program

Browse Modern Village Starter Library by domain. Preview cards from
sidebar; add-to-program buttons appear when opened from a Targets
editor. Adding copies operational_definition, target_type, default
config and criteria into targets, and copies any task analysis steps.
library_source FK preserved for later analytics.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 8: Sessions list + Practice settings

### Task 14: Sessions list (placeholder)

**Files:**
- Modify: `app.html`

A read-only sessions list per client. Live data entry ships in sub-project #2, so this is just the structural surface.

- [ ] **Step 1: Add sessions section to client detail**

Modify `renderClientPrograms` (Task 11). After the closing `</div>` of the programs render, add:

```javascript
// After programs, render sessions
var sessR = await sb.from('sessions')
  .select('id,start_time,end_time,location,cpt_code,status,provider:practice_members!provider_id(profiles(name,email))')
  .eq('practice_client_id', currentClient.id)
  .order('start_time', { ascending: false })
  .limit(20);
var sessHtml = '<div class="label" style="margin-top:24px;margin-bottom:8px">Recent Sessions</div>';
if(sessR.error){
  sessHtml += '<div style="color:var(--terracotta);font-size:13px">'+esc(sessR.error.message)+'</div>';
} else if(!sessR.data || sessR.data.length === 0){
  sessHtml += '<div style="padding:14px;background:var(--cream);border-radius:12px;font-size:13px;color:var(--warm-gray)">No sessions yet. Live data entry ships in the next sub-project — for now, sessions can be created via the data model.</div>';
} else {
  sessR.data.forEach(function(s){
    var prov = s.provider && s.provider.profiles ? (s.provider.profiles.name || s.provider.profiles.email) : '(unknown)';
    var when = new Date(s.start_time).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
    sessHtml += '<div style="border:1px solid var(--sand);border-radius:12px;padding:10px 14px;margin-bottom:6px;background:white;display:flex;justify-content:space-between;align-items:center">'+
      '<div><div style="font-weight:700;font-size:14px">'+when+'</div>'+
      '<div style="font-size:12px;color:var(--warm-gray)">'+esc(prov)+(s.cpt_code?' &middot; CPT '+s.cpt_code:'')+(s.location?' &middot; '+s.location:'')+'</div></div>'+
      '<span class="log-tag">'+s.status.replace(/_/g,' ')+'</span>'+
      '</div>';
  });
}
// Append to client detail content
el.innerHTML += sessHtml;
```

Wait — that approach replaces `el.innerHTML` twice. Refactor `renderClientPrograms` so all HTML is built into a single string, then assigned once at end. Adjust the function:

```javascript
async function renderClientPrograms(){
  var el = document.getElementById('practiceClientDetailContent');
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--warm-gray)">Loading…</div>';
  var pgR = await sb.from('programs')
    .select('id,name,category,domain,description,status,created_at,targets(id,name,status)')
    .eq('practice_client_id', currentClient.id)
    .neq('status', 'archived')
    .order('created_at', { ascending: true });
  if(pgR.error){ el.innerHTML = '<div style="padding:20px;color:var(--terracotta)">'+esc(pgR.error.message)+'</div>'; return; }
  var sessR = await sb.from('sessions')
    .select('id,start_time,end_time,location,cpt_code,status,provider:practice_members!provider_id(profiles(name,email))')
    .eq('practice_client_id', currentClient.id)
    .order('start_time', { ascending: false })
    .limit(20);
  var canWrite = S.practiceMember.role === 'owner_bcba' || S.practiceMember.role === 'supervising_bcba';
  var skill = (pgR.data||[]).filter(function(p){ return p.category === 'skill_acquisition'; });
  var bx = (pgR.data||[]).filter(function(p){ return p.category === 'behavior_reduction'; });
  var h = '<div style="max-width:880px;margin:0 auto">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="font-family:Fraunces,serif;font-size:18px;font-weight:700">Programs</h3>'+
    (canWrite ? '<button class="btn btn-p" onclick="openAddProgramModal()">+ Add program</button>' : '')+'</div>';
  h += renderProgramGroup('Skill Acquisition', skill, canWrite);
  h += renderProgramGroup('Behavior Reduction', bx, canWrite);
  // Sessions section
  h += '<div class="label" style="margin-top:24px;margin-bottom:8px">Recent Sessions</div>';
  if(sessR.error){
    h += '<div style="color:var(--terracotta);font-size:13px">'+esc(sessR.error.message)+'</div>';
  } else if(!sessR.data || sessR.data.length === 0){
    h += '<div style="padding:14px;background:var(--cream);border-radius:12px;font-size:13px;color:var(--warm-gray)">No sessions yet. Live data entry ships in the next sub-project.</div>';
  } else {
    sessR.data.forEach(function(s){
      var prov = s.provider && s.provider.profiles ? (s.provider.profiles.name || s.provider.profiles.email) : '(unknown)';
      var when = new Date(s.start_time).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
      h += '<div style="border:1px solid var(--sand);border-radius:12px;padding:10px 14px;margin-bottom:6px;background:white;display:flex;justify-content:space-between;align-items:center">'+
        '<div><div style="font-weight:700;font-size:14px">'+when+'</div>'+
        '<div style="font-size:12px;color:var(--warm-gray)">'+esc(prov)+(s.cpt_code?' &middot; CPT '+s.cpt_code:'')+(s.location?' &middot; '+s.location:'')+'</div></div>'+
        '<span class="log-tag">'+s.status.replace(/_/g,' ')+'</span>'+
        '</div>';
    });
  }
  h += '</div>';
  el.innerHTML = h;
}
```

- [ ] **Step 2: Manual verification**

1. As testprovider, drill to Maya's client detail. Below the programs you should see "Recent Sessions" with the placeholder message.
2. Insert a test session via SQL:
   ```sql
   INSERT INTO public.sessions (practice_client_id, provider_id, start_time, cpt_code, location, status)
   VALUES (
     (SELECT id FROM public.practice_clients WHERE practice_id=(SELECT practice_id FROM public.practice_members WHERE user_id=(SELECT id FROM public.profiles WHERE email='testprovider@modernvillage.app') LIMIT 1) AND child_id=(SELECT id FROM public.children WHERE name='Maya' LIMIT 1) LIMIT 1),
     (SELECT id FROM public.practice_members WHERE user_id=(SELECT id FROM public.profiles WHERE email='testprovider@modernvillage.app') LIMIT 1),
     now() - interval '1 hour',
     '97156', 'home', 'completed'
   );
   ```
3. Refresh client detail — session row appears.
4. Clean up: `DELETE FROM public.sessions WHERE status='completed' AND location='home' AND start_time > now() - interval '1 day';`

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba): sessions list placeholder in client detail

Read-only Recent Sessions section under Programs. Empty-state copy
points to next sub-project for live data entry. Existing sessions
(inserted via SQL or future UI) render with provider, time, CPT,
location, status.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Practice Settings page

Practice-level defaults for mastery / baseline / maintenance criteria, plus a daily SOAP requirement toggle and IOA-enabled flag (display only in Foundation — runtime ships later).

**Files:**
- Modify: `app.html`

(The `practices.settings` jsonb column was already added in Task 1's migration.)

- [ ] **Step 1: Add overlay HTML**

```html
<div id="practiceSettingsPage" class="overlay-page">
  <div class="overlay-header">
    <button class="overlay-back" onclick="closeOverlay('practiceSettingsPage')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D2D2D" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
    <h2 class="overlay-title">Practice Settings</h2>
  </div>
  <div class="overlay-inner" id="practiceSettingsContent" style="padding-bottom:80px"></div>
</div>
```

- [ ] **Step 2: Replace `openPracticeSettings` stub**

```javascript
async function openPracticeSettings(){
  if(!S.practiceMember){ showToast('Set up your practice first'); return; }
  if(S.practiceMember.role !== 'owner_bcba'){ showToast('Only the practice owner can edit settings'); return; }
  document.getElementById('practiceSettingsPage').classList.add('open');
  var r = await sb.from('practices').select('settings').eq('id', S.practiceMember.practice_id).single();
  var s = (r.data && r.data.settings) || {};
  var el = document.getElementById('practiceSettingsContent');
  el.innerHTML =
    '<div style="max-width:640px;margin:0 auto">'+
    '<h3 style="font-family:Fraunces,serif;font-size:20px;margin-bottom:12px">Default mastery criteria</h3>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+
    '<div><label class="fl">% correct</label><input id="psM_pct" class="fi" type="number" min="0" max="100" value="'+((s.default_mastery && s.default_mastery.response_pct)||80)+'"></div>'+
    '<div><label class="fl">Consecutive sessions</label><input id="psM_cons" class="fi" type="number" min="1" value="'+((s.default_mastery && s.default_mastery.consecutive_sessions)||3)+'"></div>'+
    '</div>'+
    '<h3 style="font-family:Fraunces,serif;font-size:20px;margin:24px 0 12px">Daily SOAP requirement</h3>'+
    '<label style="display:flex;gap:8px;font-size:14px"><input id="psSoap" type="checkbox" '+(s.require_daily_soap?'checked':'')+'> Require a SOAP note for every completed session</label>'+
    '<h3 style="font-family:Fraunces,serif;font-size:20px;margin:24px 0 12px">IOA collection</h3>'+
    '<label style="display:flex;gap:8px;font-size:14px"><input id="psIoa" type="checkbox" '+(s.ioa_enabled?'checked':'')+'> Enable inter-observer agreement (live data entry — sub-project #2)</label>'+
    '<button class="btn btn-p" style="margin-top:24px;width:100%" onclick="savePracticeSettings()">Save settings</button>'+
    '</div>';
}

async function savePracticeSettings(){
  var settings = {
    default_mastery: {
      response_pct: parseInt(document.getElementById('psM_pct').value, 10) || 80,
      consecutive_sessions: parseInt(document.getElementById('psM_cons').value, 10) || 3
    },
    require_daily_soap: document.getElementById('psSoap').checked,
    ioa_enabled: document.getElementById('psIoa').checked
  };
  var upd = await sb.from('practices').update({ settings: settings }).eq('id', S.practiceMember.practice_id);
  if(upd.error){ showToast(upd.error.message); return; }
  showToast('Settings saved');
}
```

- [ ] **Step 3: Manual verification**

1. As testprovider (owner), open Practice Settings. Defaults populate.
2. Change mastery to 90%, save. Toast confirms.
3. SQL: `SELECT settings FROM public.practices WHERE id = '<practice id>';` — jsonb shows new value.
4. Log in as testcaregiver (RBT). Try opening settings via sidebar — toast says owner-only and overlay does not open.

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba): Practice Settings page UI

Owner-only. Defaults for mastery criteria (% correct, consecutive
sessions), daily SOAP requirement toggle, IOA enabled toggle. Reads/
writes practices.settings jsonb (column added in Task 1 migration).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 9: Parent flywheel read paths

### Task 16: Verify parent read views

The migration in Task 1 already created `v_child_target_progress` and parent read RLS policies on `practice_clients` / `programs` / `targets`. No UI yet — the parent's "My BCBA" tab ships in sub-project #2. But we verify the data is reachable.

- [ ] **Step 1: As testparent, query the view**

In Supabase SQL editor, switch to testparent's JWT.

```sql
SELECT * FROM public.v_child_target_progress;
```

Expected: rows for Maya only (testparent's child). Should see Manding Training program with the target(s) added in Task 12.

- [ ] **Step 2: As testparent, attempt to read trials**

```sql
SELECT count(*) FROM public.trials;
```

Expected: 0 (RLS blocks).

- [ ] **Step 3: As testparent, attempt to read another practice's clients**

If you can set up a second practice with a different child via service_role, run the parent's query and confirm the other child does not appear.

- [ ] **Step 4: Commit (verification note in docs)**

No code change. Note the verification result in the TESTING-GUIDE addition in Task 17.

---

## Phase 10: Docs & end-to-end smoke

### Task 17: Update ROADMAP, AGENT-CONTEXT, TESTING-GUIDE

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/AGENT-CONTEXT.md`
- Modify: `docs/TESTING-GUIDE.md`

- [ ] **Step 1: Update ROADMAP**

In `docs/ROADMAP.md`, add a new "Completed" section entry. Find the existing "Completed" list and insert near the top:

```markdown
### BCBA Data Collection — Foundation (2026-05-18)
**Sub-project #1 of 6** — full initiative: [docs/superpowers/specs/2026-05-18-bcba-data-collection-foundation-design.md](docs/superpowers/specs/2026-05-18-bcba-data-collection-foundation-design.md)

- [x] Practice tier schema (practices, practice_members, practice_clients) + RLS
- [x] Clinical spine schema (programs, targets, target_steps, behavior_definitions, behavior_antecedents, behavior_consequences, sessions, trials, behavior_recordings) + RLS
- [x] Curriculum library scaffolding (curriculum_libraries, curriculum_targets, curriculum_target_steps) + Modern Village Starter seed
- [x] Existing session_notes.session_id (nullable), child_access.practice_id (nullable)
- [x] Parent read views (v_child_target_progress) + child_access-scoped RLS
- [x] Practice onboarding wizard, members management with invite flow, client roster with intake/discharge, programs CRUD, targets editor (5 target types + criteria forms + task analysis), curriculum browser with "Add to program", sessions list placeholder, practice settings
- [x] Worker endpoint /practice/invite-member + accept-invite URL handler

**Next:** sub-project #2 — Live Data Entry (trial-by-trial UI, IndexedDB sync runtime, IOA collection). Sequenced after a per-patient Stripe billing mini-spec.

Plan: [docs/superpowers/plans/2026-05-18-bcba-data-collection-foundation.md](docs/superpowers/plans/2026-05-18-bcba-data-collection-foundation.md)
```

- [ ] **Step 2: Update AGENT-CONTEXT**

In `docs/AGENT-CONTEXT.md`, find the "In-flight work" section. Add (or replace prior in-flight) with:

```markdown
## In-flight work — BCBA Data Collection (Ensora-parity initiative)

**Status as of 2026-05-18:** Foundation (sub-project #1 of 6) **complete** — schema spine, 8 admin screens, RLS, parent read paths, curriculum scaffolding all merged. See `docs/superpowers/specs/2026-05-18-bcba-data-collection-foundation-design.md` + `docs/superpowers/plans/2026-05-18-bcba-data-collection-foundation.md`.

**Sequence forward:**
1. **Mini-spec — per-patient Stripe billing** (between Foundation and #2). Wire `practices.stripe_*` fields to a real Stripe checkout + webhook, implement the $10/active-Family-subscriber credit.
2. **Sub-project #2 — Live Data Entry.** Trial-by-trial session UI, IndexedDB offline sync, IOA collection, parent "My BCBA" read-only tab.
3. **Sub-project #3 — Behavior Reduction** (structured behavior recording during a session).
4. **Sub-project #4 — Analysis & Reporting** (per-target graphs with phase change lines).
5. **Sub-project #5 — Documentation** (SOAP auto-fill from session data, timesheet signatures).
6. **Sub-project #6 — Curriculum Libraries** (Ariana-authored Starter content drop replacing placeholders, VB-MAPP/ABLLS-R licensing).

**Strategic positioning:** B2B attractor with per-patient pricing, separate Stripe product from $19.99 Family plan, RBT seats free, flywheel via $10/mo credit when a client's parent has a Family subscription. Memory: `project_bcba_data_collection.md`.
```

- [ ] **Step 3: Update TESTING-GUIDE**

In `docs/TESTING-GUIDE.md`, add a section after the existing Provider testing block:

```markdown
### Practice (BCBA Data Collection — sub-project #1)

Sign in as `testprovider@modernvillage.app` / `TestProvider123!`.

- [ ] Sidebar shows "Set up Practice" highlighted (when no practice exists)
- [ ] Onboarding wizard creates a practice; sidebar updates to show Dashboard/Members/Clients/Curriculum/Settings
- [ ] Members page lists the owner; invite modal sends email via worker `/practice/invite-member`
- [ ] Invite link with `?practice_invite=<token>` activates the pending member (test with `testcaregiver@modernvillage.app`)
- [ ] Add Client searches by parent email, picks child, sets service type and primary BCBA; child_access row auto-created with practice_id
- [ ] Discharge captures optional reason and sets practice_clients.status='discharged'
- [ ] Client detail Programs tab adds program (skill_acquisition / behavior_reduction); archive flips status
- [ ] Targets editor: DTT renders trials_per_session field, task_analysis reveals step builder, frequency/duration/interval render their respective configs; mastery/baseline/maintenance criteria forms write jsonb correctly
- [ ] Curriculum browser opens from sidebar (preview only) and from a program ("Add to program" button); adding copies the curriculum_target into targets with library_source FK set
- [ ] Practice Settings — only the owner_bcba can open it; settings persist to practices.settings jsonb
- [ ] As testparent — open Supabase SQL editor as authenticated parent; `SELECT * FROM public.v_child_target_progress` returns rows for Maya only; `SELECT count(*) FROM public.trials` returns 0 (RLS blocks)
- [ ] As testcaregiver (RBT after accepting invite) — INSERT INTO public.programs returns RLS violation
```

- [ ] **Step 4: Commit all docs in one go**

```bash
git add docs/ROADMAP.md docs/AGENT-CONTEXT.md docs/TESTING-GUIDE.md
git commit -m "$(cat <<'EOF'
docs: BCBA data collection Foundation status + testing

ROADMAP: mark sub-project #1 complete, sequence remaining work
AGENT-CONTEXT: refresh in-flight section for next agent
TESTING-GUIDE: add Practice walkthrough covering all 8 screens + RLS

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: End-to-end smoke walkthrough

A final pass exercising every screen, every role transition, every RLS rule. **No code change.**

- [ ] **Step 1: Reset test state**

In Supabase SQL editor (service_role):

```sql
-- Wipe any test practice from prior runs
DELETE FROM public.practices
  WHERE name IN ('Test Practice','Test Practice — verify wizard','Smoke Test Practice');
```

- [ ] **Step 2: Full happy path**

Sign in as testprovider:

1. Sidebar → "Set up Practice" → wizard → name "Smoke Test Practice" → finish without inviting
2. Sidebar → Practice Dashboard → confirm 30-day trial banner + 0/0/1 stats
3. Sidebar → Practice Members → invite `testcaregiver@modernvillage.app` as RBT with self as supervisor — confirm "Invite sent" toast
4. SQL check that `practice_members` row created with `active=false` + `invite_token`
5. Open new browser tab/incognito, log in as testcaregiver, paste URL `http://localhost:8000/app.html?practice_invite=<token from SQL>` — confirm welcome toast, sidebar now shows Practice Dashboard etc.
6. Back to testprovider. Sidebar → Clients → Add → search testparent → pick Maya → service 97156 → hours 10 → Add. Confirm Maya appears with "intake" pill.
7. Click Maya → Programs tab loads empty. Add program "Manding Training" → skill_acquisition / communication.
8. Open Manding Training → Add target "Mand for cookie" as DTT, 10 trials, mastery 80/3/FTI. Save.
9. Click "From curriculum" → filter "communication" → pick "Manding for preferred item" → Add to program. Confirm both targets show, second has "from library" pill.
10. Back to client detail → Recent Sessions placeholder shows.
11. Sidebar → Curriculum Library — browse all 5 starter targets across domains.
12. Sidebar → Practice Settings → change mastery default to 85 / 3 → save.

- [ ] **Step 3: RLS deny path**

As testcaregiver (RBT now active):
1. Sidebar shows Practice Dashboard but NOT "Set up Practice" (already a member)
2. Open Clients — should see Maya (read access)
3. Drill into Maya → Programs — should see Manding Training (read access)
4. NO "+ Add program" button (RBT cannot write programs)
5. Try via devtools: `await sb.from('programs').insert({ practice_client_id: '<id>', name: 'RBT hack', category: 'skill_acquisition' });` — should return RLS error

As testparent:
1. Sidebar does NOT show Practice items
2. Behavior tracker still works (parent product unchanged)
3. Open devtools console:
   ```javascript
   await sb.from('v_child_target_progress').select('*');
   // Expected: rows for Maya
   await sb.from('trials').select('*');
   // Expected: [] (RLS blocks)
   ```

- [ ] **Step 4: Clean up smoke test rows**

```sql
DELETE FROM public.practices WHERE name = 'Smoke Test Practice';
```

- [ ] **Step 5: No commit needed; ready for merge to main**

Foundation sub-project complete. Verify branch is clean:

```bash
git status
git log --oneline main..HEAD
```

Expected: clean tree, ~18 commits all with `Co-Authored-By` trailers.

---

## Self-review checklist (for the implementer)

Before opening a PR, verify:

- [ ] All 15 new tables exist in Supabase production (run the table list query from Task 1 Step 3)
- [ ] RLS smoke test from Task 3 passes on production
- [ ] `child_access.practice_id` column exists; `session_notes.session_id` column exists
- [ ] Worker is deployed: `curl https://village-api.jorrelpatterson.workers.dev/practice/invite-member` returns 401 (auth required) — confirms route exists
- [ ] Modern Village Starter Library row + 5 placeholder targets visible via `SELECT * FROM public.curriculum_targets;`
- [ ] No console errors in browser when logging in as any of the 4 test accounts
- [ ] Sidebar gating verified for all 4 test accounts (provider with/without practice, caregiver-as-RBT, parent, teacher)
- [ ] ROADMAP, AGENT-CONTEXT, TESTING-GUIDE all reflect Foundation as complete

---

## Open carry-overs (handled in subsequent specs/plans)

These are intentionally NOT in this Foundation plan; they are listed here so the next agent knows the boundary:

1. **Stripe per-patient billing** — own mini-spec, sequenced after Foundation merges.
2. **Live data entry UI** — sub-project #2.
3. **IndexedDB offline sync runtime** — sub-project #2.
4. **Graphs / phase change lines / ABC charts** — sub-project #4.
5. **SOAP auto-fill from session data** — sub-project #5.
6. **VB-MAPP / ABLLS-R licensed content packs** — sub-project #6.
7. **Parent "My BCBA" tab UI** — ships alongside sub-project #2 (data + RLS exist now via this plan).
8. **BACB credential auto-verification** — confirm during sub-project #2 (whether we call BACB registry or trust self-reporting).
9. **`session_notes` backfill of `session_id`** — recommended to leave null per spec; revisit if SOAP auto-fill (sub-project #5) needs historical records linked.
10. **Discharge data retention policy** — confirm legal retention period (HIPAA ~7 years CA) and add a hard-delete cron in a post-launch ops spec.
