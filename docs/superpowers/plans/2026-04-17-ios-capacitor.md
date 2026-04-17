# iOS + Android Capacitor Wrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Modern Village as native iOS and Android apps. **Phase 0 = a barebones iOS build in TestFlight internal testing TODAY (2026-04-17).** Phases 1-6 layer in native features, Android, live updates, and public submission over the following 4 weeks.

**Architecture:** Capacitor shell. Phase 0 uses `server.url` pointing at `https://modernvillage.app` (live remote wrap — valid for TestFlight internal testing, not public App Store). Phases 3-5 switch to hybrid bundle with `@capgo/capacitor-updater` self-hosted live updates. Push (9 types via APNs+FCM), biometrics, offline cache, share sheet, and Pro upgrade handoff layered on top.

**Tech stack:** Capacitor 7+, `@capacitor/core`, `@capacitor/ios`, `@capacitor/android`, later `@capacitor/push-notifications`, `@capgo/capacitor-updater`, `@aparajita/capacitor-biometric-auth`, `@capacitor/share`, `@capacitor/browser`, `@capacitor/preferences`. Xcode 26 (macOS 26+). Android Studio Hedgehog or newer. Firebase for FCM. Supabase + Cloudflare Worker backend already in place.

**Source spec:** `docs/superpowers/specs/2026-04-17-ios-capacitor-design.md` (committed on `feat/email-drips-optimization` branch).

**Branch strategy:** Work on new branch `feat/ios-capacitor` cut from current `main`. Spec remains on `feat/email-drips-optimization` branch (accessible cross-branch); no need to copy it into the iOS branch.

**Note on environment:** On 2026-04-17 Jorrel's Mac has Node 25, npm, CocoaPods. macOS 26.3.1. **Xcode is NOT installed yet — only Command Line Tools.** Task 0.0 addresses this.

---

## Phase 0 — Minimum viable TestFlight upload (TODAY)

**Goal:** By end of 2026-04-17, Modern Village appears as a build in TestFlight internal testing, installable on Jorrel's personal iPhone via the TestFlight app. The build loads `modernvillage.app` inside a native iOS WebView. Zero native features in this phase — just the shell.

**Why `server.url` remote-wrap is OK for Phase 0 specifically:** TestFlight internal testing (≤100 testers who are registered App Store Connect team members) does NOT go through Apple review. Apple only reviews builds submitted to external TestFlight or the public App Store. So the remote-wrap rejection risk does not apply here. Phase 5 will migrate to hybrid bundle before any external submission.

### Task 0.0: Kick off Xcode 26 download (CRITICAL FIRST STEP)

This is the longest single task and everything else waits on it. **Start this immediately; do other tasks in parallel while it downloads.**

**Files:** none

- [ ] **Step 1: Jorrel opens Mac App Store → searches "Xcode" → clicks Get/Install on Xcode**
  - App name: Xcode (by Apple)
  - Size: ~15 GB
  - Expected duration: 30-90 min depending on internet speed
  - Note: If install prompt says "macOS upgrade required," confirm with Jorrel — his macOS 26.3.1 should be fine for Xcode 26

- [ ] **Step 2: While downloading, move on to Tasks 0.1 through 0.8 in parallel**
  - Xcode download runs in background; Jorrel's Mac usable for other work

- [ ] **Step 3: Once Xcode finishes installing, Jorrel opens it to accept license**
  - Launchpad → Xcode → first launch prompts for license acceptance
  - Xcode will install additional components (~5-15 min)

- [ ] **Step 4: Claude runs `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`**
  - Tells the system to use the full Xcode, not just Command Line Tools
  - Requires Jorrel's Mac password

- [ ] **Step 5: Verify**
  - Run: `xcodebuild -version`
  - Expected: `Xcode 26.x` and a `Build version ...` line

- [ ] **Step 6: No commit — this is environment setup**

---

### Task 0.1: Create `feat/ios-capacitor` branch from main

**Files:** (branch state only)

- [ ] **Step 1: Stash or commit any uncommitted work on current branch**
  - Run: `git status`
  - If dirty: commit the autoresearch follow-ups or stash

- [ ] **Step 2: Fetch latest main**
  - Run: `git fetch origin main`

- [ ] **Step 3: Create new branch from main**
  - Run: `git checkout -b feat/ios-capacitor origin/main`

