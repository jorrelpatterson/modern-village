# Medical Billing Module — Agent Notes

**Built overnight on branch: `medical-billing`**
**Date: 2026-04-06/07**
**Status: Complete — ready for review and merge**

---

## What Was Built

### 1. SQL Migration (`supabase/migrations/20260407_medical_billing.sql`)
- **`claims` table** — tracks insurance claims per session note (provider_id, child_id, payer_name, payer_id, cpt_code, units, amount, status, submitted_at, paid_at, paid_amount, denied_reason)
- **`payer_enrollments` table** — tracks which insurance companies a BCBA is credentialed with (payer_name, payer_id, enrollment_status, credentialed_at)
- RLS policies: providers see/manage their own claims and payers. Admins can view all claims.
- Indexes on provider_id, status, session_note_id

### 2. Billing Tab in Client Detail (`app.html`)
Added a "Billing" sub-tab alongside Behavior Logs, Session Notes, Care Notes, Insights. Shows:
- **Summary cards** — 4 stats: Pending (count + $), Submitted (count + $), Paid (count + $), Denied (count + $)
- **Aging report** — visual bar showing 0-30 day / 31-60 day / 61-90+ day claim distribution
- **Claims list** — each claim shows payer, CPT code, units, amount, status badge, date
- **Status dropdown** — update claim status inline (pending → submitted → paid / denied)
- **Denial reason** — text input appears when claim is denied
- **Paid amount** — number input appears when claim is paid (for partial payments)

### 3. Generate Claim from Session Notes
Added a "Generate Claim" button on each session note card. When clicked:
- Checks if a claim already exists for that session (prevents duplicates)
- Pulls the provider's default payer from payer_enrollments
- Calculates units from session duration (duration / 15, rounded up)
- Defaults amount to $30/unit (editable later)
- Creates the claim in `pending` status

### 4. Billing Dashboard (all clients)
New sidebar item "Billing Dashboard" for providers. Shows:
- Total revenue, outstanding amount, total claims, denied count
- Aging report across all clients
- Recent 20 claims with status badges

### 5. Payer Management
New sidebar item "My Payers" for providers. Shows:
- List of enrolled insurance payers with status (active/pending/inactive)
- Add new payer form (name + payer ID)
- Update enrollment status dropdown
- Remove payer button

### 6. CSS
Added billing-specific CSS: .billing-summary, .billing-stat, .claim-card, .claim-status-*, .aging-bar, .aging-segment, .payer-card

---

## What You Need to Do

1. **Review the branch:** `git diff main..medical-billing` (or just read the commits)
2. **If it looks good, merge:** `git checkout main && git merge medical-billing`
3. **Run the SQL migration** in Supabase SQL editor: `supabase/migrations/20260407_medical_billing.sql`
4. **Push to main:** `git push origin main`
5. **Test as provider:** Log in as testprovider@modernvillage.app, open a client, create a session note, generate a claim

---

## Design Decisions Made

- **Claims are generated from session notes** (not created independently) — this ensures every claim has clinical documentation backing it
- **Default rate is $30/unit** — this is a placeholder. In production, rates should come from the payer enrollment or a rate schedule
- **Payer defaults to first active enrollment** — if provider has multiple payers, they'd need to select per-client (future enhancement)
- **No automated claim submission** — claims are tracked manually (pending → submitted → paid). Electronic claim submission (EDI 837) is a future phase requiring clearinghouse integration

---

## Potential Issues

- **Quote escaping:** All onclick handlers use `\\x27` as required. Syntax check passed clean.
- **The `confirm()` call in deletePayer** — works but is not styled. Could replace with a custom modal later.
- **No payer selection per claim** — currently uses first active payer. If a provider works with multiple insurance companies, they'd need a payer dropdown when generating claims. Flagging for future enhancement.

---

## Files Changed
- `app.html` — 280 lines added (CSS + HTML + JS)
- `supabase/migrations/20260407_medical_billing.sql` — 83 lines (new file)

## Commits (on medical-billing branch)
1. `87d0d7f` — SQL migration for claims and payer_enrollments tables
2. `0dc57ac` — Billing tab in provider client detail
3. `c843572` — Billing dashboard + payer management

---

## Additional Builds (overnight continuation)

### 6. Admin Billing Overview Tab (`admin.html`)
New "Billing Overview" tab in admin sidebar showing:
- Total revenue, outstanding amount, total claims, denial rate
- Claims by status bar chart (pending/submitted/paid/denied)
- Revenue by provider bar chart (with provider names)
- Recent 30 claims table (provider, payer, CPT, units, amount, status, date)

### 7. Client Card Billing Stats (`app.html`)
Provider client list cards now show:
- "$X paid" in green (total revenue from this client)
- "$X pending" in blue (outstanding claims)
- Replaces the old "draft/pending" session note badges with actual dollar amounts

### 8. Claim CSV Export (`app.html`)
- "Export CSV" button on the Billing Dashboard
- Downloads all claims as CSV: payer, CPT, units, amount, paid amount, status, denial reason, dates
- `exportClaims()` function added

## Updated Commit Log (all on medical-billing branch)
1. `87d0d7f` — SQL migration for claims and payer_enrollments tables
2. `0dc57ac` — Billing tab in provider client detail
3. `c843572` — Billing dashboard + payer management
4. `4743ddd` — Agent notes
5. `a7ffb16` — Admin billing overview tab
6. `1874a34` — Client card billing stats + claim export

## Total Changes
- `app.html` — ~300 lines added
- `admin.html` — ~77 lines added
- `supabase/migrations/20260407_medical_billing.sql` — 83 lines (new)
- `AGENT-NOTES.md` — this file
