# Modern Village — Complete Testing Guide

**Last updated:** 2026-05-06
**URL:** https://modernvillage.app/app.html
**Admin:** https://modernvillage.app/admin.html
**District Portal:** https://modernvillage.app/district-admin.html
**For a condensed in-person walkthrough with Ariana:** see `docs/SESSION-WALKTHROUGH-ARIANA.md`.

---

## Test Accounts

| Role | Email | Password |
|------|-------|----------|
| Parent | testparent@modernvillage.app | TestParent123! |
| Provider | testprovider@modernvillage.app | TestProvider123! |
| Caregiver | testcaregiver@modernvillage.app | TestCaregiver123! |
| Teacher | testteacher@modernvillage.app | TestTeacher123! |
| Admin | admin@modernvillage.app | IttakesaVill@ge! |

**Feedback:** Every page has a floating green chat bubble (bottom-right). Use it to report bugs/suggestions as you test. Feedback goes to admin panel → Feedback tab.

---

## 1. PARENT TESTING (testparent@modernvillage.app)

### 1.1 Login & Onboarding
- [ ] Go to app.html → click "Sign In"
- [ ] Enter testparent@modernvillage.app / TestParent123!
- [ ] App loads → splash screen → main app
- [ ] Coach tab is visible and active by default
- [ ] Bottom nav shows: Coach, Pros, Community, Track

### 1.2 Child Switcher
- [ ] Top of Coach tab: child switcher shows Maya and Elijah
- [ ] Tap Elijah → active child switches (name updates in coach)
- [ ] Tap Maya → switches back

### 1.3 AI Coach
- [ ] Type "My child had a meltdown at the grocery store" → Send
- [ ] AI responds with a structured strategy card (EMPATHY, ASSESSMENT, STRATEGY, REINFORCE, FOLLOWUP sections)
- [ ] Response mentions the child's name
- [ ] Suggested follow-up questions appear below the response
- [ ] Tap a follow-up → sends it as a new message

### 1.4 Daily Check-in
- [ ] If not already checked in today: modal should appear ~2.5 seconds after entering the app
- [ ] Select a mood (Great/OK/Tough/Crisis)
- [ ] Optional fields appear (win, concern, strategy)
- [ ] Submit → toast "Great day logged!" (or similar)
- [ ] Close and reopen app → no check-in prompt (already done today)

### 1.5 Behavior Tracker (Track tab)
- [ ] Tap "Track" in bottom nav
- [ ] Tap "+ Log Behavior"
- [ ] Fill in: behavior name, select ABA function chips (Tangible/Escape/Attention/Sensory)
- [ ] Add trigger, duration, intensity, outcome
- [ ] Save → appears in log list
- [ ] Log shows ABA function badge and "Logged by [your name]"

### 1.6 Community Tab — Feed
- [ ] Tap "Community" in bottom nav
- [ ] See underline sub-tabs: Feed, Nearby, Events, Resources, Messages
- [ ] Feed is active by default
- [ ] Compose bar shows at top → tap to open compose form
- [ ] Write a post, select topic, optionally add photo
- [ ] Submit → post appears in feed
- [ ] Like a post → heart fills red, count increments
- [ ] Tap comment button → comment thread expands
- [ ] Write a comment → appears in thread

### 1.7 Community Tab — Nearby (My Village)
- [ ] Tap "Nearby" sub-tab
- [ ] First time: see opt-in form "Find Families Near You"
- [ ] Select visibility (City or Neighborhood)
- [ ] Enter display name, bio, child age range, diagnosis category
- [ ] Select interests (tap chips to toggle on/off)
- [ ] Tap "Use My Location" → browser asks for permission → location set
  - OR enter zip code (try 91767 for Pomona) → resolves to city/state
- [ ] Read HIPAA disclaimer
- [ ] Tap "Join My Village" → toast "Welcome to My Village!"
- [ ] Nearby list loads (may be empty with few users)
- [ ] If empty: invite CTA shows with Share button
- [ ] If results: parent cards show name, city, distance, age badge, diagnosis badge, bio
- [ ] Tap a parent card → full profile overlay with Connect button
- [ ] Tap Connect → "Connection request sent!"
- [ ] Scroll to bottom → "Edit My Village Profile" link
- [ ] Tap edit → form pre-fills with your data
- [ ] Can change visibility, bio, interests
- [ ] "Leave My Village" button at bottom (deletes profile)

