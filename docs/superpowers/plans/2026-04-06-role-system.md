# Role System + Multi-User Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add role-based access so parents, providers, caregivers, and teachers can collaborate around a child's behavioral data.

**Architecture:** Single `app.html` serves all roles. Role stored in `profiles.role`, determines which tabs/sidebar items render. `child_access` table tracks who can see which child. Invite flow uses email links with tokens. Provider verification is manual via admin dashboard.

**Tech Stack:** Vanilla JS, Supabase (PostgreSQL + RLS + Auth), Cloudflare Worker (email via Resend), existing admin.html

**Spec:** `docs/superpowers/specs/2026-04-06-role-system-design.md`

**Note:** This project has no test framework. Verification is manual in browser. The app is a single ~3,950-line HTML file using abbreviated variable names (`S` for state, `sb` for Supabase client, `esc()` for HTML escaping). Follow existing code style exactly.

---

### Task 1: SQL Migration — New columns, tables, and RLS policies

**Files:**
- Create: `supabase/migrations/20260406_role_system.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- ═══════════════════════════════════════════════════
-- Role System Migration
-- 2026-04-06
-- ═══════════════════════════════════════════════════

-- 1. ADD role columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'parent',
  ADD COLUMN IF NOT EXISTS npi_number text,
  ADD COLUMN IF NOT EXISTS license_type text,
  ADD COLUMN IF NOT EXISTS license_state text,
  ADD COLUMN IF NOT EXISTS license_number text,
  ADD COLUMN IF NOT EXISTS cpt_codes text[],
  ADD COLUMN IF NOT EXISTS provider_verified boolean DEFAULT false;

-- 2. CREATE child_access table
CREATE TABLE IF NOT EXISTS public.child_access (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id uuid REFERENCES public.children(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL,
  access_level text NOT NULL DEFAULT 'full',
  granted_by uuid REFERENCES public.profiles(id) NOT NULL,
  granted_at timestamptz DEFAULT now(),
  revoked_at timestamptz
);

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

-- 3. CREATE invites table
CREATE TABLE IF NOT EXISTS public.invites (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invited_by uuid REFERENCES public.profiles(id) NOT NULL,
  email text NOT NULL,
  role text NOT NULL,
  child_id uuid REFERENCES public.children(id) ON DELETE CASCADE NOT NULL,
  token text UNIQUE NOT NULL,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES public.profiles(id)
);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own invites"
  ON public.invites FOR SELECT
  USING (auth.uid() = invited_by);

CREATE POLICY "Users create invites"
  ON public.invites FOR INSERT
  WITH CHECK (auth.uid() = invited_by);

CREATE POLICY "Users update own invites"
  ON public.invites FOR UPDATE
  USING (auth.uid() = invited_by);

-- Allow anyone to read invite by token (for accept flow)
CREATE POLICY "Anyone reads invite by token"
  ON public.invites FOR SELECT
  USING (true);

-- 4. ADD connected-user SELECT policies to existing tables

-- behavior_logs: connected users can read
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

-- behavior_logs: caregivers can insert
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

-- saved_strategies: connected users can read
CREATE POLICY "Connected users view strategies"
  ON public.saved_strategies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.child_access ca
      JOIN public.children ch ON ch.id = ca.child_id
      WHERE ch.user_id = saved_strategies.user_id
      AND ca.user_id = auth.uid()
      AND ca.revoked_at IS NULL
      AND ca.access_level IN ('full', 'clinical', 'daily')
    )
  );

-- routines: connected users can read
CREATE POLICY "Connected users view routines"
  ON public.routines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.child_access ca
      WHERE ca.child_id = routines.child_id
      AND ca.user_id = auth.uid()
      AND ca.revoked_at IS NULL
    )
  );

-- 5. AUTO-INSERT child_access for parents when they create a child
CREATE OR REPLACE FUNCTION public.auto_grant_parent_access()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.child_access (child_id, user_id, role, access_level, granted_by)
  VALUES (NEW.id, NEW.user_id, 'parent', 'full', NEW.user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_parent_access ON public.children;
CREATE TRIGGER trg_auto_parent_access
  AFTER INSERT ON public.children
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_grant_parent_access();

-- 6. BACKFILL child_access for existing parent-child relationships
INSERT INTO public.child_access (child_id, user_id, role, access_level, granted_by)
SELECT c.id, c.user_id, 'parent', 'full', c.user_id
FROM public.children c
WHERE NOT EXISTS (
  SELECT 1 FROM public.child_access ca
  WHERE ca.child_id = c.id AND ca.user_id = c.user_id
);
```

- [ ] **Step 2: Verify the file**