- [ ] **Step 4: Verify branch and clean state**
  - Run: `git status && git log --oneline -5`
  - Expected: on `feat/ios-capacitor`, 5 most recent commits are from main

---

### Task 0.2: Initialize npm project at repo root

**Files:**
- Create: `package.json`

- [ ] **Step 1: Run `npm init -y`**
  - Creates minimal package.json with defaults

- [ ] **Step 2: Edit package.json — set name + private flag**

```json
{
  "name": "modern-village",
  "version": "1.0.0",
  "description": "Modern Village iOS + Android Capacitor wrap",
  "private": true,
  "scripts": {
    "cap": "cap"
  }
}
```

- [ ] **Step 3: Verify**
  - Run: `cat package.json`
  - Expected: above JSON with no extra auto-generated fields you don't want

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: init npm project for Capacitor"
```

---

### Task 0.3: Install Capacitor core + CLI + iOS

**Files:**
- Modify: `package.json`
- Create: `package-lock.json`
- Create: `node_modules/` (gitignored next task)

- [ ] **Step 1: Install Capacitor packages**

```bash
npm install --save @capacitor/core @capacitor/cli @capacitor/ios
```

- [ ] **Step 2: Verify dependencies installed**
  - Run: `npx cap --version`
  - Expected: version string like `7.x.x` or newer

---

### Task 0.4: Update .gitignore for Capacitor + Node

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append Capacitor/Node/Xcode patterns to .gitignore**

```gitignore
# Node / Capacitor
node_modules/
package-lock.json.backup

# iOS Capacitor artifacts
ios/App/Pods/
ios/App/App.xcworkspace/xcuserdata/
ios/App/App.xcodeproj/xcuserdata/
ios/App/App.xcodeproj/project.xcworkspace/xcuserdata/
ios/App/build/
ios/DerivedData/
ios/App/output/

# Android (Phase 1)
android/.gradle/
android/app/build/
android/build/
android/local.properties
android/captures/
android/.idea/

# Superpowers brainstorming artifacts
.superpowers/
```

- [ ] **Step 2: Verify**
  - Run: `cat .gitignore | tail -25`

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore Capacitor/Node/iOS/Android artifacts"
```

---

### Task 0.5: Create minimal `www/` fallback directory

Capacitor requires a `webDir` that contains at least one HTML file, even though we're using `server.url` to load the live website. This is the first-launch fallback before `server.url` is reachable.

**Files:**
- Create: `www/index.html`

- [ ] **Step 1: Create `www/` directory and fallback index.html**

```bash
mkdir -p www
```

- [ ] **Step 2: Write `www/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>Modern Village</title>
  <style>
    body { margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; background: linear-gradient(135deg, #6b46c1, #ec4899); color: white; text-align: center; }
    .wrap { padding: 24px; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    p { opacity: 0.9; margin: 0; font-size: 15px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Modern Village</h1>
    <p>Loading…</p>
  </div>
  <script>
    window.location.href = "https://modernvillage.app/";
  </script>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add www/index.html
git commit -m "chore: add Capacitor webDir with loading fallback"
```

---

### Task 0.6: Initialize Capacitor config

**Files:**
- Create: `capacitor.config.json`

- [ ] **Step 1: Run cap init**

```bash
npx cap init "Modern Village" "app.modernvillage.ios" --web-dir "www"
```

