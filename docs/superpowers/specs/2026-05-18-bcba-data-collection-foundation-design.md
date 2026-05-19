# BCBA Data Collection — Foundation (sub-project #1)

**Date:** 2026-05-18
**Initiative:** BCBA/ABA Data Collection Suite — competing head-to-head with Ensora Data Collection
**This spec covers:** sub-project #1 of 6 (Foundation: Programs, Targets, Sessions, Practice tier)
**Subsequent sub-projects (each gets its own spec):** Live Data Entry · Behavior Reduction · Analysis & Reporting · Documentation · Curriculum Libraries

---

## Strategic context

This is not a feature for Ariana — it's a **B2B attractor product with its own subscription**, designed to feed the parent flywheel. Reference memory entry `project_bcba_data_collection.md`.

- Ensora ($60/seat) dominates clinical ABA data collection. Modern Village's wedge is **per-patient pricing**, not per-seat.
- The strategic win is the flywheel: BCBA signs up → uses Modern Village for caseload data collection → refers clients/parents to the consumer-side Modern Village app → grows the parent subscriber base at near-zero CAC.
- Direct-therapy-first (97153/97155) — that's the broader BCBA market. Parent Consultation (97156, Ariana's lane) sits on top as a thinner config of the same model.
- Whole-suite estimate: 3–5 months across 6 sub-projects.

## Locked decisions (from brainstorming, 2026-05-18)