Run: `cat supabase/migrations/20260406_role_system.sql | head -5`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260406_role_system.sql
git commit -m "feat: add SQL migration for role system — profiles, child_access, invites, RLS"
```

**Manual step for Jorrel:** Run this SQL in the Supabase SQL editor.

---

### Task 2: Provider Signup Flow — Auth Modal Enhancement

**Files:**
- Modify: `app.html:473-485` (auth modal HTML)
- Modify: `app.html:976-997` (showAuth, toggleAuthMode functions)
- Modify: `app.html:1001-1038` (handleAuth function)

- [ ] **Step 1: Add provider signup fields to auth modal HTML**

Find the auth modal (line 473-485). After the password field (line 480) and before the submit button (line 481), add provider fields:

```html
    <div id="authProviderToggle" class="hidden" style="margin:-4px 0 8px"><a style="font-size:13px;color:var(--sage-dark);cursor:pointer;font-weight:600" onclick="toggleProviderMode()">I'm a Provider / BCBA</a></div>
    <div id="authProviderFields" class="hidden">
      <div style="background:var(--sage-light);border-radius:12px;padding:14px;margin-bottom:12px;font-size:13px;color:var(--sage-dark);font-weight:600">Provider Registration</div>
      <div class="auth-field"><label>NPI Number</label><input id="authNpi" type="text" placeholder="10-digit NPI" maxlength="10"></div>
      <div class="auth-field"><label>License Type</label><select id="authLicType" class="fi" style="padding:10px 12px"><option value="">Select...</option><option>BCBA</option><option>BCaBA</option><option>LPC</option><option>LMFT</option><option>Psychologist</option><option>Other</option></select></div>
      <div style="display:flex;gap:8px" class="auth-field"><div style="flex:1"><label>License State</label><select id="authLicState" class="fi" style="padding:10px 12px"><option value="">State</option><option>AL</option><option>AK</option><option>AZ</option><option>AR</option><option>CA</option><option>CO</option><option>CT</option><option>DE</option><option>FL</option><option>GA</option><option>HI</option><option>ID</option><option>IL</option><option>IN</option><option>IA</option><option>KS</option><option>KY</option><option>LA</option><option>ME</option><option>MD</option><option>MA</option><option>MI</option><option>MN</option><option>MS</option><option>MO</option><option>MT</option><option>NE</option><option>NV</option><option>NH</option><option>NJ</option><option>NM</option><option>NY</option><option>NC</option><option>ND</option><option>OH</option><option>OK</option><option>OR</option><option>PA</option><option>RI</option><option>SC</option><option>SD</option><option>TN</option><option>TX</option><option>UT</option><option>VT</option><option>VA</option><option>WA</option><option>WV</option><option>WI</option><option>WY</option><option>DC</option></select></div><div style="flex:1"><label>License #</label><input id="authLicNum" type="text" placeholder="License number"></div></div>
      <div class="auth-field"><label>CPT Codes (select all that apply)</label><div id="authCptCodes" style="display:flex;flex-wrap:wrap;gap:6px"></div></div>
    </div>
```

- [ ] **Step 2: Add provider toggle function and CPT code rendering**

After the `toggleAuthMode()` function (around line 997), add:

```javascript
var isProviderSignup=false;
function toggleProviderMode(){
  isProviderSignup=!isProviderSignup;
  document.getElementById('authProviderFields').classList.toggle('hidden',!isProviderSignup);
  document.getElementById('authProviderToggle').querySelector('a').textContent=isProviderSignup?'← Back to Parent signup':'I\'m a Provider / BCBA';
  if(isProviderSignup&&!document.getElementById('authCptCodes').innerHTML){
    var codes=['97151','97152','97153','97154','97155','97156','97157','97158'];
    var h='';codes.forEach(function(c){h+='<button type="button" class="chip" onclick="this.classList.toggle(\'on\')" style="font-size:12px;padding:6px 10px">'+c+'</button>'});
    document.getElementById('authCptCodes').innerHTML=h;
  }
}
```

- [ ] **Step 3: Update showAuth to show provider toggle on signup mode**

In `showAuth()` (line 976), add these lines before the closing `}`:

```javascript
  isProviderSignup=false;
  document.getElementById('authProviderFields').classList.add('hidden');
  document.getElementById('authProviderToggle').classList.remove('hidden');
```

In `toggleAuthMode()` (line 988), add after the existing lines:

```javascript
  isProviderSignup=false;
  document.getElementById('authProviderFields').classList.add('hidden');
  document.getElementById('authProviderToggle').classList.toggle('hidden',!isSignup);
```

- [ ] **Step 4: Update handleAuth to save provider fields on signup**

In `handleAuth()`, find the signup block (line 1012-1023). After `S.name=name;` (line 1020), add:

```javascript
      // Save role and provider fields
      var role='parent';
      var providerData={};
      if(isProviderSignup){
        role='provider';
        var npi=document.getElementById('authNpi').value.trim();
        var licType=document.getElementById('authLicType').value;
        var licState=document.getElementById('authLicState').value;
        var licNum=document.getElementById('authLicNum').value.trim();
        var cptArr=[];
        document.querySelectorAll('#authCptCodes .chip.on').forEach(function(c){cptArr.push(c.textContent)});
        if(!npi||npi.length!==10){document.getElementById('authError').textContent='NPI must be 10 digits';document.getElementById('authError').style.display='block';btn.disabled=false;btn.textContent='Create Account';return}
        if(!licType){document.getElementById('authError').textContent='Select license type';document.getElementById('authError').style.display='block';btn.disabled=false;btn.textContent='Create Account';return}
        providerData={npi_number:npi,license_type:licType,license_state:licState||null,license_number:licNum||null,cpt_codes:cptArr.length?cptArr:null};
      }
      await sb.from('profiles').update({name:name||null,email:email,role:role,...providerData}).eq('id',S.user.id);
