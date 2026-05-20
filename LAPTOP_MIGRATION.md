# Modern Village — Laptop Migration Guide

**Last updated:** 2026-05-19

You're reading this because you copied the AI Projects folder from the Mac mini to a new APFS drive (`(626)806-4475`) and want to actually run Modern Village from a laptop. Follow this top to bottom — should take ~30-45 minutes the first time. Modern Village is the most complex of your projects (web + iOS Capacitor wrap + Cloudflare Worker + Vercel + Supabase + Apple signing keys), so don't skip steps.

---

## What this project is

- **Modern Village** — ABA-powered parenting platform for neurodivergent families
- Co-founders: Ariana Roberts (BCBA, Clinical Director) + you (President / Builder)
- **Frontend:** Vanilla HTML/CSS/JS (no framework, no build step) — `app.html`, `index.html`, `admin.html`, etc.
- **Database/Auth:** Supabase Postgres + RLS (`jrsiqjfwvunrjiihnsgc.supabase.co`)
- **API proxy:** Cloudflare Worker (`village-api.jorrelpatterson.workers.dev`) → see `worker.js`
- **AI:** Claude Sonnet 4 via Anthropic API (called from the worker)
- **Payments:** Stripe ($19.99/mo Pro)
- **Email:** Resend API
- **Hosting:** Vercel (auto-deploys from GitHub `main` branch) → `modernvillage.app`
- **iOS app:** Capacitor wrap of `modernvillage.app/app.html`, bundle ID `app.modernvillage.ios`, currently on TestFlight (build 7+)
- **Project root:** `/Volumes/(626)806-4475/Ai Projects/modern-village/`
- **GitHub:** `https://github.com/jorrelpatterson/modern-village.git`

This is the single-file HTML architecture — `app.html` is ~3,500+ lines. Don't propose a framework migration unless explicitly asked.

---

## Two ways to get the project on your laptop

### Option A — Plug in the external drive (fastest)

The `(626)806-4475` drive is APFS, works on any Mac. Plug it in, the project lives at:

```
/Volumes/(626)806-4475/Ai Projects/modern-village/
```

`node_modules/` and the two `AuthKey_*.p8` files are already on the drive — you can skip ahead to **"Prerequisites on the laptop"**.

### Option B — Clone from GitHub (cleaner, multi-machine)

The repo is already on GitHub at `jorrelpatterson/modern-village`, so cloning is straightforward:

```bash
gh auth login                                     # if not already authenticated
gh repo clone jorrelpatterson/modern-village
cd modern-village
```

Gitignored files (the two `AuthKey_*.p8` files, plus any local secrets) **do not come down with the clone**. You'll copy those manually below.

---

## Prerequisites on the laptop

### 1. Node.js (v18 or newer)

```bash
# If you have Homebrew:
brew install node

# Verify
node --version    # v18.x or higher is fine
npm --version
```

If no Homebrew, install from https://nodejs.org (pick LTS).

### 2. Git

```bash
git --version    # macOS usually has this; if not:
xcode-select --install
```

### 3. GitHub CLI (only needed for Option B or to push commits)

```bash
brew install gh
gh auth login    # follow the prompts
```

### 4. Editor — Antigravity + Claude Code (current stack)

Jorrel's actual editing stack on the laptop is **Antigravity** (Google's AI-native IDE) + **Claude Code** (this CLI). Between them you have a full editor plus agentic file edits — no separate IDE needed.

Older notes mentioned VS Code or Cursor; those are still fine fallbacks but redundant given Antigravity + Claude Code. If you want one anyway:

```bash
brew install --cask visual-studio-code   # or: brew install --cask cursor
```

The project root path has parentheses (`(626)806-4475`), so always quote shell paths regardless of editor.

### 5. (Optional) Xcode 26 — Mac-mini-primary, laptop-optional

**The Mac mini is the iOS build box.** Xcode is only required to Archive + Upload a new iOS build to TestFlight or App Store. The laptop does not need Xcode for:

