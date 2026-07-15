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


## os.jorrel.io — approved dev requests

When os.jorrel.io approves engineering work for this project, it lands in this project's
`jorrel-os.json` under `current.dev_requests[]` (written by the local `scripts/dev-requests.ts`
bridge in the jorrel-os repo). Treat any entries there as approved, ready-to-build intake —
each carries a brief and the originating discussion thread. After acting on one, you may clear
it from `current.dev_requests[]` (merge-only).


## "Save everything" — end-of-session

"Save everything" is Jorrel's phrase to wrap a session. It does NOT change your normal
rules — it just makes sure the work is saved and the os.jorrel.io dashboard reflects it.
Three things:

1. **Save your work the normal way.** If a MASTER-BRIEFING.md exists at the "Ai Projects/"
   root, follow it exactly — it governs commits (show diffs, get Jorrel's approval; do NOT
   auto-commit) and says `jorrel-os.json` is MERGE-ONLY. This note never overrides that.
2. **Update this project's `jorrel-os.json` — MERGE-ONLY.** Touch ONLY these keys:
   `current.next_action`, `current.blockers`, `current.completed_today`,
   `current.last_session` (today's date YYYY-MM-DD). Leave every other key exactly as-is —
   this file may have extra keys (`phases`, `setup`, `urls`, etc.); do not touch them, do not
   reshape the file. This file is the durable record.
3. **Refresh the live dashboard card** — this is separate from the file; one call, instant,
   no deploy:

```
curl -X POST https://os.jorrel.io/api/report \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"project_id":"modern-village","next_action":"<next concrete step>","blockers":["..."],"completed":["what shipped this session"]}'
```

`$CRON_SECRET` is in the jorrel-os repo's `.env.local` (a sibling folder under "Ai Projects/").
Send only the fields that changed. `project_id` MUST be `modern-village`.

Why both step 2 and step 3: step 2 (the file) is the permanent record; step 3 (the curl) is
what makes the live card update instantly without a deploy. They are not redundant — do both.
