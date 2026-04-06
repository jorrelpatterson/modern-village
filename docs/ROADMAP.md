# Modern Village — Product Roadmap

**Last updated:** 2026-04-06

---

## Completed

### Parent Toolkit Upgrade (2026-04-06)
- [x] Community comments RLS fix (threaded comments, moderation)
- [x] Routine Builder overhaul (Supabase persistence, per-child, AI-generated routines with ABA tips, mobile touch drag-and-drop)
- [x] IEP Toolkit PDF upload & AI analysis (client-side extraction, goals/services/accommodations/gaps)
- [x] Child management bug fixes (add/switch child updates UI immediately)

### Phase 3: Multi-Role Collaboration Platform (2026-04-06)

**Sub-project 1: Role System**
- [x] Role field on profiles (parent, provider, caregiver, teacher)
- [x] Provider signup flow (NPI, license type/state/number, CPT codes)
- [x] Provider verification in admin dashboard
- [x] Parent invite flow (email link → caregiver/teacher/provider account creation)
- [x] Role-based UI routing (tabs, sidebar, features per role)
- [x] child_access table (who can see which child's data)
- [x] RLS policies for cross-role data access
- [x] Audit trail (invite sent/accepted/revoked timestamps)
- [x] Admin dashboard: verify providers, role filter, invite monitor

**Sub-project 2: Caregiver Network**
- [x] Care Team Notes (timeline with threaded comments, role-colored badges)
- [x] Behavior log attribution (logged by caregiver/teacher name badge)
- [x] Read-only Routine Builder for caregivers
- [x] Read-only Saved Strategies for caregivers
- [x] Sidebar updates per role

**Sub-project 3: Provider Dashboard**
- [x] Client list with behavioral trend stats
- [x] Client detail overlay (behavior logs, session notes, care notes, insights sub-tabs)
- [x] Session notes with structured fields (CPT, goals, interventions, response, next steps)
- [x] AI-generated clinical narratives for insurance documentation
- [x] Superbill PDF export (provider info, client info, service details, narrative, signature line)
- [x] Billing status tracking (draft/submitted/paid/denied)
- [x] Parent session notes view (read-only shared notes)
- [x] Provider invite option in care team

**Sub-project 4: Teacher View**
- [x] Behavior Summary page (weekly comparison, 30-day trends, peak times, top behaviors, triggers, strategy effectiveness)
- [x] Expandable recent behavior logs
- [x] Teacher behavior logging (attributed)
- [x] IEP Toolkit access for teachers
- [x] Read-only routines for teachers

**Admin & Infrastructure**
- [x] Admin password reset tool (via Cloudflare Worker + Supabase Admin API)
- [x] Forgot password link in app (sends reset email)
- [x] Admin RLS policies (is_admin() security definer function to avoid recursion)
- [x] Test accounts for all 4 roles

---

## In Progress / Next Up

### Phase 3, Sub-project 5: Crisis Mode
- [ ] Red button / crisis trigger (prominent, always accessible)
- [ ] De-escalation scripts (step-by-step calming guidance)
- [ ] 988 Suicide & Crisis Lifeline integration (one-tap call)
- [ ] Emergency provider booking (fast-track session with available BCBA)
- [ ] Crisis logging (auto-logs the incident in behavior tracker)

---

## Planned — Phase 2: Make It Essential

| Feature | Description | Priority |
|---------|-------------|----------|
| iOS/Android Capacitor wrap | Native app shell, push notifications, Face ID, App Store distribution | High |
| Push notifications | Daily check-in triggers, care team note alerts, session reminders | High |
| Voice mode | Hands-free crisis support — parent mid-meltdown can't type | Medium |
| Google Calendar sync | Routines become calendar events | Medium |
| Progress milestones + celebrations | Gamification on streaks and behavior improvements | Low |

## Planned — Phase 4: Make It a Movement

| Feature | Description |
|---------|-------------|
| Child/Teen login | Simplified self-regulation view: coping strategies, mood check-ins, routine viewer. `access_level: 'self'` already defined. Parent creates account. |
| Neurodivergent adult subscription | $9.99-19.99/mo, age 18+ transition |
| School-home bridge | Teacher ↔ parent notifications, school behavior sync |
| Standardized assessment tracking | VB-MAPP, ABLLS-R, Vineland |
| Parent story library | Shared experiences, searchable by diagnosis/age/challenge |
| "My Village" resource map | GPS-based local resources (therapy, schools, support groups) |
| Annual Village Report PDF | Behavioral summary for IEP meetings |
| Parent support groups | Live group coaching sessions |

## Planned — Phase 5: Scale

| Feature | Description | Revenue |
|---------|-------------|---------|
| Insurance PMPM licensing | Direct payer contracts, covered benefit | Recurring |
| SBIR/STTR grants | NIH $314K, NSF $275K | One-time |
| District contracts pipeline | $3-8/student/year, bulk teacher onboarding | $120-320K/yr |
| ABA company partnerships | B2B licensing for clinics | $70K/yr |
| HealthKit / Google Health Connect | Wearable data integration | — |
| Apple Watch support | Wrist notifications, quick log | — |

---

## Known Bugs

| # | Priority | Issue | Workaround |
|---|----------|-------|------------|
| 1 | High | Forgot password email flow incomplete — app doesn't handle reset token callback | Admin resets via admin portal "Reset PW" button |
| 2 | High | Profile email not synced from auth on dashboard-created users | Run SQL: `UPDATE profiles SET email = u.email FROM auth.users u WHERE profiles.id = u.id AND profiles.email IS NULL` |
| 3 | High | Admin portal shows only 1 child per user (uses legacy profile fields) | View children in Supabase directly |
| 4 | Medium | Invite role validation needs worker redeploy for provider support | Redeploy worker.js to Cloudflare |
| 5 | Medium | Admin dashboard uses legacy profile child fields throughout | — |
| 6 | Low | macOS resource fork files (._*) causing git warnings | Add `._*` to .gitignore |

---

## Architecture Notes

- **Single-file app:** `app.html` (~4,500 lines) serves all roles. `applyRole()` controls what each role sees.
- **No build system:** Vanilla HTML/CSS/JS by design. Fast iteration, no framework overhead.
- **Backend:** Supabase (PostgreSQL + RLS + Auth), Cloudflare Worker (API proxy + email + invites), Stripe (payments)
- **AI:** Claude Sonnet 4 via Anthropic API through Cloudflare Worker
- **HIPAA compliance:** Parent invite = authorization, RLS enforces minimum necessary access, audit trail via child_access/invites tables, Supabase BAA active
- **Design system:** Fraunces + DM Sans fonts, cream/sage/terracotta palette, warm editorial feel
