# Provider Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the BCBA/provider experience — client list, session notes with AI narratives, superbill PDF, billing status, parent shared notes view, and test accounts.

**Architecture:** All UI in `app.html`. New `session_notes` table in Supabase. AI narrative uses existing Claude API through Cloudflare Worker. Superbill uses `window.print()` with print CSS. Test accounts created via Supabase SQL.

**Tech Stack:** Vanilla JS, Supabase (PostgreSQL + RLS), Claude Sonnet 4 via Cloudflare Worker

**Spec:** `docs/superpowers/specs/2026-04-06-provider-dashboard-design.md`

**CRITICAL:** All onclick handlers in dynamically-built HTML strings MUST use `\\x27` (escaped single quote) not bare `'` inside JS strings. Run `node --check` after every task.

---

### Task 1: SQL Migration — session_notes table + RLS

**Files:**
- Create: `supabase/migrations/20260406_provider_dashboard.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- ═══════════════════════════════════════════════════
-- Provider Dashboard Migration
-- 2026-04-06
-- ═══════════════════════════════════════════════════

-- 1. CREATE session_notes table
CREATE TABLE IF NOT EXISTS public.session_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  child_id uuid REFERENCES public.children(id) ON DELETE CASCADE NOT NULL,
  session_date date NOT NULL,
  duration_minutes integer NOT NULL,
  cpt_code text,
  session_type text NOT NULL,
  goals_addressed text[],
  interventions text,
  client_response text,
  next_steps text,
  ai_narrative text,
  shared_with_parent boolean DEFAULT true,
  billing_status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.session_notes ENABLE ROW LEVEL SECURITY;

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

-- Providers delete their own session notes
CREATE POLICY "Providers delete own notes"
  ON public.session_notes FOR DELETE
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

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260406_provider_dashboard.sql
git commit -m "feat: add SQL migration for session_notes table with RLS"
```

**Manual step:** Run in Supabase SQL editor.

---

### Task 2: Test Accounts — Create all 4 role accounts

**Files:**
- Create: `supabase/migrations/20260406_test_accounts.sql`

This SQL creates test accounts through Supabase. It needs to be run AFTER the role system migration.

- [ ] **Step 1: Create test accounts SQL**

NOTE: Test accounts are created via the Supabase Auth API (dashboard or API call), not SQL. The SQL below sets up the profile data and connections. You must first create the accounts in the Supabase Auth dashboard:

1. Go to Supabase Dashboard → Authentication → Users → Create User
2. Create these 4 users with email/password:
   - testparent@modernvillage.app / TestParent123!
   - testprovider@modernvillage.app / TestProvider123!
   - testcaregiver@modernvillage.app / TestCaregiver123!
   - testteacher@modernvillage.app / TestTeacher123!

Then run this SQL to configure their profiles (replace the UUIDs with the actual user IDs from the Auth dashboard):

```sql
-- ═══════════════════════════════════════════════════
-- Test Accounts Setup
-- Run AFTER creating users in Supabase Auth dashboard
-- Replace {PARENT_ID}, {PROVIDER_ID}, {CAREGIVER_ID}, {TEACHER_ID}
-- with actual UUIDs from Auth → Users
-- ═══════════════════════════════════════════════════

-- Update parent profile
UPDATE public.profiles SET
  name = 'Test Parent',
  role = 'parent',
  subscription_status = 'pro'
WHERE email = 'testparent@modernvillage.app';

-- Create test child for parent
INSERT INTO public.children (user_id, name, age, diagnosis, gender)
SELECT id, 'Test Child', '6 yrs', ARRAY['Autism (ASD)', 'ADHD'], 'Male'
FROM public.profiles WHERE email = 'testparent@modernvillage.app'
ON CONFLICT DO NOTHING;

-- Update provider profile
UPDATE public.profiles SET
  name = 'Dr. Test Provider',
  role = 'provider',
  provider_verified = true,
  npi_number = '1234567890',
  license_type = 'BCBA',
  license_state = 'CA',
  license_number = 'BCBA-12345',
  cpt_codes = ARRAY['97151','97153','97155']
WHERE email = 'testprovider@modernvillage.app';

-- Update caregiver profile
UPDATE public.profiles SET
  name = 'Test Caregiver',
  role = 'caregiver'
WHERE email = 'testcaregiver@modernvillage.app';

-- Update teacher profile
UPDATE public.profiles SET
  name = 'Test Teacher',
  role = 'teacher'
WHERE email = 'testteacher@modernvillage.app';

-- Connect provider to test child (clinical access)
INSERT INTO public.child_access (child_id, user_id, role, access_level, granted_by)
SELECT c.id,
  (SELECT id FROM public.profiles WHERE email = 'testprovider@modernvillage.app'),
  'provider', 'clinical',
  (SELECT id FROM public.profiles WHERE email = 'testparent@modernvillage.app')
FROM public.children c
JOIN public.profiles p ON p.id = c.user_id
WHERE p.email = 'testparent@modernvillage.app'
AND c.name = 'Test Child'
ON CONFLICT DO NOTHING;

-- Connect caregiver to test child (daily access)
INSERT INTO public.child_access (child_id, user_id, role, access_level, granted_by)
SELECT c.id,
  (SELECT id FROM public.profiles WHERE email = 'testcaregiver@modernvillage.app'),
  'caregiver', 'daily',
  (SELECT id FROM public.profiles WHERE email = 'testparent@modernvillage.app')
FROM public.children c
JOIN public.profiles p ON p.id = c.user_id
WHERE p.email = 'testparent@modernvillage.app'
AND c.name = 'Test Child'
ON CONFLICT DO NOTHING;

-- Connect teacher to test child (school access)
INSERT INTO public.child_access (child_id, user_id, role, access_level, granted_by)
SELECT c.id,
  (SELECT id FROM public.profiles WHERE email = 'testteacher@modernvillage.app'),
  'teacher', 'school',
  (SELECT id FROM public.profiles WHERE email = 'testparent@modernvillage.app')
FROM public.children c
JOIN public.profiles p ON p.id = c.user_id
WHERE p.email = 'testparent@modernvillage.app'
AND c.name = 'Test Child'
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260406_test_accounts.sql
git commit -m "feat: add test accounts setup SQL for all 4 roles"
```

