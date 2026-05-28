# Modern Village — agent onboarding

**Read `SESSION_HANDOFF.md` at the repo root before doing anything else.** That doc is the canonical, up-to-date status of this project: what's been built, what's pending, who Ariana is, where prod runs, codebase conventions, and how to resume work.

After reading it, you have full context to pick up where the last session left off.

## Quick reference

- Working dir: `/Volumes/(626)806-4475/Ai Projects/modern-village` (external drive)
- Single-file app: `app.html` (vanilla HTML/JS, no build step)
- Admin panel: `admin.html`
- Worker proxy: `worker.js` (deployed to Cloudflare as `village-api`)
- Migrations: `supabase/migrations/`
- Prod URL: https://www.modernvillage.app (Vercel auto-deploy from `main`)

## Style guardrails (full details in SESSION_HANDOFF.md)

- Use `var` (not `let`/`const`), inline `onclick`, `\x27` for embedded single quotes inside double-quoted onclick attributes
- **Never** write `\\x27` — it renders as literal `\x27` in the HTML attribute and breaks the click handler. This bit us on 2026-05-19.
- Don't redesign the schema; build new surfaces on top.
- iOS/Capacitor caches HTML aggressively — always remind users to hard-refresh after a deploy.

## Active workstream (2026-05-27)

- **NSF SBIR Phase I pitch** — draft at [docs/GRANTS-NSF-SBIR-PITCH.md](docs/GRANTS-NSF-SBIR-PITCH.md), waiting on Ariana's clinical review, then submit once the Jun 2, 2026 portal reopens. See SESSION_HANDOFF.md for the full audit (the playbook's old foundation-grant lineup was wrong for a for-profit LLC — most autism foundations require 501(c)(3)).
- **Grant strategy:** SBIR (NSF + NIH) are the realistic for-profit paths. Do NOT propose OAR / Caplan / Flutie / Autism Speaks / NEXT for AUTISM as direct applicants for Modern Village — those require a 501(c)(3) partner-model. Audit details in [docs/MARKETING-PLAYBOOK.md](docs/MARKETING-PLAYBOOK.md) §"Client Type 6".
