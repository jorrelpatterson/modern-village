# Role System + Multi-User Access — Design Spec

**Date:** 2026-04-06
**Scope:** Sub-project 1 of Phase 3 — Role system foundation
**Files affected:** `app.html`, `admin.html`, `worker.js`, new SQL migration
**Depends on:** Existing auth, profiles, children tables

---

## Overview

Add role-based access to Modern Village so parents, BCBAs/providers, caregivers, and teachers can collaborate around a child's behavioral data. This is the foundation layer — role-specific feature dashboards come in sub-projects 2-5.

**Roles:**
- **Parent** ($19.99/mo) — Full access, data owner, can invite others
- **Provider/BCBA** (free platform, 20-25% session fee) — Clinical data access for assigned clients. Signs up directly, verified by admin.
- **Caregiver** (free, invited) — Day-to-day data access for connected children. Invited by parent.
- **Teacher** (district contract, $3-8/student) — School-relevant read-only summaries. Invited by parent or district admin.

**Design principles:**
- Parent invite = HIPAA authorization (parent is authorized representative of minor)
- Minimum necessary access per role
- Audit trail for all access grants/revocations
- Data model supports future medical billing (NPI, CPT codes, license info on provider profiles)
- Single `app.html` serves all roles — role determines which UI elements render

---

## Data Model

### Modified table: `profiles`

New columns:

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| role | text | 'parent' | 'parent', 'provider', 'caregiver', 'teacher' |
| npi_number | text | null | Providers only — National Provider Identifier |
| license_type | text | null | e.g. "BCBA", "LPC", "LMFT", "BCaBA" |
| license_state | text | null | e.g. "CA", "TX" |
| license_number | text | null | State license number |
| cpt_codes | text[] | null | e.g. ["97151","97153","97155"] |
| provider_verified | boolean | false | Admin (Ariana) flips to true after review |

### New table: `child_access`

Tracks who can see which child's data and why.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| child_id | uuid FK → children | Which child |
| user_id | uuid FK → profiles | Who has access |
| role | text | Role at time of grant |
| access_level | text | 'full', 'clinical', 'daily', 'school', 'self' |
| granted_by | uuid FK → profiles | Parent who granted (self for parents) |
| granted_at | timestamptz | default now() |
| revoked_at | timestamptz | Null = active. Set = revoked. |

**Access levels:**
- `full` — Parent. All data, all actions.
- `clinical` — BCBA/Provider. Behavior logs, strategies, session data, treatment plans. No AI conversations, daily check-ins, community.
- `daily` — Caregiver. Behavior logs (read + write), routines, strategies, current goals. No billing, IEP, AI conversations.
- `school` — Teacher. Behavior summaries (aggregated, not raw logs), IEP goals + accommodations, school-tagged routines. Read-only + send notes.
- `self` — Child/Teen (Phase 4). Coping strategies, mood check-ins, simplified routine view.

**Auto-insert:** When a parent creates a child, a `child_access` row is auto-created: `access_level: 'full'`, `granted_by: self`.

**RLS policies:**
```sql
ALTER TABLE public.child_access ENABLE ROW LEVEL SECURITY;

-- Users can see their own access entries
CREATE POLICY "Users view own access"
  ON public.child_access FOR SELECT
  USING (auth.uid() = user_id);

-- Parents can see all access for their children
CREATE POLICY "Parents view child access"
  ON public.child_access FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.child_access ca
      WHERE ca.child_id = child_access.child_id
      AND ca.user_id = auth.uid()
      AND ca.access_level = 'full'
      AND ca.revoked_at IS NULL
    )
  );

-- Parents can grant access (insert)
CREATE POLICY "Parents grant access"
  ON public.child_access FOR INSERT
  WITH CHECK (auth.uid() = granted_by);

-- Parents can revoke access (update revoked_at)
CREATE POLICY "Parents revoke access"
  ON public.child_access FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.child_access ca
      WHERE ca.child_id = child_access.child_id
      AND ca.user_id = auth.uid()
      AND ca.access_level = 'full'
      AND ca.revoked_at IS NULL
    )
  );
```

### New table: `invites`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| invited_by | uuid FK → profiles | Parent who sent |
| email | text | Recipient email (lowercase, trimmed) |
| role | text | 'caregiver' or 'teacher' |
| child_id | uuid FK → children | Which child |
| token | text UNIQUE | Random invite token for the URL |
| status | text | 'pending', 'accepted', 'expired', 'revoked' |
| created_at | timestamptz | default now() |
| expires_at | timestamptz | default now() + interval '7 days' |
| accepted_at | timestamptz | null until accepted |
| accepted_by | uuid FK → profiles | User who accepted |

