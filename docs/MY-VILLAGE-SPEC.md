# MY VILLAGE — Feature Spec

## Overview

"My Village" is the local community layer of Modern Village. It turns the app from a solo parenting tool into a real-world support network. Parents discover other Modern Village families nearby, organize meetups, find autism/ADHD-friendly local resources, and build the in-person relationships that make the app impossible to leave.

**Core principle:** The AI Coach helps you alone. The forum helps you online. My Village helps you in real life.

---

## Why This Matters

**Retention:** Real friendships formed through the app are the strongest retention mechanism that exists. Nobody cancels the app where they found their closest friends and their Saturday playdate group.

**Flywheel:** Parents who meet in person recruit other parents. One parent tells another at a park playdate — organic growth with zero marketing cost.

**Differentiation:** No competitor has this. Frontera serves clinicians. Headspace is solo. ABA apps are clinical tools. Modern Village is the only platform where neurodivergent families find each other.

---

## Feature Components

### 1. Nearby Parents Discovery

Parents opt in to be discoverable by other Modern Village parents nearby.

**Privacy model (critical — get this right):**
- Default: HIDDEN (not discoverable)
- Opt-in Level 1: City only ("Sarah in Pomona")
- Opt-in Level 2: Neighborhood ("Sarah in Downtown Pomona, 1.2 miles away")
- Never show exact address
- Parents choose what profile info is visible: first name, child's age range (not exact age), diagnosis category (not specifics), interests

**Discovery UI:**
- Map view showing other parents as pins (at city/neighborhood level, not exact)
- List view sorted by distance
- Filter by: child age range, diagnosis, distance, interests
- Each card shows: first name, city, child age range ("mom of a 5yr old with autism"), a short bio they write, member since date
- Tap to view profile → "Say Hi" button (sends an in-app message)

**Database: `village_profiles` table**
```
id (uuid, PK)
user_id (uuid, FK → profiles)
visibility (enum: hidden / city / neighborhood)
display_name (text) — first name or nickname
bio (text, max 200 chars)
child_age_range (text) — "3-5" or "6-9" etc
child_diagnosis_category (text) — "Autism" / "ADHD" / "Both" / "Other" / "Prefer not to say"
interests (text[]) — ["sensory play", "outdoor activities", "ABA strategies", "IEP advocacy"]
city (text)
state (text)
lat (float) — approximate, rounded to ~0.5 mile
lng (float) — approximate, rounded to ~0.5 mile
last_active (timestamp)
created_at (timestamp)
```

**RLS:** Users can read village_profiles where visibility != 'hidden'. Users can only update their own.

---

### 2. Events & Meetups

Parents create and join local events — park playdates, sensory-friendly outings, support group meetings, resource fairs.

**Event types:**
- **Playdate** — casual, small group, location-based
- **Support Group** — structured, recurring, facilitated (by parent or BCBA)
- **Workshop** — educational, one-time (could be Ariana or a local provider)
- **Social Outing** — sensory-friendly movie, bowling, restaurant
- **Advocacy** — IEP prep group, school board meeting attendance
- **Custom** — anything else

**Event creation flow:**
1. Tap "Create Event" button
2. Fill in: title, type, description, date/time, location (address or "DM for location"), max attendees, child-friendly (yes/no), age range
3. Optional: recurring (weekly, biweekly, monthly)
4. Optional: requires RSVP approval (for safety — creator approves each attendee)
5. Publish → visible to nearby parents within X miles (creator sets radius: 5/10/25/50 miles)