| Decision | Choice | Implication |
|---|---|---|
| Service mix | Direct-therapy-first; PC layered on | Target model accommodates DTT, task analysis, frequency, duration, interval |
| Pricing | Per-patient, separate Stripe product | New `practices` tier, patient_count for billing, RBT seats free |
| Org structure | BCBA + RBT practice model | New `practice_members` with supervisor links, cosign workflow |
| Setting / offline | Schema offline-ready now; runtime ships sub-project #2 | `client_uuid` on trial/recording tables; append-only |
| Flywheel | Parent gets read-only "My BCBA" view (ships with sub-project #2 data) | Aggregate read paths only; no row-level trial exposure to parents |
| Existing data | `behavior_logs` untouched; `session_notes` rebuilt with `session_id` FK; new clinical tables coexist | No destructive migrations |
| Curriculum | Library scaffolding day one + Modern Village Starter pack | VB-MAPP/ABLLS-R drop in as content seed when licensed |

## Goals

- Stand up the data spine the rest of the suite (#2–#6) plugs into. Nothing else in the suite is unblocked without this.
- Ship 8 admin/setup screens that let a BCBA: create a practice, invite team, add a client, define programs and targets, browse a starter curriculum. **No live data entry, no graphs, no SOAP auto-fill in this sub-project.**
- Preserve every existing parent-side surface (behavior tracker, AI coach, community) unchanged.

## Non-goals (deferred to later sub-projects)

- Trial-by-trial data entry UI → sub-project #2
- Behavior recording during a session → sub-project #3
- Graphs, phase change lines, ABC bar charts → sub-project #4
- SOAP note auto-fill, timesheet signatures → sub-project #5
- VB-MAPP / ABLLS-R / PEAK licensed curriculum content → sub-project #6
- Offline sync runtime (IndexedDB queue, conflict UI) → sub-project #2
- IOA secondary-observer flow → sub-project #2
- Prompt schedule auto-fade → sub-project #2

## Architecture

### Data model

New tables (purple in the diagram), additive to existing schema. All clinical data lives in this new spine; `behavior_logs` (parent-side) stays untouched.

#### Practice tier

```sql
practices
  id uuid pk
  name text not null
  owner_id uuid fk profiles                    -- must be BCBA-credentialed
  group_npi text                                -- group billing NPI if applicable
  tax_id text
  billing_address jsonb
  stripe_subscription_id text
  stripe_customer_id text
  subscription_status text                      -- 'trialing' | 'active' | 'past_due' | 'cancelled'
  trial_ends_at timestamptz
  patient_count int default 0                   -- denormalized cache, updated on practice_clients changes
  created_at timestamptz default now()

practice_members
  id uuid pk
  practice_id uuid fk practices
  user_id uuid fk profiles
  role text not null                            -- 'owner_bcba' | 'supervising_bcba' | 'rbt' | 'admin'
  supervisor_id uuid fk practice_members null   -- RBTs must point to a supervising BCBA
  credentials jsonb                             -- {bcba_cert_number, bcba_expires, rbt_cert_number, rbt_expires}
  active boolean default true
  invited_at timestamptz default now()
  accepted_at timestamptz
  unique(practice_id, user_id)

practice_clients
  id uuid pk
  practice_id uuid fk practices
  child_id uuid fk children
  primary_bcba_id uuid fk practice_members
  secondary_bcba_id uuid fk practice_members null
  status text not null                          -- 'intake' | 'active' | 'discharged' | 'on_hold'
  service_type text                             -- '97153' | '97155' | '97156'
  prior_auth_number text
  prior_auth_start date
  prior_auth_end date
  weekly_hours_authorized numeric
  intake_date date
  discharge_date date
  discharge_reason text
  created_at timestamptz default now()
  unique(practice_id, child_id)
```

#### Program / Target spine

```sql
programs
  id uuid pk
  practice_client_id uuid fk practice_clients
  name text not null
  category text not null                        -- 'skill_acquisition' | 'behavior_reduction'
  domain text                                   -- 'adaptive_living' | 'communication' | 'social' | 'parent_skills' | 'replacement_behaviors'
  description text
  supervisor_id uuid fk practice_members         -- BCBA who owns the program
  status text not null default 'active'         -- 'active' | 'mastered' | 'on_hold' | 'archived'
  mastered_at timestamptz
  created_at timestamptz default now()
  updated_at timestamptz default now()

targets
  id uuid pk
  program_id uuid fk programs
  name text not null
  operational_definition text not null           -- required; this is the BCBA-grade contract
  target_type text not null                     -- 'discrete_trial' | 'task_analysis' | 'frequency' | 'duration' | 'interval'
  data_collection_config jsonb                  -- varies by target_type: e.g. {trials_per_session:10} or {interval_seconds:10, interval_type:'whole'}
  mastery_criteria jsonb                        -- {response_pct:80, consecutive_sessions:3, first_trial_independent:true}
  baseline_criteria jsonb                       -- {sessions:3, trials_per_session:5}
  maintenance_criteria jsonb                    -- {probe_frequency:'weekly', probes_required:2}
  status text not null default 'baseline'       -- 'baseline' | 'in_treatment' | 'mastered' | 'in_maintenance' | 'closed'
  promoted_at timestamptz
  library_source uuid fk curriculum_targets null -- non-null if added from a curriculum library
  created_at timestamptz default now()
  updated_at timestamptz default now()

target_steps
  id uuid pk
  target_id uuid fk targets
  sequence int not null                         -- 1-indexed
  name text not null                            -- e.g. "Wet toothbrush"
  description text
  unique(target_id, sequence)
```

#### Session / Trial / Behavior recording layer (offline-ready)

```sql
sessions
  id uuid pk
  practice_client_id uuid fk practice_clients
  provider_id uuid fk practice_members
  start_time timestamptz not null
  end_time timestamptz
  location text                                  -- 'home' | 'clinic' | 'school' | 'telehealth'
  cpt_code text                                  -- '97153' | '97155' | '97156' | etc.
  status text default 'in_progress'              -- 'in_progress' | 'completed' | 'cosigned' | 'cancelled'
  cosigner_id uuid fk practice_members null      -- supervising BCBA who cosigned RBT session
  cosigned_at timestamptz
  parent_present boolean default false
  prior_auth_used numeric                        -- units consumed against prior auth
  client_uuid uuid                               -- for offline conflict-free creation
  created_at timestamptz default now()
  updated_at timestamptz default now()

trials
  id uuid pk
  session_id uuid fk sessions
  target_id uuid fk targets
  target_step_id uuid fk target_steps null       -- non-null for task analysis trials
  prompt_level text                              -- 'independent' | 'gestural' | 'verbal' | 'model' | 'partial_physical' | 'full_physical' | 'no_response'
  response text                                  -- 'correct' | 'incorrect' | 'prompted' | 'refused' | 'na'
  trial_index int                                -- order within session
  timestamp timestamptz default now()
  ioa_observer_id uuid fk practice_members null
  client_uuid uuid not null                      -- device-generated, unique(session_id, client_uuid)
  superseded_by uuid fk trials null              -- for corrections without destructive updates
  unique(session_id, client_uuid)

behavior_definitions
  id uuid pk
  practice_client_id uuid fk practice_clients
  name text not null
  operational_definition text not null
  recording_type text not null                  -- 'frequency' | 'duration' | 'interval' | 'abc' | 'rate'
  classification text                           -- 'challenging' | 'replacement'
  status text default 'active'
  created_at timestamptz default now()

behavior_recordings
  id uuid pk
  session_id uuid fk sessions
  behavior_definition_id uuid fk behavior_definitions
  observer_id uuid fk practice_members
  recording_type text                            -- copied from definition for query speed
  count int                                      -- for frequency/rate
  duration_seconds int                           -- for duration
  interval_data jsonb                            -- for interval recording
  antecedent_id uuid fk behavior_antecedents null
  consequence_id uuid fk behavior_consequences null
  function_category text                         -- 'tangible' | 'escape' | 'attention' | 'sensory'
  location text
  notes text
  timestamp timestamptz default now()
  client_uuid uuid not null
  unique(session_id, client_uuid)

behavior_antecedents
  id uuid pk
  practice_client_id uuid fk practice_clients null  -- null = practice-wide library
  practice_id uuid fk practices null
  name text not null

behavior_consequences
  id uuid pk
  practice_client_id uuid fk practice_clients null
  practice_id uuid fk practices null
  name text not null
```

#### Curriculum library scaffolding

```sql
curriculum_libraries
  id uuid pk
  name text not null                             -- 'Modern Village Starter' | 'VB-MAPP' | 'ABLLS-R'
  publisher text
  license_type text                              -- 'free' | 'licensed' | 'modern_village_authored'
  version text
  active boolean default true

curriculum_targets
  id uuid pk
  library_id uuid fk curriculum_libraries
  name text not null
  operational_definition text not null
  target_type text not null
  default_data_collection_config jsonb
  default_mastery_criteria jsonb
  domain text
  suggested_age_min int
  suggested_age_max int
  suggested_diagnoses text[]

curriculum_target_steps
  id uuid pk
  curriculum_target_id uuid fk curriculum_targets
  sequence int not null
  name text not null
  description text
```

When a curriculum target is added to a client, a new row is **copied** into `targets` with `library_source` pointing back to the curriculum row. The BCBA can edit the copy without affecting the library.

### Rebuild of `session_notes`

```sql
alter table session_notes
  add column session_id uuid fk sessions null;
```

- Existing rows keep `session_id = null` (backfilled separately).
- New session notes auto-create with `session_id` set when a session is completed.
- `ai_narrative`, `interventions`, `client_response`, `next_steps` remain as overridable fields — the sub-project #5 SOAP auto-fill will populate them from `trials` + `behavior_recordings`, and the BCBA can hand-edit.
- `billing_status` column unchanged; existing claims module wires in without modification.

### Existing-data integration

| Existing | Change |
|---|---|
| `profiles` | Column-level unchanged. A user becomes a clinical user by gaining a `practice_members` row. |
| `child_access` | Add `practice_id uuid fk practices null`. When a BCBA adds a child to their roster, a `child_access` row is auto-created with `practice_id` set — this is the authorization for the practice to read/write clinical data. |
| `behavior_logs` | Untouched. BCBAs can read it as a context panel. |
| `session_notes` | `session_id` added (nullable). Old rows stay viewable. |
| `claims`, `payer_enrollments` | Untouched. Linked via `session_notes.session_id`. |

### RLS posture

- **practices, practice_members, practice_clients**: members can read/write their own practice's rows. Owner_bcba can manage members. Modern Village admins retain full read via existing `is_admin()`.
- **programs, targets, target_steps**: practice members with `active=true` can read. Only `owner_bcba` and `supervising_bcba` can write. RBTs are read-only.
- **sessions**: any active member can read sessions for their practice's clients; can write sessions only where `provider_id = self.practice_member.id`; cosigner_id can be set only by supervising BCBA on RBT sessions.
- **trials, behavior_recordings**: any active member can insert into a session they own; can read all session data for their practice. Updates blocked (append-only via `superseded_by`).
- **behavior_definitions, antecedents, consequences**: practice-scoped; BCBAs write, RBTs read.
- **curriculum_libraries, curriculum_targets**: world-readable to authenticated practice members.
- **child_access** (extended): parent retains existing access. Practice rows are read via the `practice_id` linkage.
- **Parent read-only flywheel surface**: parents see aggregated views via Supabase views/RPCs (`v_child_program_summary`, `v_child_target_progress`) that expose mastery %, status, line graph data — never individual trial rows. RLS on the views joins through `child_access`.

### Offline-readiness (schema-level only)

- `trials.client_uuid` and `behavior_recordings.client_uuid` are device-generated UUIDs. Server enforces `unique(session_id, client_uuid)` so reposting the same trial during sync retries is idempotent (insert-or-ignore).
- All data-collection tables are append-only. Corrections create a new row referencing the original via `superseded_by`.
- `updated_at` everywhere for last-write-wins on configuration tables.
- The actual IndexedDB sync queue and conflict-resolution UI ship in sub-project #2 — but the schema decisions in this sub-project make that work straightforward.

## Admin UI surfaces (Foundation scope only)

All eight screens live in `app.html`, gated behind a new sidebar entry **"Practice"** that appears for users with an active `practice_members` row. Existing provider sidebar items (Billing Dashboard, My Payers, client list) remain untouched. Routes are overlay-pages, consistent with current pattern.

1. **Practice onboarding wizard** — multi-step modal: practice name → tax info → invite first member → Stripe per-patient subscription (real Stripe wiring punted to a post-Foundation mini-spec; this wizard captures Stripe customer creation only).
2. **Members page** — invite by email (role: BCBA / RBT / admin), set supervisor on RBT invites, manage BACB credential numbers + expirations, pause/reactivate, remove.
3. **Client roster** — searchable table of `practice_clients` with status pills, service_type, prior_auth status, primary BCBA. Intake flow: pick existing `children` row (if parent already on app) OR create a `children` row + invite the parent. Discharge flow with reason.
4. **Client → Programs tab** — list programs grouped by category (skill_acquisition / behavior_reduction). Add program: name, category, domain, supervisor. Status actions: archive, master-out, put on hold.
5. **Program → Targets editor** — list targets in a program with status pills. Target editor modal: name, operational definition (required, with character min), target_type picker, data_collection_config form (renders different fields per target_type), mastery/baseline/maintenance criteria forms (jsonb-backed but rendered as friendly form), task_analysis step builder (drag-and-drop reorder, edit, delete). Add from curriculum button.
6. **Curriculum browser** — sidebar-style nav by domain. Card list of `curriculum_targets`. Card click reveals preview (operational definition, default criteria, steps if task analysis). "Add to client" button triggers copy into `targets`. Filter by suggested age / diagnosis.
7. **Sessions list (placeholder)** — table of past sessions for a client, read-only. Columns: date, provider, location, CPT, status, cosigned. "Start session" button is disabled with tooltip "Live data entry ships next." (This screen exists so the navigation structure is complete and the data model is exercised.)
8. **Practice settings** — defaults for mastery / baseline / maintenance criteria; prompt code library (the prompt levels enum is fixed in code, but BCBAs can rename labels per practice); daily SOAP requirement toggle; IOA enabled toggle (display-only in Foundation — actual IOA collection ships in #2).

### What's intentionally cut from this sub-project

Listed in non-goals above. Worth restating: **no live trial entry, no graphs, no SOAP auto-fill, no real Stripe subscription flow, no offline runtime, no IOA collection.** Foundation is purely the spine + setup.

## Pricing & flywheel mechanics

- Separate Stripe product from the existing $19.99 family plan.
- Three tiers based on `practices.patient_count`:
  - Starter (1–5 clients): $39/client/mo
  - Practice (6–15): $29/client/mo
  - Group (16+): $19/client/mo
- **RBT seats free** under the practice subscription. This is the marketing wedge against Ensora's $60/seat.
- **Flywheel credit:** for every `practice_clients` row whose `children.user_id` has an active Family ($19.99) subscription, deduct $10/mo from the practice's per-patient fee for that client. The mechanic — BCBA refers parent → parent subscribes → BCBA's bill drops — drives organic patient adoption.
- 30-day free trial for first practice owner. Trial expiration enforced via `practices.trial_ends_at`.
- **In Foundation:** the schema (`practices.subscription_status`, `patient_count`, `trial_ends_at`, `stripe_subscription_id`) and the per-patient counting logic ship. The actual Stripe checkout + webhook flow gets its own mini-spec sequenced after Foundation merges, before sub-project #2.

## Migration plan

1. Run new migration `20260518_bcba_data_collection_foundation.sql`:
   - Create all new tables
   - Add `session_notes.session_id` (nullable)
   - Add `child_access.practice_id` (nullable)
   - Seed `curriculum_libraries` with one row: "Modern Village Starter" (active=true, license_type='modern_village_authored')
   - Seed `curriculum_targets` with ~50 starter targets — authored by Ariana, content drop is a separate task before merge
   - Create RLS policies for all new tables
   - Create Supabase views `v_child_program_summary` and `v_child_target_progress` for parent read access
2. **No destructive changes.** Existing rows in `behavior_logs`, `session_notes`, `child_access`, `profiles` are not modified. Old session notes keep working with `session_id = null`.
3. App rollout is gated: the new "Practice" sidebar entry only renders when `practice_members.user_id = current_user` returns a row. Until a BCBA goes through the onboarding wizard, the new product is invisible — zero risk to the parent-side product.

## Success criteria for Foundation

- A BCBA can sign up, create a practice, invite an RBT, add a client, define 3 programs with 5 targets each (mixed target_types), import 2 targets from the Modern Village Starter library, and walk away with a fully configured clinical workspace — **without ever touching live data entry**.
- Parent of an added client is invited via the existing parent invite flow; the parent's consumer app is unchanged.
- All RLS policies pass a smoke test: an RBT cannot read another BCBA's client list; a parent cannot read trials; an admin can read everything.
- Schema review: every clinical table that will be written to during a session has `client_uuid` and append-only semantics, validated by attempted-update RLS denial.
- Zero impact on existing parent-side surfaces verified by running through the testing checklist in `docs/TESTING-GUIDE.md`.

## What unblocks after Foundation merges

- **Sub-project #2 (Live Data Entry)** — the actual session UI BCBAs/RBTs tap during a session. Requires programs, targets, sessions, trials, behavior_recordings all to exist. Also where IndexedDB sync queue lands.
- **Sub-project #3 (Behavior Reduction)** — ABC graphs and structured behavior tools. Behavior_definitions/recordings tables already exist; this is mostly UI + reporting.
- **Sub-project #4 (Analysis & Reporting)** — line graphs with phase change lines. Needs data, which needs #2.
- **Sub-project #5 (Documentation)** — SOAP auto-fill from session data. Needs sessions + trials.
- **Sub-project #6 (Curriculum Libraries)** — full content + VB-MAPP/ABLLS-R licensing work. Schema is ready from Foundation.

Plus a mini-spec — **per-patient Stripe billing** — sequenced between Foundation and #2.

## Open questions

1. **BACB credential verification.** RBT cert numbers can be checked against the BACB public registry. Do we auto-verify on invite, or trust self-reporting at intake? (Recommendation: trust at intake, surface a warning if cert expires soon.)
2. **Multi-practice membership.** Can one BCBA belong to two practices? (Real-world yes — moonlighting is common.) Unique constraint on `practice_members(practice_id, user_id)` allows it; just confirming we want it.
3. **Existing `session_notes` rows.** Backfill `session_id` by inferring sessions from `(provider_id, child_id, session_date, duration_minutes)`? Or leave null forever? (Recommendation: leave null. Old notes were free-text era, no session to attach to.)
4. **Discharge data retention.** When a client is discharged, do we keep clinical data indefinitely (HIPAA — generally yes, 7 years CA)? Confirm legal retention period for the spec.
