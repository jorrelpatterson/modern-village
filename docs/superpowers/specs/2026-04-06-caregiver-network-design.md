# Caregiver Network — Design Spec

**Date:** 2026-04-06
**Scope:** Sub-project 2 of Phase 3 — Caregiver features on top of role system
**Depends on:** Sub-project 1 (Role system — child_access, invite flow, role-based routing)
**Files affected:** `app.html`, new SQL migration

---

## Overview

Add caregiver-specific features so that grandparents, aides, co-parents, and other caregivers can actively participate in a child's care. Caregivers can log behaviors, follow routines, view saved strategies, and communicate with the care team via a notes system.

**What caregivers can do:**
- Log behaviors (same form as parent, attributed to caregiver)
- View and follow routines (read-only)
- View saved strategies (read-only)
- Write and read care team notes with threaded comments
- View resources

**What caregivers cannot do:**
- Use AI Coach
- Access Community, Pros/marketplace, IEP Toolkit
- Access Progress Dashboard or Child Insights
- Manage billing, subscriptions, or invites
- Create/edit/delete routines

---

## Data Model

### New table: `care_notes`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| child_id | uuid FK → children | Which child |
| author_id | uuid FK → profiles | Who wrote it |
| author_name | text | Cached display name |
| author_role | text | 'parent', 'caregiver', 'teacher', 'provider' |
| content | text NOT NULL | The note text |
| created_at | timestamptz | default now() |

### New table: `care_note_comments`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| note_id | uuid FK → care_notes | Which note |
| author_id | uuid FK → profiles | Who commented |
| author_name | text | Cached display name |
| author_role | text | |
| content | text NOT NULL | |
| created_at | timestamptz | default now() |

### RLS policies for care_notes

```sql
ALTER TABLE public.care_notes ENABLE ROW LEVEL SECURITY;

-- Anyone with active child_access can read notes
CREATE POLICY "Connected users view notes"
  ON public.care_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.child_access ca
      WHERE ca.child_id = care_notes.child_id
      AND ca.user_id = auth.uid()
      AND ca.revoked_at IS NULL
    )
  );

-- Anyone with active child_access can write notes
CREATE POLICY "Connected users create notes"
  ON public.care_notes FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.child_access ca
      WHERE ca.child_id = care_notes.child_id
      AND ca.user_id = auth.uid()
      AND ca.revoked_at IS NULL
    )
  );
```

### RLS policies for care_note_comments

```sql
ALTER TABLE public.care_note_comments ENABLE ROW LEVEL SECURITY;

-- Anyone who can see the note can see comments
CREATE POLICY "Connected users view note comments"
  ON public.care_note_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.care_notes cn
      JOIN public.child_access ca ON ca.child_id = cn.child_id
      WHERE cn.id = care_note_comments.note_id
      AND ca.user_id = auth.uid()
      AND ca.revoked_at IS NULL
    )
  );

-- Anyone who can see the note can comment
CREATE POLICY "Connected users create note comments"
  ON public.care_note_comments FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.care_notes cn
      JOIN public.child_access ca ON ca.child_id = cn.child_id
      WHERE cn.id = care_note_comments.note_id
      AND ca.user_id = auth.uid()
      AND ca.revoked_at IS NULL
    )
  );
```

### Modified table: `behavior_logs`

Add columns:
- `logged_by` uuid — defaults to null (means parent logged it). When a caregiver logs, set to their user ID.
- `logged_by_name` text — cached display name of the logger.

---

## Care Team Notes UI

### New overlay page: "Care Team Notes"

Accessible from sidebar for roles: parent, caregiver, provider, teacher.

**Layout:**
- Header: "Care Team Notes" with back button
- Child name shown at top (uses active child)
- "Write a Note" button/area at top — textarea + submit
- Timeline of notes below, newest first
- Each note card shows:
  - Author avatar initial (colored circle)
  - Author name + role badge (Caregiver in lavender, Teacher in sky, Provider in sage, Parent in sand)
  - Timestamp (relative: "2h ago", "Yesterday", or date)
  - Note content
  - "Reply" link — toggles comment thread
  - Comment count