**Manual steps:** Create users in Supabase Auth dashboard first, then run SQL.

---

### Task 3: Provider Dashboard — Clients Tab HTML + CSS

**Files:**
- Modify: `app.html` (HTML — add Clients tab div + Client Detail overlay; CSS — add provider styles)

- [ ] **Step 1: Add Clients tab HTML**

Find the Track tab div: `<div id="tTrack" class="tab">`. BEFORE it, add:

```html
    <!-- CLIENTS TAB (providers) -->
    <div id="tClients" class="tab">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div><h2 style="font-family:'Fraunces',serif;font-size:24px;font-weight:800">My Clients</h2><p style="color:var(--warm-gray);font-size:14px;margin-top:4px" id="clientCount"></p></div>
      </div>
      <div id="clientList"></div>
    </div>
```

- [ ] **Step 2: Add Clients tab button to bottom nav**

Find the nav buttons. After the Track button (the last `<button class="nb"` before `</div></nav>`), add:

```html
    <button class="nb" data-t="clients" onclick="switchTab('clients')" style="display:none"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9E9790" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><span class="nl">Clients</span></button>
```

- [ ] **Step 3: Add Client Detail overlay page HTML**

After the Care Team Notes overlay (`careNotesPage`), add:

```html
  <!-- CLIENT DETAIL (providers) -->
  <div id="clientDetailPage" class="overlay-page">
    <div class="overlay-hdr">
      <button class="overlay-back" onclick="closeOverlay('clientDetailPage')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D2D2D" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
      <div class="overlay-title" id="clientDetailTitle">Client</div>
    </div>
    <div class="overlay-body">
      <div class="overlay-inner">
        <div id="clientDetailProfile" style="margin-bottom:16px"></div>
        <div id="clientDetailTabs" style="display:flex;gap:4px;background:var(--cream);padding:4px;border-radius:12px;margin-bottom:16px;overflow-x:auto"></div>
        <div id="clientDetailContent"></div>
      </div>
    </div>
  </div>

  <!-- SESSION NOTE FORM (providers) -->
  <div id="sessionNoteFormPage" class="overlay-page">
    <div class="overlay-hdr">
      <button class="overlay-back" onclick="closeOverlay('sessionNoteFormPage')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D2D2D" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
      <div class="overlay-title">New Session Note</div>
    </div>
    <div class="overlay-body">
      <div class="overlay-inner" id="sessionNoteFormContent"></div>
    </div>
  </div>

  <!-- SUPERBILL PRINT VIEW -->
  <div id="superbillPage" class="overlay-page">
    <div class="overlay-hdr no-print">
      <button class="overlay-back" onclick="closeOverlay('superbillPage')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D2D2D" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
      <div class="overlay-title">Superbill</div>
    </div>
    <div class="overlay-body">
      <div class="overlay-inner" id="superbillContent"></div>
    </div>
  </div>
```

- [ ] **Step 4: Add provider CSS**

After the Care Team Notes CSS (after `.note-input:focus`), add:

```css
/* Provider Dashboard */
.client-card{background:white;border-radius:16px;padding:16px 20px;border:1px solid var(--sand);margin-bottom:12px;cursor:pointer;transition:all 0.15s}.client-card:hover{border-color:var(--sage);box-shadow:0 4px 16px rgba(0,0,0,0.05)}
.client-avatar{width:40px;height:40px;border-radius:12px;background:var(--sage-light);color:var(--sage-dark);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex-shrink:0}
.client-stat{font-size:11px;color:var(--warm-gray-light);display:flex;align-items:center;gap:4px}
.client-trend{font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px}
.client-trend.improving{background:#E8F0E8;color:var(--sage-dark)}
.client-trend.increasing{background:var(--terracotta-light);color:var(--terracotta)}
.client-trend.stable{background:var(--cream);color:var(--warm-gray)}
.session-card{background:white;border-radius:14px;padding:14px 16px;border:1px solid var(--sand);margin-bottom:10px}
.session-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;text-transform:uppercase}
.billing-draft{background:var(--cream);color:var(--warm-gray)}
.billing-submitted{background:var(--sky);color:#2a6496}
.billing-paid{background:#E8F0E8;color:var(--sage-dark)}
.billing-denied{background:var(--terracotta-light);color:var(--terracotta)}
.cdtab{padding:8px 14px;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;transition:all 0.15s;border:none;background:none;color:var(--warm-gray)}.cdtab.active{background:var(--sage);color:white}
@media print{.no-print,.overlay-hdr.no-print,.bnav,#chatBar{display:none !important}.overlay-page{position:static !important;display:block !important}.overlay-body{overflow:visible !important}}
```

- [ ] **Step 5: Update switchTab() to handle 'clients'**

Find `switchTab` function. It has a map: `var m={coach:'tCoach',pros:'tPros',community:'tComm',track:'tTrack'};`

Replace with:
```javascript
var m={coach:'tCoach',pros:'tPros',community:'tComm',track:'tTrack',clients:'tClients'};
```

- [ ] **Step 6: Update applyRole() tabMap for providers**

