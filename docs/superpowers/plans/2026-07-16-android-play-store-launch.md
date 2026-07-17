# Android Play Store Launch — Implementation Plan

> **For workers:** This plan mixes **[CODE]** tasks (engineer/agent-executable — exact files, code, verification, commit) with **[OPERATOR]** tasks (Jorrel, in a web console — Play Console / RevenueCat / Firebase — an agent cannot perform these). Execute [CODE] tasks with superpowers:executing-plans or subagent-driven-development; [OPERATOR] tasks are step-by-step checklists Jorrel runs. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship Modern Village to the Google Play Store as a fully working native Android app, including the Google Play Billing subscription paywall, mirroring the existing iOS launch.

**Architecture:** Add an Android Capacitor 8 target to the existing "server URL" app (WebView loads `https://modernvillage.app/app.html`; same Cloudflare Worker + Supabase backend). RevenueCat abstracts the store, so the subscription data flow is identical to iOS. Two small `app.html` edits make billing platform-aware; everything else is native scaffolding + Google Play compliance/ops.

**Tech Stack:** Capacitor 8, Android Gradle, Firebase (FCM, for build stability), RevenueCat (Google Play Billing), Google Play Console, Cloudflare Worker (`worker.js`), Supabase.

## Global Constraints

- **Android package name = `app.modernvillage`** (permanent once published). **Never change the iOS bundle id `app.modernvillage.ios`** — override only the Android `applicationId`.
- **`app.html` style:** `var` (never `let`/`const`), inline `onclick`, `\x27` for single quotes inside double-quoted onclick attrs. **Never write `\\x27`** (renders literally, breaks the handler).
- **All subscription/profile column writes go through the worker service key** — client writes to `subscription_status`/`subscription_source` are trigger-locked. RevenueCat is the single source of billing truth.
- **Empty RevenueCat key = IAP disabled** on that platform (existing convention for `RC_IOS_API_KEY`; same for `RC_ANDROID_API_KEY`).
- **Health app → Organization Play account** is the required posture (Google Health policy, Jan 2026 enforcement). An Org account is also **exempt** from the 12-tester/14-day closed-testing gate.
- **`google-services.json` stays local** (gitignored, documented in `SESSION_HANDOFF.md` as a non-traveling file), consistent with the repo's posture on `wrangler.toml`/`AuthKey_*.p8`.
- After any web deploy, **hard-refresh the native app** (aggressive WebView caching).

---

## Phase 0 — Account & compliance prerequisites

These gate the store submission (Phase 4) and can carry external lead time (D-U-N-S). Start them first; they run in parallel with Phase 1 code.

### Task 0.1: Confirm/establish an Organization Play account  **[OPERATOR + DECISION]**

**Why:** The 12-tester/14-day closed-testing gate applies only to *personal* accounts created after 2023-11-13; **Organization accounts are exempt**. Google's Health policy also expects sensitive-health apps to run under a verified legal entity. Modern Village Services LLC + EIN already exist.