- Website hot-fixes (Vercel auto-deploys from `main`)
- Worker hot-fixes (Cloudflare paste-deploy in browser)
- SQL / migration fixes (Supabase SQL Editor in browser)
- Admin/ops work (admin panel in browser)

Since the iOS app is a Capacitor wrapper around `modernvillage.app/app.html`, **most "iOS bugs" are actually web bugs that fix themselves the moment Vercel redeploys** — no new iOS build needed. Reserve Xcode for true native work: new Capacitor plugins, Info.plist / entitlement changes, native crash debugging, certificate rotation.

If you want laptop parity (travel-ready, can ship anything from anywhere), install Xcode 26 from the Mac App Store (~15 GB). Setup:

- Install from the Mac App Store (~15 GB; the download is the slow part — leave it overnight)
- Open Xcode → Settings → Accounts → add Apple ID `jorrelpatterson@gmail.com`
- Accept the license: `sudo xcodebuild -license accept`
- Open `ios/App/App.xcodeproj`, let it auto-fetch provisioning profiles for `app.modernvillage.ios` (Team `X577Q747WV`)
- Try a clean Archive to validate signing — that's the real test that the laptop is iOS-ready

**Reminder:** As of Apr 28 2026, all iOS submissions must be built with **Xcode 26 + iOS 26 SDK**. Older Xcode versions will be rejected at upload.

### 6. (Optional) Cloudflare Wrangler CLI

The worker is currently deployed via the **Cloudflare dashboard paste-and-deploy flow**, so Wrangler is *not* required to ship. If you want to run/test the worker locally (`wrangler dev`), install it:

```bash
npm install -g wrangler
wrangler login    # opens browser to authenticate
```

There is no `wrangler.toml` checked in — `worker.js` is uploaded via the dashboard. The `.wrangler/` directory in the repo is empty and can be ignored.

### 7. (Optional) Vercel CLI

Vercel auto-deploys from `main`, so you don't normally need the CLI. If you want to inspect deploys / pull env vars / run preview deploys locally:

```bash
npm install -g vercel
vercel login
vercel link    # link the local folder to the existing Vercel project
```

---

## Copy the gitignored files (CRITICAL)

These files are NOT in git for security reasons. **Without them, push notifications and Sign in with Apple will not work for new builds.**

### Option A (drive): they're already on the drive — verify they exist:

```bash
ls "/Volumes/(626)806-4475/Ai Projects/modern-village/"AuthKey_*.p8
```

You should see both:
- `/Volumes/(626)806-4475/Ai Projects/modern-village/AuthKey_MLBB3NX7FC.p8`
- `/Volumes/(626)806-4475/Ai Projects/modern-village/AuthKey_NA3B894JG3.p8`

### Option B (GitHub clone): copy them manually

If you cloned from GitHub, the `.p8` files are NOT in the repo. Copy them from the external drive (or the Mac mini) to the cloned project root. AirDrop, USB, or 1Password Secure Notes all work — never put them in the repo.

| File | Purpose | Where it lives on the original (Mac mini) |
|---|---|---|
| **`AuthKey_MLBB3NX7FC.p8`** | APNs (push notifications) signing key — used by `worker.js` to send pushes via Apple's APNs servers. Also stored as a Cloudflare Worker secret. | Repo root: `/Volumes/(626)806-4475/Ai Projects/modern-village/AuthKey_MLBB3NX7FC.p8` |
| **`AuthKey_NA3B894JG3.p8`** | Sign in with Apple signing key — used by Supabase to verify Apple identity tokens server-side. | Original location was `~/Desktop/` on the Mac mini; now also at repo root on the drive. |

**If either key file is lost:** you can re-download from https://developer.apple.com/account/resources/authkeys/list — but Apple only allows download **once per key**. If it was already downloaded, you'd need to delete + recreate the key, then re-paste the new key into:
- Cloudflare Worker secrets (for `MLBB3NX7FC` — APNs)
- Supabase auth provider config (for `NA3B894JG3` — Apple Sign In)

