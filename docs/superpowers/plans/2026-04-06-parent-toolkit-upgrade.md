# Parent Toolkit Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix community comments, upgrade routine builder to Supabase with AI generation, and add IEP PDF upload & analysis.

**Architecture:** All changes are in `app.html` (single-file app). One SQL migration for DB changes. No worker changes needed. pdf.js loaded from jsdelivr CDN (already in CSP allowlist).

**Tech Stack:** Vanilla JS, Supabase, Cloudflare Worker (Claude Sonnet 4), pdf.js 3.x

**Spec:** `docs/superpowers/specs/2026-04-06-parent-toolkit-upgrade-design.md`

**Note:** This project has no test framework. Verification is manual — test in browser after each task. The app is a single ~3,500-line HTML file using abbreviated variable names (e.g., `S` for state, `sb` for Supabase client, `esc()` for HTML escaping). Follow existing code style exactly.

---

### Task 1: SQL Migration — Community Comments Fix + Routines Table

**Files:**
- Create: `supabase/migrations/20260406_parent_toolkit_upgrade.sql`

This SQL must be run in the Supabase SQL editor. We create the file for version control.

- [ ] **Step 1: Create the migration file**

```sql
-- ═══════════════════════════════════════════════════
-- Parent Toolkit Upgrade Migration
-- 2026-04-06
-- ═══════════════════════════════════════════════════

-- 1. FIX community_comments — add missing columns
ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS author_name text DEFAULT 'Anonymous',
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES public.community_comments(id),
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS flagged_words text[];

-- Migrate data from old 'text' column to new 'content' column
UPDATE public.community_comments
  SET content = text
  WHERE content IS NULL AND text IS NOT NULL;

-- Recreate RLS policies for community_comments
DROP POLICY IF EXISTS "Anyone views comments" ON public.community_comments;
DROP POLICY IF EXISTS "Users create own comments" ON public.community_comments;
DROP POLICY IF EXISTS "Users update own comments" ON public.community_comments;

CREATE POLICY "Anyone views comments"
  ON public.community_comments FOR SELECT USING (true);
CREATE POLICY "Users create own comments"
  ON public.community_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own comments"
  ON public.community_comments FOR UPDATE USING (auth.uid() = user_id);

-- 2. CREATE routines table
CREATE TABLE IF NOT EXISTS public.routines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  child_id uuid REFERENCES public.children(id) ON DELETE SET NULL,
  title text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]',
  source text DEFAULT 'manual',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own routines"
  ON public.routines FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own routines"
  ON public.routines FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own routines"
  ON public.routines FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own routines"
  ON public.routines FOR DELETE USING (auth.uid() = user_id);
```

- [ ] **Step 2: Verify the file was created correctly**

Run: `cat supabase/migrations/20260406_parent_toolkit_upgrade.sql`

Expected: The complete SQL migration with both community_comments fixes and routines table creation.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260406_parent_toolkit_upgrade.sql
git commit -m "feat: add SQL migration for community comments fix + routines table"
```

**Manual step for Jorrel:** Copy the SQL and run it in the Supabase SQL editor at `https://supabase.com/dashboard/project/efuxqrvdkrievbpljlaf/sql`.

---

### Task 2: Routine Builder — Replace localStorage with Supabase CRUD

**Files:**
- Modify: `app.html:2909-2965` (saveRoutine, loadSavedRoutines2, loadSavedRoutine, deleteSavedRoutine)
- Modify: `app.html:2808-2814` (openRoutines)

All four localStorage-based functions get replaced with Supabase equivalents. The `routineSteps` array format stays the same.

- [ ] **Step 1: Replace `saveRoutine()` (line 2909)**

Replace the existing `saveRoutine` function:

```javascript
async function saveRoutine(){
  if(!routineSteps.length){showToast('Add steps first');return}
  if(!S.user){showToast('Sign in to save routines');return}
  var title=document.getElementById('routineTitle').value.trim()||'My Routine';
  var childId=(S.activeChild&&S.activeChild.id)||null;
  var steps=routineSteps.map(function(s){return{icon:s.icon,name:s.name,dur:s.dur,tip:s.tip||null}});

  var r=await sb.from('routines').insert({
    user_id:S.user.id,
    child_id:childId,
    title:title,
    steps:steps,
    source:routineSource||'manual'
  }).select();

  if(r.error){showToast('Error saving routine');console.error(r.error);return}
  showToast('Routine saved!');
  routineSource='manual';
  loadSavedRoutines2();
}
```

- [ ] **Step 2: Replace `loadSavedRoutines2()` (line 2923)**

Replace the existing `loadSavedRoutines2` function:

