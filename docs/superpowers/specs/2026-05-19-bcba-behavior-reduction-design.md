# BCBA Data Collection — Behavior Reduction (sub-project #3)

**Date:** 2026-05-19
**Initiative:** BCBA/ABA Data Collection Suite — competing head-to-head with Ensora Data Collection
**This spec covers:** sub-project #3 of 6 (Behavior Reduction — dedicated BCBA-side surface for managing behavior_definitions, antecedent/consequence libraries, and viewing per-behavior frequency/duration/ABC trends)
**Depends on:** sub-projects #1 (Foundation) + #2 (Live Data Entry) — both shipped to main 2026-05-19
**Subsequent sub-projects:** Analysis & Reporting · Documentation · Curriculum Libraries

---

## Strategic context

#2 made the act of recording behaviors possible (frequency tally, duration timer, interval, ABC). #3 makes that data **usable** for behavior reduction work — the second-most-common ABA clinical activity after skill acquisition.

In Ensora's screenshots, the Behavior Reduction tab is its own first-level navigation with sub-tabs Behaviors / Antecedents / Consequences / Locations / MO Coding plus dedicated ABC graphs. Modern Village folds the same surface into a per-client "Behaviors" tab next to Programs, which keeps the cognitive load lower for solo BCBAs while preserving all the clinical functionality.

Memory: `project_bcba_data_collection.md`.

## Locked decisions