So: **don't lose them**. They live both on the drive and (ideally) in 1Password as a backup.

### Other gitignored files

There is no `.env` or `.env.example` in this project — secrets live in:
- Cloudflare Worker secrets (Anthropic key, Resend key, Supabase service role, APNs key, etc.)
- Supabase dashboard (Apple OAuth provider config)
- Stripe dashboard

So once the `.p8` files are in place, the local repo is self-contained.

---

## Install dependencies

```bash
cd "/Volumes/(626)806-4475/Ai Projects/modern-village"     # Option A
# OR
cd ~/path/to/cloned/modern-village                          # Option B

npm install
```

Takes 1-2 minutes. Dependencies are mostly Capacitor plugins (`@capacitor/*`, `@capawesome/*`, `@aparajita/*`).

---

## Authenticate the services you'll touch

You don't need to "set up" any of these — they're already provisioned. You just need to log in once per laptop:

| Service | Where you sign in | What it's for |
|---|---|---|
| **GitHub** | `gh auth login` or VS Code's git UI | Push/pull code |
| **Vercel** | https://vercel.com (your account) | Inspect/trigger deploys; CLI: `vercel login` |
| **Cloudflare** | https://dash.cloudflare.com → Workers & Pages → `village-api` | Edit `worker.js` (paste + deploy) and manage secrets/cron |
| **Supabase** | https://supabase.com/dashboard | Run SQL migrations, manage auth providers, inspect tables |
| **App Store Connect** | https://appstoreconnect.apple.com | TestFlight, builds, submission (Team `X577Q747WV`) |
| **Apple Developer** | https://developer.apple.com/account | AuthKeys, Services IDs, capabilities |
| **Anthropic Console** | https://console.anthropic.com | Claude API key (lives in CF Worker secret, not local) |
| **Resend** | https://resend.com | Email API key (lives in CF Worker secret) |
| **Stripe** | https://dashboard.stripe.com | Subscriptions, payments |

All are signed in as `jorrelpatterson@gmail.com`.

---

## Run / preview the website locally

There's no dev server in `package.json` — the project is plain static HTML. Easiest way to preview:

```bash
# From the project root, fire up any static server. Pick one:
python3 -m http.server 3000
# OR
npx serve .
# OR just open the file
open index.html
```

Then visit http://localhost:3000. Most app code is in `app.html`; the marketing site is `index.html`.

**Note:** The app expects to be served from `https://modernvillage.app` for OAuth + Supabase + worker CORS to work cleanly. Local file:// or localhost previews are fine for layout/CSS work but will break auth and most API calls. For real testing, push to a branch → Vercel preview deploy → test on the preview URL.

---

## Workflow: change website code

1. Edit the relevant `*.html` file
2. `git add <file> && git commit -m "..." && git push origin main`
3. Vercel auto-deploys `main` → live on `modernvillage.app` within ~1 min

---

## Workflow: change the Cloudflare Worker

The worker is `worker.js` at the repo root. **It does NOT auto-deploy** — Vercel ignores it (see `.vercelignore`), and there's no GitHub Actions hookup.

To deploy a worker change:

