# Caregiver Network Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add caregiver features — care team notes with comments, behavior log attribution, read-only routines/strategies, and sidebar updates.

**Architecture:** All changes in `app.html` plus one SQL migration. Care team notes are a new overlay page with Supabase CRUD. Behavior logs get attribution columns. Routines and strategies get read-only modes gated by `S.role`. No worker changes.

**Tech Stack:** Vanilla JS, Supabase (PostgreSQL + RLS)

**Spec:** `docs/superpowers/specs/2026-04-06-caregiver-network-design.md`

**CRITICAL:** All onclick handlers in dynamically-built HTML strings MUST use `\\x27` (escaped single quote) not bare `'` inside JS strings. Run `node --check` after every task.

---

### Task 1: SQL Migration — care_notes, care_note_comments, behavior_logs columns

**Files:**
- Create: `supabase/migrations/20260406_caregiver_network.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- ═══════════════════════════════════════════════════
-- Caregiver Network Migration
-- 2026-04-06
-- ═══════════════════════════════════════════════════

-- 1. CREATE care_notes table
CREATE TABLE IF NOT EXISTS public.care_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id uuid REFERENCES public.children(id) ON DELETE CASCADE NOT NULL,
  author_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  author_name text NOT NULL DEFAULT 'Anonymous',
  author_role text NOT NULL DEFAULT 'parent',
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.care_notes ENABLE ROW LEVEL SECURITY;

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

-- 2. CREATE care_note_comments table
CREATE TABLE IF NOT EXISTS public.care_note_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id uuid REFERENCES public.care_notes(id) ON DELETE CASCADE NOT NULL,
  author_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  author_name text NOT NULL DEFAULT 'Anonymous',
  author_role text NOT NULL DEFAULT 'parent',
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.care_note_comments ENABLE ROW LEVEL SECURITY;

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

-- 3. ADD attribution columns to behavior_logs
ALTER TABLE public.behavior_logs
  ADD COLUMN IF NOT EXISTS logged_by uuid,
  ADD COLUMN IF NOT EXISTS logged_by_name text;
```

- [ ] **Step 2: Verify and commit**

```bash
git add supabase/migrations/20260406_caregiver_network.sql
git commit -m "feat: add SQL migration for care notes, comments, and behavior log attribution"
```

**Manual step:** Run in Supabase SQL editor.

---

### Task 2: Care Team Notes — CSS + HTML overlay page

**Files:**
- Modify: `app.html` (CSS section + HTML overlay page)

- [ ] **Step 1: Add Care Team Notes CSS**

Find the last CSS rule before `/* Routine Builder */` comment. After it, add:

```css
/* Care Team Notes */
.note-card{background:white;border-radius:16px;padding:16px 20px;border:1px solid var(--sand);margin-bottom:12px}
.note-author{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.note-avatar{width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0}
.note-name{font-weight:700;font-size:14px}
.note-role-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;text-transform:uppercase;letter-spacing:0.5px}
.note-time{font-size:11px;color:var(--warm-gray-light)}
.note-content{font-size:14px;line-height:1.6;margin-bottom:8px}
.note-actions{display:flex;gap:12px;font-size:12px}
.note-action{background:none;border:none;cursor:pointer;color:var(--warm-gray-light);font-weight:600;font-size:12px;padding:0}.note-action:hover{color:var(--sage-dark)}
.note-comments{margin-left:20px;padding-left:16px;border-left:2px solid var(--sand);margin-top:8px}
.note-comment{padding:8px 0}
.note-comment-author{display:flex;align-items:center;gap:8px;margin-bottom:4px}
.note-comment-avatar{width:24px;height:24px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;flex-shrink:0}
.note-input{width:100%;padding:14px 18px;border:2px solid var(--sand);border-radius:14px;font-size:14px;font-family:DM Sans,sans-serif;resize:none;min-height:60px}.note-input:focus{border-color:var(--sage);outline:none}
```

- [ ] **Step 2: Add Care Team Notes overlay page HTML**

Find the strategies overlay page (`id="strategiesPage"`). BEFORE it, add:

```html
  <!-- CARE TEAM NOTES -->
  <div id="careNotesPage" class="overlay-page">
    <div class="overlay-hdr">
      <button class="overlay-back" onclick="closeOverlay('careNotesPage')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D2D2D" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
      <div class="overlay-title">Care Team Notes</div>
    </div>
    <div class="overlay-body">
      <div class="overlay-inner">
        <div id="careNotesChildName" style="font-size:13px;color:var(--warm-gray);margin-bottom:12px"></div>
        <div style="margin-bottom:20px">
          <textarea id="careNoteInput" class="note-input" placeholder="Write a note for the care team..." rows="2"></textarea>
          <button class="btn btn-p" style="width:100%;margin-top:8px" id="careNoteSubmitBtn" onclick="postCareNote()">Post Note</button>
        </div>
        <div id="careNotesList"></div>
      </div>
    </div>
  </div>
```

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "feat: add care team notes CSS and HTML overlay page"
```

---

### Task 3: Care Team Notes — JavaScript functions

**Files:**
- Modify: `app.html` (add JS functions)

- [ ] **Step 1: Add care notes functions**

Find the `openCareTeam` function (line ~3830: `function openCareTeam(){openProfile()}`). Replace it and add the full notes system after it:

```javascript
function openCareNotes(){
  if(!S.user){showAuth(true);return}
  closeSb();
  document.getElementById('careNotesPage').classList.add('open');
  var childName=S.activeChild?S.activeChild.name:'';
  document.getElementById('careNotesChildName').textContent=childName?'Notes for '+childName:'Care Team Notes';
  loadCareNotes();
}

async function loadCareNotes(){
  if(!S.user||!S.activeChild)return;
  var el=document.getElementById('careNotesList');
  el.innerHTML='<div style="text-align:center;padding:20px;color:var(--warm-gray-light)">Loading...</div>';
  var r=await sb.from('care_notes').select('*').eq('child_id',S.activeChild.id).order('created_at',{ascending:false}).limit(50);
  var notes=r.data||[];
  if(!notes.length){
    el.innerHTML='<div style="text-align:center;padding:32px;color:var(--warm-gray-light)"><div style="font-size:32px;margin-bottom:8px">\ud83d\udcdd</div><div style="font-size:14px;font-weight:600">No notes yet</div><div style="font-size:13px;margin-top:4px">Write the first note for the care team</div></div>';
    return;
  }
  var h='';
  for(var i=0;i<notes.length;i++){
    var n=notes[i];
    var roleColor=n.author_role==='caregiver'?'var(--lavender)':n.author_role==='teacher'?'var(--sky)':n.author_role==='provider'?'var(--sage-light)':'var(--sand)';
    var badgeColor=n.author_role==='caregiver'?'#6B5B8D':n.author_role==='teacher'?'#2a6496':n.author_role==='provider'?'var(--sage-dark)':'var(--warm-gray)';
    var timeStr=renderNoteTime(new Date(n.created_at));
    h+='<div class="note-card">';
    h+='<div class="note-author"><div class="note-avatar" style="background:'+roleColor+';color:'+badgeColor+'">'+esc((n.author_name||'?')[0].toUpperCase())+'</div><div><div class="note-name">'+esc(n.author_name)+'</div><div style="display:flex;gap:6px;align-items:center;margin-top:2px"><span class="note-role-badge" style="background:'+roleColor+';color:'+badgeColor+'">'+esc(n.author_role)+'</span><span class="note-time">'+timeStr+'</span></div></div></div>';
    h+='<div class="note-content">'+esc(n.content)+'</div>';
    h+='<div class="note-actions"><button class="note-action" onclick="toggleNoteComments(\\x27'+n.id+'\\x27)">Reply</button></div>';
    h+='<div id="noteComments_'+n.id+'" class="note-comments hidden"></div>';
    h+='</div>';
  }
  el.innerHTML=h;
}

