# Known Bugs & Issues

Track bugs found during testing. Fix priority: Critical > High > Medium > Low.

---

## Critical

_(none currently)_

## High

_(none currently)_

## Medium

_(none currently)_

## Low

_(none currently)_

---

_Add new bugs below with the next number. Move to "Fixed" section when resolved._

## Fixed

- **#1 Forgot password reset flow** — Replaced `prompt()` with proper modal UI (2026-04-07)
- **#2 Profile email sync** — Migration with trigger added: `20260406_sync_profile_email.sql` (2026-04-06)
- **#3 Admin shows only 1 child** — `loadUsers()` already joins on `children` table; grants/behavior use direct queries (2026-04-07)
- **#4 Invite role validation** — Worker now accepts `co-parent`, `caregiver`, `teacher`, `provider` (2026-04-07)
- **#5 Admin legacy child fields** — Resolved as part of #3 (2026-04-07)
- **#6 macOS resource fork files** — `.gitignore` has `._*`, cleaned `.git/objects/pack/` (2026-04-07)
- **#10 Check-in shows for all roles** — Added `S.role!=='parent'` guard to `checkDailyCheckin()` (2026-04-07)
- **#11 Two-parent households** — Co-parent invite flow with `access_level: 'full'`, loads via `child_access` (2026-04-07)
- **#12 Provider Insights wrong user_id** — Already fixed; queries `providerActiveChild.user_id` (2026-04-07)

---

## Roadmap — Future Features

7. **Child/Teen login** — Simplified self-regulation view: coping strategies, mood check-ins, routine viewer. No access to parent logs or clinical data. `access_level: 'self'` already defined in `child_access`. Parent creates the child's account from their settings. (Phase 4)

8. **Behavior log triggers should use ABA functions** — (Ariana feedback) Replace free-text trigger field with ABA function categories: Access to Tangible, Escape/Avoidance, Attention, Sensory/Automatic. Makes data less subjective, more clinically useful. Could be chip/button selection with optional free-text detail.

9. **Community posts: file/photo uploads** — (Ariana feedback) Parents want to share visual aids, schedules, etc. in community posts. Needs Supabase Storage for image uploads + display in post cards.

10. **Child/Teen login** — (moved from #7, same feature)

11. **Behavior log triggers should use ABA functions** — (moved from #8, Ariana feedback)

12. **Community posts: file/photo uploads** — (moved from #9, Ariana feedback)
