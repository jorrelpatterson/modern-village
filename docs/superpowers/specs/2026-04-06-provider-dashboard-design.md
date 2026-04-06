# Provider Dashboard — Design Spec

**Date:** 2026-04-06
**Scope:** Sub-project 3 of Phase 3 — Provider/BCBA features
**Depends on:** Sub-project 1 (Role system), Sub-project 2 (Caregiver network — care notes)
**Files affected:** `app.html`, new SQL migration

---

## Overview

Build the BCBA/provider experience: client list dashboard, session notes with AI-generated clinical narratives, superbill PDF export, billing status tracking, and parent visibility of shared notes.

**What providers can do:**
- View client list with quick stats (trend, last incident, next session)
- View client behavioral data (logs, strategies, patterns)
- Write structured session notes with AI-generated clinical narratives
- Generate printable superbills for insurance billing
- Track billing status per session (draft/submitted/paid/denied)
- Toggle note visibility to parents
- Read and post care team notes (already built)
- View child insights and progress dashboard

**What providers cannot do:**
- Use AI Coach for themselves
- Access Community or parent-facing features
- Modify behavior logs, routines, or strategies
- See session notes from other providers
- Access billing/subscription management

---

## Data Model

### New table: `session_notes`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| provider_id | uuid FK → profiles | The BCBA who wrote it |
| child_id | uuid FK → children | Which child |
| session_date | date NOT NULL | When the session occurred |
| duration_minutes | integer NOT NULL | Session length |
| cpt_code | text | e.g. '97153' |
| session_type | text NOT NULL | 'assessment', 'direct_therapy', 'supervision', 'parent_training', 'caregiver_training' |
| goals_addressed | text[] | Array of goal descriptions |
| interventions | text | What strategies/techniques were used |
| client_response | text | How the child responded |
| next_steps | text | Plan for next session |
| ai_narrative | text | AI-generated clinical narrative |
| shared_with_parent | boolean DEFAULT true | Parent can see this note |
| billing_status | text DEFAULT 'draft' | 'draft', 'submitted', 'paid', 'denied' |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz DEFAULT now() | |

### RLS policies

```sql
-- Providers see their own session notes
CREATE POLICY "Providers view own notes"
  ON public.session_notes FOR SELECT
  USING (auth.uid() = provider_id);

-- Providers create their own session notes
CREATE POLICY "Providers create notes"
  ON public.session_notes FOR INSERT
  WITH CHECK (auth.uid() = provider_id);

-- Providers update their own session notes
CREATE POLICY "Providers update own notes"
  ON public.session_notes FOR UPDATE
  USING (auth.uid() = provider_id);

-- Parents see shared session notes for their children
CREATE POLICY "Parents view shared session notes"
  ON public.session_notes FOR SELECT
  USING (
    shared_with_parent = true
    AND EXISTS (
      SELECT 1 FROM public.child_access ca
      WHERE ca.child_id = session_notes.child_id
      AND ca.user_id = auth.uid()
      AND ca.access_level = 'full'
      AND ca.revoked_at IS NULL
    )
  );
```

---

## Provider Dashboard UI

### Clients Tab

When provider logs in with `applyRole()`, they see a **Clients** tab (new tab replacing Coach).

**Tab bar for providers:** Clients, Track

The Clients tab shows:
- Header: "My Clients" with client count
- List of children connected via `child_access` (access_level: 'clinical')
- Each card shows:
  - Child avatar initial + name
  - Age, diagnosis
  - Last incident date (from most recent behavior_log)
  - 30-day trend badge (improving/increasing/stable) from `detectPatterns()`
  - Session count + billing summary (X draft, Y submitted)
- Tap card → opens Client Detail overlay

### Client Detail Overlay

New overlay page: `clientDetailPage`

- Header: child name + back button
- Sub-tabs within the overlay (rendered as pill buttons):
  - **Behavior Logs** — read-only view of the child's behavior logs (reuses `loadLogs()` pattern)
  - **Session Notes** — this provider's notes for this child + "New Note" button
  - **Care Team Notes** — reuses existing care notes (already built)
  - **Insights** — child insights/pattern dashboard (reuses `renderInsights()`)

### Session Notes List

Within the client detail, the Session Notes sub-tab shows:
- "New Session Note" button at top
- List of existing notes, newest first
- Each note card: date, session type badge, CPT code, duration, billing status badge, "Shared" indicator
- Tap to expand: shows full note with narrative, edit button, superbill button