| Decision | Choice |
|---|---|
| Where the behaviors UI lives | Behaviors **tab in client detail** (sibling to Programs) — not a top-level sidebar item |
| ABC graph scope | **Per-behavior primarily**, with a "Combined view" toggle that aggregates across the client's challenging behaviors |
| Antecedent / Consequence storage | FK to `behavior_antecedents` / `behavior_consequences` (tables exist from Foundation). #2's free-text-in-notes entries remain readable for backward compat |
| Chart implementation | Vanilla SVG (matches the parent sparkline pattern from #2). No chart library |
| Cross-client analytics | **Out of scope** — single-client only. Practice-wide views come in #4 |

## Goals

- A BCBA can fully manage a client's behavior-reduction setup: define behaviors, build antecedent/consequence libraries, classify behaviors as challenging vs replacement.
- After a session, the BCBA can open a Behaviors tab → pick a behavior → see meaningful trend + ABC analysis without leaving the client view.
- ABC entries collected during a session (#2's overlay) now use the FK library pickers — no more free-text-only entries.
- The data captured here drives sub-project #4's higher-end analysis (cross-client / phase change lines / trend overlays).

## Non-goals

- Phase change lines, mean-of-day connectors, technical indicators (avg / SD / trend line) → sub-project #4
- Cross-client behavior analytics (e.g., "show all clients with aggression trending up") → sub-project #4
- BIP/behavior intervention plan documents → sub-project #5 (documentation)
- MO (motivating operation) coding as a separate library — Ensora has it; deferred unless trivially small
- Locations as a separate library (Ensora has it; for #3 we use the freeform `location` text field on behavior_recordings; structured locations library deferred)
- Mastery promotion logic for replacement behaviors (when does a replacement behavior count as "mastered"?)

## Architecture

### Schema additions

**Single small migration** `supabase/migrations/20260520_bcba_behavior_reduction.sql`:

```sql
-- Index for behavior dashboard charts: behavior_definition_id + timestamp for trend queries
CREATE INDEX IF NOT EXISTS idx_behavior_rec_def_time
  ON public.behavior_recordings(behavior_definition_id, timestamp DESC)
  WHERE superseded_by IS NULL;

-- Index for ABC analysis: antecedent + consequence FK lookups
CREATE INDEX IF NOT EXISTS idx_behavior_rec_antecedent
  ON public.behavior_recordings(antecedent_id)
  WHERE antecedent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_behavior_rec_consequence
  ON public.behavior_recordings(consequence_id)
  WHERE consequence_id IS NOT NULL;
```

No new tables. Just indexes for the chart queries.

### UI surfaces (all in `app.html`)

**Six new surfaces**, anchored on the existing client detail page:

#### A. Client detail — Behaviors tab (sibling to Programs)

The current client detail page from Foundation Task 11 shows Programs + Recent Sessions. #3 adds a tab switcher at the top: **[Programs] [Behaviors]**. Tapping Behaviors swaps the body to:

- Header row: "X behaviors defined · Y total recordings this month" + "**+ Add behavior**" button
- Two side-by-side cards:
  - **Challenging behaviors** — list of `behavior_definitions WHERE classification='challenging'`
  - **Replacement behaviors** — list of `classification='replacement'`
- Below: **Antecedents** + **Consequences** library cards with edit modal links
- Each behavior row shows: name, recording_type chip, total occurrences this month (or duration), "View dashboard →" link

#### B. Add / edit behavior modal

A modal accessed from the Behaviors tab. Same pattern as the targets modal from Foundation Task 12:
- Name (required)
- Operational definition (textarea, required, ≥20 chars)
- Recording type (frequency / duration / interval / abc / rate)
- Classification (challenging / replacement)
- Save / Archive / Cancel

For replacement behaviors, an optional "Pairs with" field that links to a challenging behavior_definition (this becomes the basis for future replacement-behavior progress charts).

#### C. Antecedent / Consequence library management

A single modal "Manage triggers and consequences" with two sections:
- Antecedents: list (name + scope: practice-wide or this-client-only) + add button
- Consequences: same shape

Add/edit flows are small inline forms. Scope picker is a 2-radio control (radio buttons: "Practice-wide" / "Just this client"). Maps to `behavior_antecedents.practice_id` vs `practice_client_id` (already CHECK-constrained at the DB level).

#### D. ABC entry upgrade (modifies #2's behavior overlay)

The Task 7 ABC entry stored antecedent + consequence as free-text in the `notes` field. #3 replaces this UI with FK pickers:

- **Antecedent** dropdown — populated from `behavior_antecedents WHERE (practice_id = current OR practice_client_id = current)`. "Other (free-text)" option preserves the prior pattern; "+ Add new" opens an inline create form.
- **Consequence** dropdown — same shape from `behavior_consequences`.
- Function category chips (unchanged from #2).
- Notes textarea retained for additional context.

When saving:
- If a library entry is selected: set `antecedent_id` / `consequence_id` FKs on the `behavior_recordings` row.
- If "Other" is used: write to `notes` (legacy pattern).
- Library reads handle both.

#### E. Behavior Dashboard (opens from "View dashboard" on a behavior row)

Full-screen overlay scoped to one behavior. Tabs:
- **Trend** (default) — line chart: x-axis = sessions over time, y-axis = total count (frequency), total seconds (duration), or % intervals occurred (interval). One SVG line, no overlays.
- **ABC** — three horizontal bar charts:
  - **Top antecedents** (sorted by frequency descending, top 5)
  - **Top consequences** (same)
  - **By function** (4 bars: tangible / escape / attention / sensory)
  - Each bar shows count + % of total
- **Recent** — list of last 30 `behavior_recordings` rows for this behavior with timestamps, observer, session date, raw data (count or duration or interval results).

A toggle at the top: "This behavior" / "All challenging behaviors combined" — switches the queries to aggregate across all `classification='challenging'` behaviors for the client.

#### F. Combined view (toggle in dashboard)

Same three tabs as the per-behavior dashboard but data aggregated across `behavior_definitions WHERE classification='challenging'` for the client. The Trend chart shows multiple SVG lines (color-coded per behavior). The ABC bars sum across behaviors.

### Chart implementation

All charts inline SVG, ~50-80 lines of JS per chart type. Reuses the sparkline pattern from #2's parent tab.

**Trend chart:**
- Container: 100% width × 200px height
- One `<path>` per series (one for single-behavior view, multiple for combined)
- X axis: time labels at start / middle / end (3 labels, not all 30 sessions)
- Y axis: 0, 50%, 100% for percentage data, or 0/max/2× for raw counts
- Tooltips on hover (simple title attribute)

**ABC bar chart:**
- Container: 100% width × variable height (one row per bar, 32px each)
- Each bar = horizontal rect with text label on left, count + % on right
- All bars normalized to longest bar = 100% width

### RLS posture

All new data flows through existing Foundation RLS — `behavior_definitions`, `behavior_antecedents`, `behavior_consequences`, `behavior_recordings` already have policies. No new policies needed.

The Behaviors tab respects the existing `is_practice_member` / `is_practice_bcba` gating: any member can read; only BCBAs can write definitions.

## Migration plan

1. Apply `20260520_bcba_behavior_reduction.sql` in Supabase Dashboard (just 3 indexes, fast)
2. No backfills required
3. No worker changes
4. App rollout: the new tab is additive — existing client detail surface stays exactly as is by default (Programs tab is the default).

## Success criteria

- BCBA can switch to Behaviors tab → add 3 challenging behaviors (frequency / duration / ABC) + 1 replacement behavior → manage antecedent/consequence libraries.
- During a session, ABC entry shows the dropdowns populated from the libraries; selecting one writes the FK; the recording row stores `antecedent_id` and `consequence_id`.
- Opening a behavior's Dashboard shows real charts driven by the session data — trend line, top antecedents bar chart, function category breakdown.
- "Combined view" toggle correctly aggregates across challenging behaviors.
- Performance: chart queries return within ~500ms for a client with 100 sessions worth of recordings.
- Zero regressions: trial entry, behavior overlay (frequency/duration/interval), session summary, IOA, cosign, parent My BCBA tab all still work.

## What unblocks after #3 ships

- **Sub-project #4 (Analysis & Reporting):** can now build the iconic per-target line graphs with phase change lines, technical indicators, and cross-client aggregate views. The chart infrastructure from #3 (SVG path rendering, axis labeling) is reusable.
- **Sub-project #5 (Documentation):** the SOAP auto-fill can pull both trial counts AND behavior trend summaries into the AI prompt for narrative generation.

## Open questions (recommendations attached)

1. **MO coding library.** Ensora has a separate library for motivating operations. Recommendation: defer to #4 as part of broader analytics features. MO is mostly relevant when the same EO/AO patterns repeat across many sessions — that's an analysis problem, not an entry problem.
2. **Locations library.** Ensora has it. Recommendation: defer indefinitely; `behavior_recordings.location` is already free-text and rarely-analyzed in practice.
3. **Replacement behavior pairing UI.** The "Pairs with" field on replacement behaviors is captured but the per-pair comparison view (challenging vs replacement trends side-by-side) lives in #4.