**RLS policies:**
```sql
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- Parents can see invites they sent
CREATE POLICY "Users view own invites"
  ON public.invites FOR SELECT
  USING (auth.uid() = invited_by);

-- Parents can create invites
CREATE POLICY "Users create invites"
  ON public.invites FOR INSERT
  WITH CHECK (auth.uid() = invited_by);

-- Parents can revoke their invites
CREATE POLICY "Users update own invites"
  ON public.invites FOR UPDATE
  USING (auth.uid() = invited_by);
```

### Modified RLS on existing tables

All child-specific tables need an additional SELECT policy for connected users. Pattern:

```sql
-- Example for behavior_logs
CREATE POLICY "Connected users view child logs"
  ON public.behavior_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.child_access ca
      JOIN public.children ch ON ch.id = ca.child_id
      WHERE ch.user_id = behavior_logs.user_id
      AND ca.user_id = auth.uid()
      AND ca.revoked_at IS NULL
    )
  );
```

Tables that need this additional SELECT policy:
- `behavior_logs`
- `saved_strategies`
- `conversations` (clinical and full access only)
- `routines`
- `daily_checkins` (full access only — not shared with clinical/daily/school)
- `bookings` (full and clinical only)

Caregivers get INSERT on `behavior_logs`:
```sql
CREATE POLICY "Caregivers log behaviors"
  ON public.behavior_logs FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.child_access ca
      JOIN public.children ch ON ch.id = ca.child_id
      WHERE ch.user_id = behavior_logs.user_id
      AND ca.user_id = auth.uid()
      AND ca.access_level IN ('full', 'daily')
      AND ca.revoked_at IS NULL
    )
  );
```

---

## Auth + Signup Flows

### Parent signup

No changes. Current flow stays exactly as-is. Profile created with `role: 'parent'`.

### Provider/BCBA signup

1. Auth modal gets a "I'm a Provider" link below the main signup form
2. Clicking it reveals additional fields:
   - Full name (required)
   - NPI number (required, 10 digits)
   - License type — dropdown: BCBA, BCaBA, LPC, LMFT, Psychologist, Other
   - License state — dropdown of US states
   - License number (required)
   - CPT codes — multi-select chips: 97151, 97152, 97153, 97154, 97155, 97156, 97157, 97158
3. Account created with `role: 'provider'`, `provider_verified: false`
4. Provider lands on a "Pending Verification" state:
   - Shows: "Your account is being reviewed. You'll get an email when approved."
   - Can see their profile but cannot access client data or marketplace
5. Admin (Ariana) reviews in admin dashboard, clicks Approve
6. System sets `provider_verified: true`, sends approval email via Resend

### Caregiver/Teacher invite flow

1. Parent goes to Settings → child card → "Invite to Care Team" button
2. Modal: enter email, select role (Caregiver or Teacher)
3. System:
   - Creates `invites` row with random 32-char hex token
   - Sends email via Resend worker endpoint:
     - Subject: "You've been invited to [Child]'s care team on Modern Village"
     - Body: "[Parent name] has invited you to join [Child]'s care team as a [role]. Click here to create your account."
     - Link: `https://modernvillage.app/app.html?invite=[token]`
4. Recipient clicks link → app detects `?invite=` param
5. If not logged in: shows signup form with role pre-filled (greyed out), email pre-filled
6. If already logged in (same email): auto-accepts invite, creates `child_access` row, shows toast "You're now connected to [Child]'s care team!"
7. If logged in with different email: shows error "This invite was sent to [email]. Please sign in with that email."
8. On account creation:
   - Profile created with `role` from invite
   - `child_access` row created with appropriate `access_level` (daily for caregiver, school for teacher)
   - Invite status updated to `accepted`
   - Parent gets notification (toast next login or email)

### Invite management

Parent Settings → each child card → "Care Team" section:
- Lists connected users: avatar initial, name, role badge, granted date
- "Revoke" button → sets `revoked_at` on `child_access`, sets invite `status: 'revoked'`
- "Resend" button on pending invites
- "Invite" button to add more

---

## Role-Based UI Routing

All roles use `app.html`. After login, `S.profile.role` determines the UI:

### Tab bar per role

| Tab | Parent | Provider | Caregiver | Teacher |
|-----|--------|----------|-----------|---------|
| Coach (AI) | ✓ | — | — | — |
| Track (behavior logs) | ✓ | ✓ (read) | ✓ (read+write) | — |
| Community | ✓ | — | — | — |
| Pros (marketplace) | ✓ | — | — | — |
| Clients | — | ✓ | — | — |
| Summary | — | — | — | ✓ |

### Sidebar items per role