```javascript
async function loadSavedRoutines2(){
  if(!S.user){
    document.getElementById('savedRoutines').innerHTML='<div class="routine-empty"><div class="routine-empty-icon">📋</div><div style="font-size:14px;font-weight:600">Sign in to save routines</div></div>';
    return;
  }
  var q=sb.from('routines').select('*').eq('user_id',S.user.id).order('created_at',{ascending:false});
  var childId=document.getElementById('routineChildFilter');
  if(childId&&childId.value)q=q.eq('child_id',childId.value);
  var r=await q;
  var saved=r.data||[];
  var el=document.getElementById('savedRoutines');
  if(!saved.length){
    el.innerHTML='<div class="routine-empty"><div class="routine-empty-icon">📋</div><div style="font-size:14px;font-weight:600">No saved routines yet</div><div style="font-size:13px;margin-top:4px">Build your first routine above!</div></div>';
    return;
  }
  var h='';
  for(var i=0;i<saved.length;i++){
    var rt=saved[i];
    var d=new Date(rt.created_at);
    var ds=d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
    var icons=(rt.steps||[]).map(function(s){return s.icon}).join(' ');
    var childName='';
    if(rt.child_id){var ch=S.children.find(function(c){return c.id===rt.child_id});if(ch)childName=ch.name}
    h+='<div class="routine-card" style="cursor:pointer" data-id="'+rt.id+'" onclick="loadSavedRoutine(\''+rt.id+'\')">';
    h+='<div class="routine-card-hdr"><div class="routine-card-title">'+esc(rt.title)+'</div><div style="display:flex;gap:6px;align-items:center">';
    if(rt.source==='ai')h+='<span style="font-size:11px;background:var(--lavender);color:#6B5B8D;padding:2px 8px;border-radius:6px;font-weight:700">AI</span>';
    h+='<span class="routine-card-time">'+ds+'</span><button class="routine-step-del" onclick="event.stopPropagation();deleteSavedRoutine(\''+rt.id+'\')">&times;</button></div></div>';
    h+='<div style="font-size:14px;margin-bottom:4px">'+icons+'</div>';
    h+='<div style="font-size:12px;color:var(--warm-gray-light)">'+rt.steps.length+' steps'+(childName?' · '+esc(childName):'')+'</div>';
    h+='</div>';
  }
  el.innerHTML=h;
}
```

- [ ] **Step 3: Replace `loadSavedRoutine()` (line 2946)**

Replace the existing `loadSavedRoutine` function:

```javascript
async function loadSavedRoutine(id){
  var r=await sb.from('routines').select('*').eq('id',id).single();
  if(!r.data)return;
  document.getElementById('routineTitle').value=r.data.title;
  routineSteps=(r.data.steps||[]).map(function(s){return{icon:s.icon,name:s.name,dur:s.dur,tip:s.tip||null}});
  routineSource=r.data.source||'manual';
  renderRoutineSteps();
  document.getElementById('routinePreview').classList.add('hidden');
  document.querySelector('#routinePage .overlay-body').scrollTop=0;
  showToast('Routine loaded');
}
```

- [ ] **Step 4: Replace `deleteSavedRoutine()` (line 2958)**

Replace the existing `deleteSavedRoutine` function:

```javascript
async function deleteSavedRoutine(id){
  var r=await sb.from('routines').delete().eq('id',id).eq('user_id',S.user.id);
  if(r.error){showToast('Error deleting');return}
  loadSavedRoutines2();
  showToast('Routine deleted');
}
```

- [ ] **Step 5: Add `routineSource` global variable**

Near line 2790, after `var selectedIcon = '⏰';`, add:

```javascript
var routineSource = 'manual';
```

- [ ] **Step 6: Add localStorage migration to `openRoutines()` (line 2808)**

Replace the existing `openRoutines` function:

```javascript
async function openRoutines(){
  closeSb();
  document.getElementById('routinePage').classList.add('open');
  renderStepIcons();
  loadTemplate('morning');

  // Migrate localStorage routines to Supabase (one-time)
  if(S.user){
    try{
      var old=JSON.parse(localStorage.getItem('mv_routines')||'[]');
      if(old.length){
        for(var i=0;i<old.length;i++){
          await sb.from('routines').insert({
            user_id:S.user.id,
            child_id:(S.activeChild&&S.activeChild.id)||null,
            title:old[i].title||'My Routine',
            steps:old[i].steps||[],
            source:'manual'
          });
        }
        localStorage.removeItem('mv_routines');
        showToast('Routines synced to your account!');
      }
    }catch(e){console.error('Routine migration:',e)}
  }

  loadSavedRoutines2();
}
```

- [ ] **Step 7: Verify in browser**

1. Open app.html in browser
2. Sign in, navigate to Routine Builder
3. Create a routine with 3+ steps, save it
4. Refresh the page — routine should persist
5. Delete a routine — should disappear

- [ ] **Step 8: Commit**

```bash
git add app.html
git commit -m "feat: migrate routine builder from localStorage to Supabase"
```

---

### Task 3: Routine Builder — Add Child Selector + Filter

**Files:**
- Modify: `app.html:658-666` (routine templates HTML area)
- Modify: `app.html` loadSavedRoutines2 (already modified in Task 2)

- [ ] **Step 1: Add child selector to routine builder HTML**

In `app.html`, find the templates section (line 658). Insert a child selector **before** the templates div:

Before the line `<div style="margin-bottom:20px">` that contains "Start from a template:", add:

```html
        <!-- Child selector for routines -->
        <div id="routineChildSelector" style="margin-bottom:16px;display:none">
          <div style="font-size:13px;font-weight:600;color:var(--warm-gray);margin-bottom:8px">Building routine for:</div>
          <select id="routineChildFilter" class="fi" onchange="loadSavedRoutines2()" style="padding:10px 14px;border-radius:12px;font-size:14px">
          </select>
        </div>
```

- [ ] **Step 2: Populate child selector on open**

In the `openRoutines()` function (modified in Task 2), add child selector population after the migration block, before `loadSavedRoutines2()`:

```javascript
  // Populate child selector
  var csel=document.getElementById('routineChildSelector');
  var cfilt=document.getElementById('routineChildFilter');
  if(S.children&&S.children.length>1){
    csel.style.display='block';
    var ch='<option value="">All children</option>';
    for(var j=0;j<S.children.length;j++){
      var c=S.children[j];
      ch+='<option value="'+c.id+'"'+(S.activeChild&&S.activeChild.id===c.id?' selected':'')+'>'+esc(c.name)+'</option>';
    }
    cfilt.innerHTML=ch;
  } else {
    csel.style.display='none';
  }
```

- [ ] **Step 3: Verify in browser**

1. With a multi-child account, open Routine Builder
2. Child selector should appear with all children + "All children" option
3. Selecting a child should filter saved routines to that child only
4. With a single-child account, selector should be hidden

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "feat: add child selector and filtering to routine builder"
```

---

### Task 4: Routine Builder — Mobile Touch Drag-and-Drop

**Files:**
- Modify: `app.html:151-180` (CSS — add dragging styles)
- Modify: `app.html:2875-2887` (drag and drop JS)

- [ ] **Step 1: Add touch drag CSS**

After the existing `.routine-add:hover` rule (line 164), add:

```css
.routine-step.dragging{opacity:0.5;transform:scale(1.02);z-index:10;position:relative}
.routine-step.drag-over{border-color:var(--sage);background:var(--sage-light)}
```

- [ ] **Step 2: Add touch event handlers**

After the existing `dropStep` function (around line 2887), add:

```javascript
// Touch drag-and-drop for mobile
var touchDragIdx=null,touchClone=null,touchStartY=0;
function touchDragStart(e){
  var step=e.target.closest('.routine-step');
  if(!step)return;
  touchDragIdx=parseInt(step.dataset.idx);
  touchStartY=e.touches[0].clientY;
  step.classList.add('dragging');
}
function touchDragMove(e){
  if(touchDragIdx===null)return;
  e.preventDefault();
  var touch=e.touches[0];
  var el=document.elementFromPoint(touch.clientX,touch.clientY);
  var steps=document.querySelectorAll('.routine-step');
  steps.forEach(function(s){s.classList.remove('drag-over')});
  if(el){var target=el.closest('.routine-step');if(target&&parseInt(target.dataset.idx)!==touchDragIdx)target.classList.add('drag-over')}
}
function touchDragEnd(e){
  if(touchDragIdx===null)return;
  var steps=document.querySelectorAll('.routine-step');
  steps.forEach(function(s){s.classList.remove('dragging','drag-over')});
  var touch=e.changedTouches[0];
  var el=document.elementFromPoint(touch.clientX,touch.clientY);
  if(el){
    var target=el.closest('.routine-step');
    if(target){
      var targetIdx=parseInt(target.dataset.idx);
      if(targetIdx!==touchDragIdx){
        var item=routineSteps.splice(touchDragIdx,1)[0];
        routineSteps.splice(targetIdx,0,item);
        renderRoutineSteps();
      }
    }
  }
  touchDragIdx=null;
}
```

- [ ] **Step 3: Add touch events to `renderRoutineSteps()`**

In `renderRoutineSteps()` (line 2839), modify the step div to include touch events. Find the line that builds the step div:

```javascript
h+='<div class="routine-step" draggable="true" data-idx="'+i+'" ondragstart="dragStart(event)" ondragover="dragOver(event)" ondrop="dropStep(event)">';
```

Replace with:

```javascript
h+='<div class="routine-step" draggable="true" data-idx="'+i+'" ondragstart="dragStart(event)" ondragover="dragOver(event)" ondrop="dropStep(event)" ontouchstart="touchDragStart(event)" ontouchmove="touchDragMove(event)" ontouchend="touchDragEnd(event)">';
```

- [ ] **Step 4: Also render tips for AI-generated steps**

In `renderRoutineSteps()`, after the line that builds the step text (`routine-step-text` div), add a tip display. Find:

```javascript
h+='<div class="routine-step-text"><div class="routine-step-name">'+esc(s.name)+'</div>'+(s.dur?'<div class="routine-step-dur">'+s.dur+' min</div>':'')+'</div>';
```

Replace with:

```javascript
h+='<div class="routine-step-text"><div class="routine-step-name">'+esc(s.name)+'</div>'+(s.dur?'<div class="routine-step-dur">'+s.dur+' min</div>':'')+(s.tip?'<div style="font-size:11px;color:var(--sage-dark);background:var(--sage-light);padding:4px 8px;border-radius:6px;margin-top:4px">'+esc(s.tip)+'</div>':'')+'</div>';
```

- [ ] **Step 5: Verify on mobile (or Chrome DevTools mobile emulation)**

1. Open app.html in Chrome DevTools with mobile emulation
2. Navigate to Routine Builder, load a template
3. Touch and drag a step — it should reorder
4. The drag-over step should highlight in sage

- [ ] **Step 6: Commit**

```bash
git add app.html
git commit -m "feat: add mobile touch drag-and-drop + AI tip display to routine builder"
```

---

### Task 5: Routine Builder — AI-Generated Routines

**Files:**
- Modify: `app.html:660-665` (add AI Suggest button to template row)
- Modify: `app.html` (add generateAIRoutine function + context dropdown)

- [ ] **Step 1: Add AI Suggest button to template row HTML**

Find the template buttons (line 660-665):

```html
          <div class="routine-templates">
            <button class="routine-template" onclick="loadTemplate('morning')">🌅 Morning</button>
            <button class="routine-template" onclick="loadTemplate('afterschool')">🎒 After School</button>
            <button class="routine-template" onclick="loadTemplate('bedtime')">🌙 Bedtime</button>
            <button class="routine-template" onclick="loadTemplate('mealtime')">🍽️ Mealtime</button>
            <button class="routine-template" onclick="loadTemplate('blank')">✏️ Blank</button>
          </div>