```

And remove the existing line (line 1019):
```javascript
        await sb.from('profiles').update({name:name||null,email:email}).eq('id',S.user.id);
```

- [ ] **Step 5: Skip onboarding for providers**

After the profile update in the signup block, change the flow:

```javascript
      if(role==='provider'){
        await loadProfile();
        closeAuth();
        enterApp();
      } else {
        closeAuth();
        showOnboarding();
      }
```

Remove the existing lines:
```javascript
      closeAuth();
      showOnboarding();
```

- [ ] **Step 6: Verify in browser**

1. Open app.html, click "Create Account"
2. "I'm a Provider / BCBA" link should appear
3. Click it — provider fields should appear (NPI, license, CPT codes)
4. Fill in provider details, submit
5. Account should be created with `role: 'provider'`
6. Should land in app (no child onboarding)

- [ ] **Step 7: Commit**

```bash
git add app.html
git commit -m "feat: add provider signup flow with NPI, license, and CPT fields"
```

---

### Task 3: Role-Based UI Routing — applyRole Function

**Files:**
- Modify: `app.html:1230-1243` (enterApp function)
- Modify: `app.html:1384-1391` (renderSb function — sidebar items)
- Modify: `app.html:898-903` (bottom nav HTML)
- Modify: `app.html` (add applyRole function)

- [ ] **Step 1: Add applyRole() function**

After the `enterApp()` function (after line 1243), add:

```javascript
function applyRole(){
  S.role=S.profile&&S.profile.role||'parent';

  // Provider pending verification check
  if(S.role==='provider'&&S.profile&&!S.profile.provider_verified){
    document.getElementById('mainScroll').innerHTML='<div style="text-align:center;padding:60px 20px"><div style="font-size:48px;margin-bottom:16px">⏳</div><div style="font-family:Fraunces,serif;font-size:22px;font-weight:800;margin-bottom:8px">Account Under Review</div><div style="font-size:14px;color:var(--warm-gray);line-height:1.6;max-width:340px;margin:0 auto">Your provider account is being reviewed by our clinical team. You\'ll receive an email once approved.</div><div style="margin-top:20px;padding:16px;background:var(--cream);border-radius:14px;font-size:13px;text-align:left"><div style="font-weight:700;margin-bottom:4px">Your Info</div><div>NPI: '+(S.profile.npi_number||'—')+'</div><div>License: '+(S.profile.license_type||'—')+' ('+(S.profile.license_state||'—')+') #'+(S.profile.license_number||'—')+'</div></div></div>';
    document.querySelectorAll('.nb').forEach(function(b){b.style.display='none'});
    document.getElementById('chatBar').style.display='none';
    return;
  }

  // Tab visibility per role
  var tabMap={
    parent:['coach','pros','community','track'],
    provider:['track'],
    caregiver:['track'],
    teacher:[]
  };
  var visibleTabs=tabMap[S.role]||tabMap.parent;
  document.querySelectorAll('.nb').forEach(function(b){
    var t=b.getAttribute('data-t');
    b.style.display=visibleTabs.indexOf(t)>=0?'':'none';
  });

  // Default to first visible tab
  if(visibleTabs.length)switchTab(visibleTabs[0]);

  // Chat bar only for parents
  document.getElementById('chatBar').style.display=S.role==='parent'?'block':'none';
}
```

- [ ] **Step 2: Call applyRole() from enterApp()**

In `enterApp()` (line 1230), add `applyRole();` after `renderChildSwitcher();` (line 1238):

```javascript
  renderChildSwitcher();
  applyRole();
```

- [ ] **Step 3: Update renderSb() for role-based sidebar items**

In `renderSb()` (line 1384), replace the `items` array with role-based items:

```javascript
  var allItems=[
    {label:"My Profile",action:"openProfile()",roles:['parent','provider','caregiver','teacher']},
    {label:"Saved Strategies",action:"openStrategies()",roles:['parent']},
    {label:"🧠 Child Insights",action:"openInsights()",roles:['parent','provider']},
    {label:"Progress Dashboard",action:"openProgress()",roles:['parent','provider']},
    {label:"Routine Builder",action:"openRoutines()",roles:['parent','caregiver']},
    {label:"IEP Toolkit",action:"openIep()",roles:['parent','teacher']},
    {label:"Resources",action:"openResources()",roles:['parent','provider','caregiver','teacher']},
    {label:"Behavior Tracker",action:"switchTab('track')",roles:['parent','caregiver']},
    {label:"Booking History",action:"openBookingHistory()",roles:['parent']},
    {label:"\ud83c\udf81 Invite Friends — Get 1 Month Free",action:"openReferral()",highlight:true,roles:['parent']},
    {label:"Care Team",action:"openCareTeam()",roles:['parent']}
  ];
  var items=allItems.filter(function(item){return !item.roles||item.roles.indexOf(S.role)>=0});
