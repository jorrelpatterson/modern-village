# Handoff: iOS Capacitor Wrap — Starting Context

**Created:** 2026-04-17 at end of session that shipped email drips + autoresearch framework
**For:** new thread starting the iOS Capacitor build

---

## READ THIS FIRST if you're a new session picking up this work

The user (Jorrel) is starting a new thread to scope + build the iOS Capacitor wrap. He has an Apple developer account as of 2026-04-16. This doc captures everything you need to bootstrap.

**Don't skip the "current platform state" section** — it's easy to assume things are greenfield when Modern Village has ~60 commits of infrastructure already live.

---

## Current platform state (what's built + live)

### In production right now

- **Web app:** `modernvillage.app` (Vercel, vanilla HTML/CSS/JS, single-file apps — no React/framework)
- **API proxy:** Cloudflare Worker at `village-api.jorrelpatterson.workers.dev` (worker.js, vanilla JS)
- **Database:** Supabase (project `efuxqrvdkrievbpljlaf.supabase.co`) with RLS
- **Auth:** Supabase Auth (Google OAuth + email/password)
- **Payments:** Stripe ($19.99/mo Family Pro — shared across co-parents via `child_access` table)
- **Email:** Resend (hello@modernvillage.app transactional + 3 outreach subdomains verified: bcba.outreach, district.outreach, rc.outreach)
- **AI:** Claude Sonnet 4 via Anthropic API (proxied through worker.js)
- **Hosting:** Vercel (auto-deploy from GitHub main branch)

### Pages that will be wrapped into the native shell

- `index.html` — landing page
- `screener.html` — M-CHAT-R lead-gen funnel
- `app.html` — the main authenticated app (AI coach, behavior tracking, daily check-ins, routines, IEP toolkit, community/My Village, care team)
- `blog.html` — SEO content
- `admin.html` — for Jorrel only, not wrapped
- `district-admin.html` — for district coordinators, not wrapped

### Key architectural constraints that affect Capacitor

1. **Single-file HTML apps, no build system.** `app.html` is a 600+ KB file containing all UI + logic. No webpack/vite/turbopack. Capacitor wraps the live website or bundles static assets — either works with this architecture.
2. **Supabase client loaded via CDN** — no npm install of supabase-js in the repo.
3. **Cloudflare Worker is the ONLY backend endpoint** for anything that needs secrets (Resend, Anthropic, Stripe webhook). The iOS app continues to call this worker for everything it doesn't hit Supabase directly for.
4. **No existing Expo/React Native/Capacitor config in repo.** Zero-start.

---

## The Capacitor strategy (already decided, per `docs/SUPPLEMENTARY.md` §7)

### Payment strategy — CRITICAL decision already made

**ALL subscriptions go through Stripe on web. NO in-app purchases.**

- iOS app has NO subscribe button visible
- Pro upgrade CTA in-app says "Upgrade at modernvillage.app" and opens Safari
- This saves Apple's 30% cut (~$3-6K/mo at scale)
- Apple generally allows this as long as there's no in-app purchase button to avoid

**Reference:** every major consumer app with a web subscription (Netflix, Spotify Premium, YouTube Premium, Audible) uses this pattern.

### Native features by priority

| Feature | Priority | Use case |
|---------|----------|----------|
| Push notifications | **P0** | Daily check-in 8pm, morning routine 7am, booking reminder 24hr, streak at risk, milestone, weekly digest, community reply, new strategy card |
| Biometric auth (Face ID / Touch ID) | P1 | Quick return to app after signin |
| Share sheet | P1 | Share strategies, screener results, community posts |
| Offline caching | P1 | Resume app offline, view cached routines/strategies |
| Badge count | P1 | Unread community/messages |
| Camera | P2 | Community post photo uploads (already works on web via file input) |
| Microphone | P2 | Voice Mode for AI coach (already works on web) |
| Geolocation | P2 | My Village "nearby parents" feature (already works on web) |

### HIPAA constraint on push notifications

Push notification text is **generic** — no PHI. Examples:
- ✅ "Time for your daily check-in"
- ✅ "Your weekly digest is ready"
- ❌ "Emma had 3 meltdowns this week"
- ❌ "Your provider sent new session notes about Jack"

Content with names/diagnoses/behaviors stays INSIDE the authenticated app.

---

## Decisions the new session needs to make (flag these in brainstorming)

1. **Static bundle vs remote-URL wrap?**
   - Remote: Capacitor WebView loads `modernvillage.app` live; app updates happen via normal web deploys
   - Static: HTML/JS is bundled into the .ipa; updates require App Store resubmit
   - **Apple generally rejects pure remote WebView wrappers** ("web clip")
   - Hybrid: bundle a base shell + dynamic content from backend — what most serious Capacitor apps do

2. **Which framework layer?**
   - **Capacitor + vanilla HTML** (matches existing codebase, lowest lift)
   - **Capacitor + React/Vue** wrapper (adds build system, bigger rewrite)
   - Recommendation: vanilla — matches the existing single-file pattern

3. **Version strategy for subscriptions?**
   - App Store reviewers look for: no in-app purchase button, no link-out to payment site from within app context, no "subscribe here" language in the app itself. Need to carefully design the Pro upgrade CTA.

4. **Testing cohort?**
   - TestFlight for beta distribution. Jorrel's current testers + Ariana + small pilot can install via invite.

5. **Timeline?**
   - Apple review takes 1-5 days typically. Plan for 2 review cycles minimum.

---

## What to tell the brainstorm subagent

When invoking brainstorming for this, give it:

1. This handoff doc path: `docs/superpowers/HANDOFF-2026-04-17-ios-capacitor.md`
2. The Capacitor strategy doc: `docs/SUPPLEMENTARY.md` §7 (lines ~193-203)
3. The key constraints:
   - Web-only Stripe, no in-app purchases
   - Generic push notification text (HIPAA)
   - Vanilla HTML/JS — no build system to introduce
   - Cloudflare Worker proxy for backend
   - Supabase Auth already handles login

4. The first brainstorming question should be: **bundle strategy** (static vs remote vs hybrid) — this is the biggest architectural decision and shapes everything downstream.

---

## Out-of-band items the new session shouldn't re-decide

These are already locked:
- [x] Apple developer account exists ($99/yr, paid)
- [x] Use Capacitor (not React Native, not Flutter, not Swift-native)
- [x] Web-only Stripe / no IAP
- [x] Push notifications are P0
- [x] Single-file vanilla HTML stays

---

## Parallel work still alive (don't let Capacitor block these)

1. **Meta Pixel + autoresearch migrations** — 2 migrations + 1 find-replace + `wrangler deploy` = ~10 minutes of Jorrel's time. Unblocks marketing ad tracking.
2. **Ariana editing BCBA cold sequence copy** — she does this in admin → Campaigns → Edit Sequence.
3. **PC Billing Phase 2a/2b** — biggest revenue lever still pending. Can scope in a separate thread.

---

## Final session state at time of this handoff

- Branch: `feat/email-drips-optimization` (49 commits ahead of main — NOT MERGED YET; both email drips + autoresearch builds live on this branch)
- Tags: `drips-phase-1-done`, `drips-phase-2-done`, `drips-phase-3-done`, `drips-phase-5-done`, `drips-deployed`, `drips-complete`, `ar-phase-4-done`, `autoresearch-live`
- Open question for Jorrel: merge feat/email-drips-optimization to main NOW, or continue layering work on it? (My recommendation: merge it. It's production-stable. Start Capacitor work on a fresh branch from main.)