**Event card shows:**
- Title, type badge, date/time
- Location (city-level until RSVP'd, then full address revealed)
- Host name + profile link
- Attendee count / max ("4/10 spots filled")
- RSVP button
- Distance from user

**Event detail page:**
- Full description
- Map (if location shared)
- Attendee list (first names + profile links)
- Comment thread for coordination ("I'm bringing snacks!", "Parking is on the east side")
- Host controls: edit, cancel, approve RSVPs, remove attendees

**Database: `village_events` table**
```
id (uuid, PK)
creator_id (uuid, FK → profiles)
title (text)
description (text, max 1000 chars)
event_type (enum: playdate / support_group / workshop / social_outing / advocacy / custom)
date (date)
start_time (time)
end_time (time)
location_name (text) — "Ganesha Park" or "TBD — DM for details"
location_address (text, nullable) — only revealed to approved RSVPs
location_city (text)
location_lat (float, nullable)
location_lng (float, nullable)
max_attendees (int, nullable)
age_range (text, nullable) — "3-8"
child_friendly (boolean, default true)
requires_approval (boolean, default false)
visibility_radius_miles (int, default 25)
recurring (enum: none / weekly / biweekly / monthly)
recurring_end_date (date, nullable)
status (enum: active / cancelled / completed)
created_at (timestamp)
```

**Database: `village_rsvps` table**
```
id (uuid, PK)
event_id (uuid, FK → village_events)
user_id (uuid, FK → profiles)
status (enum: pending / approved / declined / cancelled)
rsvp_at (timestamp)
```

**Database: `village_event_comments` table**
```
id (uuid, PK)
event_id (uuid, FK → village_events)
user_id (uuid, FK → profiles)
content (text, max 500 chars)
created_at (timestamp)
```

**RLS:**
- Events readable by authenticated users within visibility_radius (calculated in query or client-side)
- Events only editable by creator_id
- RSVPs: users can insert/update their own. Creators can update status (approve/decline) for their events.
- Comments: readable by authenticated users on events they can see. Insertable by authenticated users.

---

### 3. Local Resource Directory

Crowdsourced, rated directory of autism/ADHD-friendly local resources.

**Resource categories:**
- ABA Therapy Providers
- Occupational Therapists
- Speech Therapists
- Sensory-Friendly Businesses (restaurants, stores, venues)
- Autism-Friendly Parks & Playgrounds
- Support Groups (in-person)
- Special Needs Attorneys / Advocates
- Respite Care
- After-School Programs
- Pediatric Specialists
- Other

**Resource card shows:**
- Name, category badge, address, phone, website
- Star rating (1-5) + review count
- Distance from user
- Tags (e.g., "accepts Medi-Cal", "weekend hours", "bilingual staff")
- "Verified" badge if confirmed by Modern Village team

**Anyone can:**
- Add a resource (moderated before public)
- Rate & review (1-5 stars + text review)
- Report inaccurate info
- Save to favorites

**Database: `village_resources` table**
```
id (uuid, PK)
submitted_by (uuid, FK → profiles)
name (text)
category (text)
description (text, max 500 chars)
address (text)
city (text)
state (text)
zip (text)
lat (float)
lng (float)
phone (text, nullable)
website (text, nullable)
tags (text[])
avg_rating (float, default 0)
review_count (int, default 0)
verified (boolean, default false)
status (enum: pending / approved / rejected)
created_at (timestamp)
```

**Database: `village_reviews` table**
```
id (uuid, PK)
resource_id (uuid, FK → village_resources)
user_id (uuid, FK → profiles)
rating (int, 1-5)
review_text (text, max 500 chars)
created_at (timestamp)
```

**RLS:**
- Resources with status='approved' readable by all authenticated users
- Reviews readable by all. One review per user per resource (unique constraint on resource_id + user_id).

---

### 4. In-App Messaging (Parent-to-Parent)

Simple direct messaging between parents who've connected through My Village.

**Rules:**
- Must opt into My Village (visibility != hidden) to send/receive messages
- No unsolicited messaging — can only message after: mutual "connection" (both tap "Connect"), or both RSVP'd to the same event
- Messages are text-only (no images/files — keeps it safe)
- Report/block functionality

**Database: `village_messages` table**
```
id (uuid, PK)
sender_id (uuid, FK → profiles)
receiver_id (uuid, FK → profiles)
content (text, max 1000 chars)
read (boolean, default false)
created_at (timestamp)
```

**Database: `village_connections` table**
```
id (uuid, PK)
requester_id (uuid, FK → profiles)
receiver_id (uuid, FK → profiles)
status (enum: pending / accepted / blocked)
created_at (timestamp)
```

**RLS:**
- Messages: users can read messages where they are sender or receiver. Users can insert where they are sender and a valid connection exists.
- Connections: users can read/update their own.

---

### 5. MOPS-Style Facilitated Support Groups

Recurring, structured parent support groups — the premium layer of My Village.

**Model:**
- Free groups: parent-led, informal, anyone can create
- Pro groups: BCBA-facilitated, structured curriculum, limited to 8-12 families
- Pro groups could be included in subscription or charged separately ($10/session)

**Structure (Pro groups):**
- Weekly or biweekly, 60-90 minutes
- Facilitator (BCBA or trained parent leader) guides discussion
- Each session has a topic: "Managing transitions", "Sensory strategies at home", "IEP prep"
- Post-session: summary + strategy cards pushed to attendees in the app
- Attendance tracked — builds community over 8-12 week series

**This is Phase 2-3.** For now, the events system handles informal groups. Pro facilitated groups come after the provider marketplace is built.

---

## UI/UX Approach

### New Tab or Overlay?

**Recommendation: Replace the current Community tab (#tComm) content with a hybrid view.**

Current community tab is a basic forum (posts + comments). Replace it with:

**Top section:** "My Village" header with location + tabs:
- **Feed** — existing community forum posts (keep this)
- **Nearby** — parent discovery map/list
- **Events** — upcoming events near me
- **Resources** — local resource directory

This keeps the forum content but wraps it in the broader community experience.

### Map Component

Use **Mapbox GL JS** (free tier: 50K map loads/month) or **Google Maps JavaScript API** (free tier: 28K loads/month, but you already use Google OAuth so the API key setup is simpler).

The map shows:
- Parent pins (approximate location, colored by child age range)
- Event pins (location of upcoming events)
- Resource pins (local resources)
- User's location (blue dot)

**Clustering:** When zoomed out, group nearby pins into cluster bubbles ("12 parents in this area").

### Mobile Considerations

- Location permission request (needed for "near me" features)
- Capacitor geolocation plugin: `@capacitor/geolocation`
- Store approximate location on profile creation/update (don't constantly track)
- Offline: cache nearby parents and upcoming events for offline viewing

---

## Privacy & Safety

This is a community of vulnerable families. Safety is non-negotiable.

1. **No children's names or photos in public profiles** — only parent name, child age range, diagnosis category
2. **Approximate location only** — round lat/lng to ~0.5 mile precision
3. **Opt-in everything** — default is hidden
4. **Event locations hidden until RSVP approved** — prevents lurking
5. **Messaging requires mutual connection** — no unsolicited DMs
6. **Report/block on every interaction** — parent profiles, messages, event comments, reviews
7. **Moderation queue** — new resources require approval before public
8. **No PHI in any public-facing content** — reminder in profile creation: "Don't share medical details publicly"
9. **Block list** — blocked users can't see your profile, events, or message you
10. **Minor protection** — parents only (no child accounts). Age verification on signup.

**HIPAA note:** My Village is non-clinical. No PHI flows through it. Parent profiles contain only what parents voluntarily share publicly. This is a community directory, not a medical record. Still, add disclaimer: "Information shared in My Village is public to other members and is not protected health information."

---

## Data Model Summary

### New Tables (8)
```
village_profiles          — parent discovery profiles (visibility, bio, location)
village_events            — meetups and events
village_rsvps             — event RSVPs
village_event_comments    — event discussion threads
village_resources         — local resource directory
village_reviews           — resource ratings and reviews
village_messages          — parent-to-parent DMs
village_connections       — connection requests (required for messaging)
```

### Modified Tables
```
profiles                  — add: village_profile_id (FK, nullable)
```

---

## Build Order

### Phase 1 (MVP — build first)
1. `village_profiles` table + opt-in setup flow in My Profile
2. Nearby parents list view (sorted by distance, no map yet)
3. Events creation + RSVP + list view
4. Replace Community tab with hybrid Feed/Nearby/Events layout

### Phase 2 (Enhancement)
5. Map view (Mapbox or Google Maps)
6. Local resource directory + reviews
7. In-app messaging + connections
8. Event comments thread

### Phase 3 (Growth)
9. Push notifications for events ("Playdate tomorrow at Ganesha Park!")
10. Recurring events
11. BCBA-facilitated support groups
12. Event photo sharing (post-event recap)
13. "Invite to My Village" share link (viral growth)

---

## Success Metrics

| Metric | Target (6 months) |
|--------|-------------------|
| Village profile opt-in rate | 40% of active users |
| Events created per month | 50+ |
| Event RSVP rate | 30% of viewers |
| Resources added | 200+ |
| Parent connections | 500+ |
| Retention lift for Village users vs non-Village | +25% |

---

## Integration With Existing Features

| Existing Feature | My Village Integration |
|-----------------|----------------------|
| AI Coach | "I see you're struggling with park meltdowns. There's a sensory-friendly playground 2 miles from you — want the details?" |
| Behavior Tracker | After logging an "outing" location, suggest nearby sensory-friendly alternatives |
| Provider Marketplace | BCBAs on the marketplace can host facilitated support groups |
| Referral Program | "Invite a friend to My Village" — referral code auto-applied |
| Screener | After screener completion: "Connect with parents near you who've been where you are" |
| Daily Check-ins | "You had a great day! Share a win with your Village?" |
| Progress Dashboard | Milestone celebrations can be shared to your Village |

---

## Technical Notes

### Location Handling
```javascript
// Get approximate location (round to ~0.5 mile)
function approximateLocation(lat, lng) {
  return {
    lat: Math.round(lat * 100) / 100,  // ~1.1km precision
    lng: Math.round(lng * 100) / 100
  };
}

// Calculate distance between two points (Haversine)
function getDistance(lat1, lng1, lat2, lng2) {
  var R = 3959; // Earth radius in miles
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLng/2) * Math.sin(dLng/2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
```

---

## HIPAA Disclaimer

My Village is a community feature, not a clinical tool. Add this disclaimer to the Village opt-in screen:

> "My Village connects you with other Modern Village families nearby. Information you share in your Village profile — including your name, city, child's age range, and diagnosis category — is visible to other members. This is **not** protected health information (PHI). Do not share specific medical details, treatment plans, or provider notes in your Village profile or messages. For clinical support, use the AI Coach or book a Pro Session."
