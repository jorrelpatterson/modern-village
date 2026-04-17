# Email Drips + Optimization — Session Resume Status

**Last updated:** 2026-04-16 (end of Phase 3)
**Branch:** `feat/email-drips-optimization`
**Plan:** [2026-04-16-email-drips-and-optimization.md](2026-04-16-email-drips-and-optimization.md)
**Spec:** [../specs/2026-04-16-email-drips-and-optimization-design.md](../specs/2026-04-16-email-drips-and-optimization-design.md)

---

## Progress: 10 of 20 tasks done (50%)

```
Phase 1: Foundation              [✓✓]           Tag: drips-phase-1-done
Phase 2: Parent drips            [✓✓]           Tag: drips-phase-2-done
Phase 3: Optimization foundation [✓✓✓✓✓✓]      Tag: drips-phase-3-done  ← YOU ARE HERE
Phase 5: Cold B2B sequences      [··········]
Phase 6: Admin UX                [···]
Phase 7: Verification + docs     [··]
```

Note: no Phase 4 — Phase 3 IS "optimization foundation," Phase 5 follows.

---

## How to resume in a new session

### 1. Read this file first, then the plan

```bash
cat docs/superpowers/plans/2026-04-16-email-drips-STATUS.md
cat docs/superpowers/plans/2026-04-16-email-drips-and-optimization.md
```

### 2. Confirm git state

```bash
git checkout feat/email-drips-optimization
git log --oneline drips-phase-3-done..HEAD     # should show NOTHING if we stopped cleanly here
git log --oneline main..HEAD | wc -l           # should show 14 commits
```

### 3. Start at Task 11

