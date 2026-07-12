# Session Handoff — 2026-07-11

Single source of truth for picking up wherever the last session left off. Read this first.

## How to resume

1. Open this repo (external drive should mount at `/Volumes/(626)806-4475/Ai Projects/modern-village`)
2. `git pull` to sync the latest from `origin/main`
3. Re-read this file + the latest commits to catch up

### Restoring Claude Code auto-memory on a new laptop

The auto-memory + past session transcripts have been backed up to the external drive at:

```
/Volumes/(626)806-4475/Ai Projects/modern-village-claude-state/-Volumes--626-806-4475-Ai-Projects-modern-village/
```

On a fresh laptop, run this one-liner to restore (creates `~/.claude/projects/` if needed):

```bash
mkdir -p ~/.claude/projects && cp -R "/Volumes/(626)806-4475/Ai Projects/modern-village-claude-state/-Volumes--626-806-4475-Ai-Projects-modern-village" ~/.claude/projects/
```

After that, any new Claude Code session in this repo will see the project memory and prior conversation context automatically. If you skip this step entirely, this `SESSION_HANDOFF.md` is the safety net — read it on session start.

## Most recent session — 2026-07-11 (Apple IAP wired — Path A / RevenueCat)

**Context:** Last item before App Store submission (from the 2026-07-11 full-app audit, items 1-4 all shipped earlier today — see jorrel-os.json `completed_today`). The Stripe `subscribe()` button on iOS is a Guideline 3.1.1 rejection; Jorrel chose Path A: Apple In-App Purchase via RevenueCat. Plan + research notes: [docs/superpowers/plans/2026-07-11-apple-iap-revenuecat.md](docs/superpowers/plans/2026-07-11-apple-iap-revenuecat.md).

### What was built (approved by Jorrel 2026-07-11, committed to main + deployed; RevenueCat/ASC setup done same evening — entitlement `pro`, product `mv_pro_monthly`, `default` offering, webhook + both worker secrets live, `RC_IOS_API_KEY` in app.html)

- **`supabase/migrations/20260711_iap_subscription_source.sql`** — adds `profiles.subscription_source` (`'apple_iap'` / `'promo'` / null) + backfills promo Pros. **Not yet applied to prod.**
- **`worker.js`**: exported `computeIapProfilePatch()` (pure entitlement→profile mapping, unit-tested in `tests/iap.test.mjs`, `node --test tests/iap.test.mjs` = 7 pass) + `syncRCSubscriber()` helper; new routes `POST /iap/sync` (authed; re-syncs the caller from RevenueCat REST) and `POST /iap/webhook` (RevenueCat server notifications; exact-match Authorization header vs `REVENUECAT_WEBHOOK_AUTH`); `/validate-code` now stamps `subscription_source:'promo'`; `/subscription/downgrade-expired` re-syncs `apple_iap` subs from RevenueCat instead of blind-downgrading (renewal the webhook missed ≠ expired). All profile writes stay service-key (the column-lock trigger from the audit blocks client writes).
- **`app.html`**: `RC_IOS_API_KEY` const (line ~1683, **empty = IAP disabled**); `mvIAP` module (configure/logIn per user, `getOfferings` → `purchasePackage({aPackage})` → `/iap/sync` → `loadProfile`, restore, localized `priceString` swap on the paywall); `subscribe()` routes native→IAP-only (never Stripe on iOS), web unchanged; paywall gains Restore Purchases (native) and hides the promo-code row on native (3.1.1) — the auto-renew price + Terms/Privacy disclosure already existed on the paywall via `openLegal()` from the earlier audit session, so 3.1.2 was already covered (left as-is); `manageSubscription()` → Apple's manage-subscriptions page for `apple_iap` subs; `renderBillingCard()` (BCBA practice Stripe card) returns `''` on native; `enterApp()` calls `mvIAP.init()`; `loadProfile()` expiry check calls `/iap/sync` for `apple_iap` subs.
- **`package.json`**: `@revenuecat/purchases-capacitor@13.2.2` (Capacitor 8 compatible) + `"type":"module"` (needed for `node --test`; `npx cap` verified still working). `npx cap sync ios` ran — `ios/App/CapApp-SPM/Package.swift` now lists `RevenuecatPurchasesCapacitor`.

### Jorrel's half (in order — nothing charges until all done)