| Item | Parent | Provider | Caregiver | Teacher |
|------|--------|----------|-----------|---------|
| Routine Builder | ✓ | — | ✓ (view) | ✓ (school routines) |
| IEP Toolkit | ✓ | — | — | ✓ (view) |
| Progress Dashboard | ✓ | ✓ | — | — |
| Resources | ✓ | ✓ | ✓ | ✓ |
| Settings/Profile | ✓ | ✓ | ✓ | ✓ |
| Child Insights | ✓ | ✓ | — | — |

### Implementation

After `loadProfile()`, a new function `applyRole()` reads `S.profile.role` and:
1. Shows/hides bottom nav tabs
2. Shows/hides sidebar menu items
3. Sets `S.role` for use in conditional rendering throughout the app
4. If provider and not verified: shows pending verification overlay, blocks all other UI

```javascript
function applyRole(){
  S.role = S.profile.role || 'parent';
  var tabs = {
    parent: ['tCoach','tTrack','tComm','tPros'],
    provider: ['tTrack','tClients'],
    caregiver: ['tTrack'],
    teacher: ['tSummary']
  };
  // Hide all tabs, show only role-appropriate ones
  document.querySelectorAll('.tab-btn').forEach(function(t){t.style.display='none'});
  (tabs[S.role]||[]).forEach(function(id){
    var t=document.getElementById(id);
    if(t)t.style.display='';
  });
  // Show/hide sidebar items based on role
  // ... similar pattern
}
```

---

## Admin Dashboard Changes (`admin.html`)

### New section: Verify Providers

- List of users where `role='provider'` AND `provider_verified=false`
- Shows: name, email, NPI, license type, license state, license number, signup date
- Buttons: "Approve" (sets `provider_verified: true`, sends email) | "Reject" (sends rejection email, optionally deletes account)
- Approved providers move to main user list with "Provider ✓" badge

### Enhanced User Management

- Role column in user table
- Filter dropdown: All / Parents / Providers / Caregivers / Teachers
- Click user → expanded view shows:
  - Their profile details
  - Which children they're connected to (via `child_access`)
  - Who invited them (if applicable)

### New section: Invite Monitor

- View all invites platform-wide
- Filter by status: Pending / Accepted / Expired / Revoked
- Shows: inviter name, recipient email, role, child name, date, status
- For compliance visibility

---

## Worker Changes (`worker.js`)

### New endpoint: POST `/invite`

Handles sending invite emails:
- Auth: JWT required (must be a parent)
- Validates: email format, role is 'caregiver' or 'teacher', child belongs to user
- Creates invite row in Supabase (via service key)
- Sends email via Resend with invite link
- Rate limit: 5/min per user

### New endpoint: POST `/accept-invite`

Handles invite acceptance:
- Auth: JWT required
- Validates: token exists, not expired, not revoked, email matches
- Creates `child_access` row
- Updates invite status to 'accepted'
- Returns child info for UI

### New endpoint: POST `/verify-provider`

Admin-only endpoint:
- Auth: JWT required + admin PIN verification
- Sets `provider_verified: true` on target profile
- Sends approval email via Resend

---

## Audit Logging

All access-related actions are logged:
- Invite sent (who, to whom, for which child, what role)
- Invite accepted (who, when)
- Invite revoked (who, when)
- Access revoked (who, by whom, when)
- Provider verified/rejected (by admin, when)

Uses existing Supabase audit pattern. The `child_access` table's `granted_at` and `revoked_at` fields serve as the primary audit trail. For additional detail, a Postgres trigger on `child_access` and `invites` logs changes to an `audit_log` table.

---

## Migration Safety

All changes are additive:
- New columns on `profiles` have defaults or are nullable
- New tables don't affect existing tables
- New RLS policies are additional SELECT policies (don't replace existing ones)
- Existing parent users continue working with zero changes — `role` defaults to `'parent'`
- The `applyRole()` function defaults to parent behavior if role is missing

---

## Implementation Order

1. SQL migration — new columns, tables, RLS policies
2. Auth modal — provider signup fields + "I'm a Provider" flow
3. Role-based UI routing — `applyRole()` function, tab/sidebar visibility
4. Invite flow — parent sends invite, email via worker, recipient accepts
5. Parent access management — care team view in settings, revoke access
6. Admin dashboard — verify providers, user role filtering, invite monitor
7. Auto-insert `child_access` for parents — trigger on children table

---

## Out of Scope (Sub-projects 2-5)

- Caregiver network features (shared logging, messaging between team members)
- Provider dashboard (client list, session notes, treatment plans, superbill generation)
- Teacher view (behavior summaries, IEP goal tracking, school-home notes)
- Crisis mode (de-escalation, 988 integration, emergency booking)
- Child/Teen login (Phase 4)
- Medical billing engine (Phase 5)
- District admin bulk onboarding
- Role switcher for multi-role users