```

Replace with:

```html
          <div class="routine-templates">
            <button class="routine-template" onclick="loadTemplate('morning')">🌅 Morning</button>
            <button class="routine-template" onclick="loadTemplate('afterschool')">🎒 After School</button>
            <button class="routine-template" onclick="loadTemplate('bedtime')">🌙 Bedtime</button>
            <button class="routine-template" onclick="loadTemplate('mealtime')">🍽️ Mealtime</button>
            <button class="routine-template" onclick="loadTemplate('blank')">✏️ Blank</button>
            <button class="routine-template" style="background:var(--lavender);border-color:var(--lavender);color:#6B5B8D" onclick="showAIRoutineForm()">✨ AI Suggest</button>
          </div>
```

- [ ] **Step 2: Add AI routine form HTML**

After the `stepForm` div (after line 696), add:

```html
        <!-- AI Routine Form (hidden by default) -->
        <div id="aiRoutineForm" class="routine-form hidden">
          <div style="font-weight:700;font-size:15px;margin-bottom:4px">AI-Generated Routine</div>
          <div style="font-size:12px;color:var(--warm-gray);margin-bottom:12px">Based on your child's behavioral patterns</div>
          <div style="margin-bottom:12px">
            <label class="fl">What kind of routine?</label>
            <select id="aiRoutineContext" class="fi">
              <option value="morning">Morning routine</option>
              <option value="afterschool">After school / arrival home</option>
              <option value="bedtime">Bedtime / wind-down</option>
              <option value="transitions">Transition between activities</option>
              <option value="homework">Homework / focus time</option>
              <option value="mealtime">Mealtime</option>
            </select>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-p" style="flex:1" id="aiRoutineBtn" onclick="generateAIRoutine()">✨ Generate Routine</button>
            <button class="btn btn-s" onclick="hideAIRoutineForm()">Cancel</button>
          </div>
        </div>
```

- [ ] **Step 3: Add the AI routine generation functions**

After the `deleteSavedRoutine` function (after the function modified in Task 2), add:

```javascript
function showAIRoutineForm(){document.getElementById('aiRoutineForm').classList.remove('hidden');document.getElementById('stepForm').classList.add('hidden')}
function hideAIRoutineForm(){document.getElementById('aiRoutineForm').classList.add('hidden')}