```

- [ ] **Step 4: Verify in browser**

1. Log in as parent — should see all 4 tabs and full sidebar
2. Create a provider account — should see pending verification screen
3. (After verifying in Supabase manually: `UPDATE profiles SET provider_verified=true WHERE email='...'`)
4. Verified provider should see only Track tab and limited sidebar

- [ ] **Step 5: Commit**

```bash
git add app.html
git commit -m "feat: add role-based UI routing — tabs, sidebar, provider pending screen"
```

---

### Task 4: Invite Flow — Parent Sends Invite

**Files:**
- Modify: `app.html` (add Care Team UI to profile/settings page)
- Modify: `app.html` (add invite functions)

- [ ] **Step 1: Add Care Team section to profile children area**

Find `renderProfileChildren()` (line 3610). After each child card's Remove button area (inside the forEach), before the closing `</div>` of the child card, add a "Care Team" section. Replace the entire `renderProfileChildren` function:

```javascript
function renderProfileChildren(){
  var el=document.getElementById('profChildren');
  if(!el)return;
  if(!S.children.length){
    el.innerHTML='<div style="text-align:center;padding:20px;color:var(--warm-gray)"><div style="font-size:24px;margin-bottom:8px">&#128118;</div><div style="font-size:14px">No children added yet</div><button class="btn btn-s" style="margin-top:12px" onclick="openAddChild()">Add Your First Child</button></div>';
    return;
  }
  var h='';
  S.children.forEach(function(c){
    var isActive=S.activeChild&&S.activeChild.id===c.id;
    var dx=c.diagnosis&&c.diagnosis.length?c.diagnosis.join(', '):'';
    var age=c.age||'';
    h+='<div style="padding:16px;background:'+(isActive?'var(--sage-light)':'var(--cream)')+';border-radius:14px;border:1.5px solid '+(isActive?'var(--sage)':'var(--sand)')+';margin-bottom:10px">';
    h+='<div style="display:flex;justify-content:space-between;align-items:center">';
    h+='<div style="display:flex;align-items:center;gap:10px"><div style="width:36px;height:36px;border-radius:10px;background:'+(isActive?'var(--sage)':'var(--sand)')+';color:'+(isActive?'white':'var(--warm-gray)')+';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px">'+esc(c.name?c.name[0].toUpperCase():'?')+'</div><div><div style="font-weight:700;font-size:15px">'+esc(c.name)+(isActive?' <span style="font-size:11px;color:var(--sage-dark);font-weight:600">ACTIVE</span>':'')+'</div><div style="font-size:12px;color:var(--warm-gray);margin-top:1px">'+(age?age:'')+(dx?(age?' \u00b7 ':'')+dx:'')+(c.gender?(age||dx?' \u00b7 ':'')+c.gender:'')+'</div></div></div>';
    h+='<div style="display:flex;gap:4px">';
    if(!isActive) h+='<button class="btn btn-s" style="padding:6px 12px;font-size:11px" onclick="switchChild(\''+c.id+'\')">Set Active</button>';
    h+='<button style="background:none;border:none;cursor:pointer;padding:4px 8px;color:var(--warm-gray);font-size:12px" onclick="editChild(\''+c.id+'\')">Edit</button>';
    if(S.children.length>1) h+='<button style="background:none;border:none;cursor:pointer;padding:4px 8px;color:var(--terracotta);font-size:12px" onclick="removeChild(\''+c.id+'\')">Remove</button>';
    h+='</div></div>';

    // Care Team section (parents only)
    if(S.role==='parent'){
      h+='<div id="careTeam_'+c.id+'" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--sand)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--warm-gray)">Care Team</div><button class="btn btn-s" style="padding:4px 10px;font-size:11px" onclick="showInviteModal(\''+c.id+'\',\''+esc(c.name)+'\')">+ Invite</button></div><div id="careTeamList_'+c.id+'"><div style="font-size:12px;color:var(--warm-gray-light)">Loading...</div></div></div>';
    }

    h+='</div>';
  });
  el.innerHTML=h;

  // Load care team members for each child
  if(S.role==='parent') S.children.forEach(function(c){loadCareTeam(c.id)});
}
```

- [ ] **Step 2: Add loadCareTeam function**

After `renderProfileChildren`, add:

```javascript
async function loadCareTeam(childId){
  var el=document.getElementById('careTeamList_'+childId);
  if(!el)return;
  var r=await sb.from('child_access').select('*').eq('child_id',childId).is('revoked_at',null);
  var members=(r.data||[]).filter(function(m){return m.access_level!=='full'});
  if(!members.length){
    el.innerHTML='<div style="font-size:12px;color:var(--warm-gray-light)">No one else has access yet</div>';
    return;
  }
  var h='';
  for(var i=0;i<members.length;i++){
    var m=members[i];
    // Fetch member profile name
    var pr=await sb.from('profiles').select('name,email').eq('id',m.user_id).single();
    var name=pr.data?pr.data.name||pr.data.email:'Unknown';
    var roleBadge=m.role==='caregiver'?'Caregiver':'Teacher';
    var badgeColor=m.role==='caregiver'?'var(--lavender)':'var(--sky)';
    var d=new Date(m.granted_at).toLocaleDateString('en-US',{month:'short',day:'numeric'});
    h+='<div style="display:flex;align-items:center;gap:8px;padding:6px 0">';
    h+='<div style="width:28px;height:28px;border-radius:8px;background:'+badgeColor+';display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:var(--charcoal)">'+esc(name[0].toUpperCase())+'</div>';
    h+='<div style="flex:1"><div style="font-size:13px;font-weight:600">'+esc(name)+'</div><div style="font-size:11px;color:var(--warm-gray-light)">'+roleBadge+' · Added '+d+'</div></div>';
    h+='<button style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--terracotta);font-weight:600" onclick="revokeAccess(\''+m.id+'\',\''+childId+'\')">Revoke</button>';
    h+='</div>';
  }
  el.innerHTML=h;
}
```

- [ ] **Step 3: Add invite modal HTML**

Before the closing `</div>` of the `#app` div (around line 904), add:

```html
  <!-- INVITE MODAL -->
  <div id="inviteModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px">
    <div style="background:white;border-radius:20px;padding:24px;max-width:380px;width:100%">
      <div style="font-family:Fraunces,serif;font-size:18px;font-weight:800;margin-bottom:4px">Invite to Care Team</div>
      <div style="font-size:13px;color:var(--warm-gray);margin-bottom:16px" id="inviteChildLabel"></div>
      <div style="margin-bottom:12px"><label class="fl">Their email</label><input id="inviteEmail" class="fi" type="email" placeholder="caregiver@email.com"></div>
      <div style="margin-bottom:16px"><label class="fl">Their role</label><select id="inviteRole" class="fi"><option value="caregiver">Caregiver (grandparent, aide, co-parent)</option><option value="teacher">Teacher</option></select></div>
      <input type="hidden" id="inviteChildId">
      <div style="display:flex;gap:8px"><button class="btn btn-p" style="flex:1" id="inviteSendBtn" onclick="sendInvite()">Send Invite</button><button class="btn btn-s" onclick="closeInviteModal()">Cancel</button></div>
      <div id="inviteError" style="display:none;margin-top:8px;font-size:12px;color:var(--terracotta)"></div>
    </div>
  </div>
```

- [ ] **Step 4: Add invite modal functions**

After the `loadCareTeam` function, add:

```javascript
function showInviteModal(childId,childName){
  document.getElementById('inviteChildId').value=childId;
  document.getElementById('inviteChildLabel').textContent='For '+childName;
  document.getElementById('inviteEmail').value='';
  document.getElementById('inviteError').style.display='none';
  document.getElementById('inviteModal').style.display='flex';
}
function closeInviteModal(){document.getElementById('inviteModal').style.display='none'}

async function sendInvite(){
  var email=document.getElementById('inviteEmail').value.trim().toLowerCase();
  var role=document.getElementById('inviteRole').value;
  var childId=document.getElementById('inviteChildId').value;
  var errEl=document.getElementById('inviteError');
  errEl.style.display='none';
  if(!email||!email.includes('@')){errEl.textContent='Enter a valid email';errEl.style.display='block';return}

  var btn=document.getElementById('inviteSendBtn');
  btn.disabled=true;btn.textContent='Sending...';

  try{
    var r=await authFetch(API_URL+'invite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,role:role,child_id:childId})});
    var d=await r.json();
    if(d.error){errEl.textContent=d.error;errEl.style.display='block'}
    else{closeInviteModal();showToast('Invite sent to '+email);loadCareTeam(childId)}
  }catch(e){errEl.textContent='Failed to send invite';errEl.style.display='block'}
  btn.disabled=false;btn.textContent='Send Invite';
}

async function revokeAccess(accessId,childId){
  if(!confirm('Remove this person\'s access?'))return;
  await sb.from('child_access').update({revoked_at:new Date().toISOString()}).eq('id',accessId);
  showToast('Access revoked');
  loadCareTeam(childId);
}
```

- [ ] **Step 5: Verify in browser**

1. Open profile page — each child should show "Care Team" section
2. Click "Invite" — modal should appear
3. Enter email and role, click "Send Invite" (will fail until worker endpoint is built in Task 5)

- [ ] **Step 6: Commit**

```bash
git add app.html
git commit -m "feat: add care team UI, invite modal, and revoke access"
```

---

### Task 5: Worker — Invite and Accept Endpoints

**Files:**
- Modify: `worker.js`

- [ ] **Step 1: Add `/invite` endpoint**

In `worker.js`, find the `// ═══ AI CHAT ═══` comment (line 115). Before it, add:

```javascript
    // ═══ INVITE ═══
    if (url.pathname === '/invite') {
      if (!checkRate(ip, 'email')) return new Response('{"error":"Rate limited"}', { status: 429, headers: h });
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });

      const email = (body.email || '').toLowerCase().trim();
      const role = body.role;
      const childId = body.child_id;
      if (!email || !email.includes('@')) return new Response('{"error":"Invalid email"}', { status: 400, headers: h });
      if (!['caregiver','teacher'].includes(role)) return new Response('{"error":"Invalid role"}', { status: 400, headers: h });
      if (!childId) return new Response('{"error":"Missing child_id"}', { status: 400, headers: h });

      // Verify child belongs to user
      const childCheck = await fetch(env.SUPABASE_URL + '/rest/v1/children?id=eq.' + childId + '&user_id=eq.' + user.id + '&select=id,name', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const children = await childCheck.json();
      if (!children.length) return new Response('{"error":"Child not found"}', { status: 403, headers: h });
      const childName = children[0].name;

      // Get inviter name
      const profCheck = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=name', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const profs = await profCheck.json();
      const inviterName = (profs[0] && profs[0].name) || 'A parent';

      // Create invite token
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

      // Insert invite
      const invRes = await fetch(env.SUPABASE_URL + '/rest/v1/invites', {
        method: 'POST',
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ invited_by: user.id, email, role, child_id: childId, token, status: 'pending' })
      });
      if (!invRes.ok) return new Response('{"error":"Failed to create invite"}', { status: 500, headers: h });

      // Send email
      const roleLabel = role === 'caregiver' ? 'caregiver' : 'teacher';
      const inviteUrl = 'https://modernvillage.app/app.html?invite=' + token;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Modern Village <hello@modernvillage.app>',
          to: email,
          subject: inviterName + ' invited you to ' + childName + '\'s care team',
          html: '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px"><h2 style="color:#2D2D2D">You\'re invited!</h2><p>' + inviterName + ' has invited you to join <strong>' + childName + '\'s</strong> care team on Modern Village as a <strong>' + roleLabel + '</strong>.</p><p>Modern Village is an ABA-powered platform for families with neurodivergent children.</p><a href="' + inviteUrl + '" style="display:inline-block;padding:14px 28px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;margin:16px 0">Accept Invite</a><p style="font-size:13px;color:#9E9790">This invite expires in 7 days.</p></div>'
        })
      });

      return new Response('{"success":true}', { headers: h });
    }

    // ═══ ACCEPT INVITE ═══
    if (url.pathname === '/accept-invite') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });

      const token = body.token;
      if (!token) return new Response('{"error":"Missing token"}', { status: 400, headers: h });

      // Fetch invite
      const invRes = await fetch(env.SUPABASE_URL + '/rest/v1/invites?token=eq.' + encodeURIComponent(token) + '&status=eq.pending&select=*', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const invites = await invRes.json();
      if (!invites.length) return new Response('{"error":"Invite not found or already used"}', { status: 404, headers: h });
      const invite = invites[0];

      // Check expiry
      if (new Date(invite.expires_at) < new Date()) return new Response('{"error":"Invite expired"}', { status: 410, headers: h });

      // Check email matches
      if (invite.email !== user.email.toLowerCase().trim()) return new Response('{"error":"This invite was sent to ' + invite.email + '"}', { status: 403, headers: h });

      // Set user role if not already set to something other than parent
      const accessLevel = invite.role === 'caregiver' ? 'daily' : 'school';
      await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id, {
        method: 'PATCH',
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ role: invite.role })
      });

      // Create child_access
      await fetch(env.SUPABASE_URL + '/rest/v1/child_access', {
        method: 'POST',
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ child_id: invite.child_id, user_id: user.id, role: invite.role, access_level: accessLevel, granted_by: invite.invited_by })
      });

      // Update invite
      await fetch(env.SUPABASE_URL + '/rest/v1/invites?id=eq.' + invite.id, {
        method: 'PATCH',
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ status: 'accepted', accepted_at: new Date().toISOString(), accepted_by: user.id })
      });

      return new Response(JSON.stringify({ success: true, child_id: invite.child_id, role: invite.role }), { headers: h });
    }

```

- [ ] **Step 2: Verify worker.js syntax**

Run: `node --check worker.js`

- [ ] **Step 3: Commit**

```bash
git add worker.js
git commit -m "feat: add invite and accept-invite worker endpoints"
```

**Manual step for Jorrel:** Deploy worker via `wrangler deploy` or Cloudflare dashboard.

---

### Task 6: Invite Accept Flow — Client Side

**Files:**
- Modify: `app.html` (init function — detect `?invite=` param)

- [ ] **Step 1: Add invite detection to app init**

Find the `init()` call (line 1195). Before it, add:

```javascript
async function checkInviteToken(){
  var params=new URLSearchParams(window.location.search);
  var token=params.get('invite');
  if(!token)return false;

  // Wait for auth
  if(!S.user){
    // Store token for after login
    sessionStorage.setItem('mv_invite_token',token);
    return false;
  }

  // Accept the invite
  try{
    var r=await authFetch(API_URL+'accept-invite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token})});
    var d=await r.json();
    if(d.success){
      showToast('You\'ve joined the care team!');
      await loadProfile();
      // Clean URL
      window.history.replaceState({},'',window.location.pathname);
      return true;
    } else {
      showToast(d.error||'Could not accept invite');
    }
  }catch(e){console.error('Invite accept error:',e)}
  window.history.replaceState({},'',window.location.pathname);
  return false;
}
```

- [ ] **Step 2: Call checkInviteToken after login**

In `handleAuth()`, after the login block's `enterApp();` call (line 1031), add:

