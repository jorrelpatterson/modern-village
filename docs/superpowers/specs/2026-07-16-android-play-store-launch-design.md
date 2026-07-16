# Android Play Store Launch — Design

**Date:** 2026-07-16
**Status:** Design approved by Jorrel; pending spec review → implementation plan
**Goal:** Ship Modern Village to the Google Play Store as a fully working native Android app — including the subscription paywall — mirroring the existing iOS launch.

---

## 1. Context & current state

Modern Village's native apps are **Capacitor 8 wrappers in "server URL" mode**: the native shell loads `https://modernvillage.app/app.html` in a WebView (`capacitor.config.json:6`) rather than bundling web assets. The product itself already runs as a responsive web app, so the Android shell is thin — the real work is billing, store compliance, and native-plugin parity, not UI.

**What exists today:**

- `ios/` platform is built and shipping (Apple IAP via RevenueCat validated 2026-07-15). **No `android/` folder exists.**
- `capacitor.config.json`: `appId: "app.modernvillage.ios"`, `androidScheme: "https"` already set, `allowNavigation` allowlist already covers Supabase/Google/Stripe/Anthropic/Cloudflare/Vercel.
- Capacitor plugins in `package.json`: biometric-auth, camera, geolocation, haptics, push-notifications, share, status-bar, apple-sign-in (iOS-only), badge, revenuecat/purchases-capacitor.
- **Billing** is hard-gated to iOS: `mvIAP.available()` (`app.html:1933-1936`) returns false unless `getPlatform()==='ios'` and `RC_IOS_API_KEY` is set; `mvIAP.init()` calls `configure({apiKey: RC_IOS_API_KEY})` (`app.html:1944`). Worker routes `/iap/sync` + `/iap/webhook` are store-agnostic (driven by RevenueCat truth).
- **Auth**: "Sign in with Apple" button ships `class="hidden"` and is only revealed when the `AppleSignIn` plugin is present (`app.html:1902`, `6218`). Email/password + biometric app-lock are the primary flows.
- **Push** is live on iOS: `registerPushNotifications()` (`app.html:1710`) + a full APNs pipeline in `worker.js` (`sendPushToUser`, `push_tokens` table with a `platform` column, dedup, opt-out prefs, badge counts). `worker.js:212` explicitly skips non-iOS tokens: `if (t.platform !== 'ios') continue; // iOS only for now; add FCM later`.

---

## 2. Decisions (approved)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Android package name (permanent on Play) | **`app.modernvillage`** — override the Android `applicationId` only; iOS bundle id (`app.modernvillage.ios`) is never touched. |
| D2 | Subscription billing | **Google Play Billing via RevenueCat**, reusing the existing `mvIAP` module + `pro` entitlement + `default` offering. |
| D3 | Push notifications | **Firebase/FCM set up now** (required for a stable build — see §4.1), Android devices register tokens, but the worker's FCM **send** path is a **fast-follow** (worker already skips Android tokens safely). |
| D4 | Auth on Android | **No code change.** Email/password + biometric; the Apple button auto-hides. Google Sign-In is out of scope. |

---

## 3. Architecture

No new architectural boundaries. The Android app is another Capacitor target pointing at the same production web app and the same Cloudflare Worker / Supabase backend. RevenueCat abstracts the store, so the subscription data flow is identical to iOS:

```
Android app (WebView → modernvillage.app/app.html)
  → mvIAP.purchase() → RevenueCat SDK (Google Play Billing)
  → POST /iap/sync (worker, service-key) → profiles.subscription_status/source
  ← RevenueCat webhook → POST /iap/webhook (worker) → profiles (renewals/expiry)
```

The client never writes subscription columns (trigger-locked); the worker writes them from RevenueCat truth. This is unchanged from iOS.

---

## 4. Phased plan

### Phase 1 — Native shell & build (code + Firebase console)

1. `npx cap add android` (scaffolds the Gradle project from `appId`).
2. **Set the Android package name** to `app.modernvillage`: override `applicationId "app.modernvillage"` in `android/app/build.gradle`. The internal `namespace` (code package) may remain as Capacitor generates it — it's cosmetic and does not affect Play, Firebase, or RevenueCat, all of which key off `applicationId`.
3. **Icons/splash**: `npx capacitor-assets generate --android` from the existing `resources/` source art.
4. **Firebase**: create a Firebase project, register an Android app with package `app.modernvillage`, download `google-services.json` into `android/app/`. (Required for the build — see §4.1.)
5. `npx cap sync android`.
6. Build & run on an emulator + a physical device. Smoke-test: WebView loads the live app, login (email/password), biometric app-lock, camera, share, geolocation, core coaching + BCBA flows.

#### 4.1 Why Firebase is required now (not deferrable)

`@capacitor/push-notifications` pulls in `firebase-messaging`, whose auto-init (`FirebaseInitProvider`) reads resources generated from `google-services.json`. Without that file the Android app is unstable/crashes on launch or push registration. Since the plugin is a shared dependency, the cleanest path is to **set Firebase up now** so the build is stable and Android devices register FCM tokens (stamped `platform:'android'` by the existing registration code at `app.html:1728`). The worker already collects but skips these tokens (`worker.js:212`), so no notifications are sent to Android until the fast-follow — this is harmless, not broken.

### Phase 2 — Billing (code + RevenueCat + Play Console)

