# BCBA Data Collection — Live Data Entry (sub-project #2)

**Date:** 2026-05-18
**Initiative:** BCBA/ABA Data Collection Suite — competing head-to-head with Ensora Data Collection
**This spec covers:** sub-project #2 of 6 (Live Data Entry — the trial-by-trial UI BCBAs/RBTs use during a session)
**Depends on:** sub-project #1 (Foundation) — already shipped on `feat/bcba-data-collection-foundation`, migrations applied, worker deployed
**Subsequent sub-projects:** Behavior Reduction · Analysis & Reporting · Documentation · Curriculum Libraries

---

## Strategic context

This is the keystone sub-project of the Ensora-competitor build. Foundation gave the BCBA an admin setup pipeline. **#2 is where they actually do clinical work.** Without #2, the suite has nothing to chart, no data to summarize, no SOAPs to fill — every later sub-project operates on data this one produces.

Reference memory: `project_bcba_data_collection.md`.

## Locked decisions (from brainstorming, 2026-05-18)

| Decision | Choice |
|---|---|
| Session entry flow | Hybrid — pre-session plan with in-treatment targets pre-selected; "Run ad-hoc" skip option |
| Trial entry UX | Single-screen, big buttons (7 prompt levels), auto-advance, tap target-name to switch target |
| Behavior recording during a session | Floating "+ Behavior" action; overlay scales to recording_type (frequency / duration / interval / ABC) |
| Two-person workflows | IOA observer gets a "lite" parallel view on a second device; cosign is async from Practice Dashboard |
| End-of-session flow | Summary confirmation step (trial counts, % correct, behavior counts, duration) before close. **No SOAP auto-fill in #2** — that's sub-project #5 |
| Offline | IndexedDB queue, 30s background sync, optimistic UI, `client_uuid` dedup via DB unique constraint |
| Parent flywheel | "My BCBA" tab — in-treatment targets list, recent sessions (aggregate-only), per-target SVG sparklines |

## Goals

- Ship the **complete live-session workflow**: a BCBA or RBT can open a client, plan or skip planning, run trials, log behaviors, end the session, and see a summary — all in one continuous flow, tablet-first.
- Land **offline support** as a baseline capability — data collected in a Wi-Fi-spotty home reaches the server cleanly on reconnect, with no data loss and no duplicate rows.
- Ship the **IOA secondary-observer flow** and **cosign workflow** because both are required for billable CPT 97155 (BCBA supervision of RBT) sessions.
- Ship the **parent "My BCBA" tab** — the visible flywheel monetization surface.

## Non-goals (deferred)

- **SOAP note auto-fill** from session data → sub-project #5
- **Graphs with phase change lines** and trend analysis → sub-project #4 (the parent sparkline in this spec is intentionally minimal — single-color line over time, no overlays)
- **ABC bar charts and behavior reporting** → sub-project #4
- **Prompt schedule auto-fade** (the system suggests which prompt level to start at based on history) → later
- **Mastery promotion logic** — when a target meets mastery_criteria, auto-promote `status='in_treatment' → 'mastered'`. This is logic-only, no UI; can be added inline if cheap. Otherwise defer to #4.
- **Per-patient Stripe billing** — separate mini-spec, sequenced before #2 ships to users
- **Document storage UI** → sub-project #5

## Architecture

### Schema additions

Single small migration on top of Foundation: `supabase/migrations/20260519_bcba_live_data_entry.sql`

```sql
-- Pre-session plan: which targets are scheduled for a given session
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

-- Parent read access to sessions (aggregate-only via view)
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
```

Everything else builds on Foundation's existing `sessions`, `trials`, `behavior_recordings`, `behavior_definitions`, `targets`, `target_steps`.

### UI surfaces (all in `app.html`)

Seven new screens/components. Each is opened from the existing Client Detail view (added in Foundation Task 11).

#### A. Start Session button + Pre-session plan

On the client detail page (where the Sessions list placeholder currently lives), a prominent **"Start Session"** button appears for `practice_members` with active membership. Tapping it:

1. Opens **Pre-session plan modal**:
   - Header: client name, today's date, default location dropdown (home / clinic / school / telehealth), default CPT (defaults to `practice_clients.service_type`)
   - "Targets for today" list — all targets where `status = 'baseline' OR 'in_treatment' OR 'in_maintenance'` for this client's programs (filter out `archived`, `mastered`, `closed`). Each pre-checked with a checkbox. Each shows: program name · target name · default trials_per_session.
   - "Run ad-hoc (skip plan)" link at the top — same flow but no targets pre-selected; RBT picks during session.
   - **"Begin session"** primary button: creates the `sessions` row (`status='in_progress'`, start_time=now), inserts `session_targets` rows for each checked target, then transitions to active session view.

