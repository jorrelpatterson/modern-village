# Design: iOS + Android Capacitor Wrap

**Date:** 2026-04-17
**Status:** Approved by Jorrel (founder), ready for implementation plan
**Target public launch:** mid-May 2026 (~4 weeks, aggressive)
**Branch strategy:** Spec committed on `feat/email-drips-optimization`; actual code work begins on a fresh `feat/ios-capacitor` branch cut from `main` after email drips merges
**Handoff reference:** `docs/superpowers/HANDOFF-2026-04-17-ios-capacitor.md`

---

## Summary (founder-level)

We are shipping native iOS and Android apps for Modern Village by wrapping the existing `modernvillage.app` website in a Capacitor shell. The native apps add push notifications, biometric login, offline mode, and a native share sheet on top of the existing web experience. Subscriptions stay on Stripe via the web (no in-app purchase — saves 30% Apple/Google fee). Both platforms ship on the same day.

Timeline: 4 weeks. Week 1 foundation. Week 2 native features. Week 3 beta + submit. Week 4 review + launch.

Path chosen: aggressive submission with full feature set, accepting ~20% Apple rejection risk in exchange for speed. TestFlight cohort is inner circle only (5–10 trusted beta testers).

---

## The 6 locked founder decisions

| # | Decision | Value |
|---|---|---|
| 1 | App Store rejection risk tolerance | **Aggressive** — submit with full feature set including external upgrade link; fix and resubmit if rejected |
| 2 | TestFlight beta cohort | **Inner circle** — 5–10 trusted testers (Jorrel, Ariana, handful of BCBAs/parents) |
| 3 | Push notification tone + frequency | **Tone B** (soft & conversational) across all 9 types. **All three frequency layers**: per-notification toggles, smart capping, time-of-day learning |
| 4 | App Store metadata | Name: **Modern Village**. Subtitle: **"ABA-powered parenting support"**. Icon: existing favicon. Screenshots: annotated (5 images). Description: drafted by Claude, Jorrel approves |
| 5 | iOS or iOS + Android | **iOS + Android simultaneously** — same-day launch on both stores |
| 6 | Launch timing | **Aggressive** — public launch by mid-May 2026 |

---

## Scope

### In scope for v1 launch

- Capacitor shell for iOS and Android, loading web content via live updates
- Native push notifications (9 types, APNs + FCM)
- Per-notification toggles in Settings
- Smart frequency capping (auto-back-off for ignored pushes)
- Time-of-day learning (per-user `best_push_hour`)
- Biometric login (Face ID / Touch ID / Android fingerprint)
- Offline cache layer with automatic wipe on sign-out
- Native share sheet integration
- Pro upgrade explainer screen with web handoff to Stripe checkout
- App Store + Google Play Store listings with annotated screenshots
- Apple App Privacy "nutrition label"
- App icon set for both stores (derived from existing favicon)

### Explicitly out of scope for v1

- In-app purchases / StoreKit (intentionally excluded — web-only Stripe)
- Camera, microphone, geolocation as native-only features (they already work on web via browser APIs, no native wrap needed for v1)
- App Tracking Transparency (ATT) prompt (only needed if Meta Pixel runs on iOS; deferred to autoresearch-on-mobile decision)
- Deep linking beyond the chat-limit push (`mv://upgrade-explainer`)
- Push rich media (images, actions)
- Android-specific adaptive icons (using standard icon for v1)
- Tablet-optimized layouts (phone-first)
- Apple Watch / Wear OS companion apps

---

## Architecture

### Bundle strategy: hybrid with self-hosted live updates

The native shell contains a minimal bootstrap HTML file and Capacitor plugins. On each app launch, the shell checks a manifest URL for the latest approved web bundle version, downloads the bundle if new, extracts it locally, and loads the web content from the local extracted path. If no update is available, the last-cached bundle is used. First-launch fallback: a baked-in copy of the bundle is included in the .ipa / .aab so the app works before any network call.

**Chosen tool:** `@capgo/capacitor-updater` (self-hosted, free, community-maintained). Avoids Ionic Appflow's $499/mo fee. The manifest and bundle zip are served from Vercel (same infra as the website).

**Manifest URL shape:** `https://modernvillage.app/ios-manifest.json` returns `{ version: "1.0.3", known_good: true, url: "https://modernvillage.app/bundles/1.0.3.zip", checksum: "..." }`.