Plan Task 11 is at [the plan doc around line 1200](2026-04-16-email-drips-and-optimization.md#task-11-update-sequence-step-format-variants-array-backward-compat).

Re-invoke the subagent-driven-development skill via the Skill tool, then dispatch Task 11 following the plan's exact spec.

### 4. Apply this path rule to every subagent dispatch

**The sandbox blocks absolute paths starting with `/Volumes/`.** Write agent prompts with a path-rules header like:
```
## Path rules
Working directory: `/Volumes/Alexandria/AI Projects/modern-village`. Use RELATIVE paths only — absolute paths starting with `/Volumes/` fail with EACCES.
```

Every subagent dispatch in this build has included this header. Don't forget it.

---

## What's been done

### Phase 1: Foundation (tag `drips-phase-1-done`)

| Task | Commit | Summary |
|------|--------|---------|
| 1. Schema migration | `08a4ddc` + fix `8f8c4d5` | All new columns + `email_send_queue` table. Applied to Supabase ✅ |
| 2. Resend subdomain setup docs | `ccb33cc` | [docs/legal/RESEND-SUBDOMAIN-SETUP.md](../../legal/RESEND-SUBDOMAIN-SETUP.md) — DNS/secrets/inbound webhook setup |

### Phase 2: Parent drips (tag `drips-phase-2-done`)

| Task | Commit | Summary |
|------|--------|---------|
| 3. Screener D3/7/10 | `b104bf4` + fix `c45c10c` | New cron block for 3 additional emails after screener Day 0; fix = dropped created_at lower bound + unsubscribe_token guard |
| 4. Re-engagement 7/14/21 | `b2eabbf` + fix `f8952d7` | Replaced single-email re-engage with 3-email progressive sequence; fix = step-3 reset trap (users at step 3 now can re-enter sequence after reactivating) |
| *docs* | `9a36a82` | Added [docs/TESTING-GUIDE.md §11](../../TESTING-GUIDE.md) — phase checkpoint testing workflow (wrangler dev + seed rows pattern) |

### Phase 3: Optimization foundation (tag `drips-phase-3-done`)

| Task | Commit | Summary |
|------|--------|---------|
| 5. Resend inbound webhook | `c88d327` | New `/webhook/resend-inbound` endpoint — matches replies to `campaign_sends` via In-Reply-To header, marks `replied_at` |
| 6. Conversion attribution | `c37d41c` + fix `985cf3a` | `attributeConversion()` helper + daily cron block attributes signups/bookings/Pro upgrades. Fix = split try/catch per sub-block for resilience |
| 7+8. Bandit + reward | `e7eca5c` | Batched together: Thompson sampling (`sampleBeta`, `pickVariant` with cold-start), reward function (opens=1, clicks=5, replies=10, conversions=100), posterior update |
| 9. Send-time learning | `c86686f` | Daily rollup of `leads.best_open_hour` from last 30 days of opens (min 3 opens per lead) |
| 10. Auto-promote winners | `22b3e62` | Replaced old optimizer cron: sequence-aware, 90% Bayesian win gate via 1000 Thompson samples, 50+ sends/variant minimum, Claude challenger auto-deploys by mutating `sequence_steps` |

---

## What's NOT yet done

### Phase 5: Cold B2B sequences (Tasks 11-15)

| Task | What it does |
|------|-------------|
| 11. Variant-aware sequence processor | Updates worker.js:881-960 to pick variant via bandit, support per-step `variants[]` array (with backward compat to legacy `subject`/`html` single-variant format) |
| 12. Cold send queue processor | New cron block that drains `email_send_queue` per-cohort respecting `daily_cap`, creates `sequence_enrollments` idempotently |
| 13. Auto-enroll trigger | Postgres trigger on `leads` INSERT — when new lead has cohort, auto-enqueue Day 0 in `email_send_queue` |
| 14. Bounce-rate guard | Auto-pauses cohort if 24hr bounce rate > 5%, logs, emails Jorrel |
| 15. Seed cold campaigns | Migration loads BCBA/District/RC as `status='draft'` 9-step sequences with placeholder `[DRAFT — edit in admin]` subjects |

### Phase 6: Admin UX (Tasks 16-18)

| Task | What it does |
|------|-------------|
| 16. Sequence editor with variants | admin.html — extend existing sequence builder to support multiple variants per step (A/B/C/...) |
| 17. Cohort dashboard | admin.html — per-cohort stats: queue depth, daily cap progress, bounce/open/click/reply/conversion rates, auto-paused warnings, bandit posteriors |
| 18. Optimization log + queue manager | admin.html — log viewer for recent winner_picked / new_variant_generated / auto_paused events + queue manager (bump priority, pause cohort) |

### Phase 7: Verification + docs (Tasks 19-20)

| Task | What it does |
|------|-------------|
| 19. End-to-end smoke | Manual: apply all migrations, set DNS + wrangler secrets, edit BCBA Day 0 copy with Ariana, activate campaign, seed 10 test leads, run cron, verify inbox + campaign_sends rows |
| 20. Update ROADMAP/SUPPLEMENTARY/TESTING-GUIDE | Final doc pass |

---

## Deferred follow-ups (from code review — NOT in plan)

Tracked so we don't forget. None of these block the current build.

1. **HTML escape `{NAME}` substitutions across all email blocks** — cross-cutting security pass. Welcome sequence, screener follow-up, re-engagement, cold sequences all inject user-provided names into HTML bodies without escaping. Low-probability XSS/phishing vector. Write an `escapeHtml()` helper, apply everywhere.

2. **Upgrade Claude model ID** — worker.js currently uses `claude-sonnet-4-20250514` (dated pattern from earlier code) for optimizer and community strategy ranking. Should upgrade to `claude-sonnet-4-6` consistently. Two call sites in worker.js around lines 658 and 1511.

3. **Add List-Unsubscribe header to marketing emails** — Gmail/Yahoo bulk-sender compliance. Add `headers: { 'List-Unsubscribe': '<' + unsubUrl + '>' }` to Resend POST payloads.

4. **UTC-vs-local day boundaries** — `cutoff.toISOString().split('T')[0]` in various cron blocks uses UTC date math. For U.S.-facing product this can feel off by a day. Low priority.

5. **Add `subscription_started_at` column to `profiles`** — attribution currently uses `updated_at` as a proxy for Pro signup time. Dedicated column would be more accurate. Requires Stripe webhook integration.

6. **N+1 query in re-engagement** — per-user `behavior_logs` lookup in a loop. Fine at current scale; rewrite as single `distinct user_id` query + in-memory set diff when cohort grows past 10K parents.

7. **Activity-reset race** — re-engagement reads `behavior_logs` then calls Resend ~ms apart. Theoretically a user could log activity between check and send, getting an email they shouldn't. Real-world impact negligible.

---

## Environment state (out-of-repo actions)

| Action | Status | Notes |
|--------|--------|-------|
| Migration `20260416_email_drips_optimization.sql` applied to live Supabase | ✅ Done | Jorrel confirmed ran |
| Resend subdomain DNS setup (`bcba.outreach`, `district.outreach`, `rc.outreach`) | ⏳ Not started | Blocks Phase 5 cold sequence ACTIVATION, not Phase 5 BUILD. See [docs/legal/RESEND-SUBDOMAIN-SETUP.md](../../legal/RESEND-SUBDOMAIN-SETUP.md) |
| Wrangler secrets (`SENDER_BCBA`, `SENDER_DISTRICT`, `SENDER_RC`, `SENDER_TRANSACTIONAL`) | ⏳ Not started | Same — needed before activating cold sequences |
| Deploy worker.js to Cloudflare | ⏳ Not deployed | Phase 2 code is in branch but not live. Deploy at next checkpoint or end of build |
| Resend inbound webhook configured in Resend dashboard | ⏳ Not started | Needed to make reply tracking work in prod (endpoint exists, just needs Resend to POST to it) |

---

## Testing workflow reference

Before deploying worker.js changes: [docs/TESTING-GUIDE.md §11](../../TESTING-GUIDE.md) — "Phase Checkpoint Testing"

Steps summarized:
1. Pre-flight SQL: check who would be emailed if cron ran now
2. Seed test leads matching cron filters
3. `npx wrangler dev --test-scheduled` + `curl http://localhost:8787/__scheduled?cron=...`
4. Verify inbox + Supabase state advanced
5. Clean up test rows
6. `wrangler deploy`

---

## Rollback commands

```bash
# Discard branch entirely
git checkout main
git branch -D feat/email-drips-optimization

# Revert to a specific checkpoint
git reset --hard drips-phase-1-done   # back to foundation only
git reset --hard drips-phase-2-done   # back to parent drips
git reset --hard drips-phase-3-done   # back to current state

# If deployed and needs rollback
wrangler rollback
```

---

## Pick-up instructions (literal)

Paste this into a new session after `git checkout feat/email-drips-optimization`:

> I'm resuming the email drips + optimization build at the Phase 3 checkpoint (tag `drips-phase-3-done`). Status doc: `docs/superpowers/plans/2026-04-16-email-drips-STATUS.md`. Plan: `docs/superpowers/plans/2026-04-16-email-drips-and-optimization.md`. We're 10 of 20 tasks done. Next up: Task 11 (variant-aware sequence processor) kicking off Phase 5. Use the subagent-driven-development skill. Remember the path rule: sandbox blocks absolute paths starting with `/Volumes/`, always use relative paths in subagent prompts.
