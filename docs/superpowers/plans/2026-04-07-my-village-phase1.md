# My Village Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Community tab into a hybrid Feed/Nearby/Events experience where parents discover nearby families and organize local meetups.

**Architecture:** All code in app.html (vanilla JS/CSS/HTML) + one Supabase SQL migration. Community tab restructured with underline sub-tabs. Three new tables: village_profiles, village_events, village_rsvps. Location via browser geolocation with zip code fallback.

**Tech Stack:** Vanilla HTML/CSS/JS in app.html, Supabase PostgreSQL with RLS, zippopotam.us API for zip fallback.

**Key constraint:** Use `\\x27` for escaped single quotes in app.html JS strings (not `\'`). Run `node --check` on extracted JS after every edit.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260407_my_village.sql` | Create | 3 tables + RLS + indexes |
| `app.html` (CSS, lines ~580-587) | Modify | Add village sub-tab and card styles |
| `app.html` (HTML, line ~1055) | Modify | Restructure `#tComm` with sub-tab bar + content areas |
| `app.html` (JS, after community functions ~line 2620) | Modify | Add all village JS functions |
| `app.html` (JS, switchTab ~line 1863) | Modify | Hook village tab loading into main tab switch |

---

### Task 1: SQL Migration — Create Tables, RLS, Indexes

**Files:**
- Create: `supabase/migrations/20260407_my_village.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ═══════════════════════════════════════════════════
-- My Village Phase 1 — Local Community Layer
-- 2026-04-07
-- ═══════════════════════════════════════════════════

-- 1. Village Profiles — parent discovery
CREATE TABLE IF NOT EXISTS public.village_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  visibility text NOT NULL DEFAULT 'city',
  display_name text NOT NULL,
  bio text,
  child_age_range text,
  child_diagnosis_category text,
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

CREATE POLICY "Read visible village profiles"
  ON public.village_profiles FOR SELECT
  USING (auth.uid() IS NOT NULL AND visibility != 'hidden');

CREATE POLICY "Read own village profile"
  ON public.village_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Create own village profile"
  ON public.village_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Update own village profile"
  ON public.village_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Delete own village profile"
  ON public.village_profiles FOR DELETE
  USING (auth.uid() = user_id);

-- Admin read all
CREATE POLICY "Admins read all village profiles"
  ON public.village_profiles FOR SELECT
  USING (public.is_admin());

-- 2. Village Events — meetups and playdates
CREATE TABLE IF NOT EXISTS public.village_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  event_type text NOT NULL DEFAULT 'playdate',
  event_date date NOT NULL,
  start_time time NOT NULL,
  end_time time,
  location_name text NOT NULL,
  location_address text,
  location_city text NOT NULL,
  location_lat float,
  location_lng float,
  max_attendees integer,
  age_range text,
  child_friendly boolean DEFAULT true,
  requires_approval boolean DEFAULT false,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.village_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read active events"
  ON public.village_events FOR SELECT
  USING (auth.uid() IS NOT NULL AND status = 'active');

CREATE POLICY "Read own events"
  ON public.village_events FOR SELECT
  USING (auth.uid() = creator_id);

CREATE POLICY "Create events"
  ON public.village_events FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Update own events"
  ON public.village_events FOR UPDATE
  USING (auth.uid() = creator_id);

CREATE POLICY "Delete own events"
  ON public.village_events FOR DELETE
  USING (auth.uid() = creator_id);

CREATE POLICY "Admins read all events"
  ON public.village_events FOR SELECT
  USING (public.is_admin());

-- 3. Village RSVPs
CREATE TABLE IF NOT EXISTS public.village_rsvps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid REFERENCES public.village_events(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status text DEFAULT 'approved',
  rsvp_at timestamptz DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE public.village_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read RSVPs"
  ON public.village_rsvps FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Create own RSVP"
  ON public.village_rsvps FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Update own RSVP"
  ON public.village_rsvps FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Creator manages RSVPs"
  ON public.village_rsvps FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.village_events
      WHERE id = village_rsvps.event_id
      AND creator_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_village_profiles_user ON public.village_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_village_profiles_visibility ON public.village_profiles(visibility);
CREATE INDEX IF NOT EXISTS idx_village_events_date ON public.village_events(event_date);
CREATE INDEX IF NOT EXISTS idx_village_events_status ON public.village_events(status);
CREATE INDEX IF NOT EXISTS idx_village_events_creator ON public.village_events(creator_id);
CREATE INDEX IF NOT EXISTS idx_village_rsvps_event ON public.village_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_village_rsvps_user ON public.village_rsvps(user_id);
```

- [ ] **Step 2: Run the migration on Supabase**

