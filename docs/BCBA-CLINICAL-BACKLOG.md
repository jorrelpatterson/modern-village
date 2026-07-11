# BCBA Clinical Module — Backlog & Build Plan

From the 2026-07-11 full-app audit (two independent BCBA passes). This is the work that makes the BCBA module actually usable + trustworthy for **real, non-admin BCBA customers** — the current `is_admin` test accounts (Jorrel/Ariana/Mika) mask several of these.

**Blocker:** most fixes are in `app.html` (the BCBA module), which was mid-edit by the Apple-IAP thread. Execute this plan on a clean tree **after the IAP work is committed**. SQL-only items can go anytime.

Already done this session: offline-sync data-loss fix, children RLS (client names), cosign-visibility RLS (supervisors can read the note they cosign).

---

## P0 — product-breaking for real customers

1. **Session resume (mid-session refresh strands the session).** `openActiveSession` is only reachable from `beginSession`; the dashboard "active sessions" card routes every tap to `joinAsIoaObserver`, and an iOS webview reload loses `activeSession`, leaving the session `in_progress` forever with its trials never reaching a summary/SOAP/billing.
   - Fix: if `s.provider_id === S.practiceMember.id`, resume as **primary** (rehydrate each target's `trials_run`/`trial_index` from server counts); add a BCBA "close out / cancel session" action for sessions not in memory.

2. **Cosign can't see the SOAP note.** ✅ RLS fixed (2026-07-11). Verify the SOAP editor renders for a supervisor after applying the policy.

---

## P1 — clinical / billing integrity

3. **IOA (inter-observer agreement) math is wrong** (`renderSessionSummary` ~3666). Trials are fetched with no `ORDER BY` and paired by array position (`primary[i]` vs `ioa[i]`); a late-joining observer's counter restarts at 1, so the two arrays are systematically misaligned.
   - Fix: `select trial_index`, order by it, align by `trial_index` value (build `pByIdx` map). Deeper: stamp the IOA trial with the primary's current `trial_index` so they share a key. Also score on the full trial value (prompt_level + response), not `response` category alone.

4. **SOAP notes fabricate clinical claims** (`generateSoapFromSession` ~3912; `generateSessionNarrative` ~11108). The prompt asks for a "caregiver report" Subjective and "generalization/trend" Assessment that the count-only data can't support, so the model invents them; on parse failure the whole raw model output is dumped into the Objective field.
   - Fix: constrain the prompt to only the data provided; instruct "do not assert observations not in the data"; capture a real Subjective field (or state "no caregiver report recorded"); on parse failure show a retry state, never promote raw text into Objective.

5. **% correct == % independent, always** (trial entry ~4342). The UI only produces `independent+correct`, `prompted+prompted`, or `null+incorrect` — a prompted-but-correct response is unrepresentable, so acquisition is under-reported in prompt-fading programs.
   - Fix: after a prompt-level pick, ask correct/incorrect; define %correct vs %independent distinctly in the summary + graph.

6. **Tiered pricing isn't implemented** (worker.js checkout + app.html). One flat `STRIPE_PRICE_ID × patient_count`; no $39/$29/$19 graduated tiers, no $10 family-sub credit, and quantity is **never re-synced** when clients are added/discharged. Nothing locks the module on trial-end / `past_due`.
   - Fix: Stripe graduated-tier price + a worker route/webhook that updates subscription quantity on census change; gate writes on subscription state.

7. **Timezone shifts on clinical/billing dates.** `new Date(start_time).toISOString().slice(0,10)` for `session_date` (3992), `submitSession` (4054), annotations/phase-changes (5088/5114), intake/discharge — any session after ~5pm PT records **tomorrow's** date; `new Date('YYYY-MM-DD')` plots annotations a day **early**.
   - Fix: local-date helper (`getFullYear/Month/Date`) for writes; parse date-only strings as `+'T12:00:00'` (already done at 10132).

8. **Mastery criteria collected but never evaluated.** Targets never auto-advance; `first_trial_independent` has zero effect; the dashboard's `recentPct` micro-averages across sessions and mislabels it "mastery."
   - Fix: mastery evaluator (per-session % → last N consecutive ≥ threshold + first-trial rule) that suggests/sets promotion and writes `promoted_at`; relabel dashboard metric "recent avg %."

---

## P2 — correctness / usability

9. **Duplicate global function names** (`addStep`/`removeStep` at 5253/9309·5258/9320, `closeInviteModal` at 2667/9902). The routine-builder versions win, so the BCBA target task-analysis add/remove-step and the practice-invite Cancel are broken. Rename the BCBA ones.
10. **Trial corrections impossible.** Schema has `superseded_by` but no UPDATE policy on `trials` and the app never writes it. Add a BCBA-scoped UPDATE policy limited to `superseded_by` + an "undo last trial" button.
11. **Parent "My BCBA" shows all zeros.** `v_child_target_progress`/`v_child_sessions` use `security_invoker=on`, so their trial-count subqueries evaluate to 0 for parents. Convert to aggregate views/RPC that gate by WHERE clause instead of invoker RLS.
12. **`Rate` behavior type is a dead-end** (offered in the def modal, no entry mode). Implement a rate entry mode or hide the option.
13. **"Save & continue editing" saves nothing** (3764) — persist CPT/parent-present/notes on that button, or rename it.
14. **End-of-session race** — `confirmEndSession` renders the summary on a fixed 600ms timer after `flush()`; block until the queue is empty so SOAP isn't generated from undercounted trials.
15. **RBTs effectively can't use the product** — sidebar gates on `profiles.role='provider'` (needs NPI) and blocks the app until admin verification; RBTs can't start sessions. Gate the sidebar on `S.practiceMember` and allow RBT session starts (that's what cosign is for).
16. **Signed SOAP still editable via API** — "Providers update own notes" has no `signed_at IS NULL` guard. Verify no legit flow updates a signed note, then add the guard.
17. **Cosigned session not actually locked** — trials can still be inserted into a completed/cosigned session (offline queue posts directly). Gate trial inserts on session status.

---

## Suggested execution order (post-IAP-commit)
P0 (#1) → P1 clinical (#3, #4, #5, #8, #7) → billing (#6, its own effort with Stripe) → P2 cleanups (#9, #14, #15) → the rest. Verify each against a real (non-admin) practice-member login, not an `is_admin` test account.