1. Edit `worker.js`
2. Commit + push (so the source of truth in git matches what's live)
3. Open https://dash.cloudflare.com → Workers & Pages → `village-api` → Edit code
4. Paste the new contents of `worker.js`, click **Save and deploy**

This paste flow is intentional — the worker has secrets that are easier to manage in the dashboard than via Wrangler. If you ever want to migrate to `wrangler deploy`, you'd need to add a `wrangler.toml` and re-bind all secrets.

**Worker secrets** (set in CF dashboard → village-api → Settings → Variables):
- `ANTHROPIC_API_KEY`
- `RESEND_API_KEY`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- APNs key contents (from `AuthKey_MLBB3NX7FC.p8`) + key ID + team ID
- Stripe webhook secret

You don't normally need to re-set these on a laptop migration — they live in Cloudflare, not on disk.

---

## Workflow: run a Supabase migration

Migrations live in `supabase/migrations/*.sql`. They are **applied by paste**, not via the Supabase CLI. So a migration file in the repo can sit un-applied if you forget to paste it.

To apply:

1. Open https://supabase.com/dashboard → project `jrsiqjfwvunrjiihnsgc` → SQL Editor
2. Paste the contents of the new migration file
3. Run

**Gotcha:** if anything starts returning HTTP 400 unexpectedly, check whether a recent migration was committed but not actually pasted into Supabase. This has bitten you before.

---

## Workflow: iOS builds (only if Xcode is installed)

```bash
# Install/update native plugins after a package.json change
npx cap sync ios

# Open the iOS project in Xcode
open ios/App/App.xcodeproj
```

In Xcode:
1. Select **App** scheme, target **Any iOS Device**
2. Update build number (Product → Archive expects a unique build #)
3. **Product → Archive**
4. After archive: Distribute App → App Store Connect → Upload
5. Wait ~10-15 min for processing → appears in TestFlight

**Reminder:** Xcode 26 + iOS 26 SDK required for any submission after Apr 28 2026.

After upload, the build appears in TestFlight under App Store Connect → My Apps → Modern Village → TestFlight.

---

## Common gotchas

### Drive name has parentheses

Always quote shell paths:
```bash
cd "/Volumes/(626)806-4475/Ai Projects/modern-village"
```

Unquoted, the parens get interpreted by the shell.

### "Permission denied" on the external drive

On macOS, Terminal.app may need Full Disk Access for `/Volumes/`:
- System Settings → Privacy & Security → Full Disk Access → add Terminal
- OR: use the VS Code integrated terminal (inherits IDE permissions)

### A Supabase API call started returning 400 unexpectedly

Check whether a migration was committed but not pasted into the Supabase dashboard. Open `supabase/migrations/`, look for the most recent files, and confirm each has actually been run in Supabase SQL Editor. (See `feedback_migration_drift_check` in your Claude memory.)

### `npx cap sync ios` says plugins are missing

Make sure you ran `npm install` first. Capacitor sync reads from `node_modules/`.

### Push notifications stopped working after rebuild

This is almost always a **stale session token** in the Capacitor WebView (localStorage persists across TestFlight installs). Fix on device: delete the app entirely, then reinstall from TestFlight. The code already calls `sb.auth.refreshSession()` before `/push/register` to self-heal in most cases. (See `project_ios_push_debug_state.md` in Claude memory for the full debug story.)

### `/push/register` returns 401 from a fresh install

If `refreshSession()` also fails, the user's refresh token is dead — they have to sign in again. Acceptable edge case; just sign out + sign in fixes it.

### Onclick handlers break when generated by subagents

Subagents sometimes mangle JS quote escaping in HTML `onclick=` strings. After any subagent edit to `app.html` / `admin.html`, do a syntax check (load the page in a browser, watch console). Use `\x27` (single backslash) for single quotes in onclick handlers — **never** `\\x27`, which renders as a literal `\x27` in the attribute and breaks the click handler (this bit us on 2026-05-19, fixed in `b22e42f`). The codebase uses single-backslash `\x27` ~248 times and `\\x27` zero times. Canonical rule lives in `CLAUDE.md` and `SESSION_HANDOFF.md`.

### Vercel deploy didn't pick up a worker change

Expected. Vercel ignores `worker.js` (see `.vercelignore`). Worker changes only go live when you paste into the Cloudflare dashboard.

### iOS build won't install on a TestFlight tester's phone

Two common causes:
1. They haven't accepted the TestFlight invite (resend from App Store Connect → TestFlight → Testers)
2. The build's `aps-environment` is set wrong. For TestFlight + App Store, it must be `production`, not `development`. Check `ios/App/App/App.entitlements`.

---

## Quick reference

| What | Where |
|---|---|
| Project root | `/Volumes/(626)806-4475/Ai Projects/modern-village/` |
| GitHub repo | `https://github.com/jorrelpatterson/modern-village` |
| Live website | `https://modernvillage.app` |
| Vercel project | https://vercel.com (Modern Village) |
| Cloudflare Worker | https://dash.cloudflare.com → Workers → `village-api` |
| Worker URL | `https://village-api.jorrelpatterson.workers.dev` |
| Supabase project | `jrsiqjfwvunrjiihnsgc` (https://supabase.com/dashboard) |
| App Store Connect | App ID for Modern Village (Team `X577Q747WV`) |
| Bundle ID | `app.modernvillage.ios` |
| APNs key | `AuthKey_MLBB3NX7FC.p8` (repo root, gitignored) |
| Apple Sign In key | `AuthKey_NA3B894JG3.p8` (repo root, gitignored) |
| Worker source | `worker.js` (paste-deploy) |
| Capacitor config | `capacitor.config.json` |
| iOS Xcode project | `ios/App/App.xcodeproj` |
| SQL migrations | `supabase/migrations/*.sql` (paste-apply) |
| Roadmap | `docs/ROADMAP.md` |
| Strategy/architecture | `docs/SUPPLEMENTARY.md` |
| Marketing playbook | `docs/MARKETING-PLAYBOOK.md` |
| App Store privacy labels | `docs/APP-STORE-PRIVACY-LABELS.md` |
| Per-machine setup notes | `docs/SETUP-NEW-MACHINE.md` (older sibling of this file) |

---

## Reference: Claude project memory

Per-project Claude memory lives at:
```
~/.claude/projects/-Volumes--626-806-4475-Ai-Projects-modern-village/memory/
```

This is **per-machine** — it doesn't sync via git. The memory + past session transcripts are backed up to the external drive at `/Volumes/(626)806-4475/Ai Projects/modern-village-claude-state/`. To restore on a fresh laptop, run the one-liner in `SESSION_HANDOFF.md` (the "Restoring Claude Code auto-memory on a new laptop" section).

If you skip restoration, the durable source-of-truth docs in the repo cover most of it:

- `SESSION_HANDOFF.md` — start here, canonical session state
- `CLAUDE.md` — agent onboarding pointer
- `docs/ROADMAP.md` — full roadmap state
- `docs/SUPPLEMENTARY.md` — strategy, business decisions, architecture
- `docs/MARKETING-PLAYBOOK.md` — marketing strategy
- `docs/MY-VILLAGE-SPEC.md` — community feature spec
- `docs/APP-STORE-PRIVACY-LABELS.md` — privacy labels reference
- `AGENT-NOTES.md` — recent agent work log
- `BUGS.md` — open bugs

Without restoration, the next Claude Code session on the laptop just starts fresh — slower (it has to re-learn the codebase) but everything still works.

---

## Verification checklist

Run through this once on the laptop:

- [ ] `node --version` returns v18+
- [ ] `git --version` works
- [ ] `npm install` succeeded inside `modern-village/`
- [ ] `AuthKey_MLBB3NX7FC.p8` exists at repo root
- [ ] `AuthKey_NA3B894JG3.p8` exists at repo root
- [ ] `git remote -v` shows `origin → github.com/jorrelpatterson/modern-village.git`
- [ ] Signed into GitHub via `gh auth status` (or VS Code git)
- [ ] Signed into Vercel, Cloudflare, Supabase, Apple Developer, App Store Connect (in browser is fine)
- [ ] (If doing iOS work) Xcode 26 installed + Apple ID added in Xcode → Settings → Accounts
- [ ] (If doing iOS work) `npx cap sync ios` runs without errors
- [ ] You can read this file from the laptop ✓

If all checked, you're set. The website auto-deploys on `git push`; the worker requires a paste into Cloudflare; iOS requires Xcode + Archive + Upload. Welcome to the laptop.