function renderNoteTime(date){
  var now=new Date(),diff=now-date,mins=Math.floor(diff/60000),hrs=Math.floor(diff/3600000),days=Math.floor(diff/86400000);
  if(mins<1)return 'Just now';
  if(mins<60)return mins+'m ago';
  if(hrs<24)return hrs+'h ago';
  if(days<7)return days+'d ago';
  return date.toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

async function postCareNote(){
  if(!S.user||!S.activeChild)return;
  var input=document.getElementById('careNoteInput');
  var text=input.value.trim();
  if(!text){showToast('Write something');return}
  var btn=document.getElementById('careNoteSubmitBtn');
  btn.disabled=true;btn.textContent='Posting...';
  var r=await sb.from('care_notes').insert({
    child_id:S.activeChild.id,
    author_id:S.user.id,
    author_name:S.name||S.user.email.split('@')[0]||'Anonymous',
    author_role:S.role||'parent',
    content:text
  });
  if(r.error){showToast('Error posting note');console.error(r.error)}
  else{input.value='';showToast('Note posted!');loadCareNotes()}
  btn.disabled=false;btn.textContent='Post Note';
}

async function toggleNoteComments(noteId){
  var el=document.getElementById('noteComments_'+noteId);
  if(!el)return;
  if(!el.classList.contains('hidden')){el.classList.add('hidden');return}
  el.classList.remove('hidden');
  el.innerHTML='<div style="font-size:12px;color:var(--warm-gray-light);padding:4px 0">Loading...</div>';
  var r=await sb.from('care_note_comments').select('*').eq('note_id',noteId).order('created_at',{ascending:true});
  var comments=r.data||[];
  var h='';
  for(var i=0;i<comments.length;i++){
    var c=comments[i];
    var roleColor=c.author_role==='caregiver'?'var(--lavender)':c.author_role==='teacher'?'var(--sky)':c.author_role==='provider'?'var(--sage-light)':'var(--sand)';
    var badgeColor=c.author_role==='caregiver'?'#6B5B8D':c.author_role==='teacher'?'#2a6496':c.author_role==='provider'?'var(--sage-dark)':'var(--warm-gray)';
    h+='<div class="note-comment"><div class="note-comment-author"><div class="note-comment-avatar" style="background:'+roleColor+';color:'+badgeColor+'">'+esc((c.author_name||'?')[0].toUpperCase())+'</div><div><span style="font-weight:600;font-size:13px">'+esc(c.author_name)+'</span> <span class="note-role-badge" style="background:'+roleColor+';color:'+badgeColor+';font-size:9px">'+esc(c.author_role)+'</span> <span class="note-time">'+renderNoteTime(new Date(c.created_at))+'</span></div></div><div style="font-size:13px;line-height:1.5;margin-left:32px">'+esc(c.content)+'</div></div>';
  }
  h+='<div style="margin-top:8px;display:flex;gap:8px"><input class="fi" id="noteReply_'+noteId+'" placeholder="Write a reply..." style="flex:1;padding:8px 12px;font-size:13px"><button class="btn btn-s" style="padding:6px 14px;font-size:12px" onclick="postNoteComment(\\x27'+noteId+'\\x27)">Reply</button></div>';
  el.innerHTML=h;
}

async function postNoteComment(noteId){
  var input=document.getElementById('noteReply_'+noteId);
  if(!input)return;
  var text=input.value.trim();
  if(!text){showToast('Write something');return}
  var r=await sb.from('care_note_comments').insert({
    note_id:noteId,
    author_id:S.user.id,
    author_name:S.name||S.user.email.split('@')[0]||'Anonymous',
    author_role:S.role||'parent',
    content:text
  });
  if(r.error){showToast('Error posting reply');console.error(r.error)}
  else{showToast('Reply posted!');toggleNoteComments(noteId);toggleNoteComments(noteId)}
}
```

NOTE: The `\\x27` in onclick handlers produces `\'` in the output HTML — the correct escaped single quote for JS strings. Do NOT use bare single quotes.

- [ ] **Step 2: Verify JS syntax**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/mv_check.js && node --check /tmp/mv_check.js
```

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "feat: add care team notes JS — CRUD, comments, relative timestamps"
```

---

### Task 4: Behavior Log Attribution

**Files:**
- Modify: `app.html` (logBehavior function ~line 2298, loadLogs function ~line 2336)

- [ ] **Step 1: Update logBehavior() to include attribution**

Find `logBehavior()` (line ~2298). In the `log` object construction, after the `notes` line, add two more fields:

After:
```javascript
    notes: document.getElementById('trNotes').value.trim()||null
```

Add:
```javascript
    ,logged_by: S.role!=='parent' ? S.user.id : null
    ,logged_by_name: S.role!=='parent' ? (S.name||S.user.email.split('@')[0]) : null
```

- [ ] **Step 2: Update loadLogs() to show attribution**

Find `loadLogs()` (line ~2336). In the log card rendering, after the tags div (`h+='<div class="log-card-tags">';...`), before the closing `</div>` of the card, add an attribution line.

Find the line:
```javascript
    h+='</div></div>';
```
at the end of the log card loop (after the tags). Replace with:

```javascript
    h+='</div>';
    if(l.logged_by_name)h+='<div style="font-size:11px;color:var(--warm-gray-light);margin-top:6px;display:flex;align-items:center;gap:4px"><span style="width:16px;height:16px;border-radius:5px;background:var(--lavender);display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;color:#6B5B8D">'+esc(l.logged_by_name[0].toUpperCase())+'</span>Logged by '+esc(l.logged_by_name)+'</div>';
    h+='</div>';
```

- [ ] **Step 3: Update loadLogs() query for caregivers**

The current query is:
```javascript
  var r = await sb.from('behavior_logs').select('*').eq('user_id',S.user.id).order('logged_at',{ascending:false}).limit(20);
```

For caregivers, they need to see logs for the connected child's parent. Replace that line with:

```javascript
  var q;
  if(S.role==='parent'){
    q=sb.from('behavior_logs').select('*').eq('user_id',S.user.id);
  } else if(S.activeChild){
    q=sb.from('behavior_logs').select('*').eq('user_id',S.activeChild.user_id);
  } else {
    document.getElementById('trackLogs').innerHTML='<div class="log-empty"><div class="log-empty-icon">\ud83d\udcdd</div><div style="font-size:15px;font-weight:600;margin-bottom:4px">No child connected</div></div>';
    return;
  }
  var r=await q.order('logged_at',{ascending:false}).limit(20);
```

NOTE: `S.activeChild.user_id` is the parent's user ID (the child's owner). The RLS policy `"Connected users view child logs"` from sub-project 1 allows this query.