```javascript
      // Check for pending invite
      var pendingToken=sessionStorage.getItem('mv_invite_token');
      if(pendingToken){
        sessionStorage.removeItem('mv_invite_token');
        await authFetch(API_URL+'accept-invite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:pendingToken})}).then(function(r){return r.json()}).then(function(d){if(d.success){showToast('You\'ve joined the care team!');loadProfile()}});
      }
```

Also add the same check after the signup block finishes (after the provider/parent branching):

```javascript
      var pendingToken=sessionStorage.getItem('mv_invite_token');
      if(pendingToken){
        sessionStorage.removeItem('mv_invite_token');
        await authFetch(API_URL+'accept-invite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:pendingToken})}).then(function(r){return r.json()}).then(function(d){if(d.success){showToast('You\'ve joined the care team!');loadProfile()}});
      }
```

- [ ] **Step 3: Call checkInviteToken from init for already-logged-in users**

In the `init()` function, after the session check succeeds (after `enterApp();` on line 1187-1188), add:

```javascript
          await checkInviteToken();
```

- [ ] **Step 4: Verify in browser**

1. Open `app.html?invite=faketoken` — should show error toast after login
2. Send a real invite, open the link — should accept and show success

- [ ] **Step 5: Commit**

```bash
git add app.html
git commit -m "feat: add client-side invite acceptance flow"
```

---

### Task 7: Admin Dashboard — Verify Providers + User Role Filter + Invite Monitor

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Add Verify Providers section**

Find the admin dashboard tabs/navigation area in `admin.html`. Add a new tab "Providers" and a new section. Add after existing admin sections:

```javascript
async function loadProviders(){
  var r=await sb.from('profiles').select('id,name,email,npi_number,license_type,license_state,license_number,cpt_codes,provider_verified,created_at').eq('role','provider').order('created_at',{ascending:false});
  var providers=r.data||[];
  var unverified=providers.filter(function(p){return !p.provider_verified});
  var verified=providers.filter(function(p){return p.provider_verified});

  var h='<h3>Pending Verification ('+unverified.length+')</h3>';
  if(!unverified.length)h+='<p style="color:#999">No pending providers</p>';
  unverified.forEach(function(p){
    var d=new Date(p.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    h+='<div style="padding:16px;background:#f9f9f9;border-radius:12px;margin-bottom:10px;border-left:4px solid #E8C84A">';
    h+='<div style="display:flex;justify-content:space-between;align-items:start"><div><strong>'+esc(p.name||p.email)+'</strong><div style="font-size:12px;color:#999;margin-top:2px">'+esc(p.email)+' · Applied '+d+'</div></div><div style="display:flex;gap:6px"><button onclick="verifyProvider(\''+p.id+'\')" style="padding:6px 14px;background:#7A9E7E;color:white;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">Approve</button><button onclick="rejectProvider(\''+p.id+'\')" style="padding:6px 14px;background:#C4745A;color:white;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">Reject</button></div></div>';
    h+='<div style="margin-top:8px;font-size:13px"><span style="font-weight:600">NPI:</span> '+(p.npi_number||'—')+' · <span style="font-weight:600">License:</span> '+(p.license_type||'—')+' ('+(p.license_state||'—')+') #'+(p.license_number||'—')+'</div>';
    if(p.cpt_codes&&p.cpt_codes.length)h+='<div style="margin-top:4px;font-size:12px"><span style="font-weight:600">CPT:</span> '+p.cpt_codes.join(', ')+'</div>';
    h+='</div>';
  });

  h+='<h3 style="margin-top:24px">Verified Providers ('+verified.length+')</h3>';
  verified.forEach(function(p){
    h+='<div style="padding:12px;background:#f9f9f9;border-radius:12px;margin-bottom:8px;border-left:4px solid #7A9E7E"><strong>'+esc(p.name||p.email)+'</strong> · '+esc(p.license_type||'')+' · NPI: '+(p.npi_number||'—')+'</div>';
  });

  document.getElementById('providerSection').innerHTML=h;
}

async function verifyProvider(id){
  await sb.from('profiles').update({provider_verified:true}).eq('id',id);
  showToast('Provider approved');
  loadProviders();
}

async function rejectProvider(id){
  if(!confirm('Reject this provider? This will delete their account.'))return;
  await sb.from('profiles').delete().eq('id',id);
  showToast('Provider rejected');
  loadProviders();
}
```

- [ ] **Step 2: Add role filter to user management**

In the existing user list section, add a role filter dropdown and update the user list query to include role:

```javascript
async function loadUsersWithRoles(roleFilter){
  var q=sb.from('profiles').select('id,name,email,role,provider_verified,created_at,subscription_status').order('created_at',{ascending:false}).limit(100);
  if(roleFilter&&roleFilter!=='all')q=q.eq('role',roleFilter);
  var r=await q;
  // render user table with role column...
}
```

- [ ] **Step 3: Add invite monitor section**

