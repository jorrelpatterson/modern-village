# Modern Village — Product Roadmap

**Last updated:** 2026-05-18

---

## Currently in flight (2026-05-18)

- **BCBA Data Collection — sub-projects #1 (Foundation), #2 (Live Data Entry), and #3 (Behavior Reduction) all complete** — clinical workflow end-to-end: setup → live session → trial entry → behavior tracking → per-behavior dashboard with ABC analytics. Parents see "My BCBA" with sparklines. Offline support via IndexedDB. **Next: per-patient Stripe billing mini-spec + sub-project #4 (Analysis & Reporting — the iconic per-target line graphs with phase change lines, technical indicators, annotations).** Spec: `docs/superpowers/specs/2026-05-18-bcba-data-collection-foundation-design.md`. Plan: `docs/superpowers/plans/2026-05-18-bcba-live-data-entry.md`.
- **Email Drips + Continual Optimization** — design spec + 2402-line implementation plan committed (commits `234a7fd`, `4ec6c20`). **Code not started.** Spec: `docs/superpowers/specs/2026-04-16-email-drips-and-optimization-design.md`. Plan: `docs/superpowers/plans/2026-04-16-email-drips-and-optimization.md`. This is the gating tech build before scaling cold outreach to the 16K-lead CRM. See `docs/AGENT-CONTEXT.md` for full state.
- **Launch prep with Ariana** — testing session walkthrough at `docs/SESSION-WALKTHROUGH-ARIANA.md`, launch strategy at `docs/LAUNCH-STRATEGY.md`. Pre-launch decisions still pending (launch date, who's "the face", pricing posture, content boundaries, crisis protocol).

---

## Completed

### BCBA Data Collection — Behavior Reduction (2026-05-20)
**Sub-project #3 of 6** — spec: [docs/superpowers/specs/2026-05-19-bcba-behavior-reduction-design.md](docs/superpowers/specs/2026-05-19-bcba-behavior-reduction-design.md)

- [x] Migration — 3 indexes for behavior chart queries (no new tables)
- [x] Client detail tab switcher (Programs / Behaviors)
- [x] Behaviors list + add/edit/archive modal (challenging vs replacement, optional "pairs with")
- [x] Antecedent + Consequence library management (practice-wide vs client-scoped)
- [x] ABC entry upgrade — FK pickers replace #2's free-text inputs; backward-compatible with legacy free-text rows
- [x] Behavior Dashboard — Trend SVG chart, Recent recordings list, ABC bar charts (top antecedents/consequences/function)
- [x] Combined view toggle aggregates across challenging behaviors

**Next:** sub-project #4 — Analysis & Reporting (the iconic per-target line graphs with phase change lines, technical indicators, annotations).

Plan: [docs/superpowers/plans/2026-05-19-bcba-behavior-reduction.md](docs/superpowers/plans/2026-05-19-bcba-behavior-reduction.md)

### BCBA Data Collection — Live Data Entry (2026-05-19)
**Sub-project #2 of 6** — full initiative spec: [docs/superpowers/specs/2026-05-18-bcba-data-collection-foundation-design.md](docs/superpowers/specs/2026-05-18-bcba-data-collection-foundation-design.md)

- [x] session_targets join table + parent SELECT policy on sessions + v_child_sessions view
- [x] mvOffline IndexedDB sync queue with 30s background flush + retry + UNIQUE-constraint idempotency
- [x] Start Session button + Pre-session plan modal (target multi-select, ad-hoc skip)
- [x] Active session overlay with sticky top bar, target picker bottom-sheet, mid-session target add
- [x] Trial entry — 7 big buttons, auto-advance, task analysis step cycling, offline-safe
- [x] Behavior overlay — frequency tally, duration timer, interval recording, ABC entry, quick-add
- [x] End-of-session summary with per-target trial counts, per-behavior aggregates, IOA % per target
- [x] IOA observer flow — Active sessions card on Dashboard, lite parallel view, 5s polling of primary's target
- [x] Cosign flow — Pending cosign card, read-only summary review, cosign action
- [x] Parent "My BCBA" tab — programs/targets, SVG sparklines, recent sessions (aggregate-only)

**Next:** sub-project #3 — Behavior Reduction (dedicated ABC graphs, frequency rate trends, behavior dashboard per client). Plus a per-patient Stripe billing mini-spec sequenced before users sign up.

Plan: [docs/superpowers/plans/2026-05-18-bcba-live-data-entry.md](docs/superpowers/plans/2026-05-18-bcba-live-data-entry.md)

### BCBA Data Collection — Foundation (2026-05-18)
**Sub-project #1 of 6** — full initiative: [docs/superpowers/specs/2026-05-18-bcba-data-collection-foundation-design.md](docs/superpowers/specs/2026-05-18-bcba-data-collection-foundation-design.md)

- [x] Practice tier schema (practices, practice_members, practice_clients) + RLS
- [x] Clinical spine schema (programs, targets, target_steps, behavior_definitions, behavior_antecedents, behavior_consequences, sessions, trials, behavior_recordings) + RLS
- [x] Curriculum library scaffolding (curriculum_libraries, curriculum_targets, curriculum_target_steps) + Modern Village Starter seed
- [x] Existing session_notes.session_id (nullable), child_access.practice_id (nullable)
- [x] Parent read views (v_child_target_progress) + child_access-scoped RLS
- [x] Practice onboarding wizard, members management with invite flow, client roster with intake/discharge, programs CRUD, targets editor (5 target types + criteria forms + task analysis), curriculum browser with "Add to program", sessions list placeholder, practice settings
- [x] Worker endpoint /practice/invite-member + accept-invite URL handler

**Next:** sub-project #2 — Live Data Entry (trial-by-trial UI, IndexedDB sync runtime, IOA collection). Sequenced after a per-patient Stripe billing mini-spec.

Plan: [docs/superpowers/plans/2026-05-18-bcba-data-collection-foundation.md](docs/superpowers/plans/2026-05-18-bcba-data-collection-foundation.md)

### iOS Capacitor — Full Native Feature Set (2026-04-18)
**Branch:** `feat/ios-capacitor` (all commits pushed to main, Vercel + Cloudflare + Supabase all live). **TestFlight build 7 live + tested on physical device.**

**Phase 0 — Capacitor shell:**
- [x] Bundle ID `app.modernvillage.ios` + App Store Connect record
- [x] Xcode 26 signing + archive pipeline (Team ID `X577Q747WV`)
- [x] TestFlight internal tester group `ModernVillage`
- [x] App icon + splash screens from brand assets
- [x] Capacitor config `allowNavigation` whitelist (Supabase, Google, Stripe, Apple, Anthropic, Cloudflare, Vercel)

**Phase 2 — Push Notifications:**
- [x] Supabase `push_tokens` + `push_send_log` + `push_dedup` tables
- [x] APNs auth key (`MLBB3NX7FC`) + Cloudflare Worker secrets
- [x] `registerPushNotifications()` client flow with stale-session self-heal
- [x] All 8 push trigger types wired: daily check-in, morning routine, booking reminder (24hr), streak at risk, milestone celebration, weekly digest, community reply, new strategy card
- [x] Worker endpoints `/push/register`, `/push/test`, `/push/send`, `/push/notify-milestone`, `/push/notify-reply`, `/push/notify-new-strategy`, `/push/clear-badge`
- [x] Cron routing (morning 7am PT / evening 8pm PT / Sunday digest) with single-cron fallback mode

**Phase 3 — Badge count:**
- [x] `@capawesome/capacitor-badge` plugin
- [x] Server-side `push_badge_count` counter with auto-increment on send
- [x] Icon badge clears on app foreground

**Phase 4 — Biometric auth:**
- [x] `@aparajita/capacitor-biometric-auth` plugin
- [x] Face ID App Lock (gate on app open for signed-in users)
- [x] Face ID Sign-In (button on login screen after logout, uses saved creds)
- [x] Opt-in modal after first sign-in
- [x] iOS Save Password prompt (autocomplete + name attrs)
- [x] NSFaceIDUsageDescription

**Phase 5 — Native UX polish:**
- [x] `@capacitor/haptics` — tap feedback on chat send, login, profile save
- [x] `@capacitor/status-bar` — dark content styling
- [x] Safe area handling — viewport-fit=cover + env(safe-area-inset-top)
- [x] `@capacitor/share` — native share sheet in referral flow
- [x] `@capacitor/camera` + `@capacitor/geolocation` — Info.plist usage descriptions (location, camera, photo library, microphone)
- [x] Service worker (`sw.js`) — offline caching for app shell + CDN assets
- [x] Offline banner — amber #mvOfflineBanner with navigator.onLine detection

**Phase 6 — Apple Sign-In:**
- [x] `@capawesome/capacitor-apple-sign-in` plugin (Capacitor 8 compatible — swapped from @capacitor-community version which pinned to Cap 7)
- [x] Apple Developer Services ID `app.modernvillage.auth` + Sign In with Apple key (`NA3B894JG3`)
- [x] Supabase Apple provider enabled with JWT client secret (regenerate every 6 months via `/tmp/gen-apple-jwt.js`)
- [x] Black "Sign in with Apple" button on auth modal
- [x] `com.apple.developer.applesignin` entitlement
- [x] App Store privacy labels reference doc (`docs/APP-STORE-PRIVACY-LABELS.md`)

**Known limitations (on roadmap, see Platform section below):**
- Apple Sign-In creates duplicate Supabase account when email matches existing password user (needs Supabase manual identity linking + in-app merge UX)
- Offline caching is pragmatic only — full offline-first with IndexedDB data sync is a bigger project

**Full session snapshot:** see `project_ios_session_wrap_2026-04-18.md` in memory (has external config state, 20+ commit log, lessons learned)

### Partnership Legal Framework (2026-04-14)
- [x] Full term sheet drafted (`docs/legal/TERM-SHEET.md`)
- [x] 7 draft contracts for attorney review (`docs/legal/1-7.md`)
- [x] Structure locked: MSO/Clinical LLC dual-entity, 50/50 pooling with vesting, capital recovery, commissions
- [x] Ariana's Modern Village LLC already filed

### Original Build (Pre-Session)
- [x] 9 Pillars: AI Coach, Pro Sessions, Community, Strategy Library, Behavior Tracker, Progress Dashboard, Routine Builder, IEP Wizard, Resource Directory
- [x] Adaptive AI Engine (coach learns each child's patterns across 12 dimensions)
- [x] Child Insights Dashboard
- [x] Stripe Integration ($19.99/mo + session fees)
- [x] Google OAuth login
- [x] M-CHAT-R/F Screener (lead gen funnel)
- [x] Referral Program (invite a friend, get 1 month free)
- [x] Multi-child Support
- [x] Blog (10 SEO-optimized posts, 74K+ monthly search volume)
- [x] District Sales Tools (one-pager, analytics dashboard, email templates)
- [x] Security Hardening (20/20 checks, audit logging, RLS)
- [x] Legal Pages (Terms, Privacy Policy, BAA)
- [x] Neurodivergent Rebrand
- [x] Email Drip Sequences (4 sequences, 13 emails, HIPAA-compliant — documented)
- [x] Lead Gen CRM + 30 Automated Scrapers
- [x] Daily Check-ins + Streak System
- [x] Predictive Behavior Alerts
- [x] Satisfaction Survey

### Parent Toolkit Upgrade (2026-04-06)
- [x] Community comments RLS fix (threaded comments, moderation)
- [x] Routine Builder overhaul (Supabase persistence, per-child, AI-generated routines with ABA tips, mobile touch drag-and-drop)
- [x] IEP Toolkit PDF upload & AI analysis (client-side extraction, goals/services/accommodations/gaps)
- [x] Child management bug fixes

### Phase 3: Multi-Role Collaboration Platform (2026-04-06)

**Sub-project 1: Role System**
- [x] Role field on profiles (parent, provider, caregiver, teacher, child)
- [x] Provider signup flow (NPI, license type/state/number, CPT codes)
- [x] Provider verification in admin dashboard
- [x] Parent invite flow (email link → caregiver/teacher/provider account creation)
- [x] Role-based UI routing (tabs, sidebar, features per role)
- [x] child_access table + RLS policies
- [x] Audit trail (invite sent/accepted/revoked timestamps)

**Sub-project 2: Caregiver Network**
- [x] Care Team Notes (timeline with threaded comments, role-colored badges)
- [x] Behavior log attribution (logged by caregiver/teacher name badge)
- [x] Read-only Routine Builder and Saved Strategies for caregivers

**Sub-project 3: Provider Dashboard**
- [x] Client list with behavioral trend stats
- [x] Client detail overlay (behavior logs, session notes, care notes, insights sub-tabs)
- [x] Session notes with structured fields + AI-generated clinical narratives
- [x] Superbill PDF export (provider info, client info, CPT, narrative, signature line)
- [x] Billing status tracking (draft/submitted/paid/denied)
- [x] Parent session notes view (read-only shared notes)

**Sub-project 4: Teacher View**
- [x] Behavior Summary page (weekly comparison, 30-day trends, peak times, top behaviors, triggers, strategy effectiveness)
- [x] Teacher behavior logging (attributed)
- [x] IEP Toolkit access + read-only routines

**Sub-project 5: Crisis Mode**
- [x] 6-step de-escalation walkthrough (large text, one step at a time)
- [x] 988 Suicide & Crisis Lifeline + 911 one-tap links
- [x] Guided debrief (auto-logs behavior + care team note)
- [x] "Talk to Coach" handoff with crisis context

**Additional Features (2026-04-06)**
- [x] Voice Mode (speech-to-text → AI coach → text-to-speech, auto-activates from crisis mode)
- [x] Child/Teen Login (username + 4-digit PIN, COPPA-safe, mood check-ins, coping tools, routine viewer)
- [x] Progress Milestones & Celebrations (12 achievements, confetti popup, earned + locked history)
- [x] ABA function trigger categories (Tangible/Escape/Attention/Sensory chips on behavior tracker)
- [x] Community post photo uploads (Supabase Storage)
- [x] Admin password reset tool + forgot password flow
- [x] Admin RLS policies (is_admin() security definer function)
- [x] Test accounts for all 4 roles

---

## Not Started — Code Features

### Platform (Phase 2)
| Feature | Description | Priority |
|---------|-------------|----------|
| **Apple Sign-In account linking** | Currently: signing in with Apple using an email that already has a password account creates a DUPLICATE Supabase user. Fix: enable Supabase manual identity linking (Authentication → Settings → toggle on, or env var GOTRUE_SECURITY_MANUAL_LINKING_ENABLED=true), then add in-app flow to link identities when an Apple sign-in matches an existing email. Priority rises when we get production users. | Medium |
| ~~iOS Capacitor wrap~~ | **DONE** (2026-04-18). TestFlight build 7 with all native plugins: push, biometric (App Lock + Sign-In), camera, geolocation, share, haptics, status bar, offline cache (pragmatic), badge count, Apple Sign-In. See Completed section above. | **Done** |
| Android Capacitor wrap | Scaffolded via `npx cap add android` but no plugins mirrored yet. Mirror iOS plugins, Google Play Data Safety form, submit to Play Console. | High |
| ~~Push notifications~~ | **DONE** (2026-04-18). All 8 HIPAA-safe triggers wired end-to-end: daily check-in, morning routine, booking reminder, streak at risk, milestone, weekly digest, community reply, new strategy card. Cron-scheduled + event-based. | **Done** |
| **Medical billing module** | **DONE (Phase 1): Claims tracking, payer management, superbills, billing dashboard, aging reports. NEXT (Phase 2): PC (Parent Consultation / CPT 97156) billing — the main insurance path. See "PC Billing Build" section below. Phase 3: Clearinghouse integration (EDI 837). Phase 4: ERA/EOB auto-processing, denial management automation, batch claim submission.** | **Phase 1 Done** |
| ~~**Admin role-based access**~~ | **DONE** (2026-04-07). VA roles in admin panel: Marketing VA, Billing VA, Content VA, Super. VA Team management page with create/edit/remove. | Medium |
| **Instagram auto-posting** | **Connect Instagram Graph API via Meta Business Suite for scheduled auto-publishing from admin panel. Requires: FB Business account + IG Professional account + Meta App Review.** | Medium |
| Google Calendar sync | Routines → calendar events, session reminders for Ariana | Medium |
| Booking reminders | 24hr email cron job before scheduled sessions | Medium |
| Video behavior clips | Parent uploads video, AI analyzes behavior in context. Use Claude vision or other video-capable AI if needed. BCBA can also review clips. | Medium |
| ~~Provider Marketplace v2~~ | **DONE** (2026-04-07). DB-backed providers, search/filter, multi-provider: open marketplace, provider applications, 20-25% platform fee. Phase 3 (200+ subs): multi-provider (OTs, SLPs), shared dashboard, insurance auth support. See `docs/SUPPLEMENTARY.md` §11. | Medium |
| ~~District admin portal~~ | **DONE** (2026-04-07). Standalone district-admin.html — coordinator login, 5 pages — can see aggregate data across all schools/teachers in their district, manage teacher onboarding, view engagement metrics | Medium |
| Caregiver mental health support (Pillar 10) | LPC-provided support for caregivers through the platform. Requires hiring an LPC. | Low (needs hire) |

### My Village — Local Community Layer (High Priority)

**Full spec: [docs/MY-VILLAGE-SPEC.md](docs/MY-VILLAGE-SPEC.md)**

Turns the app from a solo parenting tool into a real-world support network. Strongest retention mechanism possible — parents who form real friendships through the app never cancel.

**Phase 1 (MVP) — DONE 2026-04-07:**
- [x] `village_profiles` table + opt-in flow (hidden/city/neighborhood visibility)
- [x] Nearby parents list view (distance-sorted, filtered by age/diagnosis/interests)
- [x] Events creation + RSVP + list view (6 event types, approval flow)
- [x] Replace Community tab with hybrid Feed/Nearby/Events sub-tabs

**Phase 2 (Enhancement):**
- [ ] Map view (Mapbox or Google Maps) with parent/event/resource pins
- [ ] Local resource directory + ratings/reviews (crowdsourced, moderated)
- [ ] In-app messaging + mutual connections (text-only, report/block)
- [ ] Event comment threads

**Phase 3 (Growth):**
- [ ] Push notifications for events
- [ ] Recurring events
- [ ] BCBA-facilitated support groups ($10/session revenue)
- [ ] "Invite to My Village" viral share link

**New tables (8):** village_profiles, village_events, village_rsvps, village_event_comments, village_resources, village_reviews, village_messages, village_connections

**Privacy:** Default hidden, approximate location only (~0.5mi), no children's names/photos in profiles, event address hidden until RSVP approved, messaging requires mutual connection, HIPAA disclaimer (non-clinical, no PHI).

### PC Billing Build — Parent Consultation Insurance Path (High Priority, Revenue)

> **Note:** "PC" in this section refers to Parent Consultation (CPT 97156), not a Professional Corporation entity. The Modern Village clinical entity is an LLC (see `docs/legal/TERM-SHEET.md`).

**Intel from Ariana (2026-04-07):** Modern Village sessions can be billed as **Parent Consultation (PC)** — CPT code **97156** — which is covered by multiple CA insurance plans. This is the main insurance path for the platform. Changes the pitch to parents ("may be covered by insurance") and BCBAs ("we handle your PC billing").

**Confirmed payers that accept 97156 (Parent Consultation):**
- Regional Centers (all 21 CA counties)
- CalOptima (Orange County Medi-Cal)
- Blue Shield CA
- Aetna
- Cigna
- Kaiser
- (There may be more — Ariana listed these from personal experience)

**Billing structure (critical — different from current 30/60-min sessions):**
- Bill in **15-minute units**
- Always **+1 unit for note taking**
- Example: 30-minute consult = **3 units** (2 for session + 1 for notes)
- Example: 60-minute consult = **5 units** (4 for session + 1 for notes)

**Prior authorization:**
- **Required by all payers Ariana has worked with**
- Need a prior auth number on every claim
- Need to track PA start/end dates per client
- **Research task:** identify states that don't require PA for PC billing — "lean into states that don't" (per Ariana). Most states require it, but some may not.

**Documentation requirements:**
- Structured "Consultation Service Note" template (Ariana has one — TODO: get from her)
- AI fills template from voice transcription of the session
- Must include: parent goals, strategies taught, parent response, next steps, billable units

### PC Billing Build Queue

**Phase 2a — Data model (can start without Ariana's template):**
- [ ] Seed payer database with 6 confirmed payers (Regional Centers, CalOptima, Blue Shield CA, Aetna, Cigna, Kaiser)
- [ ] Add `prior_auth_number`, `prior_auth_start`, `prior_auth_end` fields to payer_enrollments table
- [ ] Add `units`, `unit_rate`, `total_units` fields to claims table
- [ ] Add `note_units` (default: 1) to session_notes table

**Phase 2b — Billing UI (can start without Ariana's template):**
- [ ] Update session booking to show units + dollar amounts (not just minutes)
- [ ] Claim generation auto-adds +1 note unit
- [ ] Prior authorization tracker in admin panel + provider view
- [ ] Aging reports broken down by units

**Phase 2c — Note template + transcription (blocked on Ariana's template):**
- [ ] Get Ariana's Consultation Service Note template
- [ ] Build template in app with structured sections
- [ ] Add voice recording during session (Web Speech API or native Capacitor plugin)
- [ ] AI transcription (Whisper API or equivalent)
- [ ] AI auto-fills note template from transcription
- [ ] Provider reviews/edits + signs before submission

**Phase 2d — Research:**
- [ ] State-by-state PC billing rules research — which states don't require prior auth
- [ ] Target launch states based on research

**Note:** Phase 2c is blocked until Ariana provides her note template. Phase 2a + 2b can start immediately.

### Subscription Tiers (Deferred Decision)

**Current state (2026-04-14):**
- **Family Plan — $19.99/mo** — shared across co-parents via child_access. One parent pays, all co-parents with `access_level='full'` inherit Pro status. Handled in `loadProfile()`.
- Free Plan — 3 AI coach messages total, community access always free.

**Deferred: Second paid tier at $29.99/mo.** Decision made 2026-04-14 to NOT build a second tier yet. Architecture supports adding one later. Options to consider when tester feedback informs the decision:

- **Family Plus ($29.99)** — session discounts (20% off), priority support, premium strategy library, early feature access
- **Household ($29.99)** — unlimited children (vs 2-3 cap on Family)
- **Care Team Plus ($29.99)** — unlimited caregivers/teachers, advanced coordination, Annual Village Report PDF
- **Concierge ($29.99)** — 1 free 30-min BCBA consult/month, 24hr direct BCBA messaging, weekly BCBA-reviewed reports, priority crisis response — STRONGEST value prop per initial analysis

**Architecture notes for when we build it:**
- Add `subscription_tier` column to profiles ('family', 'household', 'concierge', etc.)
- Stripe: create second product/price in dashboard
- `loadProfile()` will need to return tier so features can gate on it
- Paywall UI needs to show both tiers side-by-side
- If Concierge: needs BCBA consult tracking (how many used this month) + priority queue in scheduling
- Co-parent inheritance: higher tier grants higher access to all co-parents (one pays, all inherit)

**When to revisit:** After tester cohort provides feedback on what feels "worth more." Specifically, ask:
- Do you wish you had a monthly BCBA check-in built in?
- Do you need more children tracked?
- Do you need faster support?
- Do you want more advanced reports?

Decision = whichever answer has the most "yes" votes from testers.

### Phase 4
| Feature | Description |
|---------|-------------|
| Neurodivergent adult subscription | $9.99-19.99/mo, age 18+ transition |
| School-home bridge | Teacher ↔ parent notifications, school behavior sync |
| Standardized assessment tracking | VB-MAPP, ABLLS-R, Vineland |
| Parent story library | Shared experiences, searchable by diagnosis/age/challenge |
| Annual Village Report PDF | Behavioral summary for IEP meetings |

### Phase 5 — Scale
| Feature | Description | Revenue |
|---------|-------------|---------|
| Insurance PMPM licensing | Direct payer contracts, covered benefit | Recurring |
| HealthKit / Google Health Connect | Wearable data integration | — |
| Apple Watch support | Wrist notifications, quick log | — |

---

## Not Started — Business Tasks

### 🔴 Revenue (do first — no code needed)
- [x] LLC formation: Ariana formed Modern Village LLC (clinical entity)
- [ ] LLC formation: Jorrel to form Modern Village Services LLC (MSO/tech entity) — bizfileonline.sos.ca.gov, $70 filing fee
- [ ] EIN for Modern Village Services LLC (free, instant online from IRS.gov)
- [ ] Business bank account for Modern Village Services LLC
- [ ] Healthcare attorney review of contract set (~$2-4K flat fee)
- [ ] Sign all 7 partnership contracts with Ariana
- [ ] Transfer Stripe account from Jorrel's existing entity to Modern Village Services LLC (within 60 days of signing)

### 🟡 Marketing
- [ ] Post first 4 graphics on Instagram
- [ ] 30-day content calendar
- [ ] Post screener link in autism parent Facebook groups (free traffic)
- [ ] Post screener on Reddit (r/Autism, r/AutismParenting, r/beyondthebump)
- [ ] Email autism bloggers to link to screener (backlink building)
- [ ] Implement email drip sequences in code (re-engagement, weekly digest) — sequences already written in docs
- [ ] **Pediatrician QR flyers** — print screener QR flyers, drop at 40 SoCal city pediatrician offices. 300 offices x conversion = ~390 subs/yr ($93K). See `docs/SUPPLEMENTARY.md` §4.
- [ ] **Podcast outreach** — pitch Ariana as guest on 10 autism/ADHD parenting podcasts (scraper found 50-100)
- [ ] **Influencer partnerships** — $5/subscriber affiliate deal with 5-20 Instagram/TikTok creators (5K-50K followers)
- [x] Create Instagram @modernvillage.app
- [x] Referral program built

### 🟡 BCBA Recruitment
- [ ] Ask Ariana to personally refer 5 BCBA colleagues (warm intros convert 10x)
- [ ] Launch email campaign to 15,000 NPI-scraped BCBA leads
- [ ] Post in BCBA Facebook groups ("ABA Therapists," "BCBA Study Group")
- [ ] Explore corporate ABA company partnership (Autism Learning Partners, LEARN Behavioral, etc. — one deal = 20-100 BCBAs)
- [ ] LinkedIn Sales Navigator trial — DM California BCBAs
- [ ] CalABA conference attendance/networking

### 🟡 Grants (time-sensitive)
- [ ] Register at researchautism.org (OAR — $50K, OPEN NOW)
- [ ] Doug Flutie Jr. Foundation ($5K-25K)
- [ ] Autism Speaks Community Grants ($5K-15K)
- [ ] Caplan Foundation ($25K-50K, early childhood 0-5)
- [ ] NEXT for AUTISM signup ($10K-50K — check cycle)
- [ ] Inclusive App Accelerator — apply Dec 2026 for 2027 cycle ($10K, inclusiveapps.com)
- [ ] Send Ariana grant docs to review
- [ ] NIH SBIR — $314K (paused, apply when reopens)
- [ ] NSF SBIR — $275K (paused)
- [ ] Full grant target list in `docs/SUPPLEMENTARY.md` §6

### 🟡 Legal (before taking real payments)
- [ ] Healthcare attorney reviews Terms, Privacy Policy, BAA ($500-1,500)

### 🟣 HIPAA Compliance
- [ ] Sign Supabase BAA (Pro plan)
- [ ] Resend BAA or switch to Paubox/SES for email
- [ ] Anthropic API BAA (or use AWS Bedrock)
- [ ] Ariana HIPAA training ($15-29)
- [ ] Push notification PHI audit (generic text only)
- [ ] App Store privacy labels
- [ ] Google Play Data Safety form

### 🟠 District Sales
- [ ] Start with **Pomona USD** — local, SpEd Director: Claudia Ruiz
- [ ] Target districts hiring new SpEd directors (EdJoin scraper)
- [ ] Target districts whose LCAP mentions PBIS/parent engagement
- [ ] Cold email → follow-up (5 days) → one-pager + demo → 90-day pilot → school board contract
- [ ] Pricing: $3-8/student/year, free 90-day pilot for 1-3 schools
- [ ] Full playbook in `docs/SUPPLEMENTARY.md` §2

### 🔵 Conferences & Outreach
- [ ] Conference presentations (CASE, CEC)
- [ ] CalABA conference (Riverside Convention Center)
- [ ] Local news pitch — "Local BCBA builds AI to help autism families" (LA NBC/ABC/FOX)
- [ ] Nextdoor posts in SoCal neighborhoods
- [ ] Flyers at Regional Center offices (21 in CA)

---

## Known Bugs

| # | Priority | Issue | Status |
|---|----------|-------|--------|
| 1 | Fixed | Forgot password email flow | Fixed — PKCE + onAuthStateChange handler |
| 2 | Fixed | Profile email not synced from auth | Fixed — trigger + backfill |
| 3 | Fixed | Admin portal shows only 1 child | Fixed — joins children table |
| 4 | Fixed | Invite role validation for provider | Fixed — needs worker redeploy |
| 5 | Fixed | Admin uses legacy child fields | Fixed — same as #3 |
| 6 | Fixed | macOS resource fork git warnings | Fixed — .gitignore updated |
| 7 | Fixed | Admin RLS infinite recursion | Fixed — is_admin() security definer |
| 8 | Fixed | ABA trigger functions (Ariana feedback) | Fixed — chip buttons added |
| 9 | Fixed | Community photo uploads (Ariana feedback) | Fixed — Supabase Storage |

---

## Architecture Notes

- **Single-file app:** `app.html` (~5,300 lines) serves all roles. `applyRole()` controls what each role sees.
- **No build system:** Vanilla HTML/CSS/JS by design. Fast iteration, no framework overhead.
- **Backend:** Supabase (PostgreSQL + RLS + Auth + Storage), Cloudflare Worker (API proxy + email + invites + password reset), Stripe (payments)
- **AI:** Claude Sonnet 4 via Anthropic API through Cloudflare Worker
- **Auth:** Supabase Auth (email/password + Google OAuth). Child login via username + PIN (no Supabase Auth, direct table lookup).
- **HIPAA compliance:** Parent invite = authorization, RLS enforces minimum necessary access, audit trail via child_access/invites tables, COPPA-safe child login (no email collected)
- **Design system:** Fraunces + DM Sans fonts, cream/sage/terracotta palette, warm editorial feel
- **Roles:** Parent, Provider (BCBA), Caregiver, Teacher, Child — each with distinct UI and data access
- **Lead gen:** 30 scrapers across 4 files, 16K+ leads in CRM. NPI registry = highest-value single source (5K+ CA providers).
- **Key decisions:** Web-only Stripe (no in-app purchases), parents-first flywheel, California-first, neurodivergent (not autism-only = 7x market). Full rationale in `docs/SUPPLEMENTARY.md` §12.
- **Competitive edge vs Frontera Health ($32M funded):** Consumer-first vs B2B-only, $19.99 vs $200+/mo, community layer (My Village), parent-generated daily data. See `docs/SUPPLEMENTARY.md` §10.
- **Reference docs:** Full business/marketing/grant strategy in `docs/SUPPLEMENTARY.md`. Feature specs in `docs/MY-VILLAGE-SPEC.md`. Business docs inventory in `_reference/` folder.

---

## Reminders (Next Session)

1. ~~**Deploy worker.js to Cloudflare**~~ — DONE 2026-04-07. Co-parent support, email sequences, all endpoints live.
2. **Have Ariana test:** Crisis mode, voice mode, care team invites, ABA trigger buttons (Tangible/Escape/Attention/Sensory), community photo uploads, provider signup flow
3. **Ready to launch campaigns:** 9-email drip sequences for BCBAs (15,000 leads), Districts (994 leads), Regional Centers (21 leads) — all in admin CRM
4. **Next to build:** My Village — local community layer (nearby parents, events/meetups, resource directory). Full spec in `docs/MY-VILLAGE-SPEC.md`. This is the #1 retention feature.
5. **Business tasks:** Jorrel to form Modern Village Services LLC, get EIN, activate Stripe real payments, OAR grant application (open now, $50K)
5a. **Partnership Contracts:** Full set of 7 draft contracts at `docs/legal/`. Ariana's LLC already formed as "Modern Village LLC". Jorrel still needs to form "Modern Village Services LLC" before signing. Attorney review needed (estimated $2K-4K flat fee). See `docs/legal/TERM-SHEET.md` for the plain-English overview.
6. **Regional Centers:** 21 imported into CRM. Craft RC-specific email sequence. Find Family Support Services director contacts at RCOC and RCSD. Ask Ariana for RC contacts.
7. **Dear Mom Co:** Research partnership opportunity — they got RCs to pay $495/ticket. Modern Village could be the digital companion.
8. **Bugs cleared:** All 12 tracked bugs resolved as of 2026-04-07. Admin sidebar reorganized into 8 grouped sections.

---

## Testing Checklist (Full Platform Test)

### Parent (testparent@modernvillage.app / TestParent123!)
- [ ] See Maya and Elijah in child switcher
- [ ] AI Coach works (send a message, get response)
- [ ] Behavior Tracker — log a behavior with ABA function chips (Tangible/Escape/Attention/Sensory)
- [ ] Community — post with photo, comment on a post
- [ ] Routine Builder — create, save, AI suggest, print
- [ ] IEP Toolkit — upload a PDF, analyze
- [ ] Care Team Notes — post a note, reply
- [ ] Care Team — invite a caregiver/teacher/provider
- [ ] Session Notes — see shared provider notes (read-only)
- [ ] Crisis Mode — walk through de-escalation steps
- [ ] Voice Mode — mic button on chat bar
- [ ] Daily Check-in — should prompt
- [ ] Progress Milestones — check sidebar
- [ ] Child login — create kid login for Maya (username + PIN)
- [ ] Forgot password flow — test from login screen
- [ ] Profile — edit, add child, set active

### Provider (testprovider@modernvillage.app / TestProvider123!)
- [ ] See 5 clients with trend stats and billing amounts
- [ ] Click client → Behavior Logs tab (read-only)
- [ ] Session Notes tab — see notes, create new note
- [ ] Generate AI clinical narrative in session note
- [ ] Billing tab — see claims summary, aging report
- [ ] Generate Claim from session note
- [ ] Update claim status (pending → submitted → paid)
- [ ] Superbill — generate and print
- [ ] Insights tab — see behavioral patterns
- [ ] Care Notes tab — post and read notes
- [ ] Sidebar: Billing Dashboard (all clients)
- [ ] Sidebar: My Payers — add/remove payers
- [ ] Sidebar: Care Team Notes
- [ ] Provider pending screen (test with unverified account)

### Caregiver (testcaregiver@modernvillage.app / TestCaregiver123!)
- [ ] See Maya only
- [ ] Log a behavior — should show "Logged by Test Caregiver"
- [ ] Routines — read-only (no edit/save/AI)
- [ ] Saved Strategies — read-only (no delete)
- [ ] Care Team Notes — post and read
- [ ] No AI Coach, no Community, no IEP Toolkit

### Teacher (testteacher@modernvillage.app / TestTeacher123!)
- [ ] See Elijah only
- [ ] Behavior Summary — weekly comparison, trends, expandable logs
- [ ] Log a behavior — attributed to teacher
- [ ] IEP Toolkit access
- [ ] Routines — read-only
- [ ] Care Team Notes
- [ ] No AI Coach, no Community

### Child (create via parent → Profile → "Create Kid Login")
- [ ] Login with username + PIN from "I'm a kid" link
- [ ] Mood check-in (emoji grid)
- [ ] Coping tools display
- [ ] Routine viewer
- [ ] Feelings history
- [ ] No access to parent data

### Admin (admin@modernvillage.app / IttakesaVill@ge!)
- [ ] Users tab — all users with roles, children, multi-child display
- [ ] Reset PW button works
- [ ] Verify Providers tab
- [ ] Invites tab
- [ ] Billing Overview — claims by status, revenue by provider
- [ ] Leads CRM — 16,000+ leads, filter, search, status update
- [ ] Marketing tab — signup chart, role breakdown, conversion funnel
- [ ] Email Campaigns — create blast, create 9-email sequence, AI generate, send test