async function generateAIRoutine(){
  if(!S.user){showToast('Sign in first');return}
  var ctx=document.getElementById('aiRoutineContext').value;
  var btn=document.getElementById('aiRoutineBtn');
  btn.disabled=true;btn.textContent='Generating...';

  try{
    var childCtx=await fetchChildContext();
    var pat=childCtx.patterns||{};
    var childInfo='Child: '+(S.child||'my child');
    if(S.age)childInfo+=', age '+S.age;
    if(S.dx)childInfo+=', diagnosis: '+S.dx;

    var patInfo='';
    if(pat.hasData){
      if(pat.topBehaviors&&pat.topBehaviors.length)patInfo+='\nMost frequent behaviors: '+pat.topBehaviors.map(function(b){return b.behavior+' ('+b.count+'x)'}).join(', ');
      if(pat.topTriggers&&pat.topTriggers.length)patInfo+='\nCommon triggers: '+pat.topTriggers.map(function(t){return t.trigger+' ('+t.count+'x)'}).join(', ');
      if(pat.peakTimeOfDay)patInfo+='\nPeak incident time: '+pat.peakTimeOfDay;
      if(pat.strategyEffectiveness&&pat.strategyEffectiveness.length){
        var best=pat.strategyEffectiveness[0];
        if(best.successRate>50)patInfo+='\nBest strategy: "'+best.strategy+'" ('+best.successRate+'% success)';
      }
    }

    var prompt='Create a '+ctx+' routine for this child.\n\n'+childInfo+patInfo+'\n\nReturn ONLY valid JSON, no other text. Format:\n{"title":"...","steps":[{"icon":"emoji","name":"step name","dur":minutes_number_or_null,"tip":"brief ABA-informed tip"}]}\n\nInclude 5-8 steps. Make steps concrete and age-appropriate. Tips should be 1 sentence referencing ABA principles (visual supports, reinforcement, antecedent strategies, etc). If behavioral data shows specific triggers or patterns, address them in the routine structure.';

    var r=await authFetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:800,system:'You are an ABA-trained routine builder. Create structured daily routines for children with autism, ADHD, and other neurodevelopmental conditions. Return ONLY valid JSON. No markdown, no commentary.',messages:[{role:'user',content:prompt}]})});
    var d=await r.json();
    var text='';if(d.content)for(var i=0;i<d.content.length;i++)if(d.content[i].text)text+=d.content[i].text;

    // Parse JSON — handle potential markdown wrapping
    text=text.replace(/```json\s*/,'').replace(/```\s*/,'').trim();
    var parsed=JSON.parse(text);

    if(parsed.title)document.getElementById('routineTitle').value=parsed.title;
    if(parsed.steps&&parsed.steps.length){
      routineSteps=parsed.steps.map(function(s){return{icon:s.icon||'⏰',name:s.name||'Step',dur:s.dur||null,tip:s.tip||null}});
      routineSource='ai';
      renderRoutineSteps();
      hideAIRoutineForm();
      showToast('Routine generated! Edit and save when ready.');
    } else {
      showToast('Could not generate routine. Try again.');
    }
  }catch(e){
    console.error('AI routine error:',e);
    showToast('Error generating routine. Try again.');
  }
  btn.disabled=false;btn.textContent='✨ Generate Routine';
}
```

- [ ] **Step 4: Reset routineSource when loading templates**

In `loadTemplate()` (line 2832), add `routineSource='manual';` at the start:

```javascript
function loadTemplate(key){
  routineSource='manual';
  var t=TEMPLATES[key];
  routineSteps=t.steps.map(function(s){return{icon:s.icon,name:s.name,dur:s.dur}});
  document.getElementById('routineTitle').value=t.title;
  renderRoutineSteps();
}
```

- [ ] **Step 5: Verify in browser**

1. Open Routine Builder, tap "AI Suggest"
2. Select "Morning routine" context, tap "Generate Routine"
3. Wait for AI response — steps should populate in the builder
4. Steps should have sage-colored ABA tips below each step name
5. Save the routine — it should show an "AI" badge in saved routines
6. Load a template — should clear AI source

- [ ] **Step 6: Commit**

```bash
git add app.html
git commit -m "feat: add AI-generated routines to routine builder"
```

---

### Task 6: IEP Toolkit — Add pdf.js + CSP Update + Upload Wizard HTML

**Files:**
- Modify: `app.html:8` (CSP meta tag — add cdnjs.cloudflare.com OR use jsdelivr)
- Modify: `app.html:16` (add pdf.js script tag)
- Modify: `app.html:600-612` (add Upload card to IEP hub)
- Modify: `app.html:2510-2522` (add 'analyze' case to startWizard)

- [ ] **Step 1: Add pdf.js script tag**

After the Supabase script tag (line 16), add:

```html
<script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js"></script>
```

This uses jsdelivr which is already in the CSP allowlist. No CSP change needed.

- [ ] **Step 2: Add new CSS for upload zone and result cards**

After the existing IEP CSS (after line 126, after `.iep-goal-text`), add:

```css
.iep-upload-zone{border:2px dashed var(--sand);border-radius:16px;padding:32px;text-align:center;cursor:pointer;transition:all 0.15s}
.iep-upload-zone:hover,.iep-upload-zone.dragover{border-color:var(--sage);background:var(--sage-light)}
.iep-result-card{background:white;border-radius:14px;padding:16px;margin-bottom:12px;border:1px solid var(--sand)}
.iep-result-card.gap{border-left:4px solid var(--terracotta);background:#FFF8F5}
.iep-goal-original{font-size:12px;color:var(--warm-gray-light);font-style:italic;margin-bottom:8px}
.iep-goal-plain{font-size:15px;line-height:1.6;font-weight:600}
.iep-service-table{width:100%;border-collapse:collapse;font-size:13px}
.iep-service-table th{text-align:left;padding:8px;border-bottom:2px solid var(--sand);font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:var(--warm-gray)}
.iep-service-table td{padding:8px;border-bottom:1px solid var(--sand)}
```

- [ ] **Step 3: Add Upload & Analyze card to IEP hub**

Find the Goals card in the IEP hub (line 611):

```html
          <div onclick="startWizard('goals')" style="background:white;border-radius:16px;padding:20px;border:1px solid var(--sand);margin-bottom:12px;cursor:pointer;transition:all 0.15s;display:flex;align-items:center;gap:14px"><div style="width:48px;height:48px;border-radius:14px;background:rgba(232,200,74,0.15);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🎯</div><div style="flex:1"><div style="font-weight:700;font-size:15px">Suggest IEP Goals</div><div style="font-size:12px;color:var(--warm-gray);margin-top:2px">Get goal suggestions based on your child's needs and diagnosis</div></div><div style="color:var(--warm-gray-light)">&rarr;</div></div>
```

After that line (before `</div>` closing the iepHub), add:

```html
          <div onclick="startWizard('analyze')" style="background:white;border-radius:16px;padding:20px;border:1px solid var(--sage);margin-bottom:12px;cursor:pointer;transition:all 0.15s;display:flex;align-items:center;gap:14px"><div style="width:48px;height:48px;border-radius:14px;background:var(--sage-light);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">📄</div><div style="flex:1"><div style="font-weight:700;font-size:15px">Upload & Analyze Your IEP</div><div style="font-size:12px;color:var(--warm-gray);margin-top:2px">Upload a PDF and get a plain-English breakdown of goals, services, and accommodations</div></div><div style="color:var(--warm-gray-light)">&rarr;</div></div>
```

- [ ] **Step 4: Add 'analyze' case to startWizard()**

Find the `startWizard` function (line 2510). In the if/else chain, after `else if(mode==='goals') renderGoalsWizard();`, add:

```javascript
  else if(mode==='analyze') renderAnalyzeWizard();
```

- [ ] **Step 5: Verify in browser**

1. Open IEP Toolkit
2. Sixth card "Upload & Analyze Your IEP" should appear with sage-colored border
3. Clicking it should not error (renderAnalyzeWizard doesn't exist yet — that's Task 7)

- [ ] **Step 6: Commit**

```bash
git add app.html
git commit -m "feat: add pdf.js dependency + IEP upload card to hub"
```

---

### Task 7: IEP Toolkit — PDF Upload, Extraction, AI Analysis + Results

**Files:**
- Modify: `app.html` (add renderAnalyzeWizard, extractPdfText, analyzeIep, renderIepResults functions)

This is the largest task. All functions go after the existing `renderGoalsWizard` function block.

- [ ] **Step 1: Add the PDF extraction function**

After the last IEP function (find the end of the Goals wizard section — search for the closing of `renderGoalsWizard`), add:

```javascript
// ── ANALYZE WIZARD ──
async function extractPdfText(file){
  var arrayBuffer=await file.arrayBuffer();
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  var pdf=await pdfjsLib.getDocument({data:arrayBuffer}).promise;
  var text='';
  for(var i=1;i<=pdf.numPages;i++){
    var page=await pdf.getPage(i);
    var content=await page.getTextContent();
    text+=content.items.map(function(item){return item.str}).join(' ')+'\n';
  }
  return{text:text,pages:pdf.numPages};
}
```

- [ ] **Step 2: Add the renderAnalyzeWizard function**

```javascript
function renderAnalyzeWizard(){
  var h='<div style="margin-bottom:20px"><div style="font-family:Fraunces,serif;font-size:22px;font-weight:800">Upload & Analyze Your IEP</div><div style="font-size:13px;color:var(--warm-gray);margin-top:4px">Upload a PDF — we\'ll extract goals, services, and accommodations in plain English</div></div>';
  h+='<div class="iep-upload-zone" id="iepDropZone" onclick="document.getElementById(\'iepFileInput\').click()" ondragover="event.preventDefault();this.classList.add(\'dragover\')" ondragleave="this.classList.remove(\'dragover\')" ondrop="event.preventDefault();this.classList.remove(\'dragover\');handleIepFile(event.dataTransfer.files[0])">';
  h+='<div style="font-size:40px;margin-bottom:12px">📄</div>';
  h+='<div style="font-weight:700;font-size:16px;margin-bottom:4px">Tap to choose a PDF</div>';
  h+='<div style="font-size:13px;color:var(--warm-gray)">or drag and drop your IEP document here</div>';
  h+='<div style="font-size:11px;color:var(--warm-gray-light);margin-top:8px">Your file stays on your device — nothing is uploaded</div>';
  h+='<input type="file" id="iepFileInput" accept=".pdf" style="display:none" onchange="handleIepFile(this.files[0])">';
  h+='</div>';
  h+='<div id="iepFileInfo" style="display:none;margin-top:12px;padding:12px 16px;background:var(--sage-light);border-radius:12px;font-size:13px"></div>';
  h+='<div id="iepAnalyzeActions" style="display:none;margin-top:12px"><button class="btn btn-p" style="width:100%;padding:16px;font-size:16px" id="iepAnalyzeBtn" onclick="analyzeIep()">Analyze My IEP</button></div>';
  h+='<div id="iepAnalyzeResult"></div>';
  document.getElementById('iepWizard').innerHTML=h;
}

var iepExtractedText='';

async function handleIepFile(file){
  if(!file)return;
  if(file.type!=='application/pdf'){showToast('Please upload a PDF file');return}
  if(file.size>10*1024*1024){showToast('File too large (max 10MB)');return}

  var info=document.getElementById('iepFileInfo');
  info.style.display='block';
  info.innerHTML='<div style="display:flex;align-items:center;gap:8px"><span>Extracting text from '+esc(file.name)+'...</span></div>';

  try{
    var result=await extractPdfText(file);
    iepExtractedText=result.text;
    var preview=iepExtractedText.substring(0,200).replace(/\n/g,' ')+'...';
    info.innerHTML='<div style="font-weight:700;margin-bottom:4px">'+esc(file.name)+' · '+result.pages+' pages</div><div style="font-size:12px;color:var(--warm-gray)">'+esc(preview)+'</div>';
    document.getElementById('iepAnalyzeActions').style.display='block';
  }catch(e){
    console.error('PDF extract error:',e);
    info.innerHTML='<div style="color:var(--terracotta)">Could not read this PDF. Try a different file or use the "Explain IEP Text" tool to paste text manually.</div>';
  }
}
```

- [ ] **Step 3: Add the analyzeIep function**

```javascript
async function analyzeIep(){
  if(!iepExtractedText){showToast('Upload a PDF first');return}
  var btn=document.getElementById('iepAnalyzeBtn');
  btn.disabled=true;btn.textContent='Analyzing...';
  var resultEl=document.getElementById('iepAnalyzeResult');
  resultEl.innerHTML='<div style="text-align:center;padding:32px;color:var(--warm-gray)"><div style="font-size:32px;margin-bottom:8px">🔍</div><div>Reading your IEP and analyzing goals, services, and accommodations...</div><div style="font-size:12px;margin-top:8px;color:var(--warm-gray-light)">This may take 15-30 seconds</div></div>';

  try{
    var childCtx=S.user?await fetchChildContext():{};
    var pat=childCtx.patterns||{};
    var childInfo='';
    if(S.child)childInfo+='Child: '+S.child;
    if(S.age)childInfo+=(childInfo?', ':'')+' age '+S.age;
    if(S.dx)childInfo+=(childInfo?', ':'')+'diagnosis: '+S.dx;

    var patInfo='';
    if(pat.hasData){
      if(pat.topBehaviors&&pat.topBehaviors.length)patInfo+='\nBehavioral data - Most frequent behaviors: '+pat.topBehaviors.map(function(b){return b.behavior}).join(', ');
      if(pat.topTriggers&&pat.topTriggers.length)patInfo+='\nCommon triggers: '+pat.topTriggers.map(function(t){return t.trigger}).join(', ');
      if(pat.strategyEffectiveness&&pat.strategyEffectiveness.length)patInfo+='\nStrategy effectiveness: '+pat.strategyEffectiveness.slice(0,3).map(function(s){return'"'+s.strategy+'" '+s.successRate+'%'}).join(', ');
    }

    // Truncate IEP text to fit within token limits (roughly 4 chars per token)
    var iepText=iepExtractedText.substring(0,12000);

    var prompt='Analyze this IEP document and return ONLY valid JSON.\n\n'+(childInfo?'CHILD INFO: '+childInfo+'\n':'')+(patInfo?'BEHAVIORAL DATA:'+patInfo+'\n':'')+'\nIEP DOCUMENT TEXT:\n'+iepText+'\n\nReturn this exact JSON structure:\n{"summary":"2-3 sentence overview","goals":[{"area":"skill area","goal_text":"original goal from document","plain_english":"what this means in simple terms","measurement":"how progress is measured","questions":["question parent should ask"]}],"services":[{"type":"service name","frequency":"how often","provider":"who provides it","notes":"any details"}],"accommodations":["accommodation 1","accommodation 2"],"gaps":[{"concern":"what seems missing or concerning","explanation":"why this matters for this specific child","action":"what parent should do about it"}]}';

    var r=await authFetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:2000,system:'You are an IEP document analyst helping parents understand their child\'s Individualized Education Program. Extract and explain all components in plain English. Be warm, supportive, and empowering. Cross-reference with the child\'s behavioral data when available to identify gaps. Return ONLY valid JSON, no markdown, no commentary.',messages:[{role:'user',content:prompt}]})});
    var d=await r.json();
    var text='';if(d.content)for(var i=0;i<d.content.length;i++)if(d.content[i].text)text+=d.content[i].text;

    text=text.replace(/```json\s*/,'').replace(/```\s*/,'').trim();
    var analysis=JSON.parse(text);
    renderIepResults(analysis);
  }catch(e){
    console.error('IEP analysis error:',e);
    resultEl.innerHTML='<div class="iep-section" style="margin-top:16px;text-align:center;color:var(--terracotta)"><div style="font-size:24px;margin-bottom:8px">⚠️</div>Could not analyze this IEP. The document may be too complex or formatted unusually.<br><br><button class="btn btn-outline" onclick="renderAnalyzeWizard()">Try Again</button></div>';
  }
  btn.disabled=false;btn.textContent='Analyze My IEP';
}
```

- [ ] **Step 4: Add the renderIepResults function**

```javascript
function renderIepResults(a){
  var h='';

  // Summary
  if(a.summary){
    h+='<div class="iep-section" style="margin-top:16px;background:var(--sage-light);border-radius:16px;padding:20px"><div style="font-family:Fraunces,serif;font-size:18px;font-weight:800;margin-bottom:8px">Summary</div><div style="font-size:14px;line-height:1.7">'+esc(a.summary)+'</div></div>';
  }

  // Goals
  if(a.goals&&a.goals.length){
    h+='<div style="font-family:Fraunces,serif;font-size:18px;font-weight:800;margin-top:20px;margin-bottom:12px">Goals ('+a.goals.length+')</div>';
    for(var i=0;i<a.goals.length;i++){
      var g=a.goals[i];
      h+='<div class="iep-result-card">';
      if(g.area)h+='<div class="iep-goal-area" style="color:var(--sage-dark)">'+esc(g.area)+'</div>';
      if(g.goal_text)h+='<div class="iep-goal-original">'+esc(g.goal_text)+'</div>';
      h+='<div class="iep-goal-plain">'+esc(g.plain_english)+'</div>';
      if(g.measurement)h+='<div style="font-size:12px;color:var(--warm-gray);margin-top:8px"><strong>Measured by:</strong> '+esc(g.measurement)+'</div>';
      if(g.questions&&g.questions.length){
        h+='<div style="margin-top:10px;padding:10px 12px;background:var(--cream);border-radius:10px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--warm-gray);margin-bottom:6px">Questions to Ask</div>';
        for(var q=0;q<g.questions.length;q++)h+='<div style="font-size:13px;margin-bottom:4px;padding-left:12px;border-left:2px solid var(--sage)">'+esc(g.questions[q])+'</div>';
        h+='</div>';
      }
      h+='</div>';
    }
  }

  // Services
  if(a.services&&a.services.length){
    h+='<div style="font-family:Fraunces,serif;font-size:18px;font-weight:800;margin-top:20px;margin-bottom:12px">Services</div>';
    h+='<div class="iep-result-card"><table class="iep-service-table"><thead><tr><th>Service</th><th>Frequency</th><th>Provider</th></tr></thead><tbody>';
    for(var s=0;s<a.services.length;s++){
      var sv=a.services[s];
      h+='<tr><td>'+esc(sv.type)+'</td><td>'+esc(sv.frequency||'—')+'</td><td>'+esc(sv.provider||'—')+'</td></tr>';
    }
    h+='</tbody></table></div>';
  }

  // Accommodations
  if(a.accommodations&&a.accommodations.length){
    h+='<div style="font-family:Fraunces,serif;font-size:18px;font-weight:800;margin-top:20px;margin-bottom:12px">Accommodations</div>';
    h+='<div class="iep-result-card">';
    for(var ac=0;ac<a.accommodations.length;ac++){
      h+='<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px"><div style="color:var(--sage);font-size:16px;flex-shrink:0">✓</div><div style="font-size:14px">'+esc(a.accommodations[ac])+'</div></div>';
    }
    h+='</div>';
  }

  // Gaps & Concerns
  if(a.gaps&&a.gaps.length){
    h+='<div style="font-family:Fraunces,serif;font-size:18px;font-weight:800;margin-top:20px;margin-bottom:12px">Gaps & Concerns</div>';
    for(var gc=0;gc<a.gaps.length;gc++){
      var gap=a.gaps[gc];
      h+='<div class="iep-result-card gap">';
      h+='<div style="font-weight:700;font-size:14px;margin-bottom:6px">'+esc(gap.concern)+'</div>';
      h+='<div style="font-size:13px;color:var(--warm-gray);line-height:1.6;margin-bottom:8px">'+esc(gap.explanation)+'</div>';
      h+='<div style="font-size:13px;font-weight:600;color:var(--sage-dark)">→ '+esc(gap.action)+'</div>';
      h+='</div>';
    }
  }

  // Actions
  h+='<div style="display:flex;gap:8px;margin-top:20px;margin-bottom:20px">';
  h+='<button class="btn btn-p" style="flex:1" onclick="copyIepAnalysis()">📋 Copy Analysis</button>';
  h+='<button class="btn btn-outline" style="flex:1" onclick="discussIepWithCoach()">💬 Discuss with Coach</button>';
  h+='</div>';
  h+='<button class="btn btn-s" style="width:100%" onclick="renderAnalyzeWizard()">Upload a Different IEP</button>';

  document.getElementById('iepAnalyzeResult').innerHTML=h;

  // Store for copy/discuss
  window._lastIepAnalysis=a;
}
```

- [ ] **Step 5: Add copy and discuss helper functions**

```javascript
function copyIepAnalysis(){
  var a=window._lastIepAnalysis;
  if(!a){showToast('No analysis to copy');return}
  var t='IEP ANALYSIS\n\n';
  if(a.summary)t+='SUMMARY\n'+a.summary+'\n\n';
  if(a.goals&&a.goals.length){
    t+='GOALS\n';
    a.goals.forEach(function(g,i){t+=(i+1)+'. '+g.plain_english+'\n   Original: '+g.goal_text+'\n   Measured by: '+(g.measurement||'N/A')+'\n\n'});
  }
  if(a.services&&a.services.length){
    t+='SERVICES\n';
    a.services.forEach(function(s){t+='- '+s.type+': '+(s.frequency||'N/A')+' ('+(s.provider||'N/A')+')\n'});
    t+='\n';
  }
  if(a.accommodations&&a.accommodations.length){
    t+='ACCOMMODATIONS\n';
    a.accommodations.forEach(function(ac){t+='- '+ac+'\n'});
    t+='\n';
  }
  if(a.gaps&&a.gaps.length){
    t+='GAPS & CONCERNS\n';
    a.gaps.forEach(function(g){t+='- '+g.concern+': '+g.explanation+' → '+g.action+'\n'});
  }
  navigator.clipboard.writeText(t).then(function(){showToast('Analysis copied!')}).catch(function(){showToast('Tap and hold to copy')});
}