```javascript
async function loadInvites(){
  var r=await sb.from('invites').select('*').order('created_at',{ascending:false}).limit(100);
  var invites=r.data||[];
  var h='<h3>Invites ('+invites.length+')</h3>';
  h+='<div style="display:flex;gap:8px;margin-bottom:12px"><button onclick="filterInvites(\'all\')" class="chip on">All</button><button onclick="filterInvites(\'pending\')" class="chip">Pending</button><button onclick="filterInvites(\'accepted\')" class="chip">Accepted</button><button onclick="filterInvites(\'expired\')" class="chip">Expired</button></div>';
  invites.forEach(function(inv){
    var d=new Date(inv.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'});
    var statusColor=inv.status==='accepted'?'#7A9E7E':inv.status==='pending'?'#E8C84A':'#C4745A';
    h+='<div style="padding:10px;border-bottom:1px solid #eee;font-size:13px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+statusColor+';margin-right:6px"></span>'+esc(inv.email)+' as <strong>'+inv.role+'</strong> · '+inv.status+' · '+d+'</div>';
  });
  document.getElementById('inviteSection').innerHTML=h;
}
```

- [ ] **Step 4: Add HTML sections to admin.html body**

Add container divs for the new sections in the admin HTML:

```html
<div id="providerSection"></div>
<div id="inviteSection"></div>
```

- [ ] **Step 5: Verify in browser**

1. Open admin.html, log in with PIN
2. Providers section should show pending/verified providers
3. Approve a provider — should move to verified list
4. Invite monitor should show all invites

- [ ] **Step 6: Commit**

```bash
git add admin.html
git commit -m "feat: add provider verification, role filter, and invite monitor to admin"
```

---

### Task 8: Connected Users — Load Children for Non-Parent Roles

**Files:**
- Modify: `app.html` (loadChildren function, loadProfile function)

- [ ] **Step 1: Update loadChildren to support non-parent roles**

The current `loadChildren()` queries `children WHERE user_id = S.user.id`. For caregivers and teachers, we need to query through `child_access` instead. Replace `loadChildren()`:

```javascript
async function loadChildren(){
  if(!S.user)return;
  S.role=S.profile&&S.profile.role||'parent';

  if(S.role==='parent'){
    // Parents: load their own children (existing behavior)
    var r=await sb.from('children').select('*').eq('user_id',S.user.id).order('created_at',{ascending:true});
    S.children=r.data||[];
    // Legacy migration (existing code)
    if(!S.children.length && S.profile && S.profile.child_name){
      var legacy={user_id:S.user.id,name:S.profile.child_name,age:S.profile.child_age||null,gender:S.profile.child_gender||null,school:S.profile.child_school||null,grade:S.profile.child_grade||null,birthday:S.profile.child_birthday||null};
      if(S.profile.diagnosis){legacy.diagnosis=Array.isArray(S.profile.diagnosis)?S.profile.diagnosis:[S.profile.diagnosis]}
      if(S.profile.goals) legacy.goals=S.profile.goals;
      var ins=await sb.from('children').insert(legacy).select();
      if(ins.data&&ins.data.length){S.children=ins.data;await sb.from('profiles').update({active_child_id:ins.data[0].id}).eq('id',S.user.id)}
    }
  } else {
    // Non-parents: load children they have access to via child_access
    var accessR=await sb.from('child_access').select('child_id').eq('user_id',S.user.id).is('revoked_at',null);
    var childIds=(accessR.data||[]).map(function(a){return a.child_id});
    if(childIds.length){
      var r=await sb.from('children').select('*').in('id',childIds);
      S.children=r.data||[];
    } else {
      S.children=[];
    }
  }

  // Set active child
  var activeId=S.profile&&S.profile.active_child_id;
  if(activeId){
    S.activeChild=S.children.find(function(c){return c.id===activeId})||S.children[0]||null;
  } else {
    S.activeChild=S.children[0]||null;
    if(S.activeChild) sb.from('profiles').update({active_child_id:S.activeChild.id}).eq('id',S.user.id);
  }
  syncActiveChild();
  renderChildSwitcher();
  renderProfileChildren();
}
```

- [ ] **Step 2: Verify in browser**

1. Log in as parent — children load normally
2. Log in as caregiver (after accepting invite) — should see the invited child
3. Log in as provider with no clients — should see empty state

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "feat: load children via child_access for non-parent roles"
```

---

### Task 9: Final Verification + Cleanup

**Files:**
- Review: `app.html`, `admin.html`, `worker.js`

- [ ] **Step 1: Syntax check**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/mv_check.js && node --check /tmp/mv_check.js
node --check worker.js
```

- [ ] **Step 2: Test full flow — Parent**

1. Sign in as parent — full tabs, full sidebar
2. Add a child — child_access auto-created (check in Supabase)
3. Open profile — Care Team section visible
4. Send invite to caregiver email
5. Check invite appears in admin invite monitor

- [ ] **Step 3: Test full flow — Provider**

1. Create provider account with NPI + license
2. See pending verification screen
3. Approve in admin dashboard
4. Refresh — provider sees Track tab only

- [ ] **Step 4: Test full flow — Caregiver**

1. Open invite link from email
2. Create account — role set to caregiver
3. See only Track tab
4. See the invited child's data

- [ ] **Step 5: Test full flow — Revocation**

1. Parent opens profile → Care Team
2. Click Revoke on caregiver
3. Caregiver refreshes — no longer sees child

- [ ] **Step 6: Commit**

```bash
git add app.html admin.html worker.js
git commit -m "chore: final verification pass for role system"
```
