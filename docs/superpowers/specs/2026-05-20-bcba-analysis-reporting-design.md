# BCBA Data Collection — Analysis & Reporting (sub-project #4)

**Date:** 2026-05-20
**This spec covers:** sub-project #4 of 6 — the iconic BCBA chart (per-target line graph with phase change lines + average overlay), per-practice Analysis Dashboard, and cross-client behavior trends.
**Depends on:** #1 (Foundation) + #2 (Live Data Entry) + #3 (Behavior Reduction) — all shipped to main.

## Locked decisions

| Decision | Choice |
|---|---|
| Where the target line graph lives | New "View graph" button on each target card in the Targets editor, opens a full-screen overlay |
| Phase change line management | New `phase_changes` table, full CRUD from the graph view |
| Technical indicators v1 | **Average overlay** + **mean-of-day connector** only. Trend line, std dev, cumulative deferred |
| Analysis Dashboard scope | Practice-wide overview: targets needing reassessment, best/worst performers, client mastery summary, RBT trial volume |
| Chart implementation | Inline SVG (extends #3 pattern). No chart library |
| Export | Deferred. Browser print + screen capture is the v1 workflow |

## Goals

- A BCBA can open any target → see a full line graph with axes, dates, % correct per session, **vertical phase change lines** that visually anchor the data to clinical events (BIP change, target promoted, etc.).
- Toggle an average overlay to compare current performance to running mean.
- New sidebar item "Analysis" gives the practice owner a single-screen overview of caseload health: which targets are stuck, who's working what, where to intervene.

## Non-goals

- Trend regression line, std dev band, cumulative count overlay → polish pass
- Annotations on individual data points → polish pass
- PDF export → polish pass
- Cross-client target-level comparisons ("compare Maya's manding to Elijah's") → not for v1
- Custom date range picker on charts (defaults to all data; user uses browser zoom for now)

## Architecture

### Schema additions

```sql
-- ═══════════════════════════════════════════════════
-- BCBA Data Collection — Analysis & Reporting (sub-project #4)
-- 2026-05-20
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.phase_changes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  target_id uuid REFERENCES public.targets(id) ON DELETE CASCADE NOT NULL,
  occurred_at date NOT NULL,
  label text NOT NULL,
    -- e.g. 'BIP change', 'Target promoted', 'Reinforcer changed'
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

-- Index for "targets needing reassessment" query
CREATE INDEX IF NOT EXISTS idx_targets_in_treatment
  ON public.targets(program_id, status, promoted_at)
  WHERE status IN ('baseline','in_treatment');
```

### UI surfaces

**4 new surfaces** added to `app.html`:

#### A. Target graph view (per-target)

Opens from a new "View graph" button on each target card in the Targets editor (`renderTargets` from Foundation Task 12). Full-screen overlay shows:

- Header: target name + back button
- **Line chart** (inline SVG, ~600×360 px, responsive width):
  - X-axis: session dates (auto-spaced)
  - Y-axis: % correct (0-100%)
  - One blue line + circles per data point
  - **Vertical dashed red lines** at each `phase_changes.occurred_at` with the label text at top
  - **Horizontal sage line** for running average (toggle on)
  - **Mean-of-day connector** (toggle on) — when multiple sessions occur same day, connect their averages as a separate line
- Below chart: legend + 3 toggle buttons: "Show average" / "Show mean-of-day" / (placeholder "Trend line — coming soon")
- Below toggles: **Phase changes** list with add/edit/remove (BCBA only)

#### B. Phase change modal

Small modal: occurred_at date picker, label text, optional notes. Add or edit. Delete with confirm.

#### C. Analysis Dashboard (new sidebar item)

New sidebar item **"Analysis"** for practice members (any role can view; BCBA-only insights flagged). Full overlay page showing four cards:

1. **Targets needing reassessment** — `in_treatment` for >30 days with recent % correct <80%. Top 10. Each row clicks through to the target graph.
2. **Best performing targets** — top 5 by recent (last 5 sessions) % correct. Quick wins to celebrate or promote.
3. **Worst performing targets** — bottom 5 by recent % correct. Where to intervene.
4. **RBT activity** — trial counts per `practice_member` over last 30 days. Caseload distribution check.

#### D. Cross-client behavior trends

A second tab on the Analysis Dashboard ("Behaviors"). Cross-client total behavior occurrences over time — one stacked line per practice_client, or a single aggregated line. Lets the BCBA scan "is challenging behavior trending up across my caseload?"

### RLS

All new queries route through existing Foundation policies. The new `phase_changes` table has its own scoped RLS. No new helper functions.

## Migration plan

1. Apply `20260521_bcba_analysis_reporting.sql` in Supabase Dashboard.
2. No backfills, no worker changes.
3. App: new sidebar item gates on `S.practiceMember`.

## Success criteria

- Open Maya → Manding Training → click "View graph" on a target → full chart renders with all sessions, average overlay works, mean-of-day connector works.
- Add a phase change at a past date → vertical dashed red line appears at that x-coordinate with the label.
- Open sidebar → Analysis → see practice-wide insights with real data.
- No regressions in Targets editor, Behavior Dashboard from #3.

## Open questions (recommendations attached)

1. **"Recent" window for best/worst.** Last 5 sessions or last 14 days? Recommendation: last 5 sessions (data-density-based, fairer for clients with low session frequency).
2. **Mean-of-day vs cumulative — which is more clinically useful?** Recommendation: mean-of-day for v1 because BCBAs commonly look at session-day averages, not running totals.