### 1.8 Community Tab — Events
- [ ] Tap "Events" sub-tab
- [ ] See "+ Create Event" button at top
- [ ] If no events: empty state with "Be the first" prompt
- [ ] Tap "Create Event"
- [ ] Fill in: type (Playdate), title, description, date, start/end time
- [ ] Fill in: location name, city, optional address
- [ ] Set max attendees, age range
- [ ] Toggle "Require RSVP approval" ON
- [ ] Tap "Create Event" → toast "Event created!"
- [ ] Event appears in list with type emoji, title, date, location, "Your event" badge
- [ ] Tap the event → detail view shows full info
- [ ] Host controls visible: Cancel Event button
- [ ] Address shown (you're the host)

### 1.9 Community Tab — Resources
- [ ] Tap "Resources" sub-tab
- [ ] If no approved resources: empty state
- [ ] Tap "+ Add Resource"
- [ ] Fill in: category (ABA Therapy), name, description, city, state
- [ ] Submit → toast "Resource submitted! It will appear after review."
- [ ] (Resource won't appear until admin approves it)

### 1.10 Community Tab — Messages
- [ ] Tap "Messages" sub-tab
- [ ] If no connections: empty state with "Find Parents" button
- [ ] (After someone accepts your connection request):
  - [ ] Conversation appears in list
  - [ ] Tap → chat thread opens
  - [ ] Type a message → send → appears as green bubble on right
  - [ ] Other person's messages appear on left
  - [ ] Enter key sends message

### 1.11 Pros Tab (Provider Marketplace)
- [ ] Tap "Pros" in bottom nav
- [ ] Search bar + filter dropdowns (specialty, price) visible
- [ ] Ariana's card shows with name, credentials, rating, specialties, pricing
- [ ] Tap her card → detail view with booking UI
- [ ] Select 30-min or 60-min session
- [ ] Pick a date → available times load
- [ ] Pick a time → total shows
- [ ] Tap "Book" → confirmation screen with video link

### 1.12 Sidebar Menu
- [ ] Tap hamburger menu (top-left) or swipe right
- [ ] See: Crisis Support, My Profile, Saved Strategies, Child Insights, Progress Dashboard, My Milestones, Routine Builder, IEP Toolkit, Resources, Session Notes, Booking History, Invite Friends, Care Team Notes
- [ ] Tap "My Profile" → profile editor opens
- [ ] Scroll to bottom → "Email Preferences" toggle visible
- [ ] Toggle off → toast "Marketing emails disabled"

### 1.13 Routine Builder
- [ ] Open from sidebar → "Routine Builder"
- [ ] Create a new routine → add steps
- [ ] Tap "AI Suggest" → AI generates routine with ABA tips
- [ ] Save routine → persists on refresh
- [ ] Print button works

### 1.14 IEP Toolkit
- [ ] Open from sidebar → "IEP Toolkit"
- [ ] Upload a PDF → AI extracts goals, services, accommodations, gaps
- [ ] Results display in structured cards

### 1.15 Crisis Mode
- [ ] Open from sidebar → "Crisis Support" (red highlight)
- [ ] 6-step de-escalation walkthrough (large text, one step at a time)
- [ ] 988 + 911 one-tap links visible
- [ ] Complete steps → debrief auto-logs behavior + care note
- [ ] "Talk to Coach" button hands off with crisis context

### 1.16 Voice Mode
- [ ] In Coach tab, tap microphone button on chat bar
- [ ] Speak → speech-to-text converts to message
- [ ] AI responds → text-to-speech reads it back
- [ ] Tap mic again to continue conversation

### 1.17 Password Reset Flow
- [ ] Log out → on login screen, enter email
- [ ] Tap "Forgot password?" → toast "reset link sent"
- [ ] (If you click the reset link from email): modal appears with password fields
- [ ] Enter new password + confirm → "Password updated!" → redirected to login

### 1.18 Feedback Widget
- [ ] Floating green chat bubble visible bottom-right
- [ ] Tap → slide-up sheet with type buttons (Bug/Improvement/Feedback/Question)
- [ ] Select type → type button highlights
- [ ] Write feedback → Submit → toast "Thanks for your feedback!"
- [ ] (Check admin panel → Feedback tab to see it)

---

## 2. PROVIDER TESTING (testprovider@modernvillage.app)

### 2.1 Login
- [ ] Log in with testprovider@modernvillage.app / TestProvider123!
- [ ] Bottom nav shows: Clients, Track
- [ ] No daily check-in prompt (provider role)

### 2.2 Client List
- [ ] Clients tab shows 5 test children with trend stats
- [ ] Each card shows: child name, age, diagnosis, billing amount
- [ ] Tap a client → detail overlay opens

### 2.3 Client Detail — Behavior Logs
- [ ] Default tab: Behavior Logs
- [ ] Shows parent-logged behaviors with timestamps, triggers, outcomes
- [ ] Read-only (provider can't edit parent logs)

### 2.4 Client Detail — Session Notes
- [ ] Tap "Sessions" sub-tab
- [ ] Tap "+ New Session Note"
- [ ] Fill in: date, duration, CPT code, objectives, interventions
- [ ] Tap "Generate AI Narrative" → AI writes clinical narrative
- [ ] Save → note appears in list
- [ ] Tap "Superbill" → PDF preview with provider info, CPT code, narrative

### 2.5 Client Detail — Billing
- [ ] Tap "Billing" sub-tab
- [ ] See claims summary and aging report
- [ ] Tap "Generate Claim" from a session note
- [ ] Claim appears with status "pending"
- [ ] Change status: pending → submitted → paid

### 2.6 Client Detail — Care Notes
- [ ] Tap "Notes" sub-tab
- [ ] Write a note → Post → appears with provider role badge
- [ ] Parent and caregiver notes also visible

### 2.7 Client Detail — Insights
- [ ] Tap "Insights" sub-tab
- [ ] Shows behavioral patterns: trend, top behaviors, triggers, strategy effectiveness
- [ ] Data comes from parent's behavior logs (not provider's user_id)

### 2.8 Provider Sidebar
- [ ] Sidebar shows: Billing Dashboard, My Payers, Care Team Notes
- [ ] Billing Dashboard: all clients' claims overview
- [ ] My Payers: manage payer enrollments (add/remove insurance companies)

---

## 3. CAREGIVER TESTING (testcaregiver@modernvillage.app)

### 3.1 Login
- [ ] Log in → sees Track tab only
- [ ] Sees Maya only (connected child)

### 3.2 Behavior Logging
- [ ] Log a behavior → shows "Logged by Test Caregiver" attribution
- [ ] ABA function chips work

### 3.3 Limited Access
- [ ] Routines → read-only (no edit/save/AI buttons)
- [ ] Saved Strategies → read-only (no delete)
- [ ] Care Team Notes → can post and read
- [ ] NO AI Coach, NO Community, NO IEP Toolkit

---

## 4. TEACHER TESTING (testteacher@modernvillage.app)

### 4.1 Login
- [ ] Log in → sees Track tab only
- [ ] Sees Elijah only (connected child)

### 4.2 Behavior Summary
- [ ] Weekly comparison, 30-day trends, peak times
- [ ] Top behaviors, triggers, strategy effectiveness

### 4.3 Behavior Logging
- [ ] Log a behavior → attributed to teacher
- [ ] ABA function chips work

### 4.4 Access
- [ ] IEP Toolkit → accessible
- [ ] Routines → read-only
- [ ] Care Team Notes → can post and read
- [ ] NO AI Coach, NO Community

---

## 5. CHILD LOGIN

### 5.1 Setup (do from parent account first)
- [ ] Log in as parent → Profile → "Create Kid Login" for Maya
- [ ] Set username + 4-digit PIN

### 5.2 Child Login
- [ ] Log out → on login screen, tap "I'm a kid" link
- [ ] Enter username + PIN
- [ ] Simplified view loads: mood check-in, coping tools, routine viewer
- [ ] NO access to parent data, behavior logs, or clinical info

---

## 6. ADMIN PANEL (admin@modernvillage.app)

### 6.1 Login
- [ ] Go to admin.html
- [ ] Log in with admin@modernvillage.app / IttakesaVill@ge!
- [ ] Sidebar shows grouped sections: Overview, Users & Access, Clinical, Platform, Sales & Marketing, Revenue, Reporting, Content

### 6.2 Dashboard
- [ ] Stats load: total users, pro users, conversations, bookings
- [ ] Top AI Topics panel
- [ ] Recent Signups panel

### 6.3 Users
- [ ] Table shows all users with: name, email, role, children (multi-child), plan, messages, joined date
- [ ] "Reset PW" button on each row

### 6.4 VA Team
- [ ] Tap "VA Team" in sidebar
- [ ] See team members table with role dropdowns
- [ ] Tap "+ Add VA" → create form (email, name, password, role)
- [ ] Change a VA's role → saves immediately
- [ ] Remove button strips admin access

### 6.5 Feedback
- [ ] Tap "Feedback" in sidebar
- [ ] See feedback stats (total, new, bugs, ideas)
- [ ] Filter by type and status
- [ ] Each entry shows: type emoji, content, user info, page
- [ ] Change status dropdown → saves
- [ ] Set priority → saves
- [ ] Add admin note → saves on blur

### 6.6 Verify Providers
- [ ] Shows pending vs verified providers
- [ ] Approve/Reject buttons

### 6.7 Billing Overview
- [ ] Claims by status, revenue by provider, recent claims

### 6.8 Leads CRM
- [ ] 16,000+ leads visible
- [ ] Filter by type (Districts, Providers, SELPAs, etc.)
- [ ] Search works
- [ ] Status updates save

### 6.9 Email Campaigns
- [ ] Create a blast or 9-email sequence
- [ ] AI Generate button creates A/B subject lines + body
- [ ] Send test email

### 6.10 Social Media
- [ ] 30 Instagram posts load
- [ ] Download PNG button
- [ ] Copy caption button

### 6.11 Other Tabs
- [ ] Sessions → booking history
- [ ] Community → posts moderation
- [ ] Behavior Data → aggregate behavior logs with charts
- [ ] District Analytics → engagement metrics
- [ ] Grant Reporting → auto-tracked metrics
- [ ] Blog → create/manage posts
- [ ] Referrals → referral tracking

---

## 7. DISTRICT PORTAL (district-admin.html)

**Note:** Requires a district coordinator account to be set up first. See admin setup below.

### 7.1 Setup (one-time, from Supabase SQL)
```sql
-- Create district
INSERT INTO districts (name, city, state, pilot_status) 
VALUES ('Pomona USD', 'Pomona', 'CA', 'pilot') RETURNING id;

-- Link your account as coordinator (replace DISTRICT_ID and YOUR_USER_ID)
INSERT INTO district_coordinators (district_id, user_id) 
VALUES ('DISTRICT_ID', 'YOUR_USER_ID');
```

### 7.2 Login
- [ ] Go to district-admin.html
- [ ] Log in with your coordinator email/password
- [ ] Dashboard loads with district stats

### 7.3 Dashboard
- [ ] Stats: Total Schools, Teachers, Families, Behavior Logs, Active This Week
- [ ] Recent Activity panel
- [ ] Schools Overview panel

### 7.4 Schools
- [ ] Table of schools with teacher/family counts

### 7.5 Teachers
- [ ] Table of teachers with activity stats

### 7.6 Engagement
- [ ] Aggregate metrics (anonymous — no child data)
- [ ] Weekly log volume, common concerns, active families trend

### 7.7 Settings
- [ ] District info displayed (read-only)

---

## 8. CROSS-ROLE TESTING

### 8.1 Invite Flow
- [ ] As parent: sidebar → Invite to Care Team
- [ ] Select child, enter email, pick role (Co-Parent/Caregiver/Teacher/Provider)
- [ ] Invite sends email with accept link
- [ ] New user clicks link → creates account → joins care team
- [ ] Child appears in their app

### 8.2 Co-Parent Access
- [ ] Invite a co-parent → they get `access_level: 'full'` + `role: 'parent'`
- [ ] Co-parent sees the same children as the inviting parent
- [ ] Co-parent gets daily check-in prompt
- [ ] Co-parent can use AI Coach, Community, Track

### 8.3 Care Team Notes Cross-Role
- [ ] Parent posts a care note → visible to provider, caregiver, teacher
- [ ] Each note shows role-colored badge
- [ ] Provider replies → visible to all

---

## 9. SCREENER (screener.html)

- [ ] Go to screener.html
- [ ] Enter child's age in months → proceed
- [ ] Answer all 20 M-CHAT-R questions
- [ ] Tap "See My Results"
- [ ] Email gate appears → enter email
- [ ] Marketing consent checkbox is visible (pre-checked)
- [ ] Submit → results page with risk level and next steps
- [ ] (Screener lead saved to screener_leads table with marketing_consent flag)

---

## 10. LANDING PAGE (index.html)

- [ ] Load index.html → hero section, features, pricing, testimonials
- [ ] "Get Started Free" button → links to app.html
- [ ] Screener CTA → links to screener.html
- [ ] Mobile responsive

---

## Tips for Testers

1. **Use the feedback button** (green bubble) for every issue — it captures your role and page automatically
2. **Test on mobile** — most parents will use their phone
3. **Try breaking things** — empty fields, special characters, rapid tapping
4. **Check loading states** — slow network? Does it show spinners or hang?
5. **Note what's confusing** — if you have to think about what to tap next, that's a UX issue