Note: the app ID `app.modernvillage.ios` is the iOS-specific Bundle ID. Android will use `app.modernvillage.android` in Phase 1 (same app, different platform IDs — matches Modern Village's pattern of two separate app records).

- [ ] **Step 2: Edit the generated `capacitor.config.json` to add `server.url`**

```json
{
  "appId": "app.modernvillage.ios",
  "appName": "Modern Village",
  "webDir": "www",
  "server": {
    "url": "https://modernvillage.app",
    "cleartext": false,
    "androidScheme": "https"
  },
  "ios": {
    "contentInset": "automatic",
    "limitsNavigationsToAppBoundDomains": false
  }
}
```

- [ ] **Step 3: Verify JSON valid**
  - Run: `node -e "JSON.parse(require('fs').readFileSync('capacitor.config.json','utf8')); console.log('valid')"`
  - Expected: `valid`

- [ ] **Step 4: Commit**

```bash
git add capacitor.config.json
git commit -m "chore: Capacitor config — server.url remote wrap for Phase 0"
```

---

### Task 0.7: Generate 1024×1024 app icon from favicon.svg

**Files:**
- Create: `resources/icon.png`
- Create: `resources/icon-foreground.png` (for future Android adaptive icon)
- Create: `resources/icon-background.png` (for future Android adaptive icon)

- [ ] **Step 1: Create `resources/` directory**

```bash
mkdir -p resources
```

- [ ] **Step 2: Convert favicon.svg to 1024x1024 PNG using rsvg-convert (preferred) or ImageMagick**

Try rsvg-convert first (cleaner SVG rendering):

```bash
rsvg-convert -w 1024 -h 1024 favicon.svg -o resources/icon.png 2>&1 || echo "rsvg-convert not available, falling back"
```

If rsvg-convert not installed, fall back to ImageMagick:

```bash
which magick >/dev/null && magick -background none -resize 1024x1024 favicon.svg resources/icon.png
```

If neither works, Jorrel has to manually export from any SVG editor (Sketch, Figma, Inkscape, Preview, or an online converter). Target: a 1024x1024 PNG saved at `resources/icon.png` with no transparency in the background (fill with a brand color if favicon is transparent).

- [ ] **Step 3: Verify icon exists and is 1024x1024**

```bash
file resources/icon.png
```

Expected: `PNG image data, 1024 x 1024, ...`

- [ ] **Step 4: Also export icon-foreground.png (same image, transparent bg allowed) and icon-background.png (solid brand color 1024x1024) for Phase 1 Android adaptive icon**

Quick brand-color background PNG via ImageMagick:

```bash
which magick >/dev/null && magick -size 1024x1024 xc:"#6b46c1" resources/icon-background.png
cp resources/icon.png resources/icon-foreground.png
```

- [ ] **Step 5: Commit**

```bash
git add resources/
git commit -m "chore: app icon assets for iOS + Android"
```

---

### Task 0.8: Install capacitor-assets and generate iOS icon set

**Files:**
- Modify: `package.json` (adds @capacitor/assets dev dep)

- [ ] **Step 1: Install capacitor-assets**

```bash
npm install --save-dev @capacitor/assets
```

- [ ] **Step 2: (deferred to Task 0.10 — after cap add ios creates the iOS project)**

---

### Task 0.9: JORREL — Apple Developer portal setup

This is Jorrel's GUI work. Requires his Apple ID login at `developer.apple.com`.

**Files:** none (external Apple services)

- [ ] **Step 1: Sign in to https://developer.apple.com/account**
  - Use the same Apple ID as the paid Developer Program membership

- [ ] **Step 2: Navigate to Certificates, Identifiers & Profiles → Identifiers**

- [ ] **Step 3: Click + to register a new Identifier**
  - Type: App IDs → Continue
  - Kind: App → Continue
  - Description: `Modern Village iOS`
  - Bundle ID: Explicit → `app.modernvillage.ios`

- [ ] **Step 4: Enable capabilities (check these boxes even if unused today — saves a round-trip later)**
  - Push Notifications (needed in Phase 2)
  - Associated Domains (needed for universal links later)
  - Sign In with Apple (optional for future)

- [ ] **Step 5: Continue → Register**

- [ ] **Step 6: Confirm the new App ID appears in the Identifiers list**

---

### Task 0.10: JORREL — App Store Connect app record

**Files:** none (external Apple services)

- [ ] **Step 1: Sign in to https://appstoreconnect.apple.com**

- [ ] **Step 2: My Apps → click the blue `+` → New App**

- [ ] **Step 3: Fill in form:**
  - Platforms: ☑ iOS
  - Name: `Modern Village`
  - Primary Language: English (U.S.)
  - Bundle ID: `app.modernvillage.ios` (dropdown — pick the one just created in Task 0.9)
  - SKU: `modern-village-ios-v1` (any unique string)
  - User Access: Full Access

- [ ] **Step 4: Create**

- [ ] **Step 5: Expected result:** the app record appears in My Apps. Fields like screenshots/description can be left empty for now — only Bundle ID needs to match for TestFlight.

---

### Task 0.11: Add iOS platform via Capacitor

Waits on Task 0.0 (Xcode installed) and Task 0.1-0.6 (branch + config ready).

**Files:**
- Create: `ios/` directory tree (generated by cap add ios)
  - `ios/App/App.xcworkspace`
  - `ios/App/App.xcodeproj/project.pbxproj`
  - `ios/App/App/Info.plist`
  - `ios/App/App/Assets.xcassets/`
  - `ios/App/Podfile`
  - etc.

- [ ] **Step 1: Add iOS platform**

```bash
npx cap add ios
```

Expected: creates `ios/` directory, runs pod install automatically. Takes 1-3 min.

- [ ] **Step 2: Sync web assets into iOS project**

```bash
npx cap sync ios
```

- [ ] **Step 3: Verify workspace exists**

```bash
ls ios/App/App.xcworkspace
```

Expected: directory exists with contents.

- [ ] **Step 4: Generate iOS icon set via @capacitor/assets**

```bash
npx capacitor-assets generate --ios --iconBackgroundColor "#6b46c1" --iconBackgroundColorDark "#2d1b4e"
```

Expected: populates `ios/App/App/Assets.xcassets/AppIcon.appiconset/` with all iOS icon sizes.

- [ ] **Step 5: Commit**

```bash
git add ios/ package.json package-lock.json
git commit -m "feat: add iOS Capacitor platform + generated icon set"
```

---

### Task 0.12: JORREL — Configure signing in Xcode

**Files:** Xcode project settings (persisted inside `ios/App/App.xcodeproj/project.pbxproj`)

- [ ] **Step 1: Open the iOS workspace**

```bash
open ios/App/App.xcworkspace
```

Xcode opens. Wait for Xcode to index files (progress bar at top). Can take 30-60 sec first time.

- [ ] **Step 2: In Xcode left sidebar, click the blue `App` project icon at the top**

- [ ] **Step 3: In the main editor area, select the `App` target (under TARGETS list)**

- [ ] **Step 4: Click the `Signing & Capabilities` tab at the top of the editor**

- [ ] **Step 5: Ensure `Automatically manage signing` is checked**

- [ ] **Step 6: Team dropdown → select Jorrel's Apple Developer team**
  - If no team shown: Xcode → Settings → Accounts → + → Apple ID → sign in with developer account, then return here

- [ ] **Step 7: Bundle Identifier field should read `app.modernvillage.ios`**
  - If not, edit it to match what was registered in Task 0.9

- [ ] **Step 8: Wait for Xcode to provision**
  - A brief spinner, then "Provisioning Profile: Xcode Managed Profile" appears
  - No red error icons

- [ ] **Step 9: Set version and build number**
  - Click `General` tab
  - Version: `1.0.0`
  - Build: `1`

---

### Task 0.13: JORREL — Verify build in simulator

Sanity check before archive. Not committed — just "does it launch?"

**Files:** none

- [ ] **Step 1: In Xcode top bar, scheme selector → select an iPhone simulator (e.g., iPhone 16 Pro)**

- [ ] **Step 2: Click the ▶ Play button (or Cmd+R)**

- [ ] **Step 3: Wait for simulator to boot and Modern Village to launch**

- [ ] **Step 4: Expected: the app launches, briefly shows the purple loading screen, then loads `https://modernvillage.app` — landing page or screener**

- [ ] **Step 5: Tap around briefly to confirm basic navigation works**

- [ ] **Step 6: Known issue to note (not fix today):** Google OAuth sign-in may fail in the WebView due to Google's embedded-browser policy. Non-blocking for Phase 0 — Apple sign-in or email/password still works. Track for Phase 4 fix.

- [ ] **Step 7: Stop the simulator (Cmd+. in Xcode)**

---

### Task 0.14: JORREL — Archive build for upload

**Files:** none (Xcode artifact only)

- [ ] **Step 1: In Xcode scheme selector, change target device from simulator to `Any iOS Device (arm64)`**
  - Top bar, left of the Play button, click the device name → scroll up → select "Any iOS Device (arm64)"

- [ ] **Step 2: Menu bar → Product → Archive**

- [ ] **Step 3: Wait for archive**
  - Takes 2-10 min depending on Mac speed
  - Xcode compiles for release

- [ ] **Step 4: Archive completion opens the Organizer window automatically**
  - The new archive shows at the top of the list with version 1.0.0 (1)

---

### Task 0.15: JORREL — Upload archive to App Store Connect

Still in the Xcode Organizer from previous task.

**Files:** none

- [ ] **Step 1: Select the archive just created → click `Distribute App` (right side)**

- [ ] **Step 2: Destination: `App Store Connect` → Next**

- [ ] **Step 3: Method: `Upload` → Next**

- [ ] **Step 4: Distribution options (keep defaults):**
  - Upload your app's symbols: ☑ (yes)
  - Manage version and build number: ☑ (yes, recommended)
  - → Next

- [ ] **Step 5: Re-sign: `Automatically manage signing` → Next**

- [ ] **Step 6: Review screen → Upload**

- [ ] **Step 7: Wait for upload**
  - 3-15 min depending on internet
  - Progress bar shows upload percentage

- [ ] **Step 8: On success: "Upload Successful" modal → Done**

---

### Task 0.16: JORREL — Configure TestFlight + install on phone

**Files:** none (App Store Connect + TestFlight app)

- [ ] **Step 1: Open https://appstoreconnect.apple.com → My Apps → Modern Village → TestFlight tab**

- [ ] **Step 2: Under "iOS Builds" a row appears for build 1.0.0 (1)**
  - Status will show "Processing" — takes 5-20 min
  - Refresh the page periodically; status changes to "Missing Compliance" or "Ready to Submit" when done

- [ ] **Step 3: Click on the build when it finishes processing**

- [ ] **Step 4: Export Compliance question:**
  - "Does your app use encryption?" → select `None of the algorithms mentioned above` (HTTPS is exempt and pre-declared)
  - Save

- [ ] **Step 5: Add an Internal Testing group (if not already existing)**
  - Left sidebar TestFlight → Internal Testing → + (create group) → Name: "Inner Circle"
  - Save

- [ ] **Step 6: Add Jorrel as the first internal tester**
  - Click the `Testers` section of the Inner Circle group
  - Click `+` → select Jorrel's App Store Connect user account
  - Save
  - (App Store Connect user accounts are different from TestFlight public testers — any team member on the developer account can be added as internal tester instantly, no approval wait)

- [ ] **Step 7: Assign the build to the Inner Circle group**
  - Under Inner Circle group → Builds → + → select build 1.0.0 (1) → Save

- [ ] **Step 8: Jorrel opens Mail app on iPhone → clicks invitation link → installs TestFlight app from App Store (if not installed) → follows link in email**

- [ ] **Step 9: TestFlight app opens → Modern Village appears → Install → wait for download**

- [ ] **Step 10: Tap Open → app launches on phone**

- [ ] **Step 11: Expected: app launches, briefly shows purple loading screen, loads https://modernvillage.app**

---

### Task 0.17: Phase 0 verification + tag

**Files:** none

- [ ] **Step 1: Confirm app installed on Jorrel's physical iPhone**

- [ ] **Step 2: Confirm modernvillage.app loads within app**

- [ ] **Step 3: Confirm basic navigation works (landing → screener flow)**

- [ ] **Step 4: Tag milestone**

```bash
git tag phase-0-testflight
git push origin feat/ios-capacitor
git push origin phase-0-testflight
```

- [ ] **Step 5: Update memory — Phase 0 complete**

(Claude action: write a project memory noting Phase 0 shipped; include build number, App Store Connect app ID, Bundle ID for future reference.)

---

## Phase 1 — Android parity (Day 2-3)

**Goal:** Modern Village appears as a build in Google Play Console internal testing track, installable on an Android device via the Play Store "internal testing" link.

Tasks outlined (detailed steps to be written when Phase 1 starts):

- [ ] Task 1.1: Jorrel pays $25 Google Play Console registration fee at https://play.google.com/console/signup
- [ ] Task 1.2: Jorrel creates Google Play Console app record (name: Modern Village, default language: en-US)
- [ ] Task 1.3: Claude adds Android platform: `npm install @capacitor/android && npx cap add android`
- [ ] Task 1.4: Claude generates Android adaptive icon via `npx capacitor-assets generate --android`
- [ ] Task 1.5: Jorrel generates app signing keystore via Android Studio (or `keytool`), saves keystore.jks outside the repo, records password in password manager
- [ ] Task 1.6: Claude configures `android/app/build.gradle` signing config to reference keystore
- [ ] Task 1.7: Jorrel opens project in Android Studio, builds signed release AAB (Build → Generate Signed App Bundle)
- [ ] Task 1.8: Jorrel uploads AAB to Google Play Console → Testing → Internal testing track
- [ ] Task 1.9: Jorrel adds his own Gmail as internal tester, installs on Android device (or emulator)
- [ ] Task 1.10: Verify app loads modernvillage.app correctly on Android

---

## Phase 2 — Push notifications end-to-end (Week 1 end)

**Goal:** A daily_check_in push delivered from Cloudflare Worker → APNs → Jorrel's iPhone and FCM → Android device. Foundation for all 9 push types.

Tasks outlined:

- [ ] Task 2.1: Claude writes Supabase migration for `push_tokens` table (user_id, device_id, platform, token, created_at)
- [ ] Task 2.2: Claude writes migration for `user_push_preferences` table (user_id, push_type, enabled, updated_at)
- [ ] Task 2.3: Jorrel generates APNs auth key in developer.apple.com → Keys → +, Apple Push Notifications service, downloads .p8 file (one-time download)
- [ ] Task 2.4: Jorrel creates Firebase project for Modern Village at https://console.firebase.google.com, adds Android app with package `app.modernvillage.android`, downloads `google-services.json`
- [ ] Task 2.5: Jorrel generates Firebase service account key (IAM → Service accounts → + → generate JSON)
- [ ] Task 2.6: Claude stores APNs .p8 content + team ID + key ID as Cloudflare Worker secrets
- [ ] Task 2.7: Claude stores Firebase service account JSON as Cloudflare Worker secret
- [ ] Task 2.8: Claude installs `@capacitor/push-notifications` in Capacitor project, wires registration flow in `www/index.html` bootstrap (or a loader script)
- [ ] Task 2.9: Claude wires push token POST to `/push/register` endpoint
- [ ] Task 2.10: Claude writes worker endpoint `POST /push/register` (upsert push_tokens)
- [ ] Task 2.11: Claude writes APNs helper: `send_apns(token, title, body, badge, data)` using HTTP/2 JWT-signed request
- [ ] Task 2.12: Claude writes FCM helper: `send_fcm(token, title, body, data)` using HTTP v1 API with OAuth2 access token
- [ ] Task 2.13: Claude writes worker endpoint `POST /push/send` (admin-auth, sends to a single user)
- [ ] Task 2.14: Jorrel tests: admin UI button or curl → push arrives on his phone
- [ ] Task 2.15: Claude wires all 9 push types as scheduled Cloudflare Worker cron triggers (one per type with its timing logic)

---

## Phase 3 — Dynamic frequency layers (Week 2 start)

**Goal:** Per-notification toggles, smart capping, time-of-day learning all working.

Tasks outlined:

- [ ] Task 3.1: Migration for `push_engagement` table (user_id, push_type, last_sent_at, last_tapped_at, consecutive_ignored_count)
- [ ] Task 3.2: Settings page UI — per-notification toggle rows (existing Settings section in app.html)
- [ ] Task 3.3: Claude writes frequency capping rule engine in worker (consult push_engagement before send)
- [ ] Task 3.4: Claude wires client-side push-tap handler — update last_tapped_at on any push tap
- [ ] Task 3.5: Claude adds `users.best_push_hour` column + daily rollup cron (mirror of `leads.best_open_hour` pattern from autoresearch framework)
- [ ] Task 3.6: Claude updates daily_check_in + weekly_digest senders to use best_push_hour

---

## Phase 4 — Biometrics + offline + share + Pro upgrade (Week 2 end)

**Goal:** Face ID login works, offline cache wipes on logout, share sheet native, Pro upgrade opens in-app Safari to Stripe.

Tasks outlined:

- [ ] Task 4.1: Install `@aparajita/capacitor-biometric-auth`
- [ ] Task 4.2: Wire enrollment prompt on successful first sign-in
- [ ] Task 4.3: Wire Face ID/fingerprint check on app launch if keychain entry exists
- [ ] Task 4.4: Implement 3x failure fallback to password/OAuth
- [ ] Task 4.5: Write Service Worker for page caching (app.html, screener.html, blog.html; 7-day expiry)
- [ ] Task 4.6: Implement sign-out HIPAA wipe (clear all IndexedDB, localStorage, sessionStorage, keychain)
- [ ] Task 4.7: Install `@capacitor/share`, wire existing share buttons to feature-detect native vs web
- [ ] Task 4.8: Build Pro upgrade explainer screen (HTML component in app.html or shared template)
- [ ] Task 4.9: Install `@capacitor/browser`, wire the upgrade button to open `https://modernvillage.app/upgrade?from=ios` in SFSafariViewController
- [ ] Task 4.10: Fix Google OAuth issue in WebView (use Capacitor Browser for OAuth flow instead of embedded WebView)

---

## Phase 5 — Live updates migration (Week 3 start)

**Goal:** Switch from `server.url` remote wrap to hybrid bundle + self-hosted live updates. This is the critical step that makes the app App Store reviewable (Phase 0's remote wrap was internal-TestFlight-only; public submission requires bundled content).

Tasks outlined:

- [ ] Task 5.1: Write build script that packages all HTML/CSS/JS assets from repo root into `dist-bundle/` with hash-based versioning
- [ ] Task 5.2: Write script to publish bundle zip to Vercel (or Cloudflare R2) at predictable URL
- [ ] Task 5.3: Write `/ios-manifest.json` endpoint (Cloudflare Worker) that returns current bundle version + known_good flag
- [ ] Task 5.4: Install `@capgo/capacitor-updater`, configure to check manifest URL on app launch
- [ ] Task 5.5: Remove `server.url` from capacitor.config.json, set webDir to `dist-bundle/` (baked-in fallback)
- [ ] Task 5.6: Add version pinning logic — if `known_good: false`, stay on last cached bundle
- [ ] Task 5.7: Test live update flow: deploy new bundle → app picks it up on next launch
- [ ] Task 5.8: Document the manifest update process for Jorrel (when to flip `known_good`, how to roll back)

---

## Phase 6 — Public submission (Week 3 end → Week 4)

**Goal:** Both iOS App Store and Google Play Store approved and live.

Tasks outlined:

- [ ] Task 6.1: Claude drafts 5 annotated screenshots (Figma exports or HTML mockups rendered to PNG at 6.9" + 6.1" + Android sizes)
- [ ] Task 6.2: Jorrel approves screenshots
- [ ] Task 6.3: Claude drafts App Store description text (long form, from existing landing copy)
- [ ] Task 6.4: Jorrel approves description
- [ ] Task 6.5: Jorrel completes Apple App Privacy nutrition label (structured form in App Store Connect)
- [ ] Task 6.6: Jorrel completes Google Play Data Safety form
- [ ] Task 6.7: HIPAA pre-submission checkpoint (Jorrel action #11 from spec)
- [ ] Task 6.8: Submit to external TestFlight beta review (one-time Apple review, 1-2 days)
- [ ] Task 6.9: Once external beta approved, invite wider inner circle (up to 100 testers still counts as internal, or use external for >100)
- [ ] Task 6.10: 4-5 days of beta feedback
- [ ] Task 6.11: Fix any beta-reported issues
- [ ] Task 6.12: Submit iOS to public App Store review
- [ ] Task 6.13: Submit Android to public Google Play review
- [ ] Task 6.14: On approval, flip public availability, tag `v1.0-launch`
- [ ] Task 6.15: Jorrel sends announcement email + social posts

---

## Out of scope for this plan

Explicitly not covered (even at outline level), per spec:
- In-app purchases / StoreKit
- Native camera/mic/geolocation plugins
- Apple Watch / Wear OS
- Tablet-specific layouts
- Meta Pixel on mobile + ATT prompt (deferred)
- Deep linking beyond the chat-limit push

---

## Risks to phase execution

| Risk | Phase | Mitigation |
|---|---|---|
| Xcode download slow or fails | 0 | Start Task 0.0 immediately; fall back to cellular hotspot if home WiFi slow |
| Jorrel's Mac too old for Xcode 26 | 0 | Check macOS version upfront (Task 0.0 notes); escalate if blocked |
| Bundle ID already taken in Apple's namespace | 0.9 | Try `com.modernvillage.app` or `app.modernvillage.village` fallback |
| First TestFlight processing hangs | 0.16 | Apple-side queue; wait up to 1 hr, then contact Apple support |
| Google OAuth fails in WebView | 0.13 (noted) → 4.10 (fix) | Use Apple Sign-In or email/password until Phase 4 |
| APNs .p8 key lost after download | 2.3 | Apple only lets you download it ONCE — save to password manager immediately |
| Keystore.jks lost | 1.5 | CRITICAL — lost keystore means cannot update Android app ever. Save to multiple secure locations |
