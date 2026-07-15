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

## STILL OPEN — B2 (blocks the mastery evaluator)

**Ariana, B2:** *"That depends on how the goal is written. Every BCBA will write them differently. Some will write '80% across 2 consecutive months' which means the average data for each month would have to be 80% or higher for mastery. Some will write '80% across 16 consecutive sessions'."*

This is the one answer that doesn't fully resolve. It tells us mastery is **not one fixed rule** — there are at least two goal-writing shapes:
- **Session-based:** "80% across 16 consecutive sessions"  (each session? or the average of 16? — she didn't say)
- **Period-based:** "80% across 2 consecutive months"  (confirmed: the *aggregate/average* within each month must be ≥ threshold)

So the earlier "averaging is a bug" framing was too simple: **averaging is the correct model for the monthly-goal style, and per-session is correct for the session style.** The app has to let the BCBA pick, not hardcode one.

### Proposed structured model (needs Ariana to confirm — see follow-up)
Replace the flat `{response_pct, consecutive_sessions}` with:
- `threshold_pct` — e.g. 80
- `window_type` — `sessions` | `weeks` | `months`
- `window_count` — N consecutive windows
- `evaluation` — `each` (every window ≥ threshold) | `aggregate` (pool the window's trials into one %)
- `min_trials_per_window` — default 5 (from B3)

This covers both of her examples:
- "80% / 2 consecutive months, monthly average" → threshold 80, months, 2, **aggregate**
- "80% / 16 consecutive sessions" → threshold 80, sessions, 16, **each** *or* **aggregate** (default TBD)

Once B2 + the maintenance-probe definition are confirmed, both features build directly from this doc.