- Comment thread under each note:
  - Same format as notes (avatar, name, role, time, text)
  - Reply input at bottom of thread

### Functions

- `openCareNotes()` — opens the overlay, loads notes for active child
- `loadCareNotes()` — queries `care_notes` for active child, renders timeline
- `postCareNote()` — inserts note with author info from `S.profile`
- `loadNoteComments(noteId)` — queries `care_note_comments` for a note
- `postNoteComment(noteId)` — inserts comment
- `renderNoteTime(date)` — relative timestamp formatting

---

## Behavior Log Attribution

### Modified behavior tracker

When a caregiver logs a behavior, `logBehavior()` checks `S.role`:
- If `S.role !== 'parent'`: sets `logged_by: S.user.id` and `logged_by_name: S.name || S.user.email`
- If `S.role === 'parent'`: leaves `logged_by` and `logged_by_name` as null (default)

### Modified behavior log display

In `loadLogs()` render, if a log has `logged_by_name`, show a subtle badge:
```
"Logged by [name]" in a small pill below the log entry
```
Uses the same color coding as care team notes (lavender for caregiver, etc).

---

## Read-Only Views

### Routines — read-only mode for caregivers

When `S.role === 'caregiver'`:
- `openRoutines()` loads saved routines for the connected child but:
  - Hides "Save Routine" button
  - Hides "AI Suggest" button
  - Hides template row
  - Hides "Add a step" button
  - Hides step delete buttons
  - Hides step form
  - Shows only the saved routines list + preview/print
- Caregiver can tap a saved routine to view it and print it, but cannot modify

Implementation: `openRoutines()` checks `S.role` and adds/removes a `.routine-readonly` class that hides edit controls via CSS:

```css
.routine-readonly .routine-templates,
.routine-readonly #routineEditor,
.routine-readonly #stepForm,
.routine-readonly #aiRoutineForm,
.routine-readonly .routine-step-del,
.routine-readonly [onclick*="saveRoutine"],
.routine-readonly [onclick*="showPreview"] { display: none !important; }
```

The preview button stays visible — caregivers should be able to view and print.

Actually, simpler: just show the saved routines list and let them tap to view/print. Hide the entire editor section.

### Saved Strategies — read-only for caregivers

The existing `openStrategies()` function loads saved strategies. For caregivers:
- Strategies are loaded via the connected child's parent's user_id (through `child_access`)
- Hide "Delete" buttons on strategy cards
- Hide "Save" buttons in chat (they don't have chat)

Implementation: `openStrategies()` checks `S.role`. If caregiver, queries strategies through `child_access` join rather than `S.user.id`, and hides delete buttons.

---

## Sidebar Updates

Update `renderSb()` role arrays:

| Item | Add roles |
|------|-----------|
| Care Team Notes | parent, caregiver, provider, teacher |
| Saved Strategies | caregiver (read-only) |
| Routine Builder | already has caregiver |

The `openCareNotes()` function replaces the placeholder `openCareTeam()` from sub-project 1 for the "Care Team" sidebar item. For parents, the sidebar label stays "Care Team" but now opens the notes page (care team member management stays in Profile).

Actually, rename the sidebar item to "Care Team Notes" for clarity, and keep the member management in the Profile page where it already lives.

---

## Implementation Order

1. SQL migration — care_notes, care_note_comments, behavior_logs columns, RLS
2. Care Team Notes UI — overlay page, note CRUD, comment threads
3. Behavior log attribution — modified logBehavior + display
4. Routine Builder read-only mode for caregivers
5. Saved Strategies access for caregivers
6. Sidebar updates

---

## Out of Scope

- Real-time chat / messaging
- Push notifications for new notes
- Photo/video attachments on notes
- Note editing/deleting after posting
- Caregiver-specific onboarding flow
- Provider or teacher-specific features (sub-projects 3-4)
