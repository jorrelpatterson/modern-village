# Known Bugs & Issues

Track bugs found during testing. Fix priority: Critical > High > Medium > Low.

---

## Critical

_(none currently)_

## High

1. **Forgot password email flow incomplete** — Supabase sends the reset email, but when user clicks the link, app.html doesn't detect the reset token or show a "set new password" form. User just lands back in the app with no way to set a new password. Workaround: admin can reset via admin portal "Reset PW" button.

2. **Profile email not synced from auth** — New Supabase auth users get a profile row with `email = null`. The `handleAuth` signup flow sets it, but direct Supabase dashboard user creation does not. Need a trigger or periodic sync.

3. **Admin portal shows only 1 child per user** — The Users table reads legacy `child_name`/`child_age`/`diagnosis` from `profiles` table instead of querying the `children` table. Multi-child parents only show their first/legacy child. **Impact:** Also affects grant reporting metrics (`loadGrantData`) and behavior data stats (`loadBehavior`) which may use the same legacy profile fields. Fix: update admin `loadUsers()` to join on `children` table and show all children, or at least the active child. Also audit grant and behavior admin functions for the same issue.

## Medium

4. **Invite role validation too strict** — Worker `/invite` endpoint only accepts `caregiver` and `teacher` but not `provider`. Updated in latest code but needs worker redeploy to take effect.

5. **Admin portal child data shows legacy fields** — Related to #3. The entire admin dashboard uses `profiles.child_name` etc. instead of the `children` table. Needs a systematic update across all admin functions.

## Low

6. **macOS resource fork files (._*) in git** — External volume creates AppleDouble metadata files that cause `non-monotonic index` warnings on every git operation. Cosmetic but noisy. Fix: add `._*` to `.gitignore` and run `git gc`.

---

_Add new bugs below with the next number. Move to "Fixed" section when resolved._

## Fixed

_(move resolved bugs here with date)_

---

## Roadmap — Future Features

7. **Child/Teen login** — Simplified self-regulation view: coping strategies, mood check-ins, routine viewer. No access to parent logs or clinical data. `access_level: 'self'` already defined in `child_access`. Parent creates the child's account from their settings. (Phase 4)

8. **Behavior log triggers should use ABA functions** — (Ariana feedback) Replace free-text trigger field with ABA function categories: Access to Tangible, Escape/Avoidance, Attention, Sensory/Automatic. Makes data less subjective, more clinically useful. Could be chip/button selection with optional free-text detail.

9. **Community posts: file/photo uploads** — (Ariana feedback) Parents want to share visual aids, schedules, etc. in community posts. Needs Supabase Storage for image uploads + display in post cards.

10. **Daily check-in prompt shows for all roles** — Only parents (and possibly children) should see the morning check-in modal. Providers, caregivers, and teachers should not be prompted. Fix: add `S.role === 'parent'` guard to `checkDailyCheckin()`.

11. **Two-parent households need dual parent access** — Currently only one parent account owns the child. Need to support a second parent (co-parent) with full access. Could use the invite flow with a new `co-parent` role that has `access_level: 'full'`, or add a second `user_id` on the children table.

12. **Provider Insights tab loads forever** — `fetchChildContext()` queries behavior_logs by `S.user.id` (the provider), but the logs belong to the parent's `user_id`. Provider Insights needs to query by `providerActiveChild.user_id` instead. The `loadClientTab` insights section already does this correctly for behavior logs but the insights renderer may call the wrong fetch.
