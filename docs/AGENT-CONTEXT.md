# Agent Context (durable, repo-resident)

**Last updated:** 2026-05-18
**Purpose:** Mirrors the per-machine Claude memory at `~/.claude/projects/-Volumes-6268064475-Ai-Projects-modern-village/memory/` into the repo so that when the project moves to a different external drive (or a fresh machine), an incoming agent can rebuild context from this file alone. Memory does NOT travel with the repo. This file does.

If an agent reads this on a new drive: the encoded path in `~/.claude/projects/...` will be different. Re-create memory entries from these contents if helpful.

---

## User profile — Jorrel Patterson

- Email: jorrelpatterson@gmail.com
- Role: Solo builder of Modern Village (technical/MSO side); partnered with BCBA Ariana on the clinical side.
- Building **Modern Village Services LLC** (MSO/tech entity) — not yet formed. Ariana already filed **Modern Village LLC** (clinical entity).
- Works across multiple machines (Mac mini primary, laptop secondary). Memory does NOT sync between machines — durable context lives in `docs/` files in the repo.
- Comfortable with a vanilla-HTML/JS stack and direct Supabase/Cloudflare/Resend ops; no build system, fast iteration.
- Owns end-to-end: code, infra, App Store, Stripe, marketing, lead-gen scrapers, partnership contracts.
- Working with Ariana (BCBA) for clinical content, BCBA referrals, and review of B2B copy targeting other BCBAs.

## Project overview — Modern Village

ABA-powered parenting platform for neurodivergent families. 9 pillars (AI Coach, Pro Sessions, Community, Strategy Library, Behavior Tracker, Progress Dashboard, Routine Builder, IEP Wizard, Resource Directory).

**Stack (no build system, by design):**
- `app.html` (~7,900 lines) — single-file app, role-gated UI via `applyRole()`
- `admin.html` (~2,200 lines) — admin/VA panel
- `worker.js` (~1,600 lines) — Cloudflare Worker proxy: AI, email, invites, push, scheduled crons
- Supabase (Postgres + RLS + Auth + Storage), Stripe, Anthropic Claude, Resend
- Capacitor iOS (`ios/`, `capacitor.config.json`) — TestFlight build 7 live with full native feature set

**Roles:** parent, provider (BCBA), caregiver, teacher, child. Each has distinct UI and RLS-enforced data access.

**Source-of-truth docs (always check before acting):**
- `docs/ROADMAP.md` — full completed/not-started lists, "currently in flight" section
- `docs/SUPPLEMENTARY.md` — business strategy, all client types, competitive notes
- `docs/MARKETING-PLAYBOOK.md` — channel strategy
- `docs/LAUNCH-STRATEGY.md` — Jorrel + Ariana launch plan
- `docs/MY-VILLAGE-SPEC.md` — community feature spec
- `docs/TESTING-GUIDE.md` — full QA checklist
- `docs/SESSION-WALKTHROUGH-ARIANA.md` — condensed in-person test session
- `docs/SETUP-NEW-MACHINE.md` — spin up on a different Mac or drive
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — design + implementation plans
- `docs/legal/TERM-SHEET.md` — partnership structure (Ariana clinical / Jorrel MSO)

**Architecture decisions worth knowing:**
- Single-file app over framework: chosen for fast iteration. Don't introduce a build system without explicit ask.
- Web-only Stripe (no IAP) — keeps margins.
- California-first, neurodivergent (not autism-only) for 7x market.
- HIPAA: Supabase BAA + RLS enforces minimum-necessary; child login is COPPA-safe (PIN, no email).

## In-flight work — BCBA Data Collection (Ensora-parity initiative)