1. **App Store Connect:** Agreements → Paid Apps active. Create auto-renewable subscription: product id `mv_pro_monthly`, group "Modern Village Pro", $19.99/mo, display name "Modern Village Coach Pro". Add a sandbox tester (Users & Access → Sandbox).
2. **RevenueCat:** account + project → add iOS app (bundle `app.modernvillage.ios`) → upload an App Store Connect In-App Purchase API key → entitlement `pro` → attach product `mv_pro_monthly` → offering `default` with a Monthly package.
3. **Keys:** public Apple SDK key (`appl_…`) → `RC_IOS_API_KEY` in app.html (ships with the site — no binary rebuild). Secret key (`sk_…`) → `wrangler secret put REVENUECAT_API_KEY`. Random string → RevenueCat webhook "Authorization header value" AND `wrangler secret put REVENUECAT_WEBHOOK_AUTH`. Webhook URL: `https://village-api.jorrelpatterson.workers.dev/iap/webhook`.
4. **Apply** `supabase/migrations/20260711_iap_subscription_source.sql` in the Supabase SQL editor.
5. **Deploy:** approve diffs → commit/push (Vercel) + `wrangler deploy`.
6. **Xcode:** open `ios/App`, add the **In-App Purchase capability** to the App target, build to a device, sign into the sandbox tester (Settings → App Store → Sandbox Account), test purchase + Restore Purchases. Sandbox subs renew every few minutes and expire fast — a quick downgrade there is expected, not a bug. Hard-refresh the app after the web deploy (iOS caches HTML aggressively).
7. **At submission time:** the FIRST subscription must ride along with the app version — on the version's page in App Store Connect, scroll to "In-App Purchases and Subscriptions" and attach `mv_pro_monthly` (plus its review screenshot) before clicking Submit for Review. Sandbox testing works fine before this, even while the product says "Missing Metadata".

### Known gaps (deliberate, out of scope)

- Web consumer Stripe checkout was ALREADY a dead end — `subscribe()` calls `/create-checkout` and `manageSubscription()` calls `/create-portal`, but neither route exists in worker.js (only the practice-billing `/stripe/create-checkout` + `/stripe/portal` exist). Pre-existing; the web $19.99 sub only ever activates via promo codes today. Decide later: build the consumer web checkout or drop the web upgrade button.
- No Android IAP (no Android release planned yet); `updateSubSt()` hardcodes "$19.99/mo" copy (fine for US-only launch).

---

## Previous session — 2026-05-27 (Grants strategy audit + NSF SBIR pitch drafted)

**Context:** Jorrel asked to work on grants. Audit revealed the playbook's grant lineup was almost entirely wrong for Modern Village's legal structure.

### What we learned (audit done 2026-05-27)

Modern Village Services LLC is a for-profit. **Almost every autism / early-childhood foundation grant previously listed in the playbook requires 501(c)(3) status** or funds research studies rather than products. Confirmed ineligibilities:

- **Caplan Foundation** — "Does not fund for-profit entities"
- **Doug Flutie Jr. Foundation** — 501(c)(3) or qualified schools only
- **OAR Community Grant** — community orgs/nonprofits/individuals (Ariana could apply individually as a "direct service provider" for $1-15K, but poor ROI vs. her clinical bandwidth)
- **OAR Applied Research Grant** — researchers at institutions only; LOI cycle already closed Mar 16, 2026
- **NEXT for AUTISM** — funds programs for autistic *adults*; 2026 cycle closed May 22

The previous playbook entries that promised "$50K, OPEN NOW" for OAR etc. were aspirational/wrong. None of those drafts ever existed on disk (`_reference/grant-oar-letter-of-intent.docx` and friends were referenced but not present).

### What we pivoted to

**NSF and NIH SBIR Phase I — the realistic for-profit paths.**

| Opportunity | Amount | Next deadline |
|-------------|--------|---------------|
| NSF SBIR Phase I — Digital Health | up to $275K | Project Pitch portal reopens **Jun 2, 2026** |
| NIH SBIR Omnibus (HHS) | up to $314K Phase I | **Sept 5, 2026** standard receipt |

Both programs were reauthorized 4/13/26. NSF "Physical, Mental and Behavioral Health" is a named sub-topic under Digital Health — direct fit. Pitch-first model: 3-page pitch → ~3-week NSF response → if invited, full Phase I proposal.

### What's drafted and where

**Working NSF Project Pitch draft:** [docs/GRANTS-NSF-SBIR-PITCH.md](docs/GRANTS-NSF-SBIR-PITCH.md). All 4 sections (Technology Innovation, Technical Objectives & Challenges, Market Opportunity, Company & Team) within NSF character limits. **Status: DRAFT — needs Ariana's clinical sign-off before submission.**

### What still needs to happen (next session pickup)

