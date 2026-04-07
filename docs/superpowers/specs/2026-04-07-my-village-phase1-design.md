# My Village Phase 1 — Design Spec

**Date:** 2026-04-07
**Scope:** Phase 1 MVP of the local community layer
**Parent spec:** docs/MY-VILLAGE-SPEC.md

---

## Overview

Transform the existing Community tab into a hybrid experience with three sub-tabs: Feed (existing forum), Nearby (parent discovery), and Events (meetups/playdates). Parents opt in to share approximate location and a public profile, then discover other Modern Village families nearby and organize local events.

**Core constraint:** Low user count at launch. Every design decision optimizes for the empty-state experience — auto-expanding search radius, invite CTAs, and compelling prompts to be "the first."

---

## Architecture

All code lives in `app.html` following the existing vanilla HTML/CSS/JS patterns. Three new Supabase tables with Row Level Security. No external dependencies. Location via browser Geolocation API with manual zip code fallback.

### Files Modified
- **app.html** — new sub-tab UI in `#tComm`, village profile opt-in flow, nearby parents list, events list/create/detail, new JS functions, new CSS
- **SQL migration** — `supabase/migrations/20260407_my_village.sql` for tables + RLS policies

### Files NOT Modified
- worker.js — no new API endpoints needed for Phase 1
- admin.html — admin moderation of village content is Phase 2

---

## Data Model

### Table: `village_profiles`

One per user. Created when user opts in. Default state is no row (not opted in).

```sql
CREATE TABLE IF NOT EXISTS public.village_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  visibility text NOT NULL DEFAULT 'city',  -- 'hidden', 'city', 'neighborhood'
  display_name text NOT NULL,
  bio text,  -- max 200 chars, enforced client-side
  child_age_range text,  -- '0-2', '3-5', '6-9', '10-13', '14-17'
  child_diagnosis_category text,  -- 'Autism', 'ADHD', 'Both', 'Other', 'Prefer not to say'
  interests text[] DEFAULT '{}',
  city text,
  state text,
  zip text,
  lat float,
  lng float,
  last_active timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.village_profiles ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read non-hidden profiles
CREATE POLICY "Read visible village profiles"
  ON public.village_profiles FOR SELECT
  USING (auth.uid() IS NOT NULL AND visibility != 'hidden');

-- Users can also always read their own (even if hidden)
CREATE POLICY "Read own village profile"
  ON public.village_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own
CREATE POLICY "Create own village profile"
  ON public.village_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own
CREATE POLICY "Update own village profile"
  ON public.village_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own (opt out)
CREATE POLICY "Delete own village profile"
  ON public.village_profiles FOR DELETE
  USING (auth.uid() = user_id);
```

### Table: `village_events`

```sql
CREATE TABLE IF NOT EXISTS public.village_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,  -- max 1000 chars, enforced client-side
  event_type text NOT NULL DEFAULT 'playdate',  -- 'playdate','support_group','workshop','social_outing','advocacy','custom'
  event_date date NOT NULL,
  start_time time NOT NULL,
  end_time time,
  location_name text NOT NULL,  -- "Ganesha Park" or "TBD"
  location_address text,  -- hidden until RSVP approved
  location_city text NOT NULL,
  location_lat float,
  location_lng float,
  max_attendees integer,
  age_range text,  -- '3-8', 'all ages', etc.
  child_friendly boolean DEFAULT true,
  requires_approval boolean DEFAULT false,
  status text DEFAULT 'active',  -- 'active', 'cancelled', 'completed'
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.village_events ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read active events
CREATE POLICY "Read active events"
  ON public.village_events FOR SELECT
  USING (auth.uid() IS NOT NULL AND status = 'active');

-- Creators can read their own regardless of status
CREATE POLICY "Read own events"
  ON public.village_events FOR SELECT
  USING (auth.uid() = creator_id);

-- Authenticated users can create events
CREATE POLICY "Create events"
  ON public.village_events FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

-- Creators can update their own
CREATE POLICY "Update own events"
  ON public.village_events FOR UPDATE
  USING (auth.uid() = creator_id);

-- Creators can delete their own
CREATE POLICY "Delete own events"
  ON public.village_events FOR DELETE
  USING (auth.uid() = creator_id);
```

### Table: `village_rsvps`