---

## Session Note Form

New overlay: `sessionNoteForm`

**Structured fields:**
- Session date (date picker, defaults to today)
- Duration (number input, minutes)
- CPT code (dropdown of provider's saved CPT codes from profile)
- Session type (dropdown: Assessment, Direct Therapy, Supervision, Parent Training, Caregiver Training)
- Goals addressed (textarea, one per line)
- Interventions used (textarea)
- Client response (textarea)
- Next steps (textarea)
- Share with parent (toggle, default on)

**"Generate Clinical Note" button:**
1. Collects all structured fields
2. Fetches child behavioral context via `fetchChildContext()`
3. Sends to Claude with clinical system prompt
4. Returns professional narrative
5. Displays in editable textarea below
6. BCBA reviews, edits, saves

**System prompt for AI narrative:**
```
You are a clinical documentation assistant for Board Certified Behavior Analysts (BCBAs). Generate a professional, insurance-ready session narrative based on the structured session data and the child's behavioral history. Use clinical ABA terminology. The narrative should be 150-250 words, written in third person. Include: session context, interventions applied, client response with specific behavioral observations, and clinical recommendations. Reference specific behavioral data when available.
```

**Save** → inserts into `session_notes` table.

---

## Superbill PDF

"Generate Superbill" button on each saved session note.

Opens a new print-formatted view (same `window.print()` pattern as routine builder) with:

- **Header:** "SUPERBILL — Modern Village" with date
- **Provider section:** Name, credentials (license_type), NPI number, license state + number
- **Client section:** Child name, DOB (from birthday field), diagnosis
- **Service section:** Date of service, CPT code, session type, duration, units (duration/15 rounded up)
- **Clinical narrative:** The AI-generated (or manually written) note
- **Billing status:** Current status
- **Signature line:** Provider signature + date

Print CSS hides all app chrome, shows only the superbill content.

---

## Billing Status Tracking

Each session note card in the list shows a billing status badge:
- **Draft** (gray) — note saved but not submitted
- **Submitted** (blue) — claim sent to insurance
- **Paid** (green) — payment received
- **Denied** (red) — claim denied

Provider can update status via a dropdown on the expanded note view.

Client list cards show a billing summary: "3 draft, 2 submitted, 1 paid"

---

## Parent View — Session Notes

Parents see a new sidebar item: "Session Notes" (only appears if there are shared session notes for their children).

Shows: read-only list of shared notes — session date, type, goals addressed, clinical narrative. No billing status or provider-internal fields visible.

Implementation: query `session_notes WHERE child_id IN (parent's children) AND shared_with_parent = true`.

---

## Provider Invite Integration

Update the existing invite modal (`showInviteModal`):
- Add 'provider' option to the role dropdown: `<option value="provider">Provider / BCBA</option>`
- When a provider accepts, `child_access` is created with `access_level: 'clinical'`
- Provider sees the child in their Clients tab

---

## Sidebar Updates for Provider

Provider sidebar items:
- My Profile
- Child Insights (for active client)
- Progress Dashboard (for active client)
- Resources
- Care Team Notes

---

## Test Accounts

Create test accounts for all roles to enable end-to-end testing:

- **testparent@modernvillage.app** — parent role, has a test child, subscription active
- **testprovider@modernvillage.app** — provider role, verified, with NPI/license, connected to test child
- **testcaregiver@modernvillage.app** — caregiver role, connected to test child
- **testteacher@modernvillage.app** — teacher role, connected to test child

All passwords: role-specific (e.g. TestParent123!, TestProvider123!, etc.)

Test accounts created via Supabase Auth API + SQL inserts for profiles, children, child_access.

---

## Implementation Order

1. SQL migration — session_notes table + RLS + invite role update
2. Test accounts — create all 4 role test accounts + connections
3. Provider dashboard — Clients tab + client list rendering
4. Client detail overlay — sub-tabs, behavior logs, care notes integration
5. Session note form — structured fields + save
6. AI narrative generation — Claude integration for clinical notes
7. Superbill print view — formatted printable superbill
8. Billing status — status badges, dropdown update, client list summary
9. Parent session notes view — read-only shared notes
10. Provider invite + sidebar updates

---

## Out of Scope

- Auto-connect on marketplace booking (future marketplace enhancement)
- Automated insurance claim submission
- Treatment plan builder (future sub-project)
- Video session integration
- Provider scheduling/availability management (already partially exists in marketplace)
- Batch superbill export
