# Setting up Modern Village on a new machine

Use this when you (Jorrel) want to spin up the project on a different Mac (laptop, second desktop, etc.) — or if you ever lose the Mac mini and need to rebuild from scratch.

## What you need installed

| Tool | Required for | Install via |
|---|---|---|
| **Git** | Cloning the repo | Comes with macOS Command Line Tools (`xcode-select --install`) |
| **Node.js 18+** | npm + JS scripts | https://nodejs.org or `brew install node` |
| **Claude Code** | AI pair programming | https://claude.ai/code |
| **Xcode 26+** | iOS builds + Archive (only if you'll do iOS work on this machine) | Mac App Store, ~15GB |
| **Apple Developer account login** | Signing iOS builds | Open Xcode → Settings → Accounts → Apple ID |

## One-time setup

```bash
# Clone the repo
git clone https://github.com/jorrelpatterson/modern-village.git
cd modern-village

# Install JS dependencies
npm install

# Optionally: install all the iOS native plugins' Swift packages
# (Xcode does this automatically when you open the project, but you can prime it)
npx cap sync ios
```

## Files NOT in git (you must copy these manually if you'll do iOS work)

These are sensitive (signing keys, secrets) and intentionally `.gitignore`d. Copy from your Mac mini via AirDrop, encrypted USB, 1Password, or similar — never put them in the repo.

| File | Purpose | Where it lives on the Mac mini |
|---|---|---|
| `AuthKey_MLBB3NX7FC.p8` | APNs (push notifications) signing key | Repo root |
| `AuthKey_NA3B894JG3.p8` | Sign in with Apple signing key | Desktop |

If you lose either key file, you can re-download from https://developer.apple.com/account/resources/authkeys/list — but Apple only allows download once per key, so if it was already downloaded you'd need to delete + recreate the key (and re-configure the secret in Cloudflare / Supabase).

## What lives where (so you know what to update where)

### Website + AI worker (no Xcode needed)

- **Website code**: `app.html`, `index.html`, `blog.html`, etc. → Vercel deploys from `main` branch automatically
- **AI worker**: `worker.js` → paste into Cloudflare dashboard → Workers & Pages → village-api → Edit code → Save and deploy
- **Supabase migrations**: `supabase/migrations/*.sql` → paste SQL into Supabase dashboard → SQL Editor → Run

### iOS native (Xcode required)

- **Capacitor config**: `capacitor.config.json`
- **iOS-specific files**: `ios/App/App/*` (AppDelegate.swift, Info.plist, entitlements)
- **Native plugins**: `package.json` dependencies starting with `@capacitor/*`, `@aparajita/*`, `@capawesome/*`, `@capacitor-community/*`

When you add a new native plugin:
```bash
npm install @capacitor/some-plugin
npx cap sync ios
git add package.json package-lock.json ios/
git commit -m "feat(ios): add some-plugin"
git push origin main
```

Then on the Mac with Xcode: `git pull`, open `ios/App/App.xcodeproj`, Reset Package Caches, bump build number, Archive, Upload.

## Daily workflow with two devices

```bash
# When you start work:
git pull origin main

# Make changes, commit when satisfied:
git add <files>
git commit -m "feat(...): ..."
git push origin main

# Switch devices: run `git pull` on the other machine before editing anything.
```

**Never** edit the same file on both devices without committing in between — you'll create merge conflicts. The rule of thumb: pull → edit → commit → push, every time you sit down.

## Claude memory (per-machine, doesn't auto-sync)

Claude Code stores per-project memory at:
```
~/.claude/projects/<encoded-project-path>/memory/
```

This is per-machine — it doesn't sync via git. To preserve continuity when switching to a new machine, you can:

1. Copy the entire memory directory from the Mac mini to the new machine, OR
2. Rely on the comprehensive docs in the repo:
   - `docs/ROADMAP.md` — full roadmap state
   - `docs/SUPPLEMENTARY.md` — strategy, business decisions, architecture
   - `docs/MARKETING-PLAYBOOK.md` — marketing strategy
   - `docs/MY-VILLAGE-SPEC.md` — community feature spec
   - `docs/APP-STORE-PRIVACY-LABELS.md` — App Store privacy reference

The wrap docs in memory are designed to be readable cold — but the repo docs are the durable source of truth.

## External services that need credentials

These all require account login (one-time per machine):

| Service | Where you sign in | What it's for |
|---|---|---|
| **GitHub** | Whatever git tool you use (Xcode, GitHub Desktop, terminal SSH key) | Push/pull code |
| **Vercel** | https://vercel.com (your account) | Auto-deploys website on every commit to main; check deploy status |
| **Cloudflare** | https://dash.cloudflare.com | Worker code + secrets + cron triggers |
| **Supabase** | https://supabase.com/dashboard | Database, auth, migrations |
| **App Store Connect** | https://appstoreconnect.apple.com | TestFlight, builds, App Store submission |
| **Apple Developer** | https://developer.apple.com/account | Signing keys, Services IDs, capabilities |
| **Stripe** | https://dashboard.stripe.com | Payments |
| **Anthropic Console** | https://console.anthropic.com | Claude API key (for `worker.js`) |
| **Resend** | https://resend.com | Email sending API key (for `worker.js`) |