```sql
CREATE TABLE IF NOT EXISTS public.village_rsvps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid REFERENCES public.village_events(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status text DEFAULT 'approved',  -- 'pending', 'approved', 'declined', 'cancelled'
  rsvp_at timestamptz DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE public.village_rsvps ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read RSVPs (needed to show attendee counts)
CREATE POLICY "Read RSVPs"
  ON public.village_rsvps FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can RSVP to events
CREATE POLICY "Create own RSVP"
  ON public.village_rsvps FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update own RSVP (cancel)
CREATE POLICY "Update own RSVP"
  ON public.village_rsvps FOR UPDATE
  USING (auth.uid() = user_id);

-- Event creators can update RSVPs on their events (approve/decline)
CREATE POLICY "Creator manages RSVPs"
  ON public.village_rsvps FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.village_events
      WHERE id = village_rsvps.event_id
      AND creator_id = auth.uid()
    )
  );
```

### Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_village_profiles_user ON public.village_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_village_profiles_visibility ON public.village_profiles(visibility);
CREATE INDEX IF NOT EXISTS idx_village_events_date ON public.village_events(event_date);
CREATE INDEX IF NOT EXISTS idx_village_events_status ON public.village_events(status);
CREATE INDEX IF NOT EXISTS idx_village_events_creator ON public.village_events(creator_id);
CREATE INDEX IF NOT EXISTS idx_village_rsvps_event ON public.village_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_village_rsvps_user ON public.village_rsvps(user_id);
```

---

## UI Design

### Community Tab Restructure

The `#tComm` div gets restructured with underline sub-tabs below the "Your Village" header.

**Sub-tab bar:** Full-width, underline indicator style. Three tabs: Feed, Nearby, Events. Active tab has sage-colored text + bottom border. Inactive tabs are warm-gray.

**Default tab:** Feed (preserves current behavior — existing forum loads first).

**Tab content areas:**
- `#villFeed` — existing community posts (compose bar, topic pills, post list — moved here)
- `#villNearby` — parent discovery or opt-in flow
- `#villEvents` — event list or opt-in prompt

**CSS for sub-tabs:**
```css
.vill-tabs{display:flex;border-bottom:2px solid var(--sand);margin-bottom:16px}
.vill-tab{padding:10px 20px;font-size:13px;font-weight:600;color:var(--warm-gray);cursor:pointer;border-bottom:2.5px solid transparent;margin-bottom:-2px;transition:all 0.15s}
.vill-tab.active{color:var(--sage-dark);font-weight:700;border-bottom-color:var(--sage)}
```

### Feed Sub-Tab

Existing community content moves inside `#villFeed`. No changes to renderCommunityPosts(), submitPost(), compose form, topic pills, etc. They just render inside the Feed container instead of directly in `#tComm`.

### Nearby Sub-Tab

#### State 1: Not Opted In (no village_profile row)

Full-screen opt-in card:

```
┌─────────────────────────────────┐
│         🏘️ (large icon)         │
│                                 │
│   Find Families Near You        │
│                                 │
│   Connect with other Modern     │
│   Village parents in your area  │
│                                 │
│   ┌─ Visibility ─────────────┐  │
│   │ ○ City ("Sarah in LA")   │  │
│   │ ○ Neighborhood (1.2 mi)  │  │
│   └──────────────────────────┘  │
│                                 │
│   Display Name: [___________]   │
│   Short Bio:    [___________]   │
│   Child Age:    [dropdown   ]   │
│   Diagnosis:    [dropdown   ]   │
│   Interests:    [chip chips ]   │
│                                 │
│   📍 Use My Location            │
│   — or —                        │
│   Zip Code: [_____]             │
│                                 │
│   ⚠️ HIPAA disclaimer text      │
│                                 │
│   [ Join My Village ]           │
└─────────────────────────────────┘
```

**Location flow:**
1. "Use My Location" button calls `navigator.geolocation.getCurrentPosition()`
2. On success: approximate coordinates (round to 2 decimal places ~1.1km), reverse-geocode to city/state using coordinates (simple lookup or zip-to-city table)
3. On denial/error: show zip code input. Use a small embedded US zip-to-lat/lng lookup (top 1000 zips cover 80%+ of users, fallback to a free API for the rest)
4. Display resolved city/state for confirmation before saving

**Interests chips (multi-select):**
Sensory Play, Outdoor Activities, ABA Strategies, IEP Advocacy, Social Skills, Routine Building, Sibling Support, Teen Parenting

**HIPAA disclaimer (shown on opt-in form):**
> "Information you share in My Village — including your name, city, and child's age range — is visible to other members. This is not protected health information (PHI). Do not share specific medical details."

#### State 2: Opted In, Viewing Nearby Parents