#### B. Active session — trial entry mode

Full-screen overlay. Top bar (sticky):

```
[← Pause]  Maya · Mand for cookie  [▼ switch]   Trial 4/10   ⏱ 12:34   ⚪ Synced
```

- Tap "▼ switch" → opens a target picker bottom-sheet listing the session's planned targets + an "Other in-treatment target..." link for ad-hoc additions
- Trial counter shows progress within current target (`planned_trials` from session_targets row)
- Session timer (mm:ss) runs from `start_time`
- Sync status badge: green dot "Synced" / yellow "Syncing (3 pending)" / red "Offline (12 queued)"

Center: **7 prompt-level buttons** in a 2×4 grid (last cell is "No Response"):

```
┌─────────────────────┬─────────────────────┐
│   Independent  ✓    │   Gestural          │
├─────────────────────┼─────────────────────┤
│   Verbal            │   Model             │
├─────────────────────┼─────────────────────┤
│   Partial Physical  │   Full Physical     │
├─────────────────────┴─────────────────────┤
│            No Response                    │
└───────────────────────────────────────────┘
```

Each button is ≥80px tall on tablet. Tap → button flashes a green/red border (correct on Independent, otherwise prompted/incorrect by ABA conventions) → trial logs via `mvOffline.enqueue` → trial counter increments → next trial loads. For task analysis targets, the step name appears above the buttons and advances through the step list before looping.

**Trial response mapping** (locked):
- Independent → `prompt_level='independent'`, `response='correct'`
- Gestural / Verbal / Model / Partial Physical / Full Physical → `prompt_level=<level>`, `response='prompted'`
- No Response → `prompt_level='no_response'`, `response='incorrect'`

