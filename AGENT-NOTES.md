# Agent Notes — READ FIRST

**Last updated:** 2026-04-16

---

## 🚧 Active work in progress: Email Drips + Optimization Build

**10 of 20 tasks done. PAUSED at Phase 3 checkpoint.**

### If you (the agent) are being asked "what's next" or to continue work on Modern Village:

1. **First, check what branch this workspace is on:**
   ```bash
   git branch --show-current
   ```

2. **If not on `feat/email-drips-optimization`, ask the user whether they want to:**
   - **Resume the email drips build** → checkout `feat/email-drips-optimization`, read `docs/superpowers/plans/2026-04-16-email-drips-STATUS.md`, continue from Task 11
   - **Switch priorities** → see `docs/ROADMAP.md` and the build queue memory for other work (PC billing, iOS Capacitor wrap, etc.)

3. **If resuming, follow the STATUS doc's "Pick-up instructions" section exactly:**
   - Re-invoke `superpowers:subagent-driven-development` via the Skill tool
   - Dispatch Task 11 per the plan at `docs/superpowers/plans/2026-04-16-email-drips-and-optimization.md`
   - Remember the path-sandbox rule: subagent tool calls that use absolute paths starting with `/Volumes/` will fail with EACCES — always pass relative paths in subagent prompts

### Resume document

[docs/superpowers/plans/2026-04-16-email-drips-STATUS.md](docs/superpowers/plans/2026-04-16-email-drips-STATUS.md) — has the full task status, commit SHAs, deferred follow-ups, out-of-repo state (DNS/deploy/Resend inbound still pending), testing workflow reference, and rollback commands.

### Git state at pause

- Branch: `feat/email-drips-optimization`
- Latest tag: `drips-phase-3-done`
- 15 commits ahead of `main`
- worker.js changes NOT yet deployed to Cloudflare
- Supabase migration `20260416_email_drips_optimization.sql` IS applied to live DB

---

## Prior completed builds (historical reference — safe to ignore unless specifically asked)

### Medical Billing Module (2026-04-06/07, branch `medical-billing` — merged)

SQL migration + Billing tab in client detail with 4 summary cards (Pending/Submitted/Paid/Denied) and aging reports. Claims and payer_enrollments tables with RLS. See commit history for details.