- [ ] **Step 1:** Play Console → **Account details** → note the **account type** (Personal vs Organization) and, if Personal, the creation date.
- [ ] **Step 2: Decide:**
  - If already **Organization (verified)** → done, no testing gate. Proceed.
  - If **Personal created before 2023-11-13** → exempt from the gate, but for the Health-policy posture, plan to convert to Organization.
  - If **Personal created after 2023-11-13** → **convert to / register an Organization account** (recommended: removes the gate *and* satisfies health policy). This requires a **D-U-N-S number** for Modern Village Services LLC (free from Dun & Bradstreet; allow days–weeks of lead time if you don't have one).
- [ ] **Step 3:** If converting/registering, complete Google's Organization verification (D-U-N-S + business details).
- [ ] **Verification:** Play Console → Account details shows **Organization**, verification **complete**. Record the decision + any D-U-N-S ETA in `SESSION_HANDOFF.md`.

### Task 0.2: Confirm the data-deletion pathway (already implemented)  **[VERIFY]**

**Why:** The Data Safety form asks whether users can request deletion. This is already true.

- [ ] **Step 1:** Confirm the flow end-to-end in a test build: Profile → **"Delete my account"** (`app.html:1157`) → `deleteAccount()` (`app.html:6372`) → worker `/delete-account` (`worker.js:665`). Confirm the account + data are removed.
- [ ] **Step 2:** Confirm `privacy.html` §8 "Data Retention" (90-day deletion, HIPAA 6-yr caveat) is public at `https://modernvillage.app/privacy.html`.
- [ ] **Verification:** deleting a throwaway test account removes it; privacy URL loads. (Used for the Data Safety declaration in Task 4.4.)

### Task 0.3: Verify (and if absent, add) an in-app sensitive-data disclosure  **[CODE, conditional]**

**Why:** Google requires a *prominent in-app* disclosure when collecting personal & sensitive (health) data — not just a privacy-policy link.

- [ ] **Step 1:** Inspect the signup/onboarding screen in `app.html` for a visible data-collection notice with a privacy-policy link (search for the auth form near `authAppleBtn` / any `openLegal()` link on the signup card).
- [ ] **Step 2:** If a visible privacy link + a one-line notice already exist at signup, mark this satisfied and stop.
- [ ] **Step 3 (only if absent):** Add a concise disclosure line under the signup form. Match existing style (`var`, inline styles):

```html
<p style="font-size:12px;color:var(--warm-gray-light);text-align:center;margin:8px 0 0;line-height:1.4">
  Modern Village collects your account info and the developmental/behavioral data you enter to provide coaching and clinical features. See our
  <a href="javascript:openLegal(\x27privacy\x27)" style="color:var(--sage);text-decoration:underline">Privacy Policy</a>.
</p>
```

- [ ] **Verification:** the disclosure is visible on the signup screen in a native build. If code changed, commit:

```bash
git add app.html
git commit -m "feat(compliance): in-app sensitive-data disclosure on signup for Play Health policy"
```

---

## Phase 1 — Native Android shell & build

### Task 1.1: Create the Firebase project + Android app  **[OPERATOR]**

**Why:** `@capacitor/push-notifications` pulls in `firebase-messaging`, whose auto-init needs `google-services.json`; without it the Android build is unstable. Setting this up now also lets Android devices register FCM tokens (delivery is a fast-follow).

- [ ] **Step 1:** Firebase console → create/choose a project for Modern Village.
- [ ] **Step 2:** Add an **Android app** with package name **`app.modernvillage`** (exact — must match the applicationId in Task 1.3).
- [ ] **Step 3:** Download **`google-services.json`**. Keep it — it goes into `android/app/` in Task 1.2.
- [ ] **Verification:** `google-services.json` downloaded; its `package_name` reads `app.modernvillage`.

### Task 1.2: Scaffold the Android platform  **[CODE]**

**Files:** Create `android/` (generated); Modify `.gitignore`

- [ ] **Step 1:** From the repo root, add the platform:

```bash
npx cap add android
```

Expected: `android/` directory created; output confirms plugins detected (biometric-auth, camera, geolocation, haptics, push-notifications, share, status-bar, badge, purchases).

- [ ] **Step 2:** Place Firebase config:

```bash
cp /path/to/downloaded/google-services.json "android/app/google-services.json"
```

- [ ] **Step 3:** Keep it local (matches repo posture on secrets/config). Append to `.gitignore`:

```
# Firebase Android config — stays on the external drive, like wrangler.toml / AuthKey_*.p8
android/app/google-services.json
```

- [ ] **Verification:** `ls android/app/google-services.json` succeeds; `git status` does NOT list `google-services.json`.
- [ ] **Step 4: Commit** the scaffold (without the Firebase file):

```bash
git add android .gitignore
git commit -m "feat(android): scaffold Capacitor android platform"
```

### Task 1.3: Set the Android applicationId to `app.modernvillage`  **[CODE]**

**Files:** Modify `android/app/build.gradle`

**Why:** The shared Capacitor `appId` is `app.modernvillage.ios`; `cap add android` seeds the Android `applicationId` from it. Override just the Android `applicationId` so Play gets a clean, iOS-independent package name. The internal `namespace` may stay as generated (cosmetic; Play/Firebase/RevenueCat key off `applicationId`).

- [ ] **Step 1:** In `android/app/build.gradle`, inside `android { defaultConfig { ... } }`, set:

```gradle
        applicationId "app.modernvillage"
```

(replacing the generated `applicationId "app.modernvillage.ios"`).

- [ ] **Step 2: Verify:**

```bash
grep -n 'applicationId' android/app/build.gradle
```

Expected: `applicationId "app.modernvillage"`

- [ ] **Step 3: Commit:**

```bash
git add android/app/build.gradle
git commit -m "feat(android): set applicationId app.modernvillage (iOS bundle untouched)"
```

### Task 1.4: Generate Android icons & splash  **[CODE]**

**Files:** Modify `android/app/src/main/res/**` (generated)

- [ ] **Step 1:** Generate from existing source art (repo already has `@capacitor/assets` + `resources/`):

```bash
npx capacitor-assets generate --android
```

- [ ] **Step 2: Verify:** adaptive-icon and splash resources exist:

```bash
ls android/app/src/main/res/mipmap-anydpi-v26/ android/app/src/main/res/drawable*/ | head
```

- [ ] **Step 3: Commit:**

```bash
git add android/app/src/main/res
git commit -m "feat(android): generate app icons and splash"
```

### Task 1.5: Sync Capacitor  **[CODE]**

- [ ] **Step 1:**

```bash
npx cap sync android
```

Expected: web assets + all plugins sync; no errors.

- [ ] **Verification:** output lists the plugins from `package.json` under `android`. No commit needed unless `sync` changes tracked files (commit them with `git commit -m "chore(android): cap sync"` if so).

### Task 1.6: Build & smoke-test on emulator + device  **[OPERATOR/CODE]**

- [ ] **Step 1:** Open in Android Studio (`npx cap open android`) or `cd android && ./gradlew assembleDebug`. Resolve any Gradle/JDK/Firebase-version issues (verification item V3).
- [ ] **Step 2:** Run on an **emulator** and a **physical device**.
- [ ] **Step 3: Smoke-test checklist** — WebView loads `modernvillage.app/app.html`; email/password login; biometric app-lock enable + unlock; camera (photo upload); share; geolocation; core coaching chat; a BCBA data-entry flow; the **Apple button is NOT shown** (Task 3.1); the app does not crash on push-permission prompt.
- [ ] **Verification:** all checklist items pass on both emulator and device. Log any WebView-specific defects (date inputs, file upload, PDF) as separate bugs.

---

## Phase 2 — Google Play Billing (subscription)

### Task 2.1: Create the subscription product in Play Console  **[OPERATOR]**

- [ ] **Step 1:** Play Console → (app) → **Monetize → Products → Subscriptions** → create a subscription (product id e.g. `mv_pro_monthly` to mirror iOS) with a **base plan**: auto-renewing, monthly, **$19.99**.
- [ ] **Step 2:** Activate the subscription + base plan.
- [ ] **Step 3:** Add **license testers** (Play Console → Setup → License testing) so purchases are free in testing.
- [ ] **Verification:** subscription shows **Active**; your tester Google account is listed.

### Task 2.2: Add the Android app in RevenueCat  **[OPERATOR]**

- [ ] **Step 1:** RevenueCat → the existing Modern Village project → **add an Android app** (Play package `app.modernvillage`).
- [ ] **Step 2:** Upload **Google Play service-account credentials** (JSON) with the Play Developer API access RevenueCat requires (grant the service account access in Play Console → Users & permissions / API access).
- [ ] **Step 3:** Attach the Play subscription to the **existing `pro` entitlement**, and add it to the **`default` offering's** Monthly package (same entitlement/offering iOS uses).
- [ ] **Step 4:** Copy the **public Android SDK key** (`goog_…`).
- [ ] **Verification:** RevenueCat shows the Android app + the product mapped to `pro` in `default`.

### Task 2.3: Make billing platform-aware in `app.html`  **[CODE]**

**Files:** Modify `app.html` (`~1683`, `mvIAP` `~1928-1945`)

**Interfaces produced:** `mvIAP.apiKey()` → returns the platform's RevenueCat public key or `''`. `mvIAP.available()` unchanged signature; now true on iOS *or* Android when the matching key is set and the plugin is present.

- [ ] **Step 1:** Add the Android key next to `RC_IOS_API_KEY` (line ~1683). Paste the `goog_…` key from Task 2.2 (leave `""` until then — empty disables Android IAP safely):

```javascript
var RC_ANDROID_API_KEY = ""; // RevenueCat PUBLIC Android (Google Play) SDK key (goog_...). Empty = IAP disabled on Android. Served remotely — no binary rebuild to change.
```

- [ ] **Step 2:** Add an `apiKey()` resolver and generalize `available()` in the `mvIAP` object. Replace the current `available:function(){…}` (lines ~1932-1937):

```javascript
  apiKey:function(){
    if(typeof mvNative==='undefined'||!mvNative.isNative())return '';
    var plat=(window.Capacitor.getPlatform&&window.Capacitor.getPlatform())||'';
    if(plat==='ios')return RC_IOS_API_KEY;
    if(plat==='android')return RC_ANDROID_API_KEY;
    return '';
  },
  available:function(){
    if(typeof mvNative==='undefined'||!mvNative.isNative())return false;
    if(!mvIAP.apiKey())return false;
    return !!mvIAP.plugin();
  },
```

- [ ] **Step 3:** In `mvIAP.init()` (line ~1944), swap the hardcoded key in `configure`:

```javascript
      else{await P.configure({apiKey:mvIAP.apiKey(),appUserID:S.user.id});mvIAP._ready=true;}
```

- [ ] **Step 4: Verify no iOS regression (logic):** on iOS, `apiKey()` returns `RC_IOS_API_KEY`, so `available()` and `configure()` behave exactly as before. On Android with an empty key, `available()` is false (paywall no-ops) until the key is set — same convention as iOS.
- [ ] **Step 5: Commit:**

```bash
git add app.html
git commit -m "feat(android): platform-aware RevenueCat key so Play Billing drives the paywall on Android"
```

### Task 2.4: Verify the worker handles Play events (no change expected)  **[VERIFY / CODE-if-gap]**

**Files:** `worker.js` (`/iap/sync`, `/iap/webhook`), `tests/iap.test.mjs`

**Why:** `/iap/sync` + `/iap/webhook` map RevenueCat *entitlements* → profile, independent of store, so Play should Just Work.

- [ ] **Step 1:** Run the existing unit tests (regression):

```bash
node --test tests/iap.test.mjs
```

Expected: PASS (7 tests) — `computeIapProfilePatch()` is store-agnostic.

- [ ] **Step 2:** After a test purchase (Task 2.5), confirm `/iap/webhook` processes the Play-originated RevenueCat event and `/iap/sync` returns the Pro entitlement. If (and only if) a Play-specific field breaks mapping, add a failing test to `tests/iap.test.mjs` reproducing it, fix `computeIapProfilePatch()`, and re-run. Otherwise no code change.
- [ ] **Verification:** tests pass; live webhook + sync reflect the Play purchase.

### Task 2.5: End-to-end purchase test on Android  **[OPERATOR]**

- [ ] **Step 1:** Deploy the `app.html` change (Vercel) + set the real `goog_…` key in `RC_ANDROID_API_KEY`; hard-refresh the native app.
- [ ] **Step 2:** On a device signed into a license-tester Google account, open the paywall → confirm the **localized Play price** shows → purchase.
- [ ] **Step 3:** Confirm the profile flips to **Pro** (via `/iap/sync`); test **Restore Purchases**; confirm RevenueCat shows the transaction and the webhook fired.
- [ ] **Verification:** purchase → Pro; restore works; RevenueCat + worker agree.

---

## Phase 3 — Auth verification

### Task 3.1: Confirm the iOS-only Apple button hides on Android  **[VERIFY, no code expected]**

**Why:** `authAppleBtn` ships `class="hidden"` and only un-hides when `mvNative.appleSignIn.isAvailable()` is true (`app.html:1902`), which requires the `AppleSignIn` plugin — not installed on Android.

- [ ] **Step 1:** On the Android build, open signup + login: confirm **no "Sign in with Apple" button**; email/password works; biometric works.
- [ ] **Step 2 (only if the button appears):** guard its reveal at `app.html:6218` — additionally require `window.Capacitor.getPlatform()==='ios'`. Commit `fix(android): hide Apple sign-in button on non-iOS`.
- [ ] **Verification:** Apple button absent on Android; email/password + biometric log in.

---

## Phase 4 — Store listing, compliance declarations & release

All **[OPERATOR]** (Play Console). Jorrel supplies business-specific copy/answers.

### Task 4.1: App signing & release build

- [ ] **Step 1:** Generate an **upload keystore** (`keytool`), store it with the other non-traveling secrets (gitignored). Enroll in **Play App Signing** (Google manages the app signing key).
- [ ] **Step 2:** Build a **signed release AAB** (`./gradlew bundleRelease` or Android Studio → Generate Signed Bundle).
- [ ] **Verification:** signed `.aab` produced; upload key registered with Play App Signing.

### Task 4.2: Store listing assets

- [ ] App icon 512×512; feature graphic 1024×500; ≥2 phone screenshots (tablet recommended); short (≤80 char) + full (≤4000 char) descriptions; category; contact details.
- [ ] **Verification:** Play Console "Main store listing" shows no missing-asset errors.

### Task 4.3: Content rating (IARC questionnaire)

- [ ] Complete the questionnaire honestly (no objectionable content; app for parents/providers).
- [ ] **Verification:** a rating is issued.

### Task 4.4: Data Safety form

- [ ] Declare: **personal info** (name, email) + **health/sensitive** (developmental/behavioral data) collected; purpose = app functionality/clinical features; **encrypted in transit**; **users can request deletion** (in-app Delete my account + `privacy.html` §8 — Task 0.2); **not sold**; sharing only with processors necessary to run the service.
- [ ] **Verification:** form saved; consistent with `privacy.html`.

### Task 4.5: Health Apps Declaration

- [ ] Complete the Health apps declaration (App content page). Notes: the app does **not** use Health Connect / `READ_HEALTH_DATA_IN_RECORDS`; it stores user-entered developmental/behavioral data for coaching + clinical (BCBA) features; **no medical-device claims**; HIPAA-aligned (see the repo's compliance docs + `baa.html`).
- [ ] **Verification:** declaration submitted without policy flags.

### Task 4.6: Target audience & content

- [ ] Declare an **adult** audience (tool for parents/BCBAs); **not primarily child-directed** (so the Families program does not apply), while acknowledging the app concerns children's health.
- [ ] **Verification:** target-audience section complete; app not enrolled in Families by mistake.

### Task 4.7: Privacy policy URL

- [ ] Set `https://modernvillage.app/privacy.html`.
- [ ] **Verification:** URL saved and loads.

### Task 4.8: Release tracks → Production

- [ ] **Step 1:** Upload the AAB to **Internal testing**; install from the Play link on a device; confirm it runs + a test purchase works.
- [ ] **Step 2 (branch on Task 0.1):**
  - **Organization account** → no closed-testing gate; promote to **Production** (submit for review).
  - **Personal account created after 2023-11-13** → run **Closed testing** with **≥12 opted-in testers for ≥14 continuous days**, iterating on feedback, then apply for Production access.
- [ ] **Step 3:** Submit for review (Google review typically 1–7 days).
- [ ] **Verification:** app is live/installable from the Play Store.

---

## Phase 5 — Fast-follow (out of v1 scope): Android push delivery

Not required for launch. Tracked so it isn't lost. Android FCM tokens are already collected by launch (registration works; `worker.js:212` skips non-iOS sends).

- Add `sendFcm(env, token, payload)` in `worker.js` using **FCM HTTP v1** (OAuth via a Firebase service-account secret, e.g. `FCM_SERVICE_ACCOUNT`), mirroring `sendApns()`.
- In `sendPushToUser` (`worker.js:212`), replace `if (t.platform !== 'ios') continue;` with a branch: `ios` → `sendApns`, `android` → `sendFcm`.
- Add a unit test to `tests/iap.test.mjs`-style suite for the payload builder.
- Verify a real notification reaches an Android device.

---

## Self-review (done)

- **Spec coverage:** D1 package name → 1.3; D2 billing → 2.1–2.5; D3 Firebase-now/FCM-later → 1.1/1.2 + Phase 5; D4 auth → 3.1. Spec §4 phases 1–4 → Phases 1–4. §5 V1 (testing gate) → 0.1; V2 (deletion) → 0.2 (found already implemented); V3 (build compat) → 1.6. §7 risks are mitigated in-task. New findings beyond the spec (Organization-account requirement, in-app disclosure, Health declaration) added as 0.1/0.3/4.5 — **the spec should be amended to record these**.
- **Placeholders:** none — `RC_ANDROID_API_KEY = ""` and product ids are intentional real defaults, filled by their tasks.
- **Type consistency:** `mvIAP.apiKey()` defined in 2.3 and consumed by `available()`/`init()` in the same task; `available()` signature unchanged for existing callers (`showPw`, `openPaywall`, `mvIAP.*`).