(BCBAs can over-ride to mark a prompted trial as incorrect via a long-press menu — out of #2 scope; defer.)

Bottom-right: floating **"+ Behavior"** circular button (∅ 56px), high-contrast.

#### C. Behavior log overlay

Floating-action button → slide-up panel:

1. List of `behavior_definitions` for this client. Each row shows name + recording_type chip (frequency / duration / interval / ABC).
2. Tap a behavior → form scaled to `recording_type`:
   - **Frequency:** large + and − buttons with running count. "Save" finalizes a `behavior_recordings` row with `count=N`.
   - **Duration:** Start/Stop timer (or directly enter seconds). Save finalizes with `duration_seconds=N`.
   - **Interval:** picks interval length from `data_collection_config.interval_seconds`. Each interval flashes the screen edge; tap "occurred" or "didn't." Auto-saves at end of observation window. (Simplest UI: a single "Yes / No" toggle per interval with auto-tick.)
   - **ABC:** dropdowns for antecedent (from `behavior_antecedents` library for this practice/client), behavior (the definition itself), consequence (from `behavior_consequences`), function category chip selector (tangible / escape / attention / sensory), Notes textarea, "Save" finalizes.
3. After save: returns to trial entry with the same target/trial state preserved. Behavior is logged offline-safely via `mvOffline.enqueue`.

A small "Recently logged: X" pill appears in the top bar so the RBT can see behavior events firing without leaving trial entry.

#### D. End-of-session summary

When RBT taps "End Session" in the active session view (button in the top bar overflow menu):

1. **Confirmation modal:** "End session? You'll see a summary before it's saved."
2. **Summary screen:**
   - Header: client name · duration · location · CPT code (defaulted; editable)
   - **Trial summary table** — one row per target in session:
     - Target name
     - Trials run / Planned trials
     - % correct (independent + correct prompted treated per response field)
     - % independent (independent only)
   - **Behavior summary table** — one row per behavior definition that fired:
     - Name · recording_type · totals (count for frequency, total seconds for duration, % of intervals occurred for interval, count for ABC)
   - **Session metadata** form:
     - CPT code (editable)
     - Parent_present checkbox
     - Notes textarea (free-text, optional — saves to a placeholder `session_notes` row; full SOAP auto-fill is #5)
   - **Submit session** button → marks session `status='completed'`, sets `end_time=now`, returns to client detail.
   - **Save & continue editing** button (secondary) → leaves session in_progress and returns to active session view.

#### E. IOA observer flow

Standard: a supervising BCBA observes the same session on their own device.

Implementation:

- Practice Dashboard surfaces a card **"Active sessions (N)"** — sessions in `status='in_progress'` for any client in the practice. Shows: client name · primary observer · start time.
- Tapping a session from this card opens it in **IOA mode** if the current user is NOT the `provider_id`. IOA mode is a stripped-down trial-entry surface:
  - Top bar shows the same target name + trial counter as the primary observer (live-synced from server every 5s)
  - 7 prompt-level buttons same as primary
  - Tap → trial logs with `ioa_observer_id = self.practice_member_id` (still goes through `mvOffline` queue)
  - No "+ Behavior" overlay, no target switching, no "End Session" — IOA observer can only record on what the primary is currently running
- After the primary submits the session, the summary screen calculates **IOA % per target** = (matching `(target_id, trial_index, response)` tuples between primary and IOA streams) / (total IOA trials). Displayed alongside trial counts. Threshold ≥80% renders green; below renders amber.

#### F. Cosign flow

CPT 97155 requires supervising BCBA cosign on RBT-run sessions.

- Practice Dashboard surfaces a card **"Pending cosign (N)"** — query: `sessions WHERE status='completed' AND cosigner_id IS NULL AND <viewer is_practice_bcba>`.
- Tap → list of sessions sorted by `end_time DESC`. Each row shows client name · provider · date · "Review →".
- Tap a session → opens the **end-of-session summary view** (read-only) plus an IOA reconciliation table if applicable. **"Cosign"** button sets `cosigner_id = self.practice_member_id`, `cosigned_at = now()`, `status = 'cosigned'`.
- A session in `cosigned` status is locked from further edits (RLS already blocks updates by default — only INSERT policies exist on trials/behavior_recordings).

#### G. Parent "My BCBA" tab

New sidebar item for parents whose child has at least one `practice_clients` row (query gate on `loadProfile`).

Layout:

- Per child (if multiple kids on the account, prefer the currently active child):
  - **Header:** "[Child name] is working with [Primary BCBA name] at [Practice name]"
  - **Programs in treatment** — accordion cards. Each card: program name, X targets in treatment, status pills (baseline / in treatment / in maintenance). Tap → expands to show targets list with name + status + simple sparkline.
  - **Recent sessions** — list (most recent 10). Each row: date · location · duration · trial count · behavior count. Tap → opens session summary view (the same view BCBA sees post-session, parent variant: no editable fields, no notes if `session_notes.shared_with_parent = false`).
  - **Progress sparklines** — for each in-treatment target, a 200×40 SVG showing % correct per session over the last 20 sessions. Single-color line, no axes labels (graphs ship in #4).

This is the keystone flywheel surface. Parents who see clinical progress don't churn.

### Offline runtime

Single file: `lib/mv-offline.js` (or inline in app.html under `// ═══ OFFLINE SYNC ═══`). ~250-300 lines vanilla JS.

**State:**

```javascript
mvOffline = {
  db: null,                        // IndexedDB handle
  online: navigator.onLine,
  syncing: false,
  queueCount: 0,
  flushTimer: null
};
```

**Public API:**

- `await mvOffline.init()` — open IndexedDB, set up `online`/`offline` event listeners, start 30s flush timer.
- `await mvOffline.enqueue({ table, payload })` — add an op to the queue. Caller is responsible for setting `payload.client_uuid` (UUID v4 generated client-side). Returns immediately; UI shouldn't wait.
- `await mvOffline.flush()` — manually trigger a sync attempt. Called on app focus, on `online` event, and from the 30s timer.
- `mvOffline.statusBadge()` — returns one of `{ status: 'synced' | 'syncing' | 'offline', queueCount: N }`. Top bar reads this every 1s while in a session.

**IndexedDB schema:**

- Database: `mv-offline-v1`
- Object store: `queue` with auto-incremented key, columns: `{ table, payload, client_uuid, attempted_at?, attempt_count? }`

**Flush algorithm:**

1. If offline OR syncing OR queue empty → return.
2. Set syncing=true.
3. For each op in queue (oldest first, batches of 25):
   - POST to `${SUPA_URL}/rest/v1/${table}` with `Prefer: return=minimal`, body=payload, auth header.
   - 200 / 201: delete from queue.
   - 409 (unique violation, dedup): delete from queue (assume already synced).
   - 4xx other (validation): mark op as failed, surface to user via toast "X ops failed to sync — open Sync Log."
   - 5xx / network: bump `attempt_count`, leave in queue. Exponential backoff before next flush (60s → 5min cap).
4. Set syncing=false. Re-trigger flush if queue still non-empty.

**Conflict resolution:** None needed for INSERT-only tables (trials, behavior_recordings). The DB's `UNIQUE(session_id, client_uuid)` constraint makes retries idempotent.

**Sessions table is treated specially:** sessions are created online (a session needs a server-generated `id`) but their `end_time` and `status` updates can flow through the queue. If a session can't be created online (no connectivity at "Begin Session" tap), the UI blocks with a clear message — sessions start online or not at all. This is a deliberate simplification for #2; pure offline session creation would need a client-generated session_id, which complicates IOA observer joining.

**Visibility:** A small badge in the top bar of the active session and on the main app navbar shows queue state (`⚪ Synced` / `🟡 Syncing (N)` / `🔴 Offline (N)`). Tapping opens a Sync Log modal with the last 20 ops, errors, and a "Retry all" button.

### RLS posture

All new INSERT operations from the active session UI route through existing Foundation RLS policies:

- Trials/behavior_recordings INSERT → already-tested "Members insert trials/recordings" policies
- session_targets INSERT/SELECT → new policies in this migration, scoped through `sessions → practice_clients` join
- sessions UPDATE (status changes) → "Provider writes own sessions" FOR ALL policy from Foundation handles this
- Parent SELECT on sessions → new "Parents read sessions via child_access" policy

No new RLS helper functions needed.

## Migration plan

1. Apply `supabase/migrations/20260519_bcba_live_data_entry.sql` in Supabase Dashboard
2. Deploy any worker changes (none expected — all flows are client → Supabase REST)
3. Existing data: no migration. New `sessions` rows from #2 carry the new flow; old rows (if any) just won't have `session_targets`.
4. App rollout: the new "Start Session" UI gates on `S.practiceMember` (same gate as Foundation). Parent "My BCBA" tab gates on `S.role === 'parent' && <has practice_clients>`. Both gates fail closed if data is missing — no risk to existing surfaces.

## Success criteria

- An RBT can log in, open a client, plan a session with 3 targets, run 30 trials across them with the floating-behavior overlay firing 2 ABC entries mid-session, end the session, review summary, submit — entirely on a tablet, with Wi-Fi turned off mid-session and the data syncing cleanly on reconnect.
- A second BCBA can join the same active session from their device as IOA observer and record on a subset of trials; the summary screen shows accurate per-target IOA % after submit.
- A BCBA can open the Practice Dashboard, see N sessions pending cosign, review one, cosign it. Session transitions to `status='cosigned'`.
- A parent can open their Modern Village app and see "My BCBA" with their child's in-treatment targets, recent session list, and a sparkline per target — without seeing any row-level clinical data they aren't authorized for.
- All offline-queued ops eventually reach the server and result in correctly-deduped database rows; no data loss.

## What unblocks after #2 ships

- **Sub-project #3 (Behavior Reduction):** now there's real session-level behavior data flowing in. #3 builds the dedicated ABC graphs, frequency rate trends, and the per-client behavior dashboard.
- **Sub-project #4 (Analysis & Reporting):** target-level line graphs with phase change lines, mean-of-day, technical indicators. Replaces the parent sparkline with the real Ensora-class chart.
- **Sub-project #5 (Documentation):** SOAP note auto-fill takes the session summary data and writes the narrative + populates `session_notes.ai_narrative` + ties to the existing medical billing module's `claims` flow.
- **Per-patient Stripe billing mini-spec** — sequenced between #2 and #3, wires the real Stripe checkout and the $10/active-Family-subscriber credit.

## Open questions

1. **Trial response over-ride.** Should we let BCBAs long-press a prompt button to mark a prompted trial as incorrect? Useful for "trial run but client refused / no clear response." Recommendation: defer to #2.1 polish pass; not blocking the build.
2. **Session pause/resume.** If an RBT pauses mid-session (calls for help, kid melts down), do we want explicit "Pause" state separate from in_progress? Recommendation: no — leave as in_progress, the session timer keeps running. Pause is a behavioral concept (write a behavior log), not a system state.
3. **What happens if the IOA observer is offline?** Their queue would build up; when they reconnect, the IOA trials sync to a session that may already be `completed`. The summary's IOA % might appear *after* the cosign view, requiring a re-render. Recommendation: surface a banner "IOA data still arriving" until queue is empty for the session.
4. **Parent's view of session_notes.** Foundation kept `session_notes.shared_with_parent` boolean. In #2, parent's "Recent sessions" → session detail view: does it show the (placeholder) free-text notes when shared? Recommendation: yes, render notes if `shared_with_parent = true`; otherwise show only aggregate counts. Full SOAP rendering belongs in #5.