Find `applyRole()`. Change the provider line in tabMap from:
```javascript
    provider:['track'],
```
To:
```javascript
    provider:['clients','track'],
```

- [ ] **Step 7: Verify syntax and commit**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/mv_check.js && node --check /tmp/mv_check.js
git add app.html
git commit -m "feat: add provider dashboard HTML, CSS, Clients tab, overlay pages"
```

---

### Task 4: Provider Dashboard — Client List JavaScript

**Files:**
- Modify: `app.html` (add loadClients, openClientDetail, renderClientDetail functions)

- [ ] **Step 1: Add client list and detail functions**

Find the `openCareNotes` function. BEFORE it, add all the provider dashboard JS:

```javascript
// ═══ PROVIDER DASHBOARD ═══
async function loadClients(){
  if(!S.user||S.role!=='provider')return;
  var el=document.getElementById('clientList');
  el.innerHTML='<div style="text-align:center;padding:20px;color:var(--warm-gray-light)">Loading clients...</div>';
  var accessR=await sb.from('child_access').select('child_id').eq('user_id',S.user.id).eq('access_level','clinical').is('revoked_at',null);
  var childIds=(accessR.data||[]).map(function(a){return a.child_id});
  if(!childIds.length){
    el.innerHTML='<div style="text-align:center;padding:32px;color:var(--warm-gray-light)"><div style="font-size:40px;margin-bottom:8px">\ud83d\udc65</div><div style="font-size:15px;font-weight:600">No clients yet</div><div style="font-size:13px;margin-top:4px">Parents can invite you from their Care Team settings</div></div>';
    document.getElementById('clientCount').textContent='0 clients';
    return;
  }
  var childR=await sb.from('children').select('*').in('id',childIds);
  var children=childR.data||[];
  document.getElementById('clientCount').textContent=children.length+' client'+(children.length!==1?'s':'');

  var h='';
  for(var i=0;i<children.length;i++){
    var c=children[i];
    var dx=c.diagnosis&&c.diagnosis.length?c.diagnosis.join(', '):'';
    var logsR=await sb.from('behavior_logs').select('logged_at,behavior,intensity').eq('user_id',c.user_id).order('logged_at',{ascending:false}).limit(30);
    var logs=logsR.data||[];
    var lastIncident=logs.length?new Date(logs[0].logged_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'No logs';
    var pat=detectPatterns(logs);
    var trend=pat.trend||'new_user';
    var trendLabel=trend==='improving'?'Improving':trend==='increasing'?'Increasing':trend==='stable'?'Stable':'New';

    var sessR=await sb.from('session_notes').select('billing_status').eq('provider_id',S.user.id).eq('child_id',c.id);
    var sessions=sessR.data||[];
    var drafts=sessions.filter(function(s){return s.billing_status==='draft'}).length;
    var submitted=sessions.filter(function(s){return s.billing_status==='submitted'}).length;

    h+='<div class="client-card" onclick="openClientDetail(\\x27'+c.id+'\\x27)">';
    h+='<div style="display:flex;align-items:center;gap:12px"><div class="client-avatar">'+esc((c.name||'?')[0].toUpperCase())+'</div><div style="flex:1"><div style="font-weight:700;font-size:15px">'+esc(c.name)+'</div><div style="font-size:12px;color:var(--warm-gray);margin-top:2px">'+(c.age||'')+(dx?(c.age?' \u00b7 ':'')+dx:'')+'</div></div>';
    if(trend!=='new_user')h+='<span class="client-trend '+trend+'">'+trendLabel+'</span>';
    h+='</div>';
    h+='<div style="display:flex;gap:16px;margin-top:10px">';
    h+='<div class="client-stat">Last: '+lastIncident+'</div>';
    h+='<div class="client-stat">'+sessions.length+' sessions</div>';
    if(drafts)h+='<div class="client-stat"><span class="session-badge billing-draft">'+drafts+' draft</span></div>';
    if(submitted)h+='<div class="client-stat"><span class="session-badge billing-submitted">'+submitted+' pending</span></div>';
    h+='</div></div>';
  }
  el.innerHTML=h;
}

var providerActiveChild=null;
var providerActiveTab='logs';

async function openClientDetail(childId){
  var childR=await sb.from('children').select('*').eq('id',childId).single();
  if(!childR.data)return;
  providerActiveChild=childR.data;
  S.activeChild=providerActiveChild;
  syncActiveChild();

  document.getElementById('clientDetailTitle').textContent=providerActiveChild.name;
  var dx=providerActiveChild.diagnosis&&providerActiveChild.diagnosis.length?providerActiveChild.diagnosis.join(', '):'';
  document.getElementById('clientDetailProfile').innerHTML='<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--sage-light);border-radius:14px"><div class="client-avatar" style="width:48px;height:48px;font-size:20px">'+esc((providerActiveChild.name||'?')[0].toUpperCase())+'</div><div><div style="font-weight:700;font-size:16px">'+esc(providerActiveChild.name)+'</div><div style="font-size:13px;color:var(--warm-gray);margin-top:2px">'+(providerActiveChild.age||'')+(dx?(providerActiveChild.age?' \u00b7 ':'')+dx:'')+'</div></div></div>';

  var tabs=['<button class="cdtab active" onclick="switchClientTab(\\x27logs\\x27)">Behavior Logs</button>','<button class="cdtab" onclick="switchClientTab(\\x27sessions\\x27)">Session Notes</button>','<button class="cdtab" onclick="switchClientTab(\\x27notes\\x27)">Care Notes</button>','<button class="cdtab" onclick="switchClientTab(\\x27insights\\x27)">Insights</button>'];
  document.getElementById('clientDetailTabs').innerHTML=tabs.join('');
  providerActiveTab='logs';

  document.getElementById('clientDetailPage').classList.add('open');
  loadClientTab();
}

function switchClientTab(tab){
  providerActiveTab=tab;
  document.querySelectorAll('.cdtab').forEach(function(t){t.classList.remove('active')});
  event.target.classList.add('active');
  loadClientTab();
}

async function loadClientTab(){
  var el=document.getElementById('clientDetailContent');
  if(!providerActiveChild)return;

  if(providerActiveTab==='logs'){
    el.innerHTML='<div style="text-align:center;padding:20px;color:var(--warm-gray-light)">Loading...</div>';
    var r=await sb.from('behavior_logs').select('*').eq('user_id',providerActiveChild.user_id).order('logged_at',{ascending:false}).limit(30);
    var logs=r.data||[];
    if(!logs.length){el.innerHTML='<div style="text-align:center;padding:32px;color:var(--warm-gray-light)">No behavior logs yet</div>';return}
    var h='';
    for(var i=0;i<logs.length;i++){
      var l=logs[i];
      var d=new Date(l.logged_at);
      var timeStr=d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' at '+d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
      h+='<div class="session-card"><div style="display:flex;justify-content:space-between"><div style="font-weight:700;font-size:14px">'+esc(l.behavior)+'</div><div style="font-size:11px;color:var(--warm-gray-light)">'+timeStr+'</div></div>';
      if(l.trigger_desc)h+='<div style="font-size:13px;color:var(--warm-gray);margin-top:4px"><strong>Trigger:</strong> '+esc(l.trigger_desc)+'</div>';
      if(l.strategy_used)h+='<div style="font-size:13px;color:var(--warm-gray);margin-top:2px"><strong>Strategy:</strong> '+esc(l.strategy_used)+'</div>';
      if(l.duration_minutes)h+='<div style="font-size:13px;color:var(--warm-gray);margin-top:2px"><strong>Duration:</strong> '+l.duration_minutes+' min</div>';
      h+='<div style="display:flex;gap:6px;margin-top:6px">';
      if(l.intensity)h+='<span class="session-badge billing-'+(l.intensity==='severe'?'denied':l.intensity==='moderate'?'submitted':'draft')+'">'+l.intensity+'</span>';
      if(l.outcome)h+='<span class="session-badge billing-'+(l.outcome==='improved'?'paid':l.outcome==='escalated'?'denied':'draft')+'">'+l.outcome.replace('_',' ')+'</span>';
      h+='</div>';
      if(l.logged_by_name)h+='<div style="font-size:11px;color:var(--warm-gray-light);margin-top:4px">Logged by '+esc(l.logged_by_name)+'</div>';
      h+='</div>';
    }
    el.innerHTML=h;

  } else if(providerActiveTab==='sessions'){
    loadSessionNotes();

  } else if(providerActiveTab==='notes'){
    el.innerHTML='<div style="text-align:center;padding:20px;color:var(--warm-gray-light)">Loading...</div>';
    var origChild=S.activeChild;
    S.activeChild=providerActiveChild;
    document.getElementById('clientDetailContent').innerHTML='<div style="margin-bottom:16px"><textarea id="careNoteInputInline" class="note-input" placeholder="Write a note..." rows="2"></textarea><button class="btn btn-p" style="width:100%;margin-top:8px" onclick="postCareNoteInline()">Post Note</button></div><div id="careNotesInline"></div>';
    var r=await sb.from('care_notes').select('*').eq('child_id',providerActiveChild.id).order('created_at',{ascending:false}).limit(50);
    var notes=r.data||[];
    var h='';
    for(var i=0;i<notes.length;i++){
      var n=notes[i];
      var roleColor=n.author_role==='caregiver'?'var(--lavender)':n.author_role==='teacher'?'var(--sky)':n.author_role==='provider'?'var(--sage-light)':'var(--sand)';
      var badgeColor=n.author_role==='caregiver'?'#6B5B8D':n.author_role==='teacher'?'#2a6496':n.author_role==='provider'?'var(--sage-dark)':'var(--warm-gray)';
      h+='<div class="note-card"><div class="note-author"><div class="note-avatar" style="background:'+roleColor+';color:'+badgeColor+'">'+esc((n.author_name||'?')[0].toUpperCase())+'</div><div><div class="note-name">'+esc(n.author_name)+'</div><div style="display:flex;gap:6px;align-items:center;margin-top:2px"><span class="note-role-badge" style="background:'+roleColor+';color:'+badgeColor+'">'+esc(n.author_role)+'</span><span class="note-time">'+renderNoteTime(new Date(n.created_at))+'</span></div></div></div><div class="note-content">'+esc(n.content)+'</div></div>';
    }
    document.getElementById('careNotesInline').innerHTML=h||'<div style="text-align:center;padding:20px;color:var(--warm-gray-light)">No notes yet</div>';

  } else if(providerActiveTab==='insights'){
    el.innerHTML='<div style="text-align:center;padding:20px"><div class="typing"><div class="td"></div><div class="td"></div><div class="td"></div></div><div style="margin-top:12px;font-size:14px;color:var(--warm-gray)">Analyzing patterns...</div></div>';
    var logsR=await sb.from('behavior_logs').select('*').eq('user_id',providerActiveChild.user_id).order('logged_at',{ascending:false}).limit(100);
    var ctx={logs:logsR.data||[],strategies:[],patterns:{},conversationTopics:[],checkins:[]};
    ctx.patterns=detectPatterns(ctx.logs);
    renderInsights(ctx);
  }
}

async function postCareNoteInline(){
  var input=document.getElementById('careNoteInputInline');
  if(!input)return;
  var text=input.value.trim();
  if(!text){showToast('Write something');return}
  await sb.from('care_notes').insert({child_id:providerActiveChild.id,author_id:S.user.id,author_name:S.name||S.user.email.split('@')[0]||'Anonymous',author_role:S.role||'provider',content:text});
  input.value='';showToast('Note posted!');loadClientTab();
}
```

- [ ] **Step 2: Add switchTab handler for clients**

In `switchTab()`, find the section after tab switching that does conditional loading:
```javascript
if(t==='track')loadLogs();if(t==='community')renderCommunityPosts()
```

Add:
```javascript
;if(t==='clients')loadClients()
```

- [ ] **Step 3: Verify syntax and commit**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/mv_check.js && node --check /tmp/mv_check.js
git add app.html
git commit -m "feat: add provider client list and client detail with sub-tabs"
```

---

### Task 5: Session Notes — Form + CRUD

**Files:**
- Modify: `app.html` (add session note functions)

- [ ] **Step 1: Add session note form and list functions**

After the `postCareNoteInline` function, add:

```javascript
// ═══ SESSION NOTES ═══
async function loadSessionNotes(){
  var el=document.getElementById('clientDetailContent');
  el.innerHTML='<div style="text-align:center;padding:20px;color:var(--warm-gray-light)">Loading...</div>';
  if(!providerActiveChild)return;
  var r=await sb.from('session_notes').select('*').eq('provider_id',S.user.id).eq('child_id',providerActiveChild.id).order('session_date',{ascending:false});
  var notes=r.data||[];

  var h='<button class="btn btn-p" style="width:100%;margin-bottom:16px" onclick="openSessionNoteForm()">+ New Session Note</button>';
  if(!notes.length){h+='<div style="text-align:center;padding:20px;color:var(--warm-gray-light)">No session notes yet</div>';el.innerHTML=h;return}

  for(var i=0;i<notes.length;i++){
    var n=notes[i];
    var d=new Date(n.session_date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    var typeLabel=n.session_type.replace(/_/g,' ');
    h+='<div class="session-card">';
    h+='<div style="display:flex;justify-content:space-between;align-items:start"><div><div style="font-weight:700;font-size:14px">'+d+'</div><div style="display:flex;gap:6px;margin-top:4px"><span class="session-badge billing-draft" style="text-transform:capitalize">'+typeLabel+'</span>';
    if(n.cpt_code)h+='<span class="session-badge billing-submitted">'+n.cpt_code+'</span>';
    h+='<span class="session-badge billing-'+n.billing_status+'">'+n.billing_status+'</span>';
    h+='</div></div><div style="font-size:12px;color:var(--warm-gray-light)">'+n.duration_minutes+' min'+(n.shared_with_parent?' \u00b7 Shared':'')+'</div></div>';
    if(n.ai_narrative)h+='<div style="font-size:13px;line-height:1.6;margin-top:10px;color:var(--warm-gray)">'+esc(n.ai_narrative.substring(0,200))+(n.ai_narrative.length>200?'...':'')+'</div>';
    h+='<div style="display:flex;gap:8px;margin-top:10px">';
    h+='<button class="btn btn-s" style="padding:4px 12px;font-size:11px" onclick="event.stopPropagation();openSuperbill(\\x27'+n.id+'\\x27)">Superbill</button>';
    h+='<select style="padding:4px 8px;border-radius:8px;border:1px solid var(--sand);font-size:11px;font-family:inherit" onchange="updateBillingStatus(\\x27'+n.id+'\\x27,this.value)"><option value="draft"'+(n.billing_status==='draft'?' selected':'')+'>Draft</option><option value="submitted"'+(n.billing_status==='submitted'?' selected':'')+'>Submitted</option><option value="paid"'+(n.billing_status==='paid'?' selected':'')+'>Paid</option><option value="denied"'+(n.billing_status==='denied'?' selected':'')+'>Denied</option></select>';
    h+='</div></div>';
  }
  el.innerHTML=h;
}

function openSessionNoteForm(){
  document.getElementById('sessionNoteFormPage').classList.add('open');
  var cptOptions='<option value="">Select CPT...</option>';
  var cpts=S.profile&&S.profile.cpt_codes||['97151','97153','97155'];
  cpts.forEach(function(c){cptOptions+='<option value="'+c+'">'+c+'</option>'});

  var today=new Date().toISOString().split('T')[0];
  document.getElementById('sessionNoteFormContent').innerHTML='<div style="display:flex;flex-direction:column;gap:14px">'+
    '<div><label class="fl">Session Date</label><input id="snDate" class="fi" type="date" value="'+today+'"></div>'+
    '<div style="display:flex;gap:12px"><div style="flex:1"><label class="fl">Duration (min)</label><input id="snDuration" class="fi" type="number" placeholder="60" value="60"></div><div style="flex:1"><label class="fl">CPT Code</label><select id="snCpt" class="fi">'+cptOptions+'</select></div></div>'+
    '<div><label class="fl">Session Type</label><select id="snType" class="fi"><option value="direct_therapy">Direct Therapy</option><option value="assessment">Assessment</option><option value="supervision">Supervision</option><option value="parent_training">Parent Training</option><option value="caregiver_training">Caregiver Training</option></select></div>'+
    '<div><label class="fl">Goals Addressed (one per line)</label><textarea id="snGoals" class="fi" rows="3" style="resize:none" placeholder="Reduce elopement behavior\nIncrease manding frequency"></textarea></div>'+
    '<div><label class="fl">Interventions Used</label><textarea id="snInterventions" class="fi" rows="3" style="resize:none" placeholder="DTT, natural environment training, token economy..."></textarea></div>'+
    '<div><label class="fl">Client Response</label><textarea id="snResponse" class="fi" rows="3" style="resize:none" placeholder="How did the child respond to interventions?"></textarea></div>'+
    '<div><label class="fl">Next Steps</label><textarea id="snNextSteps" class="fi" rows="2" style="resize:none" placeholder="Plan for next session..."></textarea></div>'+
    '<div style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="snShared" checked><label for="snShared" style="font-size:13px">Share with parent</label></div>'+
    '<div id="snNarrativeArea"></div>'+
    '<button class="btn btn-outline" style="width:100%" id="snGenBtn" onclick="generateSessionNarrative()">Generate Clinical Note</button>'+
    '<button class="btn btn-p" style="width:100%" onclick="saveSessionNote()">Save Session Note</button>'+
    '</div>';
}

async function generateSessionNarrative(){
  var btn=document.getElementById('snGenBtn');
  btn.disabled=true;btn.textContent='Generating...';

  var goals=(document.getElementById('snGoals').value||'').trim();
  var interventions=(document.getElementById('snInterventions').value||'').trim();
  var response=(document.getElementById('snResponse').value||'').trim();
  var nextSteps=(document.getElementById('snNextSteps').value||'').trim();
  var sessionType=document.getElementById('snType').value.replace(/_/g,' ');
  var duration=document.getElementById('snDuration').value;

  var childInfo='Child: '+(S.child||providerActiveChild.name);
  if(providerActiveChild.age)childInfo+=', age '+providerActiveChild.age;
  if(providerActiveChild.diagnosis)childInfo+=', dx: '+providerActiveChild.diagnosis.join(', ');

  var logsR=await sb.from('behavior_logs').select('*').eq('user_id',providerActiveChild.user_id).order('logged_at',{ascending:false}).limit(20);
  var recentLogs=(logsR.data||[]).slice(0,5).map(function(l){return l.behavior+(l.trigger_desc?' (trigger: '+l.trigger_desc+')':'')+(l.outcome?' ['+l.outcome+']':'')}).join('; ');

  var prompt='Generate a clinical session note.\n\n'+childInfo+'\nSession type: '+sessionType+'\nDuration: '+duration+' minutes\n';
  if(goals)prompt+='Goals addressed: '+goals+'\n';
  if(interventions)prompt+='Interventions: '+interventions+'\n';
  if(response)prompt+='Client response: '+response+'\n';
  if(nextSteps)prompt+='Next steps: '+nextSteps+'\n';
  if(recentLogs)prompt+='Recent behavioral data: '+recentLogs+'\n';
  prompt+='\nWrite a 150-250 word professional clinical narrative suitable for insurance documentation.';

  try{
    var r=await authFetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:600,system:'You are a clinical documentation assistant for Board Certified Behavior Analysts (BCBAs). Generate professional, insurance-ready session narratives. Use clinical ABA terminology. Write in third person. Include: session context, interventions applied, client response with specific behavioral observations, and clinical recommendations.',messages:[{role:'user',content:prompt}]})});
    var d=await r.json();
    var text='';if(d.content)for(var i=0;i<d.content.length;i++)if(d.content[i].text)text+=d.content[i].text;
    document.getElementById('snNarrativeArea').innerHTML='<div><label class="fl">Clinical Narrative (AI-generated — review and edit)</label><textarea id="snNarrative" class="fi" rows="8" style="resize:vertical;font-size:13px;line-height:1.6">'+esc(text)+'</textarea></div>';
  }catch(e){
    showToast('Error generating narrative');console.error(e);
  }
  btn.disabled=false;btn.textContent='Regenerate Clinical Note';
}

async function saveSessionNote(){
  if(!providerActiveChild){showToast('No client selected');return}
  var date=document.getElementById('snDate').value;
  var duration=parseInt(document.getElementById('snDuration').value);
  if(!date||!duration){showToast('Enter date and duration');return}

  var goalsText=document.getElementById('snGoals').value.trim();
  var goals=goalsText?goalsText.split('\n').map(function(g){return g.trim()}).filter(function(g){return g}):[];
  var narrativeEl=document.getElementById('snNarrative');

  var note={
    provider_id:S.user.id,
    child_id:providerActiveChild.id,
    session_date:date,
    duration_minutes:duration,
    cpt_code:document.getElementById('snCpt').value||null,
    session_type:document.getElementById('snType').value,
    goals_addressed:goals.length?goals:null,
    interventions:document.getElementById('snInterventions').value.trim()||null,
    client_response:document.getElementById('snResponse').value.trim()||null,
    next_steps:document.getElementById('snNextSteps').value.trim()||null,
    ai_narrative:narrativeEl?narrativeEl.value.trim()||null:null,
    shared_with_parent:document.getElementById('snShared').checked,
    billing_status:'draft'
  };

  var r=await sb.from('session_notes').insert(note);
  if(r.error){showToast('Error saving note');console.error(r.error);return}
  showToast('Session note saved!');
  closeOverlay('sessionNoteFormPage');
  loadSessionNotes();
}

async function updateBillingStatus(noteId,status){
  await sb.from('session_notes').update({billing_status:status,updated_at:new Date().toISOString()}).eq('id',noteId);
  showToast('Status updated');
}
```

- [ ] **Step 2: Verify syntax and commit**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/mv_check.js && node --check /tmp/mv_check.js
git add app.html
git commit -m "feat: add session notes — form, AI narrative, CRUD, billing status"
```

---

### Task 6: Superbill Print View

**Files:**
- Modify: `app.html` (add openSuperbill function)

- [ ] **Step 1: Add superbill function**

After `updateBillingStatus`, add:

```javascript
async function openSuperbill(noteId){
  var r=await sb.from('session_notes').select('*').eq('id',noteId).single();
  if(!r.data){showToast('Note not found');return}
  var n=r.data;
  var childR=await sb.from('children').select('*').eq('id',n.child_id).single();
  var child=childR.data||{};
  var d=new Date(n.session_date+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  var units=Math.ceil(n.duration_minutes/15);
  var dx=child.diagnosis&&child.diagnosis.length?child.diagnosis.join(', '):'';

  var h='<div style="max-width:600px;margin:0 auto;font-size:14px;line-height:1.6">';
  h+='<div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid var(--charcoal)"><div style="font-family:Fraunces,serif;font-size:24px;font-weight:800">SUPERBILL</div><div style="font-size:13px;color:var(--warm-gray);margin-top:4px">Modern Village \u2014 Behavioral Health Services</div></div>';

  h+='<div style="display:flex;gap:24px;margin-bottom:20px"><div style="flex:1"><div style="font-weight:700;font-size:12px;text-transform:uppercase;color:var(--warm-gray);margin-bottom:6px">Provider</div><div style="font-weight:700">'+esc(S.name||'')+'</div><div>'+esc(S.profile.license_type||'')+' \u2014 '+(S.profile.license_state||'')+' #'+(S.profile.license_number||'')+'</div><div>NPI: '+(S.profile.npi_number||'')+'</div></div>';
  h+='<div style="flex:1"><div style="font-weight:700;font-size:12px;text-transform:uppercase;color:var(--warm-gray);margin-bottom:6px">Client</div><div style="font-weight:700">'+esc(child.name||'')+'</div><div>DOB: '+(child.birthday||'N/A')+'</div><div>Dx: '+esc(dx||'N/A')+'</div></div></div>';

  h+='<div style="background:var(--cream);border-radius:12px;padding:16px;margin-bottom:20px"><div style="font-weight:700;font-size:12px;text-transform:uppercase;color:var(--warm-gray);margin-bottom:8px">Service Details</div>';
  h+='<div style="display:flex;gap:16px;flex-wrap:wrap"><div><strong>Date:</strong> '+d+'</div><div><strong>CPT:</strong> '+(n.cpt_code||'N/A')+'</div><div><strong>Duration:</strong> '+n.duration_minutes+' min ('+units+' units)</div><div><strong>Type:</strong> '+n.session_type.replace(/_/g,' ')+'</div></div></div>';

  if(n.goals_addressed&&n.goals_addressed.length){
    h+='<div style="margin-bottom:16px"><div style="font-weight:700;font-size:12px;text-transform:uppercase;color:var(--warm-gray);margin-bottom:6px">Goals Addressed</div>';
    n.goals_addressed.forEach(function(g){h+='<div style="padding-left:12px;border-left:2px solid var(--sage);margin-bottom:4px">'+esc(g)+'</div>'});
    h+='</div>';
  }

  if(n.ai_narrative){
    h+='<div style="margin-bottom:16px"><div style="font-weight:700;font-size:12px;text-transform:uppercase;color:var(--warm-gray);margin-bottom:6px">Clinical Narrative</div><div style="white-space:pre-wrap">'+esc(n.ai_narrative)+'</div></div>';
  }

  h+='<div style="margin-top:32px;padding-top:16px;border-top:1px solid var(--sand)"><div style="display:flex;justify-content:space-between"><div><strong>Status:</strong> <span class="session-badge billing-'+n.billing_status+'">'+n.billing_status+'</span></div><div style="font-size:12px;color:var(--warm-gray)">Generated '+new Date().toLocaleDateString()+'</div></div></div>';

  h+='<div style="margin-top:40px;border-top:1px solid var(--charcoal);padding-top:8px;font-size:12px"><div>Provider Signature: ___________________________ Date: ___________</div></div>';

  h+='<button class="btn btn-p no-print" style="width:100%;margin-top:24px" onclick="window.print()">Print Superbill</button>';
  h+='</div>';

  document.getElementById('superbillContent').innerHTML=h;
  document.getElementById('superbillPage').classList.add('open');
}
```

- [ ] **Step 2: Verify syntax and commit**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/mv_check.js && node --check /tmp/mv_check.js
git add app.html
git commit -m "feat: add superbill print view with provider and client info"
```

---

### Task 7: Parent Session Notes View

**Files:**
- Modify: `app.html` (add parent session notes overlay + sidebar item)

- [ ] **Step 1: Add parent session notes overlay HTML**

After the superbill overlay, add:

```html
  <!-- PARENT SESSION NOTES VIEW -->
  <div id="parentSessionNotesPage" class="overlay-page">
    <div class="overlay-hdr">
      <button class="overlay-back" onclick="closeOverlay('parentSessionNotesPage')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D2D2D" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
      <div class="overlay-title">Session Notes</div>
    </div>
    <div class="overlay-body">
      <div class="overlay-inner" id="parentSessionNotesList"></div>
    </div>
  </div>
```

- [ ] **Step 2: Add parent session notes function**

After the `openSuperbill` function, add:

```javascript
async function openParentSessionNotes(){
  if(!S.user){showAuth(true);return}
  closeSb();
  document.getElementById('parentSessionNotesPage').classList.add('open');
  var el=document.getElementById('parentSessionNotesList');
  el.innerHTML='<div style="text-align:center;padding:20px;color:var(--warm-gray-light)">Loading...</div>';
  if(!S.activeChild){el.innerHTML='<div style="text-align:center;padding:32px;color:var(--warm-gray-light)">No child selected</div>';return}
  var r=await sb.from('session_notes').select('*').eq('child_id',S.activeChild.id).eq('shared_with_parent',true).order('session_date',{ascending:false});
  var notes=r.data||[];
  if(!notes.length){el.innerHTML='<div style="text-align:center;padding:32px;color:var(--warm-gray-light)"><div style="font-size:32px;margin-bottom:8px">\ud83d\udccb</div><div style="font-size:14px;font-weight:600">No session notes yet</div><div style="font-size:13px;margin-top:4px">Your provider will share notes after sessions</div></div>';return}
  var h='';
  for(var i=0;i<notes.length;i++){
    var n=notes[i];
    var d=new Date(n.session_date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    h+='<div class="session-card"><div style="font-weight:700;font-size:14px">'+d+'</div><div style="display:flex;gap:6px;margin-top:4px"><span class="session-badge billing-draft" style="text-transform:capitalize">'+n.session_type.replace(/_/g,' ')+'</span>';
    if(n.cpt_code)h+='<span class="session-badge billing-submitted">'+n.cpt_code+'</span>';
    h+='<span class="session-badge" style="background:var(--cream);color:var(--warm-gray)">'+n.duration_minutes+' min</span></div>';
    if(n.goals_addressed&&n.goals_addressed.length){h+='<div style="margin-top:8px;font-size:12px;font-weight:700;color:var(--warm-gray)">Goals:</div>';n.goals_addressed.forEach(function(g){h+='<div style="font-size:13px;padding-left:12px;border-left:2px solid var(--sage);margin-top:2px">'+esc(g)+'</div>'})}
    if(n.ai_narrative)h+='<div style="font-size:13px;line-height:1.6;margin-top:10px;color:var(--warm-gray);white-space:pre-wrap">'+esc(n.ai_narrative)+'</div>';
    h+='</div>';
  }
  el.innerHTML=h;
}
```

- [ ] **Step 3: Verify syntax and commit**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/mv_check.js && node --check /tmp/mv_check.js
git add app.html
git commit -m "feat: add parent session notes read-only view"
```

---

### Task 8: Sidebar + Invite Updates

**Files:**
- Modify: `app.html` (sidebar allItems, invite modal)

- [ ] **Step 1: Update sidebar allItems**

Find the `allItems` array in `renderSb()`. Replace the entire line with:

```javascript
  var allItems=[{label:"My Profile",action:"openProfile()",roles:['parent','provider','caregiver','teacher']},{label:"Saved Strategies",action:"openStrategies()",roles:['parent','caregiver']},{label:"\ud83e\udde0 Child Insights",action:"openInsights()",roles:['parent','provider']},{label:"Progress Dashboard",action:"openProgress()",roles:['parent','provider']},{label:"Routine Builder",action:"openRoutines()",roles:['parent','caregiver']},{label:"IEP Toolkit",action:"openIep()",roles:['parent','teacher']},{label:"Resources",action:"openResources()",roles:['parent','provider','caregiver','teacher']},{label:"Behavior Tracker",action:"switchTab('track')",roles:['parent','caregiver']},{label:"Session Notes",action:"openParentSessionNotes()",roles:['parent']},{label:"Booking History",action:"openBookingHistory()",roles:['parent']},{label:"\ud83c\udf81 Invite Friends \u2014 Get 1 Month Free",action:"openReferral()",highlight:true,roles:['parent']},{label:"Care Team Notes",action:"openCareNotes()",roles:['parent','caregiver','provider','teacher']}];
```

Key changes: added "Session Notes" for parents, changed "Care Team" to "Care Team Notes" with `openCareNotes()` action (fixes bug from sub-project 2), expanded roles.

- [ ] **Step 2: Add provider to invite role options**

Find the invite role select:
```html
<select id="inviteRole" class="fi"><option value="caregiver">Caregiver (grandparent, aide, co-parent)</option><option value="teacher">Teacher</option></select>
```

Replace with:
```html
<select id="inviteRole" class="fi"><option value="caregiver">Caregiver (grandparent, aide, co-parent)</option><option value="teacher">Teacher</option><option value="provider">Provider / BCBA</option></select>
```

- [ ] **Step 3: Update worker invite endpoint to accept provider role**

Find in `worker.js` the line:
```javascript
      if (!['caregiver','teacher'].includes(role)) return new Response('{"error":"Invalid role"}', { status: 400, headers: h });
```

Replace with:
```javascript
      if (!['caregiver','teacher','provider'].includes(role)) return new Response('{"error":"Invalid role"}', { status: 400, headers: h });
```

And update the access level logic. Find:
```javascript
      const accessLevel = invite.role === 'caregiver' ? 'daily' : 'school';
```

Replace with:
```javascript
      const accessLevel = invite.role === 'caregiver' ? 'daily' : invite.role === 'provider' ? 'clinical' : 'school';
```

- [ ] **Step 4: Verify syntax and commit**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/mv_check.js && node --check /tmp/mv_check.js
node --check worker.js
git add app.html worker.js
git commit -m "feat: update sidebar, add provider invite option, fix care team notes link"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Full syntax check**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/mv_check.js && node --check /tmp/mv_check.js
node --check worker.js
```

- [ ] **Step 2: Test as provider**

1. Log in as testprovider@modernvillage.app
2. Should see Clients tab + Track tab
3. Clients tab shows Test Child with stats
4. Tap client → detail view with sub-tabs
5. Behavior Logs tab → read-only log entries
6. Session Notes tab → New Note button
7. Create session note → fill fields → Generate narrative → Save
8. Superbill → print view opens
9. Change billing status → updates
10. Care Notes tab → can read and post

- [ ] **Step 3: Test as parent**

1. Log in as testparent@modernvillage.app
2. Sidebar shows "Session Notes" item
3. Open Session Notes → see provider's shared notes (read-only)
4. Notes NOT shared should not appear

- [ ] **Step 4: Commit**

```bash
git add app.html worker.js
git commit -m "chore: final verification pass for provider dashboard"
```