```
┌─────────────────────────────────┐
│ 🏘️ Invite parents to grow your  │
│ local village → [Share Link]    │  ← invite CTA (always visible if < 10 results)
├─────────────────────────────────┤
│ Filter: [Age ▾] [Dx ▾] [25mi▾] │  ← simple dropdowns
├─────────────────────────────────┤
│ ┌─ Parent Card ───────────────┐ │
│ │ [S] Sarah M.        1.2 mi │ │
│ │     Pomona, CA              │ │
│ │     ┌─────┐ ┌──────┐       │ │
│ │     │ 3-5 │ │Autism│       │ │
│ │     └─────┘ └──────┘       │ │
│ │ "Looking for playdate       │ │
│ │  friends who get it"        │ │
│ └─────────────────────────────┘ │
│ ┌─ Parent Card ───────────────┐ │
│ │ [M] Maria L.        3.8 mi │ │
│ │     Claremont, CA           │ │
│ │     ┌─────┐ ┌────┐         │ │
│ │     │ 6-9 │ │ADHD│         │ │
│ │     └─────┘ └────┘         │ │
│ │ "ADHD mom, love hiking..."  │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

**Distance auto-expansion logic:**
1. Query all non-hidden village_profiles (excluding self)
2. Calculate distance client-side using Haversine formula
3. Start at 10mi. If < 3 results, expand to 25. If still < 3, expand to 50. If still < 3, expand to 100.
4. Sort by distance ascending
5. If 0 results at 100mi: show invite CTA + "You're the first Modern Village parent in [State]!"

**Parent card tap → profile overlay:**
Full profile view with all fields, interests tags, member-since date. "Say Hi" button disabled with tooltip "Messaging coming soon" (Phase 2). Back button to return to list.

#### Settings

"Edit My Village Profile" link at bottom of Nearby tab (when opted in). Opens the same form as opt-in but pre-filled. Includes a "Leave My Village" danger button that deletes the village_profile row.

### Events Sub-Tab

#### State: Viewing Events

```
┌─────────────────────────────────┐
│ [ + Create Event ]              │
├─────────────────────────────────┤
│ ┌─ Event Card ────────────────┐ │
│ │ 🎪 Playdate                 │ │  ← type badge
│ │ Saturday Sensory Playdate   │ │  ← title
│ │ Sat Apr 12 · 10:00 AM      │ │  ← date/time
│ │ Ganesha Park · Pomona       │ │  ← location name + city
│ │ Hosted by Sarah M.          │ │  ← creator name
│ │ 4/10 spots · 2.1 mi away   │ │  ← attendees + distance
│ │         [ RSVP ]            │ │
│ └─────────────────────────────┘ │
│ ┌─ Event Card ────────────────┐ │
│ │ 💬 Support Group             │ │
│ │ Dads of ND Kids — Coffee    │ │
│ │ Thu Apr 17 · 7:00 PM        │ │
│ │ Starbucks · Claremont       │ │
│ │ Hosted by David R.          │ │
│ │ 6/12 spots · 5.0 mi away   │ │
│ │         [ RSVP ]            │ │
│ └─────────────────────────────┘ │
│                                 │
│ (empty state if no events:)     │
│ 📅 No events near you yet       │
│ Be the first to organize a      │
│ playdate! [ Create Event ]      │
└─────────────────────────────────┘
```

**Event type badges/emojis:**
- playdate: 🎪
- support_group: 💬
- workshop: 📚
- social_outing: 🎳
- advocacy: ✊
- custom: 📌

**Events require village_profile:** If user hasn't opted in, show the same opt-in flow as Nearby. Can't create or RSVP without a village profile.

**Event list query:**
1. Fetch all active events with event_date >= today
2. Calculate distance client-side (if user has location)
3. Sort by date ascending
4. Show distance if user has location, otherwise just show city

#### Create Event Form (overlay)

```
┌─────────────────────────────────┐
│ ← Back         Create Event     │
├─────────────────────────────────┤
│ Type: [Playdate          ▾]     │
│ Title: [____________________]   │
│ Description:                    │
│ [____________________________]  │
│ [____________________________]  │
│                                 │
│ Date: [Apr 12, 2026      📅]   │
│ Start: [10:00 AM          ▾]   │
│ End:   [12:00 PM          ▾]   │
│                                 │
│ Location Name: [____________]   │
│ City: [_____________________]   │
│ Address (optional):             │
│ [____________________________]  │
│ ℹ️ Address only shared with     │
│   approved attendees            │
│                                 │
│ Max Attendees: [10        ▾]   │
│ Age Range: [All Ages      ▾]   │
│ ☐ Child-friendly                │
│ ☐ Require RSVP approval        │
│                                 │
│ [ Create Event ]                │
└─────────────────────────────────┘
```

#### Event Detail (overlay, tap from card)

Shows: full description, date/time, location (city only if not RSVP'd, full address if approved), host profile link, attendee list (first names + avatars), RSVP button.

**If user is the host:** Edit button, Cancel Event button, and if requires_approval is true: list of pending RSVPs with Approve/Decline buttons.

**RSVP logic:**
- If `requires_approval = false`: RSVP inserts with `status: 'approved'`, user immediately sees full address
- If `requires_approval = true`: RSVP inserts with `status: 'pending'`, user sees "Waiting for host approval." Host gets the pending RSVP in their event detail.

---

## Location Handling

### Geolocation

```javascript
function approximateLocation(lat, lng) {
  return {
    lat: Math.round(lat * 100) / 100,
    lng: Math.round(lng * 100) / 100
  };
}

