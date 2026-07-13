# BCBA Clinical Module — Backlog & Build Plan

From the 2026-07-11 full-app audit (two independent BCBA passes). This is the work that makes the BCBA module actually usable + trustworthy for **real, non-admin BCBA customers** — the current `is_admin` test accounts (Jorrel/Ariana/Mika) mask several of these.

**Blocker:** most fixes are in `app.html` (the BCBA module), which was mid-edit by the Apple-IAP thread. Execute this plan on a clean tree **after the IAP work is committed**. SQL-only items can go anytime.

Already done (2026-07-11): offline-sync data-loss fix, children RLS (client names), cosign-visibility RLS (supervisors can read the note they cosign).

## Status update — 2026-07-12 (shipped this session)

- ✅ **#1 Session resume (P0)** — dashboard routes the primary to `resumeActiveSession`; `openActiveSession` rehydrates trials_run/correct/step_idx from the server so a reloaded session continues instead of stranding.
- ✅ **#14 End-of-session race** — `drainThenSummary` loops `flush()` until the queue is empty (cap 8s) before opening the summary/SOAP, so it isn't generated from undercounted trials.
- ✅ **#3 IOA math** — observer now stamps the primary's `trial_index`; summary pairs by index value and scores on prompt_level+response. ⚠️ needs a two-device IOA test + Ariana review before relying on the numbers.
- ✅ **#7 Timezone** — `mvLocalDate()` for all date-only writes.
- ✅ **#9 Duplicate function names** — BCBA `addStep`/`removeStep` → `addTaStep`/`removeTaStep`; practice-invite `closeInviteModal` → `closeMemberInviteModal`.
- ✅ **#13 Save & continue editing** — now persists CPT/parent-present via `saveSessionDetails`.
- ◑ **#8 (partial)** — relabeled the "recent mastery" metric to "recent average correct"; the auto-advancing mastery evaluator is still TODO (needs Ariana's criteria).
- ✅ **#16 Signed-SOAP lock** — migration `20260712_bcba_soap_signature_lock.sql` written and **run in Supabase (2026-07-12)**.
- ✅ **#15 RBT access** — practice tools now gate on membership (`S.practiceMember`), not `profiles.role`, so RBTs reach the module and can start/record sessions; per-role write actions and RLS are unchanged.
- ✅ **#11 Parent "My BCBA" zeros** — migration `20260712_bcba_parent_progress_views.sql` written and **run in Supabase (2026-07-13)**. Flips the two aggregate views to run as owner with an explicit access WHERE (`user_has_child_access` / `is_practice_member` / `is_admin`), so parent trial/behavior counts are no longer forced to 0 by invoker RLS.
- ⏸ **#17 Cosigned-session trial lock — DEFERRED.** A naive RLS gate returns 403, which the offline queue treats as "auth expired, retry forever," jamming the queue. Fix the offline flush to distinguish a permanent RLS block from a transient 401/403 first, then gate inserts on `status <> 'cosigned'`.
- ⏸ **#12 Rate behavior type** — left as-is: the def modal reuses the type `<select>` for editing (sets `bdmType.value` from an existing def), so removing the option would silently retype existing rate defs to "frequency". Implement a rate entry mode or render the option conditionally instead.

**Still open:** #4 (SOAP fabrication — verify prior partial fix), #5 (%correct vs %independent — trial-entry UX change), #8-full (mastery evaluator), #6 (tiered pricing — needs Stripe), #10 (undo last trial — needs trials UPDATE policy).

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