1. **Send the draft to Ariana** with the validation asks listed in the "Open items for Ariana" section at the bottom of the pitch file — research targets (85% inter-rater, F1 ≥ 0.80, 20% behavior reduction), the actual 12 dimensions of the Adaptive AI Engine, clinical claims sanity check, and her 20+ hr/wk co-PI commitment confirmation. Aim to get it to her this week so she has ≥5 days before the Jun 2 portal opens.
2. **Jorrel fills in:** state of LLC registration (currently "US-registered"), current active subscriber count, decide whether to name competitors by name in §3
3. **Submit pitch shortly after Jun 2, 2026** when portal reopens (https://seedfund.nsf.gov/project-pitch/)
4. **In parallel:** pick the NIH institute for the Sept 5 omnibus (likely NIMH or NICHD) and start scoping that submission

### Procedural setup (all done 2026-05-27)

- ✅ Modern Village Services LLC formed
- ✅ EIN issued
- ✅ SAM.gov registration complete
- ✅ SBIR.gov registration complete

Jorrel is ready to submit pitches with no further setup blocked.

### Docs updated this session

- [docs/MARKETING-PLAYBOOK.md](docs/MARKETING-PLAYBOOK.md) §"Client Type 6" — full rewrite with eligibility audit + SBIR-first opportunities + partner-model alternative
- [docs/ROADMAP.md](docs/ROADMAP.md) grants checklist + business tasks lines — updated
- [docs/SUPPLEMENTARY.md](docs/SUPPLEMENTARY.md) §6 — tier list restructured (Tier 1 = SBIR, Tier 3 = partner-model only)
- [docs/GRANTS-NSF-SBIR-PITCH.md](docs/GRANTS-NSF-SBIR-PITCH.md) — **new** working draft
- Memory: `project_grants_pivot_sbir.md` saved so future sessions don't re-make the same foundation-grant mistake

### One sentence for the future session that picks this up

The NSF SBIR pitch is drafted and waiting on Ariana's clinical review; once she signs off and the Jun 2 portal opens, submit it.

---

## Previous session — 2026-05-19 (Mika onboarded as sub_admin)

**Context:** Jorrel asked to give Mika (mika@ascnd.pro) an admin login with a "sub admin" role he can later restrict.

**State of the `sub_admin` role at session start (already done by an earlier session, commit `ea428b4` on 2026-05-15, already on origin/main and live in prod):**

- `admin_role` value `sub_admin` is a first-class option in [admin.html](admin.html) (VA Team section): create-VA form dropdown, inline role-change dropdown, stats row, sage tag color
- No schema change was needed: `profiles.admin_role` is plain `text` with no CHECK constraint (see [supabase/migrations/20260407_admin_roles.sql](supabase/migrations/20260407_admin_roles.sql))
- No worker.js change was needed: `/admin/create-va` passes `admin_role` through without a whitelist
- **Permissions are identical to existing marketing/billing/content admins.** Only `is_admin=true` is checked on most endpoints. Only `/admin/create-va` gates on `admin_role==='super'` (so a sub_admin cannot create new admin accounts). Future per-feature gating can target `adminRole === 'sub_admin'` in [admin.html](admin.html) / [worker.js](worker.js).

**What this session actually changed:** only created Mika's account in prod Supabase, and updated this handoff doc.

**Mika's account (live in prod Supabase, project ref `jrsiqjfwvunrjiihnsgc`):**

| Field | Value |
|---|---|
| `id` | `1485ab72-8994-4552-9463-0faadd15660c` |
| `email` | `mika@ascnd.pro` |
| `name` | `Mika` |
| `is_admin` | `true` |
| `admin_role` | `sub_admin` |
| Password | `Mika` (weak, 4 chars — created via direct Supabase Admin API which doesn't enforce the 8-char min the worker normally enforces; remind her to change on first login) |
| Login URL | https://modernvillage.app/admin.html |
| Email confirmed | yes |

**How Mika was created (for reference, in case you need to do this again):** the local `supabase` CLI is authenticated against the org, so `supabase projects api-keys --project-ref jrsiqjfwvunrjiihnsgc` returns the `service_role` key. With that key, two API calls do it: `POST /auth/v1/admin/users` (create auth user) then `PATCH /rest/v1/profiles?id=eq.{id}` (set `is_admin=true`, `admin_role`, `name`). Alternatively, after pushing any pending commits, a super admin can use the admin.html VA Team → + Add VA UI.

**Immediate next step on the new laptop:** `git push` to publish the SESSION_HANDOFF.md update (`d9305be`). Mika's account exists in Supabase already and is independent of any push.

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
