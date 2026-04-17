# Agent Notes — READ FIRST

**Last updated:** 2026-04-16

---

## Email Drips + Optimization Build — LIVE in production (2026-04-17)

**18 of 20 tasks done. Parent drips + optimization layer DEPLOYED.** Cold sequences seeded as drafts awaiting Ariana's copy edits.

### Status summary

- **Worker version live:** `7743ef11-3a13-4208-afc9-86540c12f2ff` at `village-api.jorrelpatterson.workers.dev`
- **Cron:** 3am UTC daily
- **Branch:** `feat/email-drips-optimization` — NOT yet merged to main (open question: merge now or after Task 19 E2E)
- **Tags:** `drips-deployed` (current), `drips-phase-5-done` (pre-deploy), `drips-phase-3-done`, `drips-phase-2-done`, `drips-phase-1-done`

### If you (the agent) are being asked "what's next" on Modern Village:

**Check build queue memory first** (`project_build_queue.md`) — the top of stack is up-to-date.

Current priorities:
1. Email drips build — essentially DONE except Ariana editing BCBA copy (not an agent task) and a final E2E smoke once she activates (Task 19, gated)
2. PC Billing Phase 2a+2b (Parent Consultation, CPT 97156) — biggest revenue lever, unblocked
3. iOS Capacitor wrap + push notifications — Apple dev account acquired 2026-04-16
4. My Village map view + local resources

### For the email drips build specifically

[docs/superpowers/plans/2026-04-16-email-drips-STATUS.md](docs/superpowers/plans/2026-04-16-email-drips-STATUS.md) has the full state, commit SHAs, deferred follow-ups, and resume instructions.

**If Ariana has edited BCBA copy and user wants to run Task 19:** the STATUS doc's "If resuming AFTER Ariana has edited" section has the exact steps.

**Deferred follow-ups to schedule later** (tracked in STATUS doc): HTML escape user-provided names in email bodies, upgrade Claude model ID from `claude-sonnet-4-20250514` to `claude-sonnet-4-6`, add List-Unsubscribe header for Gmail/Yahoo compliance.

### Path-sandbox rule for any subagent dispatches

Absolute paths starting with `/Volumes/` fail with EACCES. Always pass relative paths in subagent prompts. Include this header on every subagent dispatch:
```
## Path rules
Working directory: `/Volumes/Alexandria/AI Projects/modern-village`. Use RELATIVE paths only — absolute paths starting with `/Volumes/` fail with EACCES.
```

---

## Prior completed builds (historical reference — safe to ignore unless specifically asked)

### Medical Billing Module (2026-04-06/07, branch `medical-billing` — merged)

SQL migration + Billing tab in client detail with 4 summary cards (Pending/Submitted/Paid/Denied) and aging reports. Claims and payer_enrollments tables with RLS. See commit history for details.
