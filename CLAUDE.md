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
