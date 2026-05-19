# Session Handoff — 2026-05-19

Single source of truth for picking up the BCBA module work on a new machine. Read this first.

## How to resume

1. Open this repo (external drive should mount at `/Volumes/(626)806-4475/Ai Projects/modern-village`)
2. `git pull` to sync the latest from `origin/main`
3. Re-read this file + the latest commits to catch up

The auto-memory at `~/.claude/projects/-Volumes--626-806-4475-Ai-Projects-modern-village/memory/` lives on the old laptop, not on the external drive. If you want it on the new laptop, copy that directory over manually. Otherwise this doc is the canonical state.

## What's running in production

- Web: https://www.modernvillage.app (Vercel auto-deploy from `main`)
- API: `village-api` Cloudflare Worker — https://village-api.jorrelpatterson.workers.dev/
- DB: Supabase Postgres + Storage
- iOS: Capacitor wrapper loading `server.url = https://modernvillage.app/app.html`

## BCBA module status (Ensora competitor)

Sub-projects 1–5 plus Stripe v1, graph polish, document storage, multi-CPT auths all shipped. The module is functionally usable for a solo/small-practice BCBA today.

| # | Sub-project | Status |
|---|---|---|
| 1 | Foundation (schema + admin setup) | ✅ shipped |
| 2 | Live Data Entry (sessions, trials, IOA, cosign, parent My BCBA, offline sync) | ✅ shipped |
| 3 | Behavior Reduction (Behaviors tab, ABC, dashboards) | ✅ shipped |
| 4 | Analysis & Reporting (per-target line graphs, phase changes, cross-client analysis) | ✅ shipped |
| 5 | SOAP Auto-fill (4-section editor, Claude generation, sign & submit) | ✅ shipped |
| 6 | Curriculum (Ariana-authored Starter Library + AI target authoring + CSV import) | ⏭️ next |

Also shipped on top: per-patient Stripe billing v1, graph polish (trend line + SD band + annotations + Print/PDF), client document storage (Supabase Storage), insurance Client ID + payer fields, pending-email invites, parent-lookup SECURITY DEFINER RPC, multi-CPT authorizations (`practice_client_authorizations` table), `+` / `−` trial entry, role gating fix for sub-admin VAs.

## What Ariana asked for and where it landed

Ariana is the design partner — Trabuco Canyon BCBA, runs her own PC practice. Her feedback drives priorities.

| Item | Status | Commit |
|---|---|---|
| Can't click into clients (dead onclick) | ✅ fixed | `b22e42f` |
| Multi-CPT (97151/97153/97155/97156) checkboxes on Add Client | ✅ shipped | `6c0373e` |
| Per-CPT weekly hours authorized | ✅ shipped | same commit |
| `+` / `−` trial entry instead of 6-button grid (Verbal/Gestural/Partial physical/Full physical/Incorrect under `−`) | ✅ shipped | `19c5766` |
| Practice settings should be per-goal | ⚠️ partial — mastery already per-target; added explainer line. Still need her to say which other fields she wants per-goal | `6c0373e` |
| Insurance Client ID as a field | ✅ shipped | `de35738` |
| Parent email lookup broken | ✅ shipped (SECURITY DEFINER RPC) | `c55e04b` |

## Operational TODOs the user (Jorrel) still owes

- [ ] Create Supabase Storage bucket `practice-client-documents` (private). Required for document upload UI to work end-to-end. Run the storage policies from `supabase/migrations/20260525_bcba_client_documents.sql` after creating the bucket.
- [ ] Apply earlier migrations if any are still missing — query to check:
  ```sql
  SELECT
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='target_annotations') AS m_20260524,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='practice_client_documents') AS m_20260525,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='practice_clients' AND column_name='insurance_client_id') AS m_20260526_insurance,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='practice_client_authorizations') AS m_20260527;
  ```