Go to Supabase Dashboard → SQL Editor → paste and run the migration. Verify all 3 tables appear in the Table Editor with RLS enabled.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260407_my_village.sql
git commit -m "feat: add My Village tables — village_profiles, village_events, village_rsvps"
```

---

### Task 2: CSS — Add Village Sub-Tab and Card Styles

**Files:**
- Modify: `app.html` — CSS block (before `</style>` at line ~587)

- [ ] **Step 1: Add village CSS rules**

Insert before the `</style>` closing tag:

```css
/* My Village */
.vill-tabs{display:flex;border-bottom:2px solid var(--sand);margin-bottom:16px}
.vill-tab{padding:10px 20px;font-size:13px;font-weight:600;color:var(--warm-gray);cursor:pointer;border-bottom:2.5px solid transparent;margin-bottom:-2px;transition:all 0.15s}
.vill-tab.active{color:var(--sage-dark);font-weight:700;border-bottom-color:var(--sage)}
.vill-section{display:none}.vill-section.active{display:block}
.vill-parent-card{background:white;border-radius:16px;padding:16px;border:1px solid var(--sand);margin-bottom:10px;cursor:pointer;transition:all 0.15s}
.vill-parent-card:hover{border-color:var(--sage);box-shadow:0 4px 16px rgba(0,0,0,0.04)}
.vill-badge{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600}
.vill-badge-age{background:var(--sky);color:var(--sky-dark)}
.vill-badge-dx{background:var(--lavender);color:#6B5B8D}
.vill-event-card{background:white;border-radius:16px;padding:16px;border:1px solid var(--sand);margin-bottom:10px;transition:all 0.15s}
.vill-event-card:hover{border-color:var(--sage);box-shadow:0 4px 16px rgba(0,0,0,0.04)}
.vill-type-badge{display:inline-block;padding:3px 10px;border-radius:8px;font-size:11px;font-weight:700;background:var(--sage-light);color:var(--sage-dark)}
.vill-invite-cta{background:linear-gradient(135deg,var(--sage-light),var(--cream));border-radius:16px;padding:16px;margin-bottom:16px;border:1px solid var(--sage);display:flex;align-items:center;gap:12px}
.vill-opt-in{text-align:center;padding:32px 20px}
.vill-opt-in h3{font-family:'Fraunces',serif;font-size:22px;font-weight:800;margin-bottom:8px}
.vill-form-label{font-size:12px;font-weight:600;color:var(--warm-gray);margin-bottom:6px;display:block}
.vill-interest-chip{display:inline-block;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;border:1.5px solid var(--sand);background:white;color:var(--warm-gray);cursor:pointer;margin:0 4px 6px 0;transition:all 0.15s}
.vill-interest-chip.on{background:var(--sage-light);border-color:var(--sage);color:var(--sage-dark)}
.vill-filters{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.vill-filter{padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;border:1px solid var(--sand);background:white;color:var(--warm-gray);cursor:pointer}
.vill-disclaimer{font-size:11px;color:var(--warm-gray-light);line-height:1.5;padding:12px;background:var(--cream);border-radius:10px;margin:12px 0}
```

- [ ] **Step 2: Syntax check**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/app_check.js && node --check /tmp/app_check.js
```

Expected: no output (success). CSS changes don't affect JS, but verify nothing was accidentally broken.

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "style: add My Village CSS — sub-tabs, parent cards, event cards, opt-in form"
```

---

### Task 3: HTML — Restructure Community Tab with Sub-Tabs

**Files:**
- Modify: `app.html` — HTML at line ~1055 (the `#tComm` div)

- [ ] **Step 1: Replace the `#tComm` div contents**

Find the current `#tComm` div (line ~1055, starts with `<div id="tComm" class="tab">` and ends before `<!-- CLIENTS TAB`). Replace its inner content with a structure that has:
1. The same "Your Village" header
2. A new underline sub-tab bar (Feed / Nearby / Events)
3. Three content sections: `#villFeed` (contains existing forum content), `#villNearby`, `#villEvents`

Replace the full `<div id="tComm" class="tab">...</div>` block with:

```html
<div id="tComm" class="tab">
  <div style="margin-bottom:4px"><h2 style="font-family:'Fraunces',serif;font-size:24px;font-weight:800">Your Village</h2><p style="color:var(--warm-gray);font-size:14px;margin-top:4px">Real parents. Real stories. Real support.</p></div>
  <div class="vill-tabs">
    <div class="vill-tab active" data-vt="feed" onclick="switchVillTab('feed')">Feed</div>
    <div class="vill-tab" data-vt="nearby" onclick="switchVillTab('nearby')">Nearby</div>
    <div class="vill-tab" data-vt="events" onclick="switchVillTab('events')">Events</div>
  </div>
  <!-- FEED (existing forum) -->
  <div id="villFeed" class="vill-section active">
    <div id="topicPills" style="display:flex;gap:8px;overflow-x:auto;padding-bottom:12px;margin-bottom:8px"></div>
    <div id="composeBar" style="background:white;border-radius:16px;padding:14px 20px;margin-bottom:16px;border:1px solid var(--sand);display:flex;align-items:center;gap:12px;cursor:pointer" onclick="openCompose()"><div class="hdr-av" id="commAv" style="width:36px;height:36px;font-size:14px">?</div><span style="color:var(--warm-gray-light);font-size:14px">Share a win, ask a question, or just vent...</span></div>
    <div id="composeForm" class="hidden" style="background:white;border-radius:20px;padding:20px;border:2px solid var(--sage);margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><div class="hdr-av" id="composeAv" style="width:36px;height:36px;font-size:14px">?</div><div style="font-weight:700;font-size:14px" id="composeName">You</div></div>
      <textarea id="composeText" style="width:100%;padding:12px;border:2px solid var(--sand);border-radius:12px;font-size:15px;font-family:'DM Sans',sans-serif;resize:none;min-height:80px;color:var(--charcoal)" placeholder="What's on your mind?"></textarea>
      <div style="margin-top:10px;margin-bottom:12px"><div style="font-size:12px;font-weight:600;color:var(--warm-gray);margin-bottom:6px">Topic</div><div style="display:flex;gap:6px;flex-wrap:wrap" id="composeTopics"></div></div>
      <div style="margin-bottom:12px"><input type="file" id="composeImage" accept="image/*" style="display:none" onchange="previewComposeImage(this)"><button type="button" style="background:none;border:1.5px dashed var(--sand);border-radius:12px;padding:10px 16px;cursor:pointer;color:var(--warm-gray);font-size:13px;font-weight:600;width:100%;transition:all 0.15s" onclick="document.getElementById('composeImage').click()">&#x1F4F7; Add Photo</button><div id="composeImagePreview" style="margin-top:8px;display:none"><img id="composeImageThumb" style="max-width:100%;border-radius:12px;max-height:200px"><button type="button" style="display:block;margin-top:4px;background:none;border:none;color:var(--terracotta);font-size:12px;cursor:pointer" onclick="removeComposeImage()">Remove photo</button></div></div>
      <div style="display:flex;gap:8px"><button class="btn btn-p" style="flex:1" onclick="submitPost()">Post to Village</button><button class="btn btn-s" onclick="closeCompose()">Cancel</button></div>
    </div>
    <div id="communityPosts" style="display:flex;flex-direction:column;gap:12px"></div>
  </div>
  <!-- NEARBY -->
  <div id="villNearby" class="vill-section"></div>
  <!-- EVENTS -->
  <div id="villEvents" class="vill-section"></div>
</div>
```

- [ ] **Step 2: Syntax check**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/app_check.js && node --check /tmp/app_check.js
```

Expected: success (no output).

- [ ] **Step 3: Verify Feed still works**

Open app.html in browser, go to Community tab. The Feed sub-tab should be active by default and show the existing forum posts exactly as before. Topic pills, compose bar, and posts should all render.

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "feat: restructure Community tab with Feed/Nearby/Events underline sub-tabs"
```

---

### Task 4: JS — Sub-Tab Switching + Village State

**Files:**
- Modify: `app.html` — JS section, after community functions (~line 2620)
- Modify: `app.html` — switchTab function (~line 1863)

- [ ] **Step 1: Add village state variable and sub-tab switching**

Add after the existing community JS functions (after loadCommentCounts or the last community-related function, around line ~2620):

```javascript
// ═══ MY VILLAGE ═══
var villTab='feed';
var villProfile=null;

function switchVillTab(t){
  villTab=t;
  document.querySelectorAll('.vill-tab').forEach(function(el){el.classList.toggle('active',el.getAttribute('data-vt')===t)});
  document.querySelectorAll('.vill-section').forEach(function(el){el.classList.remove('active')});
  var ids={feed:'villFeed',nearby:'villNearby',events:'villEvents'};
  document.getElementById(ids[t]).classList.add('active');
  if(t==='feed')renderCommunityPosts();
  if(t==='nearby')loadNearbyTab();
  if(t==='events')loadEventsTab();
}

async function loadVillageProfile(){
  if(!S.user||!sb)return null;
  var r=await sb.from('village_profiles').select('*').eq('user_id',S.user.id).maybeSingle();
  villProfile=r.data||null;
  return villProfile;
}
```

- [ ] **Step 2: Update switchTab to load village on community activation**

In the existing `switchTab` function (line ~1863), find the line:

```javascript
if(t==='community')renderCommunityPosts();
```

Replace with:

```javascript
if(t==='community'){if(villTab==='feed')renderCommunityPosts();else if(villTab==='nearby')loadNearbyTab();else if(villTab==='events')loadEventsTab();}
```

- [ ] **Step 3: Syntax check**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/app_check.js && node --check /tmp/app_check.js
```

Expected: success. The `loadNearbyTab` and `loadEventsTab` functions don't exist yet — that's fine, they'll be added in the next tasks. The syntax check only verifies JS parses, not that functions are defined.

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "feat: add village sub-tab switching + village profile state"
```

---

### Task 5: JS — Location Utilities + Zip Lookup

**Files:**
- Modify: `app.html` — JS section, after the code from Task 4

- [ ] **Step 1: Add location utility functions**

Add after the village state code from Task 4:

```javascript
// ═══ VILLAGE LOCATION ═══
function approximateLocation(lat,lng){return{lat:Math.round(lat*100)/100,lng:Math.round(lng*100)/100}}

function getDistance(lat1,lng1,lat2,lng2){
  var R=3959;var dLat=(lat2-lat1)*Math.PI/180;var dLng=(lng2-lng1)*Math.PI/180;
  var a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function getEventTypeEmoji(t){return{playdate:'\uD83C\uDFAA',support_group:'\uD83D\uDCAC',workshop:'\uD83D\uDCDA',social_outing:'\uD83C\uDFB3',advocacy:'\u270A',custom:'\uD83D\uDCCC'}[t]||'\uD83D\uDCCC'}

function formatEventDate(d,t){
  var dt=new Date(d+'T'+(t||'12:00:00'));
  var days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var hr=dt.getHours();var mn=dt.getMinutes();var ampm=hr>=12?'PM':'AM';hr=hr%12||12;
  return days[dt.getDay()]+' '+months[dt.getMonth()]+' '+dt.getDate()+' \u00b7 '+hr+':'+(mn<10?'0':'')+mn+' '+ampm;
}

async function getVillageLocation(callback){
  if(!navigator.geolocation){callback(null);return}
  navigator.geolocation.getCurrentPosition(
    function(pos){
      var approx=approximateLocation(pos.coords.latitude,pos.coords.longitude);
      callback(approx);
    },
    function(){callback(null)},
    {timeout:10000,maximumAge:300000}
  );
}

async function lookupZip(zip){
  try{
    var r=await fetch('https://api.zippopotam.us/us/'+encodeURIComponent(zip));
    if(!r.ok)return null;
    var d=await r.json();
    if(!d.places||!d.places.length)return null;
    var p=d.places[0];
    return{lat:parseFloat(p.latitude),lng:parseFloat(p.longitude),city:p['place name'],state:d['state abbreviation']};
  }catch(e){return null}
}
```

- [ ] **Step 2: Syntax check**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/app_check.js && node --check /tmp/app_check.js
```

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "feat: add village location utilities — geolocation, haversine, zip lookup"
```

---

### Task 6: JS — Village Opt-In Flow (Nearby Tab)

**Files:**
- Modify: `app.html` — JS section, after the code from Task 5

- [ ] **Step 1: Add the Nearby tab loader and opt-in form renderer**

```javascript
// ═══ VILLAGE NEARBY ═══
var VILL_INTERESTS=['Sensory Play','Outdoor Activities','ABA Strategies','IEP Advocacy','Social Skills','Routine Building','Sibling Support','Teen Parenting'];

async function loadNearbyTab(){
  var el=document.getElementById('villNearby');
  el.innerHTML='<div style="text-align:center;padding:20px;color:var(--warm-gray-light)">Loading...</div>';
  await loadVillageProfile();
  if(!villProfile){showVillageOptIn();return}
  loadNearbyParents();
}

function showVillageOptIn(){
  var el=document.getElementById('villNearby');
  var name=S.name||S.profile&&S.profile.name||'';
  var h='<div class="vill-opt-in"><div style="font-size:48px;margin-bottom:12px">\uD83C\uDFD8\uFE0F</div>';
  h+='<h3>Find Families Near You</h3>';
  h+='<p style="font-size:14px;color:var(--warm-gray);max-width:300px;margin:0 auto 20px">Connect with other Modern Village parents in your area. You control what\\x27s shared.</p>';
  h+='<div style="text-align:left;max-width:360px;margin:0 auto">';
  // Visibility
  h+='<label class="vill-form-label">Visibility</label>';
  h+='<div style="display:flex;gap:8px;margin-bottom:14px">';
  h+='<label style="flex:1;display:flex;align-items:center;gap:6px;padding:10px 12px;border:1.5px solid var(--sand);border-radius:10px;cursor:pointer;font-size:13px"><input type="radio" name="villVis" value="city" checked> City only</label>';
  h+='<label style="flex:1;display:flex;align-items:center;gap:6px;padding:10px 12px;border:1.5px solid var(--sand);border-radius:10px;cursor:pointer;font-size:13px"><input type="radio" name="villVis" value="neighborhood"> Neighborhood</label>';
  h+='</div>';
  // Display name
  h+='<label class="vill-form-label">Display Name</label>';
  h+='<input id="villName" class="fi" value="'+esc(name)+'" placeholder="First name or nickname" maxlength="50" style="margin-bottom:14px">';
  // Bio
  h+='<label class="vill-form-label">Short Bio <span style="font-weight:400;color:var(--warm-gray-light)">(optional, 200 chars)</span></label>';
  h+='<textarea id="villBio" class="fi" rows="2" maxlength="200" placeholder="e.g. Mom of a 5yr old with autism in Pomona. Looking for playdate friends!" style="margin-bottom:14px;resize:none"></textarea>';
  // Age range
  h+='<label class="vill-form-label">Child Age Range</label>';
  h+='<select id="villAge" class="fi" style="margin-bottom:14px"><option value="">Select...</option><option value="0-2">0-2 years</option><option value="3-5">3-5 years</option><option value="6-9">6-9 years</option><option value="10-13">10-13 years</option><option value="14-17">14-17 years</option></select>';
  // Diagnosis
  h+='<label class="vill-form-label">Diagnosis Category</label>';
  h+='<select id="villDx" class="fi" style="margin-bottom:14px"><option value="">Select...</option><option value="Autism">Autism</option><option value="ADHD">ADHD</option><option value="Both">Both</option><option value="Other">Other</option><option value="Prefer not to say">Prefer not to say</option></select>';
  // Interests
  h+='<label class="vill-form-label">Interests</label>';
  h+='<div id="villInterests" style="margin-bottom:14px">';
  VILL_INTERESTS.forEach(function(t){h+='<span class="vill-interest-chip" onclick="this.classList.toggle(\\x27on\\x27)">'+t+'</span>'});
  h+='</div>';
  // Location
  h+='<label class="vill-form-label">Location</label>';
  h+='<div id="villLocStatus" style="margin-bottom:8px"></div>';
  h+='<button class="btn btn-s" style="width:100%;margin-bottom:8px" onclick="requestVillageGeo()">\uD83D\uDCCD Use My Location</button>';
  h+='<div style="text-align:center;font-size:12px;color:var(--warm-gray-light);margin-bottom:8px">\u2014 or \u2014</div>';
  h+='<input id="villZip" class="fi" placeholder="Enter zip code" maxlength="5" style="margin-bottom:14px" onchange="resolveVillZip()">';
  // Disclaimer
  h+='<div class="vill-disclaimer">Information you share in My Village \u2014 including your name, city, and child\\x27s age range \u2014 is visible to other members. This is not protected health information (PHI). Do not share specific medical details.</div>';
  // Submit
  h+='<button class="btn btn-p" style="width:100%" onclick="submitVillageProfile()">Join My Village</button>';
  h+='</div></div>';
  el.innerHTML=h;
}

var villGeoData=null;

function requestVillageGeo(){
  var el=document.getElementById('villLocStatus');
  el.innerHTML='<div style="font-size:13px;color:var(--warm-gray)">Getting location...</div>';
  getVillageLocation(function(loc){
    if(!loc){
      el.innerHTML='<div style="font-size:13px;color:var(--terracotta)">Location denied. Please enter a zip code.</div>';
      return;
    }
    villGeoData=loc;
    lookupZip('').then(function(){
      el.innerHTML='<div style="font-size:13px;color:var(--sage-dark)">\u2705 Location set (approximate)</div>';
    });
    el.innerHTML='<div style="font-size:13px;color:var(--sage-dark)">\u2705 Location set (approximate)</div>';
  });
}

async function resolveVillZip(){
  var zip=document.getElementById('villZip').value.trim();
  if(zip.length!==5)return;
  var el=document.getElementById('villLocStatus');
  el.innerHTML='<div style="font-size:13px;color:var(--warm-gray)">Looking up zip...</div>';
  var data=await lookupZip(zip);
  if(!data){el.innerHTML='<div style="font-size:13px;color:var(--terracotta)">Zip not found</div>';return}
  villGeoData={lat:data.lat,lng:data.lng};
  document.getElementById('villZip').value=zip;
  el.innerHTML='<div style="font-size:13px;color:var(--sage-dark)">\u2705 '+esc(data.city)+', '+esc(data.state)+'</div>';
}

async function submitVillageProfile(){
  var name=document.getElementById('villName').value.trim();
  if(!name){showToast('Display name is required');return}
  if(!villGeoData){showToast('Please set your location');return}
  var vis=document.querySelector('input[name="villVis"]:checked');
  var interests=[];
  document.querySelectorAll('#villInterests .vill-interest-chip.on').forEach(function(el){interests.push(el.textContent)});
  var zipVal=document.getElementById('villZip').value.trim();
  var cityState=document.getElementById('villLocStatus').textContent.replace('\u2705 ','').split(', ');
  var profile={
    user_id:S.user.id,
    visibility:vis?vis.value:'city',
    display_name:name,
    bio:document.getElementById('villBio').value.trim()||null,
    child_age_range:document.getElementById('villAge').value||null,
    child_diagnosis_category:document.getElementById('villDx').value||null,
    interests:interests,
    city:cityState[0]||null,
    state:cityState[1]||null,
    zip:zipVal||null,
    lat:villGeoData.lat,
    lng:villGeoData.lng
  };
  try{
    if(villProfile){
      await sb.from('village_profiles').update(profile).eq('user_id',S.user.id);
    } else {
      await sb.from('village_profiles').insert(profile);
    }
    showToast(villProfile?'Profile updated!':'Welcome to My Village!');
    villGeoData=null;
    await loadVillageProfile();
    loadNearbyParents();
  }catch(e){console.error('Village profile save:',e);showToast('Could not save profile')}
}
```

- [ ] **Step 2: Syntax check**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/app_check.js && node --check /tmp/app_check.js
```

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "feat: add village opt-in flow — profile form, geolocation, zip lookup"
```

---

### Task 7: JS — Nearby Parents List with Auto-Expanding Radius

**Files:**
- Modify: `app.html` — JS section, after the code from Task 6

- [ ] **Step 1: Add the nearby parents loader and renderer**

```javascript
// ═══ NEARBY PARENTS LIST ═══
async function loadNearbyParents(){
  var el=document.getElementById('villNearby');
  if(!villProfile||!villProfile.lat){el.innerHTML='<div class="vill-opt-in"><p style="color:var(--warm-gray)">Location not set. <a style="color:var(--sage-dark);cursor:pointer;font-weight:600" onclick="editVillageProfile()">Update your profile</a></p></div>';return}

  el.innerHTML='<div style="text-align:center;padding:20px;color:var(--warm-gray-light)">Finding families nearby...</div>';

  var r=await sb.from('village_profiles').select('*').neq('visibility','hidden').neq('user_id',S.user.id);
  var all=r.data||[];
  all.forEach(function(p){p._dist=getDistance(villProfile.lat,villProfile.lng,p.lat,p.lng)});
  all.sort(function(a,b){return a._dist-b._dist});

  // Auto-expand radius
  var radii=[10,25,50,100];var nearby=[];var usedRadius=100;
  for(var i=0;i<radii.length;i++){
    nearby=all.filter(function(p){return p._dist<=radii[i]});
    if(nearby.length>=3){usedRadius=radii[i];break}
  }
  if(nearby.length<3)nearby=all.filter(function(p){return p._dist<=100});

  var h='';
  // Invite CTA
  if(nearby.length<10){
    h+='<div class="vill-invite-cta">';
    h+='<div style="font-size:28px">\uD83C\uDFD8\uFE0F</div>';
    h+='<div style="flex:1"><div style="font-size:13px;font-weight:700;color:var(--sage-dark)">Grow your local village</div><div style="font-size:12px;color:var(--warm-gray);margin-top:2px">Invite parents to connect nearby</div></div>';
    h+='<button class="btn btn-s" style="font-size:12px;padding:8px 14px" onclick="openReferral()">Share</button>';
    h+='</div>';
  }

  // Filters
  h+='<div class="vill-filters">';
  h+='<select class="vill-filter" id="villFilterAge" onchange="filterNearby()"><option value="">All Ages</option><option value="0-2">0-2</option><option value="3-5">3-5</option><option value="6-9">6-9</option><option value="10-13">10-13</option><option value="14-17">14-17</option></select>';
  h+='<select class="vill-filter" id="villFilterDx" onchange="filterNearby()"><option value="">All</option><option value="Autism">Autism</option><option value="ADHD">ADHD</option><option value="Both">Both</option><option value="Other">Other</option></select>';
  h+='</div>';

  // Parent cards
  h+='<div id="villParentList">';
  if(!nearby.length){
    h+='<div style="text-align:center;padding:32px 20px"><div style="font-size:40px;margin-bottom:12px">\uD83C\uDF31</div><div style="font-family:Fraunces,serif;font-size:18px;font-weight:800;margin-bottom:8px">You\\x27re the first!</div><div style="font-size:14px;color:var(--warm-gray);max-width:280px;margin:0 auto">No Modern Village parents near you yet. Share your link and build your local village!</div><button class="btn btn-p" style="margin-top:16px" onclick="openReferral()">Invite Parents</button></div>';
  } else {
    nearby.forEach(function(p){h+=renderParentCard(p)});
  }
  h+='</div>';

  // Edit profile link
  h+='<div style="text-align:center;margin-top:20px;padding-bottom:20px"><a style="font-size:13px;color:var(--sage-dark);cursor:pointer;font-weight:600" onclick="editVillageProfile()">Edit My Village Profile</a></div>';

  el.innerHTML=h;

  // Store for filtering
  el.dataset.nearby=JSON.stringify(nearby);
}

function renderParentCard(p){
  var dist=p._dist!==undefined?p._dist.toFixed(1)+' mi':'';
  var h='<div class="vill-parent-card" onclick="openParentProfile(\\x27'+p.id+'\\x27)">';
  h+='<div style="display:flex;align-items:start;gap:12px">';
  h+='<div style="width:40px;height:40px;border-radius:12px;background:var(--sage-light);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:var(--sage-dark);flex-shrink:0">'+esc((p.display_name||'?')[0].toUpperCase())+'</div>';
  h+='<div style="flex:1;min-width:0">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center"><div style="font-weight:700;font-size:14px">'+esc(p.display_name)+'</div>';
  if(dist)h+='<div style="font-size:12px;color:var(--warm-gray-light);flex-shrink:0">'+dist+'</div>';
  h+='</div>';
  h+='<div style="font-size:12px;color:var(--warm-gray);margin-top:2px">'+esc((p.city||'')+(p.state?', '+p.state:''))+'</div>';
  h+='<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">';
  if(p.child_age_range)h+='<span class="vill-badge vill-badge-age">'+esc(p.child_age_range)+'</span>';
  if(p.child_diagnosis_category&&p.child_diagnosis_category!=='Prefer not to say')h+='<span class="vill-badge vill-badge-dx">'+esc(p.child_diagnosis_category)+'</span>';
  h+='</div>';
  if(p.bio)h+='<div style="font-size:13px;color:var(--warm-gray);margin-top:6px;line-height:1.4">'+esc(p.bio.substring(0,120))+(p.bio.length>120?'...':'')+'</div>';
  h+='</div></div></div>';
  return h;
}

function filterNearby(){
  var el=document.getElementById('villNearby');
  var nearby=JSON.parse(el.dataset.nearby||'[]');
  var age=document.getElementById('villFilterAge').value;
  var dx=document.getElementById('villFilterDx').value;
  var filtered=nearby.filter(function(p){
    if(age&&p.child_age_range!==age)return false;
    if(dx&&p.child_diagnosis_category!==dx)return false;
    return true;
  });
  var h='';
  if(!filtered.length)h='<div style="text-align:center;padding:24px;color:var(--warm-gray-light)">No matches with these filters</div>';
  else filtered.forEach(function(p){h+=renderParentCard(p)});
  document.getElementById('villParentList').innerHTML=h;
}

function openParentProfile(profileId){
  // Find profile in cached data
  var el=document.getElementById('villNearby');
  var nearby=JSON.parse(el.dataset.nearby||'[]');
  var p=nearby.find(function(x){return x.id===profileId});
  if(!p){showToast('Profile not found');return}
  var dist=p._dist!==undefined?p._dist.toFixed(1)+' mi away':'';
  var d=new Date(p.created_at);
  var memberSince=d.toLocaleDateString('en-US',{month:'short',year:'numeric'});
  var h='<div style="padding:20px"><button class="btn btn-s" style="margin-bottom:16px" onclick="loadNearbyParents()">\u2190 Back</button>';
  h+='<div style="text-align:center;margin-bottom:20px">';
  h+='<div style="width:64px;height:64px;border-radius:16px;background:var(--sage-light);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:var(--sage-dark);margin:0 auto 12px">'+esc((p.display_name||'?')[0].toUpperCase())+'</div>';
  h+='<div style="font-family:Fraunces,serif;font-size:20px;font-weight:800">'+esc(p.display_name)+'</div>';
  h+='<div style="font-size:13px;color:var(--warm-gray);margin-top:4px">'+esc((p.city||'')+(p.state?', '+p.state:''))+(dist?' \u00b7 '+dist:'')+'</div>';
  h+='<div style="font-size:12px;color:var(--warm-gray-light);margin-top:4px">Member since '+memberSince+'</div>';
  h+='</div>';
  if(p.bio)h+='<div style="background:white;border-radius:14px;padding:14px;border:1px solid var(--sand);margin-bottom:12px;font-size:14px;line-height:1.5;color:var(--charcoal)">'+esc(p.bio)+'</div>';
  h+='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">';
  if(p.child_age_range)h+='<span class="vill-badge vill-badge-age">Age '+esc(p.child_age_range)+'</span>';
  if(p.child_diagnosis_category&&p.child_diagnosis_category!=='Prefer not to say')h+='<span class="vill-badge vill-badge-dx">'+esc(p.child_diagnosis_category)+'</span>';
  h+='</div>';
  if(p.interests&&p.interests.length){
    h+='<div style="margin-bottom:12px">';
    p.interests.forEach(function(t){h+='<span class="vill-interest-chip on" style="cursor:default">'+esc(t)+'</span>'});
    h+='</div>';
  }
  h+='<button class="btn btn-s" style="width:100%;opacity:0.5" disabled>Say Hi \u2014 messaging coming soon</button>';
  h+='</div>';
  document.getElementById('villNearby').innerHTML=h;
}

function editVillageProfile(){
  villGeoData=villProfile?{lat:villProfile.lat,lng:villProfile.lng}:null;
  showVillageOptIn();
  // Pre-fill form
  if(villProfile){
    setTimeout(function(){
      document.getElementById('villName').value=villProfile.display_name||'';
      document.getElementById('villBio').value=villProfile.bio||'';
      if(villProfile.child_age_range)document.getElementById('villAge').value=villProfile.child_age_range;
      if(villProfile.child_diagnosis_category)document.getElementById('villDx').value=villProfile.child_diagnosis_category;
      var vis=document.querySelector('input[name="villVis"][value="'+villProfile.visibility+'"]');
      if(vis)vis.checked=true;
      if(villProfile.zip)document.getElementById('villZip').value=villProfile.zip;
      if(villProfile.city){
        document.getElementById('villLocStatus').innerHTML='<div style="font-size:13px;color:var(--sage-dark)">\u2705 '+esc(villProfile.city)+(villProfile.state?', '+esc(villProfile.state):'')+'</div>';
      }
      if(villProfile.interests&&villProfile.interests.length){
        document.querySelectorAll('#villInterests .vill-interest-chip').forEach(function(el){
          if(villProfile.interests.indexOf(el.textContent)>=0)el.classList.add('on');
        });
      }
    },50);
  }
}

async function leaveVillage(){
  if(!confirm('Leave My Village? Your profile will be removed and you won\\x27t appear in nearby searches.'))return;
  await sb.from('village_profiles').delete().eq('user_id',S.user.id);
  villProfile=null;
  showToast('You\\x27ve left My Village');
  showVillageOptIn();
}
```

- [ ] **Step 2: Syntax check**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/app_check.js && node --check /tmp/app_check.js
```

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "feat: add nearby parents list — auto-expanding radius, filters, parent profile overlay"
```

---

### Task 8: JS — Events Tab (List, Create, Detail, RSVP)

**Files:**
- Modify: `app.html` — JS section, after the code from Task 7

- [ ] **Step 1: Add events tab loader, card renderer, and creation form**

```javascript
// ═══ VILLAGE EVENTS ═══
async function loadEventsTab(){
  var el=document.getElementById('villEvents');
  el.innerHTML='<div style="text-align:center;padding:20px;color:var(--warm-gray-light)">Loading...</div>';
  await loadVillageProfile();
  if(!villProfile){showVillageOptIn();return}
  loadVillageEvents();
}

async function loadVillageEvents(){
  var el=document.getElementById('villEvents');
  var today=new Date().toISOString().split('T')[0];
  var r=await sb.from('village_events').select('*').gte('event_date',today).eq('status','active').order('event_date',{ascending:true});
  var events=r.data||[];

  // Fetch RSVP counts and user's RSVPs
  var eventIds=events.map(function(e){return e.id});
  var rsvpMap={};var myRsvps={};
  if(eventIds.length){
    var rr=await sb.from('village_rsvps').select('event_id,user_id,status').in('event_id',eventIds);
    (rr.data||[]).forEach(function(rv){
      if(rv.status==='approved'||rv.status==='pending'){
        rsvpMap[rv.event_id]=(rsvpMap[rv.event_id]||0)+(rv.status==='approved'?1:0);
      }
      if(rv.user_id===S.user.id)myRsvps[rv.event_id]=rv.status;
    });
  }

  // Fetch creator names
  var creatorIds=[...new Set(events.map(function(e){return e.creator_id}))];
  var creatorNames={};
  if(creatorIds.length){
    var cr=await sb.from('village_profiles').select('user_id,display_name').in('user_id',creatorIds);
    (cr.data||[]).forEach(function(c){creatorNames[c.user_id]=c.display_name});
  }

  // Calculate distances
  events.forEach(function(e){
    if(villProfile&&villProfile.lat&&e.location_lat){
      e._dist=getDistance(villProfile.lat,villProfile.lng,e.location_lat,e.location_lng);
    }
  });

  var h='<button class="btn btn-p" style="width:100%;margin-bottom:16px" onclick="openCreateEvent()">+ Create Event</button>';

  if(!events.length){
    h+='<div style="text-align:center;padding:32px 20px"><div style="font-size:40px;margin-bottom:12px">\uD83D\uDCC5</div><div style="font-family:Fraunces,serif;font-size:18px;font-weight:800;margin-bottom:8px">No events yet</div><div style="font-size:14px;color:var(--warm-gray);max-width:280px;margin:0 auto">Be the first to organize a playdate or meetup!</div></div>';
  } else {
    events.forEach(function(e){
      var emoji=getEventTypeEmoji(e.event_type);
      var typeLabel=e.event_type.replace('_',' ').replace(/\b\w/g,function(c){return c.toUpperCase()});
      var dateStr=formatEventDate(e.event_date,e.start_time);
      var creator=creatorNames[e.creator_id]||'Someone';
      var rsvpCount=rsvpMap[e.id]||0;
      var myStatus=myRsvps[e.id]||null;
      var isHost=e.creator_id===S.user.id;
      var dist=e._dist!==undefined?e._dist.toFixed(1)+' mi':'';

      h+='<div class="vill-event-card" onclick="openEventDetail(\\x27'+e.id+'\\x27)">';
      h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:18px">'+emoji+'</span><span class="vill-type-badge">'+esc(typeLabel)+'</span></div>';
      h+='<div style="font-weight:700;font-size:15px;margin-bottom:4px">'+esc(e.title)+'</div>';
      h+='<div style="font-size:13px;color:var(--warm-gray);margin-bottom:2px">'+dateStr+'</div>';
      h+='<div style="font-size:13px;color:var(--warm-gray);margin-bottom:6px">'+esc(e.location_name)+' \u00b7 '+esc(e.location_city)+'</div>';
      h+='<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px">';
      h+='<span style="color:var(--warm-gray)">Hosted by '+esc(creator)+'</span>';
      h+='<span style="color:var(--warm-gray-light)">'+(e.max_attendees?rsvpCount+'/'+e.max_attendees+' spots':rsvpCount+' going')+(dist?' \u00b7 '+dist:'')+'</span>';
      h+='</div>';
      if(myStatus==='approved')h+='<div style="margin-top:8px;font-size:12px;font-weight:600;color:var(--sage-dark)">\u2705 You\\x27re going!</div>';
      else if(myStatus==='pending')h+='<div style="margin-top:8px;font-size:12px;font-weight:600;color:var(--sunflower-dark)">\u23F3 Waiting for approval</div>';
      else if(isHost)h+='<div style="margin-top:8px;font-size:12px;font-weight:600;color:var(--sage-dark)">Your event</div>';
      h+='</div>';
    });
  }
  el.innerHTML=h;
  el.dataset.events=JSON.stringify(events);
  el.dataset.rsvpMap=JSON.stringify(rsvpMap);
  el.dataset.myRsvps=JSON.stringify(myRsvps);
  el.dataset.creatorNames=JSON.stringify(creatorNames);
}

function openCreateEvent(){
  var el=document.getElementById('villEvents');
  var h='<div style="padding:4px 0"><div style="display:flex;align-items:center;gap:12px;margin-bottom:20px"><button class="btn btn-s" onclick="loadVillageEvents()">\u2190 Back</button><div style="font-family:Fraunces,serif;font-size:18px;font-weight:800">Create Event</div></div>';
  h+='<label class="vill-form-label">Event Type</label>';
  h+='<select id="evType" class="fi" style="margin-bottom:12px"><option value="playdate">\uD83C\uDFAA Playdate</option><option value="support_group">\uD83D\uDCAC Support Group</option><option value="workshop">\uD83D\uDCDA Workshop</option><option value="social_outing">\uD83C\uDFB3 Social Outing</option><option value="advocacy">\u270A Advocacy</option><option value="custom">\uD83D\uDCCC Custom</option></select>';
  h+='<label class="vill-form-label">Title</label>';
  h+='<input id="evTitle" class="fi" placeholder="e.g. Saturday Park Playdate" maxlength="100" style="margin-bottom:12px">';
  h+='<label class="vill-form-label">Description <span style="font-weight:400;color:var(--warm-gray-light)">(optional)</span></label>';
  h+='<textarea id="evDesc" class="fi" rows="3" maxlength="1000" placeholder="What should people know about this event?" style="margin-bottom:12px;resize:none"></textarea>';
  h+='<div style="display:flex;gap:8px;margin-bottom:12px"><div style="flex:1"><label class="vill-form-label">Date</label><input id="evDate" class="fi" type="date"></div><div style="flex:1"><label class="vill-form-label">Start Time</label><input id="evStart" class="fi" type="time"></div><div style="flex:1"><label class="vill-form-label">End Time</label><input id="evEnd" class="fi" type="time"></div></div>';
  h+='<label class="vill-form-label">Location Name</label>';
  h+='<input id="evLocName" class="fi" placeholder="e.g. Ganesha Park" maxlength="100" style="margin-bottom:12px">';
  h+='<label class="vill-form-label">City</label>';
  h+='<input id="evLocCity" class="fi" placeholder="e.g. Pomona" maxlength="100" style="margin-bottom:12px">';
  h+='<label class="vill-form-label">Address <span style="font-weight:400;color:var(--warm-gray-light)">(optional \u2014 only shared with approved attendees)</span></label>';
  h+='<input id="evLocAddr" class="fi" placeholder="Full address" maxlength="200" style="margin-bottom:12px">';
  h+='<div style="display:flex;gap:8px;margin-bottom:12px"><div style="flex:1"><label class="vill-form-label">Max Attendees</label><select id="evMax" class="fi"><option value="">No limit</option><option value="5">5</option><option value="10">10</option><option value="15">15</option><option value="20">20</option><option value="30">30</option></select></div><div style="flex:1"><label class="vill-form-label">Age Range</label><select id="evAgeRange" class="fi"><option value="All Ages">All Ages</option><option value="0-2">0-2</option><option value="3-5">3-5</option><option value="6-9">6-9</option><option value="10-13">10-13</option><option value="14-17">14-17</option></select></div></div>';
  h+='<div style="margin-bottom:12px"><label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="checkbox" id="evChildFriendly" checked> Child-friendly event</label></div>';
  h+='<div style="margin-bottom:16px"><label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="checkbox" id="evApproval"> Require RSVP approval</label></div>';
  h+='<button class="btn btn-p" style="width:100%" onclick="submitEvent()">Create Event</button>';
  h+='</div>';
  el.innerHTML=h;
  // Default date to next Saturday
  var d=new Date();d.setDate(d.getDate()+(6-d.getDay()+7)%7||7);
  document.getElementById('evDate').value=d.toISOString().split('T')[0];
  document.getElementById('evStart').value='10:00';
  document.getElementById('evEnd').value='12:00';
}

async function submitEvent(){
  var title=document.getElementById('evTitle').value.trim();
  var locName=document.getElementById('evLocName').value.trim();
  var locCity=document.getElementById('evLocCity').value.trim();
  var evDate=document.getElementById('evDate').value;
  var evStart=document.getElementById('evStart').value;
  if(!title){showToast('Title is required');return}
  if(!locName||!locCity){showToast('Location name and city are required');return}
  if(!evDate||!evStart){showToast('Date and start time are required');return}

  // Geocode the city using zip lookup to get approximate lat/lng
  var locData=await lookupZip(locCity);

  var evMaxVal=document.getElementById('evMax').value;
  var event={
    creator_id:S.user.id,
    title:title,
    description:document.getElementById('evDesc').value.trim()||null,
    event_type:document.getElementById('evType').value,
    event_date:evDate,
    start_time:evStart,
    end_time:document.getElementById('evEnd').value||null,
    location_name:locName,
    location_address:document.getElementById('evLocAddr').value.trim()||null,
    location_city:locCity,
    location_lat:locData?locData.lat:(villProfile?villProfile.lat:null),
    location_lng:locData?locData.lng:(villProfile?villProfile.lng:null),
    max_attendees:evMaxVal?parseInt(evMaxVal):null,
    age_range:document.getElementById('evAgeRange').value||null,
    child_friendly:document.getElementById('evChildFriendly').checked,
    requires_approval:document.getElementById('evApproval').checked
  };

  try{
    await sb.from('village_events').insert(event);
    showToast('Event created!');
    loadVillageEvents();
  }catch(e){console.error('Event create:',e);showToast('Could not create event')}
}

async function openEventDetail(eventId){
  var el=document.getElementById('villEvents');
  var events=JSON.parse(el.dataset.events||'[]');
  var rsvpMap=JSON.parse(el.dataset.rsvpMap||'{}');
  var myRsvps=JSON.parse(el.dataset.myRsvps||'{}');
  var creatorNames=JSON.parse(el.dataset.creatorNames||'{}');
  var ev=events.find(function(e){return e.id===eventId});
  if(!ev){showToast('Event not found');return}

  var isHost=ev.creator_id===S.user.id;
  var myStatus=myRsvps[eventId]||null;
  var creator=creatorNames[ev.creator_id]||'Someone';
  var emoji=getEventTypeEmoji(ev.event_type);
  var typeLabel=ev.event_type.replace('_',' ').replace(/\b\w/g,function(c){return c.toUpperCase()});
  var dateStr=formatEventDate(ev.event_date,ev.start_time);
  var showAddress=(myStatus==='approved'||isHost)&&ev.location_address;

  // Load attendees
  var rr=await sb.from('village_rsvps').select('user_id,status').eq('event_id',eventId);
  var rsvps=rr.data||[];
  var approved=rsvps.filter(function(r){return r.status==='approved'});
  var pending=rsvps.filter(function(r){return r.status==='pending'});

  // Load attendee names
  var attendeeIds=rsvps.map(function(r){return r.user_id});
  var attendeeNames={};
  if(attendeeIds.length){
    var nr=await sb.from('village_profiles').select('user_id,display_name').in('user_id',attendeeIds);
    (nr.data||[]).forEach(function(n){attendeeNames[n.user_id]=n.display_name});
  }

  var h='<div style="padding:4px 0"><button class="btn btn-s" style="margin-bottom:16px" onclick="loadVillageEvents()">\u2190 Back</button>';
  h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:24px">'+emoji+'</span><span class="vill-type-badge" style="font-size:12px">'+esc(typeLabel)+'</span></div>';
  h+='<div style="font-family:Fraunces,serif;font-size:20px;font-weight:800;margin-bottom:12px">'+esc(ev.title)+'</div>';
  h+='<div style="background:white;border-radius:14px;padding:14px;border:1px solid var(--sand);margin-bottom:12px">';
  h+='<div style="font-size:14px;margin-bottom:6px">\uD83D\uDCC5 '+dateStr+'</div>';
  h+='<div style="font-size:14px;margin-bottom:6px">\uD83D\uDCCD '+esc(ev.location_name)+' \u00b7 '+esc(ev.location_city)+'</div>';
  if(showAddress)h+='<div style="font-size:13px;color:var(--sage-dark);margin-bottom:6px">\uD83C\uDFE0 '+esc(ev.location_address)+'</div>';
  else if(ev.location_address&&!isHost)h+='<div style="font-size:12px;color:var(--warm-gray-light);font-style:italic">Address shared after RSVP approval</div>';
  h+='<div style="font-size:13px;color:var(--warm-gray)">Hosted by '+esc(creator)+'</div>';
  h+='</div>';
  if(ev.description)h+='<div style="font-size:14px;line-height:1.6;color:var(--charcoal);margin-bottom:12px">'+esc(ev.description)+'</div>';

  // RSVP button
  if(!isHost){
    if(!myStatus){
      h+='<button class="btn btn-p" style="width:100%;margin-bottom:16px" onclick="rsvpEvent(\\x27'+eventId+'\\x27)">RSVP</button>';
    } else if(myStatus==='approved'){
      h+='<div style="display:flex;gap:8px;margin-bottom:16px"><div style="flex:1;padding:12px;background:var(--sage-light);border-radius:12px;text-align:center;font-size:14px;font-weight:700;color:var(--sage-dark)">\u2705 You\\x27re going!</div><button class="btn btn-s" style="font-size:12px" onclick="cancelRsvp(\\x27'+eventId+'\\x27)">Cancel RSVP</button></div>';
    } else if(myStatus==='pending'){
      h+='<div style="display:flex;gap:8px;margin-bottom:16px"><div style="flex:1;padding:12px;background:var(--cream);border-radius:12px;text-align:center;font-size:14px;font-weight:600;color:var(--warm-gray)">\u23F3 Waiting for host approval</div><button class="btn btn-s" style="font-size:12px" onclick="cancelRsvp(\\x27'+eventId+'\\x27)">Cancel</button></div>';
    }
  }

  // Attendees
  if(approved.length){
    h+='<div style="font-size:13px;font-weight:700;color:var(--warm-gray);margin-bottom:8px">Going ('+approved.length+')</div>';
    h+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">';
    approved.forEach(function(r){
      var name=attendeeNames[r.user_id]||'Someone';
      h+='<div style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:white;border-radius:10px;border:1px solid var(--sand);font-size:12px"><div style="width:20px;height:20px;border-radius:6px;background:var(--sage-light);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:var(--sage-dark)">'+esc(name[0].toUpperCase())+'</div>'+esc(name)+'</div>';
    });
    h+='</div>';
  }

  // Host controls
  if(isHost){
    if(pending.length){
      h+='<div style="font-size:13px;font-weight:700;color:var(--warm-gray);margin-bottom:8px">Pending Approval ('+pending.length+')</div>';
      pending.forEach(function(r){
        var name=attendeeNames[r.user_id]||'Someone';
        h+='<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:white;border-radius:12px;border:1px solid var(--sand);margin-bottom:6px">';
        h+='<div style="display:flex;align-items:center;gap:8px"><div style="width:28px;height:28px;border-radius:8px;background:var(--cream);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800">'+esc(name[0].toUpperCase())+'</div><span style="font-size:13px;font-weight:600">'+esc(name)+'</span></div>';
        h+='<div style="display:flex;gap:6px"><button class="btn btn-p" style="font-size:11px;padding:6px 12px" onclick="approveRsvp(\\x27'+r.user_id+'\\x27,\\x27'+eventId+'\\x27)">Approve</button><button class="btn btn-s" style="font-size:11px;padding:6px 12px" onclick="declineRsvp(\\x27'+r.user_id+'\\x27,\\x27'+eventId+'\\x27)">Decline</button></div>';
        h+='</div>';
      });
    }
    h+='<div style="display:flex;gap:8px;margin-top:16px"><button class="btn btn-s" style="flex:1;color:var(--terracotta);border-color:var(--terracotta)" onclick="cancelEvent(\\x27'+eventId+'\\x27)">Cancel Event</button></div>';
  }
  h+='</div>';
  el.innerHTML=h;
}

async function rsvpEvent(eventId){
  var events=JSON.parse(document.getElementById('villEvents').dataset.events||'[]');
  var ev=events.find(function(e){return e.id===eventId});
  var status=ev&&ev.requires_approval?'pending':'approved';
  try{
    await sb.from('village_rsvps').upsert({event_id:eventId,user_id:S.user.id,status:status},{onConflict:'event_id,user_id'});
    showToast(status==='approved'?'You\\x27re in!':'RSVP sent \u2014 waiting for approval');
    openEventDetail(eventId);
  }catch(e){console.error('RSVP:',e);showToast('Could not RSVP')}
}

async function cancelRsvp(eventId){
  try{
    await sb.from('village_rsvps').update({status:'cancelled'}).eq('event_id',eventId).eq('user_id',S.user.id);
    showToast('RSVP cancelled');
    openEventDetail(eventId);
  }catch(e){console.error('Cancel RSVP:',e);showToast('Could not cancel')}
}

async function approveRsvp(userId,eventId){
  await sb.from('village_rsvps').update({status:'approved'}).eq('event_id',eventId).eq('user_id',userId);
  showToast('Approved!');
  openEventDetail(eventId);
}

async function declineRsvp(userId,eventId){
  await sb.from('village_rsvps').update({status:'declined'}).eq('event_id',eventId).eq('user_id',userId);
  showToast('Declined');
  openEventDetail(eventId);
}

async function cancelEvent(eventId){
  if(!confirm('Cancel this event? All attendees will see it as cancelled.'))return;
  await sb.from('village_events').update({status:'cancelled'}).eq('id',eventId);
  showToast('Event cancelled');
  loadVillageEvents();
}
```

- [ ] **Step 2: Syntax check**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/app_check.js && node --check /tmp/app_check.js
```

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "feat: add village events — list, create, detail, RSVP, approval, cancellation"
```

---

### Task 9: Integration — Role Visibility + Final Wiring

**Files:**
- Modify: `app.html` — JS section (applyRole tab mapping, ~line 1688)

- [ ] **Step 1: Verify community tab is visible for parents**

The existing `tabMap` at ~line 1688 already includes `community` for parents. No change needed. But verify providers with the caregiver network also see community — currently they don't. The Community tab (now with Nearby/Events) should be visible for parents only in Phase 1. This matches the existing tabMap:

```javascript
parent:['coach','pros','community','track'],
```

No code change needed — just verify this line is still intact.

- [ ] **Step 2: Add "Leave My Village" to the edit profile form**

In the `showVillageOptIn()` function from Task 6, the submit button says "Join My Village". When editing (villProfile exists), we need to show an additional "Leave My Village" button. Update `showVillageOptIn` by adding this check before the closing `</div></div>` of the form:

Find the line in showVillageOptIn that has:
```javascript
h+='<button class="btn btn-p" style="width:100%" onclick="submitVillageProfile()">Join My Village</button>';
```

Replace with:
```javascript
h+='<button class="btn btn-p" style="width:100%" onclick="submitVillageProfile()">'+(villProfile?'Update Profile':'Join My Village')+'</button>';
if(villProfile)h+='<button style="display:block;margin:12px auto 0;background:none;border:none;color:var(--terracotta);font-size:13px;cursor:pointer;font-weight:600" onclick="leaveVillage()">Leave My Village</button>';
```

- [ ] **Step 3: Syntax check**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/app_check.js && node --check /tmp/app_check.js
```

- [ ] **Step 4: Full smoke test**

Open app.html in browser:
1. Log in as testparent@modernvillage.app
2. Go to Community tab — should see Feed/Nearby/Events underline tabs
3. Feed tab — existing forum posts display correctly
4. Nearby tab — shows opt-in form (no village profile yet)
5. Fill out opt-in form, use zip code "91767" (Pomona)
6. Submit — should see "Welcome to My Village!" toast
7. Nearby list loads (likely empty — show invite CTA)
8. Events tab — shows "Create Event" button + empty state
9. Create an event — fill form, submit
10. Event appears in list with correct type badge and date
11. Tap event card — detail view loads with host controls

- [ ] **Step 5: Commit**

```bash
git add app.html
git commit -m "feat: complete My Village Phase 1 — integration, edit/leave profile, smoke tested"
```

---

### Task 10: Final — Push + Update Docs

- [ ] **Step 1: Push all commits**

```bash
git push
```

- [ ] **Step 2: Update ROADMAP.md**

Mark My Village Phase 1 items as complete:
```markdown
**Phase 1 (MVP):**
- [x] `village_profiles` table + opt-in flow (hidden/city/neighborhood visibility)
- [x] Nearby parents list view (distance-sorted, filtered by age/diagnosis/interests)
- [x] Events creation + RSVP + list view (6 event types, approval flow)
- [x] Replace Community tab with hybrid Feed/Nearby/Events sub-tabs
```

- [ ] **Step 3: Update BUGS.md if any issues found during smoke test**

- [ ] **Step 4: Commit docs**

```bash
git add docs/ROADMAP.md docs/BUGS.md
git commit -m "docs: mark My Village Phase 1 as complete"
git push
```
