# Modern Village — Product Roadmap

**Last updated:** 2026-04-06

---

## Completed

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
| iOS/Android Capacitor wrap | Native app shell, Face ID, App Store distribution | High |
| Push notifications | Daily check-in triggers, care team note alerts, session reminders, milestone celebrations | High (requires native app) |
| **Medical billing module** | **DONE (Phase 1): Claims tracking, payer management, superbills, billing dashboard, aging reports. NEXT (Phase 2): Clearinghouse integration (EDI 837) for electronic claim submission via Availity/Office Ally. Phase 3: ERA/EOB auto-processing, denial management automation, batch claim submission.** | **Phase 1 Done** |
| Google Calendar sync | Routines → calendar events, session reminders for Ariana | Medium |
| Booking reminders | 24hr email cron job before scheduled sessions | Medium |
| Video behavior clips | Parent uploads video, AI analyzes behavior in context. Use Claude vision or other video-capable AI if needed. BCBA can also review clips. | Medium |
| Provider Marketplace v2 | Public-facing marketplace browsing, application → review → onboarding flow, multi-provider booking UI | Medium |
| District admin portal | Separate coordinator login — can see aggregate data across all schools/teachers in their district, manage teacher onboarding, view engagement metrics | Medium |
| Caregiver mental health support (Pillar 10) | LPC-provided support for caregivers through the platform. Requires hiring an LPC. | Low (needs hire) |
| Parent Support Groups | Live group coaching sessions via platform | Low |

### Phase 4
| Feature | Description |
|---------|-------------|
| Neurodivergent adult subscription | $9.99-19.99/mo, age 18+ transition |
| School-home bridge | Teacher ↔ parent notifications, school behavior sync |
| Standardized assessment tracking | VB-MAPP, ABLLS-R, Vineland |
| Parent story library | Shared experiences, searchable by diagnosis/age/challenge |
| "My Village" resource map | GPS-based local resources (therapy, schools, support groups) |
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
- [ ] Form LLC → bizfileonline.sos.ca.gov
- [ ] Get EIN → irs.gov
- [ ] Create Stripe account with real payments ($19.99/mo + session fees)

### 🟡 Marketing
- [ ] Post first 4 graphics on Instagram
- [ ] 30-day content calendar
- [ ] Post screener link in autism parent Facebook groups (free traffic)
- [ ] Post screener on Reddit (r/Autism, r/AutismParenting, r/beyondthebump)
- [ ] Email autism bloggers to link to screener (backlink building)
- [ ] Implement email drip sequences in code (re-engagement, weekly digest) — sequences already written in docs
- [x] Create Instagram @modernvillage.app
- [x] Referral program built

### 🟡 Grants (time-sensitive)
- [ ] Register at researchautism.org (OAR — $50K, OPEN NOW)
- [ ] NEXT for AUTISM signup ($10K — check cycle)
- [ ] Inclusive App Accelerator — apply Dec 2026 for 2027 cycle ($10K, inclusiveapps.com)
- [ ] Send Ariana grant docs to review
- [ ] NIH SBIR — $314K (paused, apply when reopens)
- [ ] NSF SBIR — $275K (paused)

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
- [ ] Convert pilot districts to paid contracts ($3-8/student/year)
- [ ] District admin portal (separate coordinator login)

### 🔵 Conferences & Outreach
- [ ] Conference presentations (CASE, CEC)
- [ ] Annual conference planning
- [ ] CalABA conference
- [ ] Post in BCBA Facebook groups (Ariana)
- [ ] LinkedIn Sales Navigator trial

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

---

## Reminders (Next Session)

1. **Deploy worker.js to Cloudflare** — latest version has email sequences, token cap raise (8000), campaign send endpoint, webhook receiver. Paste code from repo into Cloudflare dashboard.
2. **Have Ariana test:** Crisis mode, voice mode, care team invites, ABA trigger buttons (Tangible/Escape/Attention/Sensory), community photo uploads, provider signup flow
3. **Ready to launch campaigns:** 9-email drip sequences for BCBAs (15,000 leads), Districts (994 leads), Regional Centers (21 leads) — all in admin CRM
4. **Next to build:** Medical billing module — automated claim submission, ERA/EOB processing, billing dashboard. This is the BCBA hook that makes them stay.
5. **Business tasks:** Form LLC, get EIN, activate Stripe real payments, OAR grant application (open now, $50K)
6. **Regional Centers:** 21 imported into CRM. Craft RC-specific email sequence. Find Family Support Services director contacts at RCOC and RCSD. Ask Ariana for RC contacts.
7. **Dear Mom Co:** Research partnership opportunity — they got RCs to pay $495/ticket. Modern Village could be the digital companion.