- [ ] **Step 4: Verify syntax and commit**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/mv_check.js && node --check /tmp/mv_check.js
git add app.html
git commit -m "feat: add behavior log attribution and caregiver log viewing"
```

---

### Task 5: Routine Builder — Read-Only Mode for Caregivers

**Files:**
- Modify: `app.html` (CSS + openRoutines function)

- [ ] **Step 1: Add read-only CSS**

After the existing routine CSS (after `.routine-preview-arrow`), add:

```css
.routine-readonly .routine-templates,.routine-readonly #routineEditor,.routine-readonly #stepForm,.routine-readonly #aiRoutineForm,.routine-readonly #routineChildSelector,.routine-readonly [onclick*="saveRoutine"],.routine-readonly [onclick*="showPreview"]{display:none !important}
```

- [ ] **Step 2: Update openRoutines() for read-only mode**

Find `openRoutines()` (line ~3183). At the START of the function, after `closeSb();`, add:

```javascript
  var isReadonly=S.role==='caregiver'||S.role==='teacher';
  document.getElementById('routinePage').classList.toggle('routine-readonly',isReadonly);
  if(isReadonly){
    document.getElementById('routinePage').classList.add('open');
    loadSavedRoutines2();
    return;
  }
```

This short-circuits for caregivers: shows only the saved routines list (no editor, no templates, no AI suggest).

- [ ] **Step 3: Verify syntax and commit**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/mv_check.js && node --check /tmp/mv_check.js
git add app.html
git commit -m "feat: add routine builder read-only mode for caregivers"
```

---

### Task 6: Saved Strategies — Read-Only Access for Caregivers

**Files:**
- Modify: `app.html` (loadSavedStrategies function)

- [ ] **Step 1: Update loadSavedStrategies() to query via child_access for caregivers**

Find `loadSavedStrategies()` (line ~2369). Replace the query line:

```javascript
  var r = await sb.from('saved_strategies').select('*').eq('user_id',S.user.id).order('created_at',{ascending:false});
```