- [ ] Stripe Dashboard: create Product + Price, add 3 secrets to the Worker (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`). Only needed before charging real money.
- [ ] Ask Ariana what else under "per-goal settings" she wants beyond mastery criteria.

## Migrations applied to prod (in order, all confirmed by user)

```
20260518_bcba_data_collection_foundation.sql
20260518_bcba_starter_library_seed.sql
20260519_bcba_live_data_entry.sql
20260520_bcba_behavior_reduction.sql
20260521_bcba_analysis_reporting.sql
20260521_bcba_pending_invites.sql
20260522_bcba_soap_autofill.sql
20260523_bcba_stripe_billing.sql
20260524_bcba_target_annotations.sql       (applied 2026-05-19)
20260525_bcba_client_documents.sql
20260526_bcba_insurance_client_id.sql
20260526_bcba_parent_lookup_rpc.sql
20260527_bcba_client_authorizations.sql    (applied 2026-05-19)
```

## Codebase landmarks

- `app.html` — single-file vanilla HTML/JS app, ~12k lines. No build system. Style: `var` (not let/const), inline `onclick`, `\x27` for single quotes inside double-quoted onclick attribute values. Avoid `\\x27` (renders as literal `\x27` and breaks the handler — burned by this on 2026-05-19).
- `admin.html` — admin panel (has the Feedback tab where Ariana's submissions land — see `loadFeedback()`)
- `worker.js` — Cloudflare Worker proxy for Anthropic API + Supabase admin endpoints + Stripe webhooks
- `supabase/migrations/` — every schema change. Idempotent (`IF NOT EXISTS` / `ON CONFLICT`).
- `sw.js` — service worker. Network-first for HTML, cache-first for static. iOS Safari/Capacitor still caches aggressively — always tell users to hard-refresh after a deploy.
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — design + implementation history per sub-project.

## Build / deploy

- Vercel auto-deploys `main` → `www.modernvillage.app`. Static site, no build step. Build queue is shared across all your projects; if a deploy seems stuck, check for an `ascnd-platform` build "Initializing" and cancel it.
- Worker: `wrangler deploy` from repo root pushes `worker.js`.
- iOS app: from `ios/App/`, open in Xcode → Archive → upload to TestFlight.

## Local files that DO NOT travel via git (must stay on external drive)

These are in `.gitignore` deliberately — they're either secrets or per-machine state:

- `AuthKey_*.p8` — Apple Push Notification keys (sensitive!)
- `wrangler.toml` — Cloudflare config (secrets stored via `wrangler secret put`, but conservative to keep out of git)
- `jorrel-os.json` — local project metadata
- `.claude/` — Claude Code per-project settings
- `supabase/.temp/` — Supabase CLI scratch
- `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/` — Xcode package state

If you move to a new machine and your external drive is mounted, these are already there. If you ever clone fresh from GitHub, you'll need to recreate them.

## Test accounts

- testprovider / TestProvider123!  (BCBA — practice owner role)
- testparent / TestParent123!
- testcaregiver / TestCaregiver123!

## Strategic posture (as of 2026-05-19)

- Wedge: per-patient pricing vs Ensora's $60/seat
- Flywheel: BCBAs refer their parent clients → grows consumer subscriber base at near-zero CAC
- Target: solo BCBAs, PC-heavy practices, anyone whose clients are already Modern Village parents
- Pricing (defined, partially wired): $39 (1-5 clients) / $29 (6-15) / $19 (16+) per active patient/mo. RBT seats free. $10/mo credit when a client's parent holds the $19.99 Family subscription. 30-day free trial.

## Don't redesign

- Schema is settled — build new surfaces on top of existing tables.
- Don't pursue VB-MAPP / ABLLS-R / PEAK / AFLS licensing. Multi-month negotiations with low odds for a pre-revenue startup. Sub-project #6 ships an Ariana-authored Starter Library + AI-assisted target authoring + CSV import + community sharing instead.