**Version pinning safeguard:** if `known_good: false`, the app stays on its last cached bundle. This is the kill switch for broken deploys. Manifest is manually updated by admin (or auto-updated only on tagged-release deploys).

### Payment strategy

Stripe web-only. The native apps display an in-app Pro explainer screen at every locked feature; this screen contains a "Manage subscription at modernvillage.app" button. Tapping the button opens `@capacitor/browser` (SFSafariViewController on iOS, Chrome Custom Tabs on Android) to `https://modernvillage.app/upgrade?from=ios` (or `from=android`). After Stripe checkout completes, the Supabase webhook marks the user Pro; the native app detects the change on its next session refresh.

**Chat-limit push (notification #9)** uses a two-hop pattern to reduce Apple rejection risk: the push itself says "You've used today's free chats. Want unlimited?" with no mention of website or subscription. Tapping opens the app to the explainer screen; the explainer screen contains the web handoff button.

### Push notifications

**Plugin:** `@capacitor/push-notifications` — handles APNs + FCM registration, permission prompts, foreground/background message delivery, badge count.

**Server side:** Cloudflare Worker gains new endpoints:
- `POST /push/register` — stores APNs or FCM token in new `push_tokens` table keyed by `user_id` + `device_id` + `platform`
- `POST /push/send` — admin-only, manual trigger
- Scheduled cron triggers: `daily_check_in_push` (fires at per-user `best_push_hour`), `morning_routine_push` (7am local weekdays), `weekly_digest_push` (Sunday 6pm local), `streak_at_risk_push` (8:30pm local conditional), etc.

**APNs:** auth key (p8 file) registered with Apple. Stored as Cloudflare Worker secret. Send via HTTP/2 to `api.push.apple.com`.

**FCM:** Firebase project created for Modern Village. Service account JSON registered with Cloudflare Worker. Send via HTTP v1 API (OAuth2 access token flow).

**HIPAA constraint enforced at worker level:** push payload body is constructed from templates with variable substitution limited to non-PHI fields only. Templates and allowed variables are whitelisted in worker code. Kid names, diagnoses, and behavior data cannot be substituted.

### Dynamic frequency layers

**Layer 1 — per-notification toggles.** New `user_push_preferences` table in Supabase. One row per user x push type. Default on. Settings UI in the web app (inside the Capacitor shell) lets user toggle each type. Worker checks preferences before sending.

**Layer 2 — smart frequency capping.** `push_engagement` table tracks per-user per-type: `last_sent_at`, `last_tapped_at`, `consecutive_ignored_count`. Rule: if `consecutive_ignored_count >= 3`, reduce frequency to every other day. If `>= 6`, reduce to weekly. If `>= 10`, auto-disable (user notified in Settings, can re-enable). Any tap resets the counter.

**Layer 3 — time-of-day learning.** Mirror the existing `leads.best_open_hour` pattern onto `users.best_push_hour`. Daily rollup job analyzes when each user actually opens the app (from session data in Supabase). Daily check-in push and weekly digest push are sent at the user's learned hour +/- 30 min. Cold start default: 8pm local (check-in), 6pm Sunday local (digest).

### Biometric login

**Plugin:** `@aparajita/capacitor-biometric-auth` (mature, well-maintained Capacitor community plugin).

**Flow:**
1. User signs in normally first time (Supabase Auth email/Google OAuth)
2. On successful sign-in, app offers: "Enable Face ID for faster login next time?" On accept, stores Supabase refresh token in iOS Keychain / Android Keystore, encrypted-at-rest by OS
3. On next app launch, if keychain entry exists, app prompts Face ID/fingerprint
4. On success, retrieves refresh token and hydrates Supabase session without password
5. On failure (3x fallback threshold): falls back to full password/OAuth flow, clears keychain entry

**HIPAA safeguard:** keychain entry is cleared on explicit sign-out AND on any "sensitive action" failure (e.g., failed biometric attempts exceed 3).

### Offline mode

**Approach:** a Service Worker running inside the Capacitor WebView caches the last N loaded pages (app.html, screener.html, blog.html at minimum) in IndexedDB. On navigation while offline, cached pages are served. Network-dependent features (AI coach responses, community posts) display a "You are offline" state.

**Cache expiry:** 7 days per page.

**HIPAA wipe on logout:** sign-out action calls `navigator.serviceWorker.controller.postMessage({ action: 'wipe' })` which clears all IndexedDB caches, localStorage, and sessionStorage. Supabase session tokens, biometric keychain entries, and any PHI-containing cached pages are all removed.

### Share sheet

**Plugin:** `@capacitor/share` — one-line call from JS. Feature-detected: on native platforms, routes to Capacitor native share (iOS share sheet, Android intent). On web, falls back to Web Share API or clipboard copy.

### Build tooling

- `npx cap init` — initialize Capacitor in the repo
- `npx cap add ios` — add iOS platform (creates `ios/App/` Xcode project)
- `npx cap add android` — add Android platform (creates `android/` Gradle project)
- `npx cap sync ios` / `npx cap sync android` — sync web bundle and native plugins after changes
- Build: Xcode 26 (required by Apple's Apr 28 2026 deadline). Android Studio latest stable.
- No Node/npm runtime in production — Capacitor CLI is dev-only. The shipped app is pure native binary + web bundle.

### Tech stack additions (new dependencies)

| Package | Purpose |
|---|---|
| `@capacitor/core` | Core runtime |
| `@capacitor/ios` | iOS platform |
| `@capacitor/android` | Android platform |
| `@capacitor/push-notifications` | APNs + FCM |
| `@capacitor/share` | Native share sheet |
| `@capacitor/browser` | In-app browser for Stripe handoff |
| `@capacitor/preferences` | Settings storage |
| `@capgo/capacitor-updater` | Live updates (self-hosted) |
| `@aparajita/capacitor-biometric-auth` | Biometric login |

Firebase project for FCM (Android push). Apple APNs auth key for iOS push.

---

## User experience

### First-time user flow

1. Open app to screener.html (M-CHAT-R funnel, same as web)
2. Complete screener to see results
3. Sign up via Google OAuth or email (Supabase Auth)
4. Soft prompt: "Get gentle reminders to check in? You can turn them off anytime." On accept, standard iOS/Android push permission prompt fires
5. Second prompt: "Use Face ID next time?" On accept, biometric enrollment
6. Lands in the authenticated app (app.html)

### Return user flow

1. Open app to biometric prompt (if enrolled), Face ID/fingerprint success, straight into app
2. If biometric fails 3x, falls back to password/OAuth flow

### Push experience

- One or two pushes/day max for an active user (daily check-in + occasional event)
- All pushes follow Tone B (soft & conversational)
- Each can be toggled off independently in Settings
- Ignored pushes auto-back-off
- Time-of-day adapts to when user actually opens app

### Pro upgrade moment

1. User taps locked feature
2. Clean explainer screen: "This is part of Modern Village Pro. Unlimited AI coach chats, full routine library, priority community support."
3. "Manage subscription at modernvillage.app" button
4. Opens in-app Safari/Chrome browser to `/upgrade?from=ios`
5. Completes Stripe checkout
6. Returns to app (either via "Done" button or auto after success)
7. App refreshes session, Pro flag lights up, locked feature now accessible

---

## Push notification catalog (final locked copy — Tone B)

| # | Type | When it fires | Copy |
|---|---|---|---|
| 1 | Daily check-in | Per-user `best_push_hour` (default 8pm local) | "Hey — how did today go? Want to do a quick check-in?" |
| 2 | Morning routine | 7am local, weekdays | "Good morning. Your routine for today is ready when you are." |
| 3 | Booking reminder | 24hr before provider session | "Just a heads up — your session with [provider name] is tomorrow." |
| 4 | Streak at risk | 8:30pm local, only if no check-in yet AND 3+ day active streak | "Don't lose the streak — a quick check-in keeps it going." |
| 5 | Milestone celebration | On 7-day, 30-day, 90-day streak achievement | "[N] days. We see you. That takes work." |
| 6 | Weekly digest | Sunday 6pm local (time-of-day learned) | "Your week is wrapped up — take a peek when you're ready." |
| 7 | Community reply | Within 5 min of reply on user's My Village post | "Someone in My Village replied to your post." |
| 8 | New strategy card | When admin publishes a new card matching child profile | "We added a new strategy you might want to try." |
| 9 | Chat limit reached | When user hits daily free chat cap (once per 24hr max) | "You've used today's free chats. Want unlimited?" (deep link to in-app Pro explainer) |

**Whitelisted variables:** `[provider name]` (clinician name — not patient PHI), `[N]` (streak day count). No child names, no diagnoses, no behavior data anywhere.

---

## App Store + Google Play metadata

**Name:** Modern Village
**Subtitle (iOS) / Short description (Play):** "ABA-powered parenting support"
**Icon:** derived from existing `favicon.svg` at required sizes (1024x1024 master for iOS; adaptive icon foreground + background for Android)
**Screenshots (5 annotated):**
1. AI coach conversation — headline: "Your BCBA-built parenting coach, 24/7"
2. Daily check-in with mood tracker — headline: "A gentle daily check-in"
3. Routine library — headline: "Routines that actually work"
4. My Village community — headline: "You're not doing this alone"
5. Strategy card — headline: "Real strategies from clinicians who get it"

All screenshots use **fake demo data** (no real PHI). Device: iPhone 16 Pro Max (6.9") + iPhone 16 (6.1") for iOS. Pixel 8 Pro + Pixel 8 for Android.

**Description text:** drafted by Claude from existing landing page copy; Jorrel approves in Week 2.

**Apple App Privacy nutrition label:** drafted from existing `privacy.html`; covers data categories: contact info (email), user content (journal entries, check-ins), identifiers (push token, device ID), usage data (session analytics), diagnostics (crash logs).

---

## Timeline

### Week 1 (Apr 17 – Apr 23) — Foundation

- Jorrel installs Xcode 26 (Day 1)
- Jorrel pays $25 Google Play Console fee (Day 2)
- `feat/ios-capacitor` branch cut from `main`
- Capacitor initialized in repo, iOS + Android platforms added
- Both shells build and load `modernvillage.app` successfully
- Apple APNs auth key generated (Jorrel walks through with Claude, Day 3)
- Firebase project created for FCM
- TestFlight inner circle list collected (Jorrel, Day 4)
- Basic push notification delivery confirmed end-to-end to Jorrel's device

### Week 2 (Apr 24 – Apr 30) — Native features

- All 9 push types wired up (Cloudflare Worker + APNs + FCM)
- `user_push_preferences` + `push_tokens` + `push_engagement` tables created in Supabase
- Per-notification toggle UI in Settings (inside web app)
- Smart frequency capping logic shipped
- Time-of-day learning cron job shipped
- `@aparajita/capacitor-biometric-auth` integrated, Face ID/Touch ID/fingerprint flow working
- Service Worker offline cache layer shipped
- Sign-out HIPAA wipe routine shipped
- `@capacitor/share` integrated with existing web share buttons
- Pro upgrade explainer screen built
- `@capacitor/browser` handoff to Stripe working end-to-end
- Live updates manifest + `@capgo/capacitor-updater` integration working
- App icons generated and added
- Jorrel approves final push copy (Day 1)
- Screenshots drafted by Claude (Day 4), Jorrel approves
- Description text drafted by Claude (Day 5), Jorrel approves

### Week 3 (May 1 – May 7) — Beta + submission

- TestFlight build uploaded Day 1
- Google Play internal testing track live Day 1
- Inner circle invited
- 4 days of real-device feedback collection
- HIPAA pre-submission checkpoint (Jorrel, Day 3)
- Bug fixes from beta
- Final store assets locked
- Submit to Apple + Google for public review Day 5

### Week 4 (May 8 – May 14) — Review + launch

- Apple review (1–5 days), if rejected fix + resubmit same-day
- Google review (1–3 days, typically clears first)
- Public launch day coordinated for Apple approval
- Announcement email + social posts (Jorrel)

---

## Founder action items

Full list of things Jorrel needs to personally do, with timing.

| # | Action | When | Estimated time |
|---|---|---|---|
| 1 | Upgrade Xcode to v26 | Week 1 Day 1 | ~1 hr (download time) |
| 2 | Pay $25 Google Play Console fee | Week 1 Day 2 | ~10 min |
| 3 | Generate Apple push notification auth key | Week 1 Day 3 | ~15 min (walked through) |
| 4 | Finalize TestFlight inner circle list | Week 1 Day 4 | ~10 min |
| 5 | Approve final push notification copy | Week 2 Day 1 | ~15 min |
| 6 | Approve App Store screenshots | Week 2 Day 4 | ~30 min |
| 7 | Approve App Store description text | Week 2 Day 5 | ~30 min |
| 8 | Mirror metadata for Google Play listing | Week 3 Day 2 | ~30 min |
| 9 | Confirm "go" for Apple + Google submission | Week 3 Day 5 | ~5 min |
| 10 | Public launch marketing (email + social) | Week 4 on approval | ~2 hrs |
| 11 | **HIPAA pre-submission checkpoint** | Week 3 Day 3 | ~30 min |

**Total founder time:** roughly 6–8 hours over 4 weeks.

---

## Risks and mitigations

### Risk 1 — Apple rejects first submission (~20% likelihood)

Impact: 3–7 day launch slip.
Mitigations: (a) native shell features reduce "too website-like" rejections; (b) chat-limit push uses two-hop pattern to reduce external-payment rejection; (c) metadata triple-checked before submission; (d) on rejection, reviewer provides reason — fix and resubmit same-day.

### Risk 2 — Push notifications unreliable in early testing

Impact: bad first impression with inner circle.
Mitigations: Jorrel is the first test recipient in Week 1, before inner circle invited. Confirms end-to-end delivery before wider beta.

### Risk 3 — Broken web deploy ships via live updates to existing users

Impact: white screen for users until next app launch.
Mitigations: `known_good: false` kill switch in manifest; last-cached bundle fallback; manual manifest update process for tagged releases.

### Risk 4 — Capacitor compatibility issue with 600KB `app.html`

Impact: specific feature glitches on native only.
Mitigations: TestFlight inner circle catches these before public review; single-file vanilla HTML is the easiest architecture for Capacitor to handle.

### Risk 5 — Xcode 26 deadline trip-up

Impact: cannot upload builds, total stall.
Mitigations: Day 1 task #1 is upgrade. Early failure if Mac hardware too old, adjusts timeline before Week 3 crunch.

### Risk 6 — HIPAA / BAA gap discovered pre-launch

Impact: launch delay or scope cut.
Mitigations: Action #11 checkpoint in Week 3 Day 3. Jorrel owns this separately from the build; tracked in founder roadmap.

---

## HIPAA considerations

### Mobile-specific risks addressed in this design

- **No PHI in push notification body** — enforced at worker level with whitelisted template variables. Apple APNs and Google FCM do not sign BAAs; keeping bodies generic eliminates that concern.
- **Offline cache encrypted at rest** — iOS/Android encrypt app data automatically when device has a passcode; cache wipe on sign-out clears any PHI.
- **Biometric login fallback** — Face ID/Touch ID failures fall back to password after 3 attempts, preventing look-alike access.
- **In-app browser handoff** — Stripe/Supabase handle upgrade checkout with existing web-side protections (assumed BAA-compliant; see founder roadmap).
- **Screenshots use demo data** — no real user PHI in App Store / Play Store listings.
- **App Privacy nutrition label** — drafted to accurately reflect data categories collected in the native app context.

### Founder-owned (tracked in Jorrel's roadmap, not blocking launch)

Confirm signed BAAs are in place with:

- Supabase (Pro plan or higher required for BAA)
- Cloudflare (Workers Enterprise BAA)
- Anthropic (Claude for Healthcare / enterprise BAA)
- Vercel (Enterprise BAA)
- Stripe (healthcare merchant BAA)
- Resend (limited BAA availability — evaluate risk)

Jorrel will handle BAA verification separately. If any gap is discovered at the Week 3 checkpoint, launch go/no-go is a separate decision at that point.

---

## Success criteria for launch

- Both iOS and Android apps publicly available in their stores by end of Week 4
- First 5–10 inner circle testers active on TestFlight / Google Play internal testing for at least 5 days before submission
- Push notification delivery success rate >95% in testing
- Biometric login works on iPhone 12+ and Pixel 6+ target devices
- Offline mode reads last-cached pages on signal loss
- Pro upgrade completion rate from in-app handoff within 20% of web-direct rate
- Zero HIPAA violations identified at Week 3 checkpoint
- App Store / Play Store approved on first or second submission

---

## Open questions / deferred decisions

- **Meta Pixel on mobile + ATT prompt.** Autoresearch framework uses Meta Pixel. Mobile requires App Tracking Transparency opt-in, which ~25–30% of users accept nationally. Decision deferred: enable Meta Pixel on native or skip tracking on native-only traffic? Not blocking v1 launch.
- **Apple Watch / Wear OS companion.** Powerful for daily check-in push at the wrist. Out of scope for v1. Revisit in v1.1.
- **Tablet layouts.** Phone-first for v1. Tablet support a v1.1 item if user demand emerges.