With:

```javascript
  var stratUserId=S.user.id;
  if(S.role!=='parent'&&S.activeChild){stratUserId=S.activeChild.user_id}
  var r = await sb.from('saved_strategies').select('*').eq('user_id',stratUserId).order('created_at',{ascending:false});
```

- [ ] **Step 2: Hide delete buttons for non-parents**

In the strategy card rendering, find the delete button line:

```javascript
    h+='<button class="strat-delete" onclick="deleteStrategy(\''+s.id+'\')">Remove</button></div>';
```

Replace with:

```javascript
    if(S.role==='parent')h+='<button class="strat-delete" onclick="deleteStrategy(\\x27'+s.id+'\\x27)">Remove</button>';
    h+='</div>';
```

NOTE: Also fix the existing unescaped quotes in the original delete button onclick — change `\'` to `\\x27`.

- [ ] **Step 3: Verify syntax and commit**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/mv_check.js && node --check /tmp/mv_check.js
git add app.html
git commit -m "feat: add read-only strategy access for caregivers"
```

---

### Task 7: Sidebar Updates

**Files:**
- Modify: `app.html` (renderSb allItems array)

- [ ] **Step 1: Update sidebar items**

Find the `allItems` array in `renderSb()` (line ~1518). Make these changes:

1. Change the "Saved Strategies" item roles from `['parent']` to `['parent','caregiver']`
2. Change the "Care Team" item: rename label to "Care Team Notes", change action from `openCareTeam()` to `openCareNotes()`, and add roles `['parent','caregiver','provider','teacher']`

The updated allItems line should be:

```javascript
  var allItems=[{label:"My Profile",action:"openProfile()",roles:['parent','provider','caregiver','teacher']},{label:"Saved Strategies",action:"openStrategies()",roles:['parent','caregiver']},{label:"\ud83e\udde0 Child Insights",action:"openInsights()",roles:['parent','provider']},{label:"Progress Dashboard",action:"openProgress()",roles:['parent','provider']},{label:"Routine Builder",action:"openRoutines()",roles:['parent','caregiver']},{label:"IEP Toolkit",action:"openIep()",roles:['parent','teacher']},{label:"Resources",action:"openResources()",roles:['parent','provider','caregiver','teacher']},{label:"Behavior Tracker",action:"switchTab('track')",roles:['parent','caregiver']},{label:"Booking History",action:"openBookingHistory()",roles:['parent']},{label:"\ud83c\udf81 Invite Friends \u2014 Get 1 Month Free",action:"openReferral()",highlight:true,roles:['parent']},{label:"Care Team Notes",action:"openCareNotes()",roles:['parent','caregiver','provider','teacher']}];
```

- [ ] **Step 2: Remove the old openCareTeam stub**

Find and delete the line:
```javascript
function openCareTeam(){openProfile()}
```

It's no longer needed since we replaced it with `openCareNotes()`.

- [ ] **Step 3: Verify syntax and commit**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/mv_check.js && node --check /tmp/mv_check.js
git add app.html
git commit -m "feat: update sidebar for caregiver access — notes, strategies, routines"
```

---

### Task 8: Final Verification

**Files:**
- Review: `app.html`

- [ ] **Step 1: Full syntax check**

```bash
sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d' > /tmp/mv_check.js && node --check /tmp/mv_check.js
```

- [ ] **Step 2: Test as parent**

1. Log in as parent — full sidebar, all features work
2. Open "Care Team Notes" — should show empty state
3. Post a note — should appear in timeline
4. Reply to note — comment should appear
5. Log a behavior — no attribution badge (parent is default)
6. Routines — full editor access

- [ ] **Step 3: Test as caregiver**

1. Log in as caregiver account
2. Should see only Track tab
3. Sidebar: My Profile, Saved Strategies, Routine Builder, Resources, Behavior Tracker, Care Team Notes
4. Open Care Team Notes — see parent's notes, can post and reply
5. Open Behavior Tracker — see parent's logs, can log new behavior with attribution
6. Open Routines — read-only, sees saved routines only
7. Open Saved Strategies — sees parent's strategies, no delete button

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "chore: final verification pass for caregiver network"
```
