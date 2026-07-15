# Clinical rules — Ariana's answers + build spec

Answers received 2026-07-14. This is the source of truth for building backlog #5 (trial scoring) and #8 (mastery). Verbatim answers preserved; the build spec below is derived from them.

---

## Section A — trial scoring → LOCKED (and simpler than we proposed)

**Ariana, A1:** *"No. Prompted responses are always incorrect. Correct is only if it is independent. We should probably call correct 'independent'."*
**A3/A4:** *"% independent is the only number we care about because it's the only number insurance cares about."* / graph: *"independent."*
**A5:** *"Yes, love this"* (prompt-level breakdown).

### Build decisions (A)
1. **Do NOT add a correct/incorrect sub-tap.** Her model collapses outcomes to: **Independent = the only success; every prompted level and "incorrect" = not-independent.** Keep the current one-tap flow (Independent, or the prompt sheet, or Incorrect).
2. **Rename "correct" → "independent"** everywhere in the trial UI and summaries. (No DB migration needed — `%independent` is already computed from `prompt_level = 'independent'`, which is the canonical signal.)
3. **Remove the `% correct` column** from the session summary and anywhere else — it was always identical to `% independent`. Keep **`% independent` only.**
4. **Graph `% independent` only** (drop the planned secondary %correct line).
5. **Add a prompt-level breakdown** (counts + % of trials at each level: independent / verbal / gestural / partial physical / full physical / incorrect) on the session summary and the target graph — this is what visualizes prompt fading.

*Net: Section A needs no schema change — UI relabel, drop one column, add a breakdown.*

---

## Section B — mastery → LOCKED except B2

**B1 (threshold on):** independent.
**B3 (min trials/session):** *"5 is standard. Although this should be changeable. For example for a tooth brushing goal, we aren't going to make a kid brush their teeth 5 times in 2 hours."*
**B4 (first-trial-independent):** confirmed — the first trial of each of the N qualifying sessions must be independent (cold-probe retention).
**B5 (auto vs manual):** *"we should offer automatic or manual mastery settings for each goal. Manual should be default with the suggestion and required confirmation attached."*
**B6 (after mastery):** confirmed — move to maintenance, schedule probes at the configured frequency.
**B7 (failed maintenance):** *"flag for review."*

### Build decisions (B)
- **B1:** mastery threshold is measured on **% independent**.
- **B3:** add **`min_trials_per_session`** to each goal's mastery config, **default 5, editable down** (natural-environment goals like tooth-brushing may be 1–2). A session below the minimum does not count toward mastery.
- **B4:** `first_trial_independent` = the **first trial of each qualifying session** must be independent.
- **B5:** add per-goal **`mastery_mode: 'manual' | 'automatic'`, default `manual`.** Manual → surface a "ready for mastery review" suggestion and require BCBA confirmation before promoting. Automatic → promote as soon as criteria are met.
- **B6:** on promotion → `status = maintenance`, begin scheduling probes per `probe_frequency` / `probes_required`.
- **B7:** a mastered target that fails maintenance → **flag for review**, never auto-drop back to active.

---

## B2 — mastery model → RESOLVED (follow-up answered 2026-07-14)

**Follow-up answers:** Q1 model works. **Q2: "Average of trials per session would have to hit 80%"** (each session's own %independent must clear the bar — the *each-window* reading, not pooled-across-sessions). **Q3: weeks are wanted.** **Q4: no minimum sessions per pooled window** — the min-trials rule is enough on its own.

**Key simplification from Q2:** we do NOT need a separate `each` vs `aggregate` toggle. Every case collapses to **"N consecutive windows, each window's %independent ≥ threshold"** — the window is just the unit:
- a **session** window scores on its own trials → "each session ≥ 80%"  (her Q2)
- a **week / month** window pools all trials in that calendar period → "each month's average ≥ 80%"  (her B2 monthly example)

### Final mastery-criteria model (replaces flat `{response_pct, consecutive_sessions}`)
- `threshold_pct` — %independent bar (default 80)
- `window_type` — `session` | `week` | `month`
- `window_count` — N consecutive windows (e.g. 16 sessions, 2 months)
- `min_trials_per_window` — a window with fewer trials is **skipped, not failed** (default 5, editable down for natural-environment goals per B3; Q4: no separate min-sessions gate)
- `first_trial_independent` — if set, the first trial of each qualifying **session** must be independent (B4)
- `mastery_mode` — `manual` (default) | `automatic` (B5)

**Evaluator:** per window, %independent = independent trials ÷ all primary trials in that window; ignore windows below `min_trials_per_window`; mastery met when the most recent `window_count` qualifying windows are calendar-consecutive and each ≥ `threshold_pct` (plus the first-trial rule if set). Build-time edge calls (documented, not re-asked): empty/below-min windows are skipped rather than breaking the streak; `first_trial_independent` applies per session even inside week/month windows.

### Maintenance probing (Q5 + B6/B7) → configurable per goal
Q5: *"up to the BCBA … I like to probe 2–5 times per month … dropdown options."*
- `probe_frequency` (dropdown: weekly / biweekly / 2× month / monthly …) and `probes_required` — already on the target; surface as dropdowns.
- Probe passes when the opportunity is **independent** (default; single cold opportunity).
- Flag-for-review threshold is a per-goal dropdown (default: 2 consecutive failed probes). On trip → **flag for review, never auto-drop** (B7).

**Status: both #5 (scoring) and #8 (mastery) are fully specced. No further clinical input needed — remaining edges are engineering defaults.**

---

## Build status — 2026-07-14

**Shipped (app.html, no migration — mastery_criteria is jsonb, targets.status is unconstrained):**
- **#5 Section A:** %independent is the single score everywhere; %correct column removed; prompt-level breakdown (Ind/Vb/Gest/PP/FP/Inc) on session summary + target graph; SOAP generator + parent views aligned.
- **#8 mastery core:** per-goal criteria form (threshold · N · session/week/month · min-trials · manual/automatic · first-trial rule); `mvEvaluateMastery()`; target-graph mastery banner + Promote; auto-promotion for `automatic` goals; `checkMasteryForSession()` re-evaluates a session's targets on submit (auto-promote + "ready for review" nudge). Promotion writes `status='mastered'`, `promoted_at`, and a "Mastered" phase-change marker.

**Maintenance-probe engine (B6/B7/Q5) — SHIPPED 2026-07-14:**
- Promotion lands a target in `in_maintenance` (which the pre-session picker already offers), so it is probed by including it in a session — each trial is a probe opportunity.
- Criteria form adds a `2×/month` frequency and a `flag_threshold` dropdown (consecutive failed probes before flagging; default 2).
- `checkProbesForSession()` runs on submit: for each maintenance target worked, if the last `flag_threshold` probe sessions (since `promoted_at`) are all below the mastery %independent bar, it sets `status='needs_review'` + a "Maintenance flag" phase-change marker. Never auto-drops (B7).
- Probe pass = the probe session meets the mastery %independent bar (single-opportunity probe → independent = pass, per Q5).
- Surfaces: target-graph shows "Mastered · in maintenance · next probe due ~date" (`mvNextProbeDue`) and, when flagged, Return-to-treatment / Keep-maintaining (`setTargetStatus`); the practice dashboard shows a "Maintenance — needs review" card.

**Still deferred (minor):** a practice-wide "probes due soon" reminder list (per-target due date is already shown on each target's graph).