function discussIepWithCoach(){
  var a=window._lastIepAnalysis;
  if(!a)return;
  iepBack();iepBack();
  switchTab('tCoach');
  var summary='I just analyzed my child\'s IEP. Here\'s what was found: '+a.summary;
  if(a.gaps&&a.gaps.length)summary+=' Key concerns: '+a.gaps.map(function(g){return g.concern}).join(', ')+'.';
  summary+=' Can you help me understand what to do next?';
  var input=document.getElementById('chatInput');
  if(input){input.value=summary;input.focus()}
}
```

- [ ] **Step 6: Verify in browser**

1. Open IEP Toolkit → "Upload & Analyze Your IEP"
2. Upload a PDF — file info should appear with page count and text preview
3. Tap "Analyze My IEP" — loading state should show
4. Results should render with Goals, Services, Accommodations, Gaps sections
5. "Copy Analysis" should copy formatted text to clipboard
6. "Discuss with Coach" should navigate to chat tab with IEP context pre-loaded
7. "Upload a Different IEP" should reset the wizard

- [ ] **Step 7: Commit**

```bash
git add app.html
git commit -m "feat: add IEP PDF upload, extraction, and AI analysis with results display"
```

---

### Task 8: Final Verification + Cleanup

**Files:**
- Review: `app.html` (all changes)

- [ ] **Step 1: Test full flow — Community Comments**

1. Sign in, go to Community tab
2. Open a post, write a comment
3. Comment should appear (no RLS error in console)
4. Refresh — comment should persist

(Requires SQL migration from Task 1 to be run on live Supabase first)

- [ ] **Step 2: Test full flow — Routine Builder**

1. Open Routine Builder
2. Test template loading
3. Test AI Suggest → Generate → Edit → Save
4. Test child selector filtering (if multi-child)
5. Test drag-and-drop on mobile (Chrome DevTools)
6. Delete a routine
7. Refresh — all routines persist

- [ ] **Step 3: Test full flow — IEP Toolkit**

1. Open IEP Toolkit → all 6 cards visible
2. Upload & Analyze → upload PDF → analyze → results
3. Copy analysis → paste in notepad → verify formatted
4. Discuss with Coach → chat tab opens with context
5. Test with non-PDF file → should show error
6. Test with large file (>10MB) → should show error

- [ ] **Step 4: Check for console errors**

Open browser dev tools, navigate through all features. Should be zero errors.

- [ ] **Step 5: Final commit**

```bash
git add app.html
git commit -m "chore: final verification pass for parent toolkit upgrade"
```