1. **Play Console**: create the auto-renewable subscription product (base plan $19.99/mo) under the app; add license testers for sandbox purchases.
2. **RevenueCat**: add an Android app (Play package `app.modernvillage` + a Google Play service-account credentials JSON) → attach the product to the existing `pro` entitlement and `default` offering's Monthly package.
3. **`app.html` — the only app code change for billing:**
   - Add `var RC_ANDROID_API_KEY = "goog_...";` next to `RC_IOS_API_KEY` (`~line 1683`). Empty string = IAP disabled on Android, same convention as iOS.
   - Make `mvIAP.available()` (`1933-1936`) platform-aware: accept `android` as well as `ios`, requiring the matching platform key to be non-empty.
   - Make `mvIAP.init()` (`1944`) call `configure({apiKey: <platform key>})` instead of hardcoding `RC_IOS_API_KEY`.
   - Everything downstream (`getOfferings`, `purchasePackage`, `restore`, price refresh, `/iap/sync`) is store-agnostic — no change.
4. **Worker**: expected **no change** — `/iap/sync` and `/iap/webhook` process RevenueCat-normalized data regardless of store. Verify the webhook handles Play-originated events during testing.
5. Test: a license-tester purchase on Android → `mvIAP.purchase()` → `/iap/sync` → profile flips to Pro; Restore Purchases works; paywall shows the localized Play price.

### Phase 3 — Auth verification (code, none expected)

Confirm on-device that the Apple button stays hidden on Android and email/password + biometric work. No code change anticipated (see D4). If the button ever renders, add an explicit platform guard — but the plugin-presence gate should make this a no-op.

### Phase 4 — Store launch (external, no code — the bulk of the calendar time)

1. **Signing**: generate an upload keystore; enroll in Play App Signing (Google holds the app signing key). Build a signed release **AAB**.
2. **Store listing**: 512×512 icon, 1024×500 feature graphic, ≥2 phone screenshots (+ tablet recommended), short (80-char) + full (4000-char) descriptions, category.
3. **Content rating** (IARC questionnaire).
4. **Data Safety form** — handled carefully given PHI/HIPAA: declare personal info (name, email) + **sensitive health/behavioral data** collected, **encrypted in transit** (HTTPS), a **data-deletion pathway** offered, not sold. Requires a working account/data-deletion route + URL (verify one exists; Google mandates it).
5. **Health apps declaration** — Google's Health Apps form: purpose, HIPAA posture.
6. **Target audience & content** — declare an **adult** audience (tool for parents/providers), not primarily child-directed, so the Families policy program does not apply while still acknowledging the app concerns children's health.
7. **Privacy policy URL**: `https://modernvillage.app/privacy.html`.
8. **Release tracks**: Internal testing → Closed testing → Production. Google review is typically 1–7 days.

### Fast-follow (post-launch)

- **Worker `sendFcm()`**: add an FCM v1 (HTTP v1 + service account) send path alongside `sendApns()`, and drop the `platform !== 'ios'` skip. Android tokens are already being collected by launch, so this lights up push delivery with no client change.
- Optional: Google Sign-In on Android.

---

## 5. Open verification items (do during planning/implementation)

- **V1 — Google testing gate:** Google may require a **14-day closed test with ~12 opted-in testers before Production access** for certain (esp. newer personal) developer accounts. Verify the *current* rule and whether Jorrel's existing account is subject to it. This is a **store-side calendar gate** — code cannot shorten it. If it applies, the realistic time-to-Production is ~2+ weeks after the closed track opens. *(My training may be stale on Google's exact policy; confirm against live Play Console docs during planning.)*
- **V2 — Data-deletion route:** confirm the app/web offers an account + data deletion mechanism and a public URL for the Data Safety form. If missing, it's a small prerequisite task.
- **V3 — Capacitor 8 / Gradle / Firebase version compatibility** on the build machine (Android Studio, JDK, Gradle) — surface during Phase 1.

---

## 6. Out of scope (v1)

- Worker FCM **send** path (fast-follow — Android push *delivery*).
- Google Sign-In on Android (email/password suffices).
- Any Android-specific UI redesign or tablet-optimized layouts beyond the existing responsive web app.
- Changing the iOS bundle id, RevenueCat iOS setup, or the Stripe/web billing paths.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Play review rejection on billing | Mirror the validated iOS RevenueCat approach; the subscribe button uses Play Billing exclusively on Android. |
| Data Safety / Health policy rejection (PHI) | Careful, accurate declarations; ensure the data-deletion route (V2) exists; lean on the existing `privacy.html` + HIPAA remediation work. |
| 14-day / 12-tester gate delays Production (V1) | Open the closed track early; set expectations that this is calendar time, not engineering time. |
| Android WebView ≠ iOS WKWebView quirks | Device-test camera/file upload, date inputs, PDF rendering, biometric prompt during Phase 1. |
| Firebase/Gradle build friction | Set Firebase up in Phase 1; verify version compatibility (V3) before deep work. |

---

## 8. Verification strategy

- **Phase 1:** app launches and the live product loads + functions on emulator + physical device.
- **Phase 2:** end-to-end license-tester purchase flips the profile to Pro via `/iap/sync`; Restore works; webhook handles a Play renewal event.
- **Phase 4:** app passes Google review and is installable from the Play Store (internal track first).
- Regression: iOS build unaffected (bundle id, RevenueCat iOS, APNs all unchanged).