function getDistance(lat1, lng1, lat2, lng2) {
  var R = 3959;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLng/2) * Math.sin(dLng/2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
```

### Zip Code Fallback

Embed a small lookup object for the top ~1000 US zip codes (covers majority of users). Format: `{zip: {lat, lng, city, state}}`. For zips not in the lookup, use the free zippopotam.us API: `https://api.zippopotam.us/us/{zip}` — returns lat/lng/city/state, no API key needed, CORS-enabled.

---

## Privacy & Safety

1. **Default:** No village_profile row = not discoverable. Must explicitly opt in.
2. **Location precision:** `Math.round(lat * 100) / 100` = ~1.1km / ~0.7mi precision. Never exact.
3. **No child names** in village profiles. Only parent's display name.
4. **Diagnosis is category only:** "Autism" / "ADHD" / "Both" / "Other" / "Prefer not to say"
5. **Age is range only:** "0-2" / "3-5" / "6-9" / "10-13" / "14-17"
6. **Event address hidden** until RSVP is approved by host (or auto-approved if no approval required).
7. **HIPAA disclaimer** shown during opt-in. Non-clinical data, voluntarily shared.
8. **Opt-out:** "Leave My Village" deletes village_profile row. Profile disappears from all lists immediately.

---

## What's NOT in Phase 1

- Map view (Mapbox/Google Maps) — Phase 2
- Local resource directory + reviews — Phase 2
- In-app messaging + connections — Phase 2
- Event comments thread — Phase 2
- Recurring events — add when users manually recreate weekly
- Visibility radius selector on events — default 25mi for all
- Admin moderation panel for village content — Phase 2
- Push notifications for events — requires native app (Capacitor)

---

## New JS Functions (app.html)

### Village Tab Management
- `switchVillTab(tab)` — switches between 'feed', 'nearby', 'events' sub-tabs
- `loadVillageTab()` — called when Community main tab activates, loads active sub-tab

### Village Profiles
- `loadVillageProfile()` — fetch current user's village_profile (or null)
- `showVillageOptIn()` — render the opt-in form
- `submitVillageProfile()` — validate + insert/update village_profile
- `getVillageLocation()` — browser geolocation with approximate rounding
- `lookupZip(zip)` — zip code to lat/lng/city/state
- `loadNearbyParents()` — fetch profiles, calculate distances, auto-expand radius, render list
- `renderParentCard(profile, distance)` — single parent card HTML
- `openParentProfile(profileId)` — full profile overlay
- `editVillageProfile()` — open opt-in form pre-filled for editing
- `leaveVillage()` — confirm + delete village_profile

### Events
- `loadVillageEvents()` — fetch active events, calculate distances, render list
- `renderEventCard(event, rsvpStatus, distance)` — single event card HTML
- `openCreateEvent()` — event creation form overlay
- `submitEvent()` — validate + insert event
- `openEventDetail(eventId)` — full event detail overlay
- `rsvpEvent(eventId)` — insert RSVP (pending or approved based on requires_approval)
- `cancelRsvp(eventId)` — update RSVP status to cancelled
- `approveRsvp(rsvpId)` — host approves a pending RSVP
- `declineRsvp(rsvpId)` — host declines a pending RSVP
- `cancelEvent(eventId)` — host cancels event (sets status to cancelled)
- `editEvent(eventId)` — host edits event details

### Utilities
- `approximateLocation(lat, lng)` — round coordinates
- `getDistance(lat1, lng1, lat2, lng2)` — Haversine formula
- `formatEventDate(date, startTime)` — "Sat Apr 12 · 10:00 AM"
- `getEventTypeEmoji(type)` — type to emoji mapping

---

## Migration File

Single file: `supabase/migrations/20260407_my_village.sql`

Contains all three CREATE TABLE statements, RLS policies, and indexes listed above.