**Status as of 2026-05-18:** Foundation (sub-project #1 of 6) **complete** — schema spine, 8 admin screens, RLS, parent read paths, curriculum scaffolding all merged on branch `feat/bcba-data-collection-foundation`. See `docs/superpowers/specs/2026-05-18-bcba-data-collection-foundation-design.md` + `docs/superpowers/plans/2026-05-18-bcba-data-collection-foundation.md`.

**Sequence forward:**
1. **Mini-spec — per-patient Stripe billing** (between Foundation and #2). Wire `practices.stripe_*` fields to a real Stripe checkout + webhook, implement the $10/active-Family-subscriber credit.
2. **Sub-project #2 — Live Data Entry.** Trial-by-trial session UI, IndexedDB offline sync, IOA collection, parent "My BCBA" read-only tab.
3. **Sub-project #3 — Behavior Reduction** (structured behavior recording during a session).
4. **Sub-project #4 — Analysis & Reporting** (per-target graphs with phase change lines).
5. **Sub-project #5 — Documentation** (SOAP auto-fill from session data, timesheet signatures).
6. **Sub-project #6 — Curriculum Libraries** (Ariana-authored Starter content drop replacing placeholders, VB-MAPP/ABLLS-R licensing).

**Strategic positioning:** B2B attractor with per-patient pricing, separate Stripe product from $19.99 Family plan, RBT seats free, flywheel via $10/mo credit when a client's parent has a Family subscription. Memory: `project_bcba_data_collection.md`.

## In-flight work — Email Drips + Continual Optimization

**Status as of 2026-05-06:** Design spec and implementation plan committed (commits `234a7fd`, `4ec6c20`). **Code work has NOT started.** `git status` clean on `main`.

**Spec:** `docs/superpowers/specs/2026-04-16-email-drips-and-optimization-design.md`
**Plan:** `docs/superpowers/plans/2026-04-16-email-drips-and-optimization.md` (2402 lines, 7 phases)

**Why:** 16K+ scraped leads sitting idle. Existing `campaigns`/`sequence_enrollments`/`campaign_sends` infra plus an autoresearch cron exist but only handle one-shot blasts. Cold-blasting from main domain would tank parent transactional email reputation — subdomain isolation is non-negotiable.

**Scope (one bundled effort):**
- Sequence A — Screener follow-up (Days 3/7/10) for screener leads
- Sequence B — Multi-touch re-engagement (Days 7/14/21) replaces single-email at worker.js:719-778
- Sequence C — B2B cold (9 emails × 3 cohorts: BCBAs / Districts / Regional Centers), loaded as `status='draft'`
- Optimization layer: reply tracking, conversion attribution, Thompson sampling bandit per (cohort, step), auto-promote winners with significance gate, send-time learning per recipient
- Deliverability: `outreach.modernvillage.app` subdomain in Resend with per-cohort sub-subdomains
- `email_send_queue` table for warmup-aware pacing (50→100→250→500/day)

**Phases (in plan):**
1. Foundation (schema migration `20260416_email_drips_optimization.sql`, Resend subdomain DNS)
2. Sequence A
3. Sequence B
4. Optimization foundation (webhooks, bandit, attribution)
5. Sequence C
6. Admin UX (variants, cohort dashboard, queue manager, optimization log viewer)
7. Verification + docs

**Open questions in spec (still unresolved):**
1. Does Resend support inbound parsing on subdomains, or need a separate inbound provider?
2. Send-time selector when warmup cap binding — send anyway or hold for next day?
3. Bandit cold-start — uniform random for first 3-5 sends per variant?
4. Ariana's BCBA-copy review workflow — admin panel direct or Google Doc mirror?

**How to apply:** When Jorrel asks to start/continue, follow the plan task-by-task with one commit per task. Use `email LIKE '%@modernvillage-test.app'` for verification.

## Working with two machines (and external drives)

Jorrel works across two Macs and at least one external drive. Source of truth for setup: `docs/SETUP-NEW-MACHINE.md`.

**What does NOT sync via git (must transfer manually):**
- `AuthKey_MLBB3NX7FC.p8` — APNs (push notifications) signing key, lives at repo root on Mac mini
- `AuthKey_NA3B894JG3.p8` — Sign in with Apple signing key, lives on Desktop on Mac mini
- Apple keys can only be downloaded from Apple once; if lost, must delete + recreate the key and re-configure secrets in Cloudflare/Supabase.
- `~/.claude/projects/<encoded-path>/memory/` — Claude memory is per-machine **and** per-path. When the repo moves to a different drive, the encoded path changes and memory will appear empty. Use this file (`docs/AGENT-CONTEXT.md`) to rebuild context.

**Daily workflow:** `git pull origin main` → edit → commit → `git push origin main`. Same on the other machine: `git pull` before editing. Don't edit same file on both without committing in between.

**External services that need sign-in per machine:** GitHub, Vercel, Cloudflare, Supabase, App Store Connect, Apple Developer, Stripe, Anthropic Console, Resend.

**iOS work needs Xcode 26+** (~15GB) — only install on machines that will Archive/upload to TestFlight.

---

## How an agent should bootstrap on a fresh drive

1. Read `docs/ROADMAP.md` — full state.
2. Read this file (`docs/AGENT-CONTEXT.md`) for user + project context.
3. Read `docs/SUPPLEMENTARY.md` for business decisions.
4. If the user mentions "the email drip plan" or similar, read the spec + plan in `docs/superpowers/`.
5. If memory dir is empty/missing on the new machine, recreate the four entries from this file: `user_jorrel.md`, `project_overview.md`, `project_email_drips.md`, `reference_two_machines.md` — the contents in this file map 1:1 to those memory entries.
