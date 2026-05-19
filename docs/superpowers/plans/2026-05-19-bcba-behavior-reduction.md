# BCBA Data Collection — Behavior Reduction Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the dedicated BCBA-side surface for managing behavior_definitions, antecedent/consequence libraries, ABC FK pickers, and per-behavior dashboards with trend + ABC bar charts.

**Architecture:** Single small migration (3 indexes only). All UI in `app.html`. Behaviors tab added as sibling to Programs in client detail. Vanilla SVG charts (matches sparkline pattern from #2 parent tab). Upgrades #2's ABC entry to use FK library pickers while preserving backward compat for free-text rows.

**Tech Stack:** Supabase Postgres + RLS, vanilla HTML/JS `app.html`, IndexedDB-backed `mvOffline` from #2.

**Spec:** [docs/superpowers/specs/2026-05-19-bcba-behavior-reduction-design.md](../specs/2026-05-19-bcba-behavior-reduction-design.md)

**Verification:** Manual — Supabase SQL editor for schema, browser walkthrough for UI, browser DevTools for chart rendering.

**Commit cadence:** one commit per task. Co-Authored-By trailer on every commit.

---

## File Structure

| File | Responsibility | Phase |
|------|---------------|-------|
| `supabase/migrations/20260520_bcba_behavior_reduction.sql` | 3 indexes for behavior trend + ABC queries | 1 |
| `app.html` | All UI surfaces — tab switcher, behavior CRUD, library management, dashboard, ABC upgrade | 2-8 |
| `docs/ROADMAP.md` + `docs/AGENT-CONTEXT.md` + `docs/TESTING-GUIDE.md` | Status updates + testing walkthrough | 9 |

---

## Phase 1: Schema

### Task 1: Migration — chart indexes

**Files:** Create `supabase/migrations/20260520_bcba_behavior_reduction.sql`

- [ ] **Step 1: Create the file with this exact content:**

```sql
-- ═══════════════════════════════════════════════════
-- BCBA Data Collection — Behavior Reduction (sub-project #3)
-- 2026-05-20
-- Spec: docs/superpowers/specs/2026-05-19-bcba-behavior-reduction-design.md
-- Depends on: 20260518_bcba_data_collection_foundation.sql + 20260519_bcba_live_data_entry.sql
-- ═══════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_behavior_rec_def_time
  ON public.behavior_recordings(behavior_definition_id, timestamp DESC)
  WHERE superseded_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_behavior_rec_antecedent
  ON public.behavior_recordings(antecedent_id)
  WHERE antecedent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_behavior_rec_consequence
  ON public.behavior_recordings(consequence_id)
  WHERE consequence_id IS NOT NULL;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260520_bcba_behavior_reduction.sql
git commit -m "$(cat <<'EOF'
feat(bcba-behave): migration — chart query indexes

Three partial indexes for the behavior dashboard chart queries:
trend (definition_id + timestamp), ABC (antecedent_id and
consequence_id). No new tables; existing Foundation schema is enough.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2: Behaviors tab

### Task 2: Add tab switcher to client detail + Behaviors tab skeleton

**Files:** Modify `app.html`

Adds a tab switcher above the existing Programs/Sessions content in `renderClientPrograms`. When "Behaviors" tab is active, calls a new `renderClientBehaviors` function.

- [ ] **Step 1: Refactor `renderClientPrograms` to support tabs**

Find `async function renderClientPrograms()` in app.html. At the top of the function (right after the existing `el.innerHTML = '<div style="text-align:center..."` loading line), add a module-level state var ABOVE the function:

```javascript
var clientDetailTab = 'programs'; // 'programs' | 'behaviors'
```

Modify `renderClientPrograms` to check `clientDetailTab` and dispatch. Replace the entire `renderClientPrograms` body so the loading line is the only thing fetched eagerly, then it dispatches to the appropriate sub-render:

```javascript
async function renderClientPrograms(){
  var el = document.getElementById('practiceClientDetailContent');
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--warm-gray)">Loading…</div>';
  // Tab switcher
  var tabBar = '<div style="display:flex;gap:0;border-bottom:1px solid var(--sand);margin:-20px -20px 16px -20px;padding:0 20px">'+
    '<button onclick="switchClientDetailTab(\x27programs\x27)" style="padding:10px 16px;background:none;border:none;border-bottom:3px solid '+(clientDetailTab==='programs'?'var(--sage-dark)':'transparent')+';color:'+(clientDetailTab==='programs'?'var(--sage-dark)':'var(--warm-gray)')+';font-weight:700;font-size:14px;cursor:pointer">Programs</button>'+
    '<button onclick="switchClientDetailTab(\x27behaviors\x27)" style="padding:10px 16px;background:none;border:none;border-bottom:3px solid '+(clientDetailTab==='behaviors'?'var(--sage-dark)':'transparent')+';color:'+(clientDetailTab==='behaviors'?'var(--sage-dark)':'var(--warm-gray)')+';font-weight:700;font-size:14px;cursor:pointer">Behaviors</button>'+
    '</div>';
  if(clientDetailTab === 'programs'){
    await renderClientProgramsTab(tabBar);
  } else {
    await renderClientBehaviorsTab(tabBar);
  }
}

function switchClientDetailTab(tab){
  clientDetailTab = tab;
  renderClientPrograms();
}
```

Then take the OLD body of `renderClientPrograms` (everything after the loading line) and move it into a new function `renderClientProgramsTab(tabBar)` that **prepends** `tabBar` to its HTML output. The change at the very top of the function:

```javascript
async function renderClientProgramsTab(tabBar){
  var el = document.getElementById('practiceClientDetailContent');
  var pgR = await sb.from('programs')
    // ... rest of existing Programs query unchanged ...
```

And at the very bottom where it currently does `el.innerHTML = h;`, change to:

```javascript
  el.innerHTML = tabBar + h;
}
```

(Keep all the existing code in between. Just add tabBar to the final innerHTML assignment.)

- [ ] **Step 2: Add the Behaviors tab renderer stub**

Add this new function (will be filled out in Task 3):

```javascript
async function renderClientBehaviorsTab(tabBar){
  var el = document.getElementById('practiceClientDetailContent');
  el.innerHTML = tabBar + '<div style="text-align:center;padding:40px;color:var(--warm-gray)">Behaviors tab content lands in Task 3.</div>';
}
```

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba-behave): client detail tab switcher + Behaviors tab skeleton

Refactors renderClientPrograms to dispatch to renderClientProgramsTab
or renderClientBehaviorsTab based on clientDetailTab state. Programs
tab is the default; Behaviors tab content lands in Task 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: Behaviors list + CRUD

### Task 3: Behaviors tab — list view + add/edit/archive modal

**Files:** Modify `app.html`

- [ ] **Step 1: Add the behavior modal HTML**

Insert near other practice modals:

```html
<div id="behaviorDefModal" class="modal-overlay" style="display:none">
  <div class="modal-content" style="max-width:560px;max-height:90vh;overflow-y:auto">
    <h3 id="bdmTitle" style="font-family:Fraunces,serif;font-size:22px;margin-bottom:12px">New behavior</h3>
    <label class="fl">Name *</label>
    <input id="bdmName" class="fi" placeholder="e.g. Aggression — open-hand hitting">
    <label class="fl" style="margin-top:12px">Operational definition * <span style="color:var(--warm-gray);font-weight:400;font-size:11px">(measurable, observable)</span></label>
    <textarea id="bdmDef" class="fi" rows="3" placeholder="Open-hand contact with another person's body with sufficient force to make an audible sound."></textarea>
    <label class="fl" style="margin-top:12px">Recording type *</label>
    <select id="bdmType" class="fi">
      <option value="frequency">Frequency (tally count)</option>
      <option value="duration">Duration (timer)</option>
      <option value="interval">Interval (sample over time)</option>
      <option value="abc">ABC (incidents with context)</option>
      <option value="rate">Rate (count per unit time)</option>
    </select>
    <label class="fl" style="margin-top:12px">Classification *</label>
    <select id="bdmClass" class="fi">
      <option value="challenging">Challenging (reduce)</option>
      <option value="replacement">Replacement (build up)</option>
    </select>
    <div id="bdmPairsWrap" style="display:none;margin-top:12px">
      <label class="fl">Pairs with (optional — challenging behavior this replaces)</label>
      <select id="bdmPairs" class="fi"><option value="">— None —</option></select>
    </div>
    <div style="display:flex;gap:8px;margin-top:18px">
      <button class="btn btn-s" style="flex:1" onclick="closeBehaviorDefModal()">Cancel</button>
      <button class="btn btn-p" style="flex:1" onclick="submitBehaviorDef()">Save</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Replace the `renderClientBehaviorsTab` stub with the real implementation + add CRUD helpers**

Find the stub:

```javascript
async function renderClientBehaviorsTab(tabBar){
  var el = document.getElementById('practiceClientDetailContent');
  el.innerHTML = tabBar + '<div style="text-align:center;padding:40px;color:var(--warm-gray)">Behaviors tab content lands in Task 3.</div>';
}
```

Replace with:

```javascript
var behaviorDefEditing = null;

async function renderClientBehaviorsTab(tabBar){
  var el = document.getElementById('practiceClientDetailContent');
  var defR = await sb.from('behavior_definitions')
    .select('id,name,operational_definition,recording_type,classification,status,created_at')
    .eq('practice_client_id', currentClient.id)
    .order('created_at', { ascending: false });
  if(defR.error){ el.innerHTML = tabBar + '<div style="padding:20px;color:var(--terracotta)">'+esc(defR.error.message)+'</div>'; return; }
  // Count recordings this month per behavior
  var monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  var recR = await sb.from('behavior_recordings')
    .select('behavior_definition_id,recording_type,count,duration_seconds,interval_data')
    .gte('timestamp', monthStart.toISOString())
    .is('superseded_by', null)
    .in('behavior_definition_id', (defR.data || []).map(function(d){ return d.id; }));
  var recsByDef = {};
  (recR.data || []).forEach(function(r){
    if(!recsByDef[r.behavior_definition_id]) recsByDef[r.behavior_definition_id] = { count: 0, duration: 0, intervals: 0 };
    var b = recsByDef[r.behavior_definition_id];
    if(r.recording_type === 'frequency') b.count += (r.count || 0);
    else if(r.recording_type === 'duration') b.duration += (r.duration_seconds || 0);
    else if(r.recording_type === 'interval' && r.interval_data) b.intervals += (r.interval_data.results || []).filter(function(x){ return x; }).length;
    else if(r.recording_type === 'abc') b.count += 1;
  });
  var canWrite = S.practiceMember.role === 'owner_bcba' || S.practiceMember.role === 'supervising_bcba';
  var defs = (defR.data || []).filter(function(d){ return d.status === 'active'; });
  var challenging = defs.filter(function(d){ return d.classification === 'challenging'; });
  var replacement = defs.filter(function(d){ return d.classification === 'replacement'; });
  var h = '<div style="max-width:880px;margin:0 auto">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'+
    '<div style="font-family:Fraunces,serif;font-size:18px;font-weight:700">'+defs.length+' behavior'+(defs.length!==1?'s':'')+' defined</div>'+
    (canWrite ? '<div style="display:flex;gap:6px"><button class="btn btn-s" onclick="openLibrariesModal()">Triggers/consequences</button><button class="btn btn-p" onclick="openBehaviorDefModal()">+ Add behavior</button></div>' : '')+
    '</div>';
  h += renderBehaviorGroup('Challenging behaviors', challenging, recsByDef, canWrite);
  h += renderBehaviorGroup('Replacement behaviors', replacement, recsByDef, canWrite);
  h += '</div>';
  el.innerHTML = tabBar + h;
}

function renderBehaviorGroup(label, list, recsByDef, canWrite){
  var h = '<div class="label" style="margin-top:18px;margin-bottom:8px">'+label+'</div>';
  if(list.length === 0){
    h += '<div style="padding:14px;background:var(--cream);border-radius:12px;color:var(--warm-gray);font-size:13px">None yet.</div>';
    return h;
  }
  list.forEach(function(b){
    var rec = recsByDef[b.id] || {};
    var statParts = [];
    if(b.recording_type === 'frequency' || b.recording_type === 'abc') statParts.push((rec.count || 0) + ' this month');
    if(b.recording_type === 'duration') statParts.push((rec.duration / 60).toFixed(1) + ' min this month');
    if(b.recording_type === 'interval') statParts.push((rec.intervals || 0) + ' occurrences this month');
    h += '<div style="border:1px solid var(--sand);border-radius:12px;padding:12px 14px;margin-bottom:6px;background:white">'+
      '<div style="display:flex;justify-content:space-between;align-items:start;gap:10px">'+
      '<div style="flex:1"><div style="font-weight:700;font-size:15px">'+esc(b.name)+'</div>'+
      '<div style="font-size:12px;color:var(--warm-gray);margin-top:4px">'+esc((b.operational_definition || '').slice(0, 140))+(b.operational_definition && b.operational_definition.length > 140 ? '…' : '')+'</div>'+
      '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">'+
      '<span class="log-tag" style="background:var(--sage-light)">'+b.recording_type+'</span>'+
      (statParts.length ? '<span class="log-tag">'+statParts[0]+'</span>' : '')+
      '</div></div>'+
      '<div style="display:flex;flex-direction:column;gap:4px">'+
      '<button class="btn btn-s" style="padding:6px 10px;font-size:11px" onclick="openBehaviorDashboard(\x27'+b.id+'\x27)">Dashboard &rarr;</button>'+
      (canWrite ? '<button class="btn btn-s" style="padding:6px 10px;font-size:11px" onclick="editBehaviorDef(\x27'+b.id+'\x27)">Edit</button>' : '')+
      '</div></div></div>';
  });
  return h;
}

async function openBehaviorDefModal(){
  behaviorDefEditing = null;
  document.getElementById('bdmTitle').textContent = 'New behavior';
  document.getElementById('bdmName').value = '';
  document.getElementById('bdmDef').value = '';
  document.getElementById('bdmType').value = 'frequency';
  document.getElementById('bdmClass').value = 'challenging';
  document.getElementById('bdmPairsWrap').style.display = 'none';
  document.getElementById('bdmPairs').value = '';
  document.getElementById('bdmClass').onchange = onClassChange;
  document.getElementById('behaviorDefModal').style.display = 'flex';
}

async function editBehaviorDef(id){
  var r = await sb.from('behavior_definitions').select('*').eq('id', id).single();
  if(r.error){ showToast(r.error.message); return; }
  behaviorDefEditing = r.data;
  document.getElementById('bdmTitle').textContent = 'Edit behavior';
  document.getElementById('bdmName').value = r.data.name;
  document.getElementById('bdmDef').value = r.data.operational_definition;
  document.getElementById('bdmType').value = r.data.recording_type;
  document.getElementById('bdmClass').value = r.data.classification || 'challenging';
  document.getElementById('bdmPairsWrap').style.display = (r.data.classification === 'replacement' ? 'block' : 'none');
  document.getElementById('bdmClass').onchange = onClassChange;
  document.getElementById('behaviorDefModal').style.display = 'flex';
}

function onClassChange(){
  var v = document.getElementById('bdmClass').value;
  document.getElementById('bdmPairsWrap').style.display = (v === 'replacement' ? 'block' : 'none');
}

function closeBehaviorDefModal(){
  document.getElementById('behaviorDefModal').style.display = 'none';
}

async function submitBehaviorDef(){
  var name = document.getElementById('bdmName').value.trim();
  var def = document.getElementById('bdmDef').value.trim();
  if(!name || def.length < 20){ showToast('Name and operational definition (≥20 chars) required'); return; }
  var payload = {
    practice_client_id: currentClient.id,
    name: name,
    operational_definition: def,
    recording_type: document.getElementById('bdmType').value,
    classification: document.getElementById('bdmClass').value,
    status: 'active'
  };
  if(behaviorDefEditing){
    var upd = await sb.from('behavior_definitions').update(payload).eq('id', behaviorDefEditing.id);
    if(upd.error){ showToast(upd.error.message); return; }
  } else {
    var ins = await sb.from('behavior_definitions').insert(payload);
    if(ins.error){ showToast(ins.error.message); return; }
  }
  closeBehaviorDefModal();
  showToast('Behavior saved');
  renderClientPrograms();
}

function openLibrariesModal(){ alert('Libraries modal lands in Task 4'); }
function openBehaviorDashboard(id){ alert('Behavior dashboard lands in Task 6'); }
```

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba-behave): Behaviors tab — list view + add/edit modal

Lists behavior_definitions grouped by classification (challenging /
replacement). Shows monthly recording counts inline. Add/edit modal
captures name, operational definition (≥20 chars), recording type,
classification, optional "pairs with" for replacement behaviors.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: Antecedent / Consequence libraries

### Task 4: Library management modal

**Files:** Modify `app.html`

Replaces the `openLibrariesModal` stub. Single modal manages both antecedent and consequence libraries with practice-wide vs client-only scope.

- [ ] **Step 1: Add the libraries modal HTML**

```html
<div id="librariesModal" class="modal-overlay" style="display:none">
  <div class="modal-content" style="max-width:640px;max-height:90vh;overflow-y:auto">
    <h3 style="font-family:Fraunces,serif;font-size:22px;margin-bottom:6px">Triggers &amp; consequences</h3>
    <div style="font-size:13px;color:var(--warm-gray);margin-bottom:14px">Used by ABC entry during sessions. Practice-wide entries are shared across all clients.</div>
    <div class="label" style="margin-bottom:8px">Antecedents (triggers)</div>
    <div id="libAntecedentsList" style="margin-bottom:6px"></div>
    <div style="display:flex;gap:6px;margin-bottom:14px">
      <input id="libNewAnt" class="fi" placeholder="New antecedent name" style="flex:1">
      <select id="libNewAntScope" class="fi" style="max-width:170px"><option value="client">This client only</option><option value="practice">Practice-wide</option></select>
      <button class="btn btn-s" onclick="addLibraryItem('antecedent')">+ Add</button>
    </div>
    <div class="label" style="margin-bottom:8px;margin-top:6px">Consequences</div>
    <div id="libConsequencesList" style="margin-bottom:6px"></div>
    <div style="display:flex;gap:6px;margin-bottom:14px">
      <input id="libNewCons" class="fi" placeholder="New consequence name" style="flex:1">
      <select id="libNewConsScope" class="fi" style="max-width:170px"><option value="client">This client only</option><option value="practice">Practice-wide</option></select>
      <button class="btn btn-s" onclick="addLibraryItem('consequence')">+ Add</button>
    </div>
    <button class="btn btn-p" style="width:100%" onclick="closeLibrariesModal()">Done</button>
  </div>
</div>
```

- [ ] **Step 2: Replace the `openLibrariesModal` stub**

Find:

```javascript
function openLibrariesModal(){ alert('Libraries modal lands in Task 4'); }
```

Replace with:

```javascript
async function openLibrariesModal(){
  if(!currentClient){ return; }
  document.getElementById('librariesModal').style.display = 'flex';
  await loadLibraries();
}

async function loadLibraries(){
  var antR = await sb.from('behavior_antecedents')
    .select('id,name,practice_id,practice_client_id')
    .or('practice_id.eq.'+S.practiceMember.practice_id+',practice_client_id.eq.'+currentClient.id)
    .order('name');
  var consR = await sb.from('behavior_consequences')
    .select('id,name,practice_id,practice_client_id')
    .or('practice_id.eq.'+S.practiceMember.practice_id+',practice_client_id.eq.'+currentClient.id)
    .order('name');
  document.getElementById('libAntecedentsList').innerHTML = renderLibraryList(antR.data || [], 'antecedent');
  document.getElementById('libConsequencesList').innerHTML = renderLibraryList(consR.data || [], 'consequence');
}

function renderLibraryList(items, kind){
  if(items.length === 0) return '<div style="color:var(--warm-gray);font-size:13px;padding:6px">No '+kind+'s yet.</div>';
  var h = '';
  items.forEach(function(i){
    var scope = i.practice_id ? 'Practice-wide' : 'This client';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border:1px solid var(--sand);border-radius:8px;margin-bottom:4px">'+
      '<div style="flex:1"><div style="font-size:13px">'+esc(i.name)+'</div><div style="font-size:10px;color:var(--warm-gray)">'+scope+'</div></div>'+
      '<button class="btn btn-s" style="padding:4px 8px;font-size:11px" onclick="deleteLibraryItem(\x27'+kind+'\x27,\x27'+i.id+'\x27)">&times;</button>'+
      '</div>';
  });
  return h;
}

async function addLibraryItem(kind){
  var nameEl = document.getElementById(kind === 'antecedent' ? 'libNewAnt' : 'libNewCons');
  var scopeEl = document.getElementById(kind === 'antecedent' ? 'libNewAntScope' : 'libNewConsScope');
  var name = nameEl.value.trim();
  if(!name){ showToast('Name required'); return; }
  var table = kind === 'antecedent' ? 'behavior_antecedents' : 'behavior_consequences';
  var payload = { name: name };
  if(scopeEl.value === 'practice') payload.practice_id = S.practiceMember.practice_id;
  else payload.practice_client_id = currentClient.id;
  var r = await sb.from(table).insert(payload);
  if(r.error){ showToast(r.error.message); return; }
  nameEl.value = '';
  await loadLibraries();
}

async function deleteLibraryItem(kind, id){
  if(!confirm('Remove this '+kind+'?')) return;
  var table = kind === 'antecedent' ? 'behavior_antecedents' : 'behavior_consequences';
  var r = await sb.from(table).delete().eq('id', id);
  if(r.error){ showToast(r.error.message); return; }
  await loadLibraries();
}

function closeLibrariesModal(){
  document.getElementById('librariesModal').style.display = 'none';
}
```

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba-behave): antecedent + consequence library management

Single modal manages both libraries. Each item has practice-wide or
client-only scope (DB CHECK ensures one of the two FKs is set).
Inline add forms with scope picker. Delete with confirm.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5: ABC entry FK upgrade

### Task 5: Upgrade #2's ABC entry to use FK pickers

**Files:** Modify `app.html`

Replaces the free-text antecedent/consequence inputs in #2's behavior overlay ABC mode with library FK pickers. Preserves "Other (free-text)" as a fallback.

- [ ] **Step 1: Modify the `mode === 'abc'` branch in `renderBehaviorOverlay`**

Find this block (from #2 Task 7):

```javascript
  } else if(behaviorOverlayState.mode === 'abc'){
    title.textContent = behaviorOverlayState.current.name;
    var bo = behaviorOverlayState;
    if(!bo.abc) bo.abc = { antecedent: '', consequence: '', function_category: '', notes: '' };
    el.innerHTML = '<div style="padding:0 4px">'+
      '<label class="fl">Antecedent (what happened just before)</label>'+
      '<textarea id="boAnt" class="fi" rows="2" placeholder="e.g. Asked to come to table">'+esc(bo.abc.antecedent)+'</textarea>'+
```

Replace the entire ABC branch with this expanded version that fetches library items + builds dropdowns:

```javascript
  } else if(behaviorOverlayState.mode === 'abc'){
    title.textContent = behaviorOverlayState.current.name;
    var bo = behaviorOverlayState;
    if(!bo.abc) bo.abc = { antecedent_id: '', antecedent_text: '', consequence_id: '', consequence_text: '', function_category: '', notes: '' };
    // Fetch libraries (cached on bo to avoid refetch)
    if(!bo.libraries){
      Promise.all([
        sb.from('behavior_antecedents').select('id,name').or('practice_id.eq.'+S.practiceMember.practice_id+',practice_client_id.eq.'+activeSession.practice_client_id).order('name'),
        sb.from('behavior_consequences').select('id,name').or('practice_id.eq.'+S.practiceMember.practice_id+',practice_client_id.eq.'+activeSession.practice_client_id).order('name')
      ]).then(function(rs){
        bo.libraries = { antecedents: rs[0].data || [], consequences: rs[1].data || [] };
        renderBehaviorOverlay();
      });
      el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--warm-gray)">Loading libraries…</div>';
      return;
    }
    var antOpts = '<option value="">— Select —</option>' +
      bo.libraries.antecedents.map(function(a){ return '<option value="'+a.id+'"'+(bo.abc.antecedent_id===a.id?' selected':'')+'>'+esc(a.name)+'</option>'; }).join('') +
      '<option value="__other"'+(bo.abc.antecedent_id==='__other'?' selected':'')+'>Other (free-text)</option>';
    var consOpts = '<option value="">— Select —</option>' +
      bo.libraries.consequences.map(function(c){ return '<option value="'+c.id+'"'+(bo.abc.consequence_id===c.id?' selected':'')+'>'+esc(c.name)+'</option>'; }).join('') +
      '<option value="__other"'+(bo.abc.consequence_id==='__other'?' selected':'')+'>Other (free-text)</option>';
    el.innerHTML = '<div style="padding:0 4px">'+
      '<label class="fl">Antecedent (what happened just before)</label>'+
      '<select id="boAntPick" class="fi" onchange="onAbcAntPick(this.value)">'+antOpts+'</select>'+
      (bo.abc.antecedent_id === '__other' ? '<textarea id="boAntText" class="fi" rows="2" style="margin-top:6px" placeholder="Describe…">'+esc(bo.abc.antecedent_text)+'</textarea>' : '')+
      '<label class="fl" style="margin-top:10px">Behavior</label>'+
      '<div style="padding:10px;background:var(--cream);border-radius:10px;font-size:13px"><strong>'+esc(bo.current.name)+'</strong><br><span style="color:var(--warm-gray);font-size:11px">'+esc(bo.current.operational_definition || '')+'</span></div>'+
      '<label class="fl" style="margin-top:10px">Consequence (what happened after)</label>'+
      '<select id="boConsPick" class="fi" onchange="onAbcConsPick(this.value)">'+consOpts+'</select>'+
      (bo.abc.consequence_id === '__other' ? '<textarea id="boConsText" class="fi" rows="2" style="margin-top:6px" placeholder="Describe…">'+esc(bo.abc.consequence_text)+'</textarea>' : '')+
      '<label class="fl" style="margin-top:10px">Function</label>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">'+
        ['tangible','escape','attention','sensory'].map(function(f){
          var sel = bo.abc.function_category === f;
          return '<button onclick="behaviorAbcFn(\x27'+f+'\x27)" style="padding:8px 14px;border-radius:20px;border:2px solid '+(sel?'var(--sage-dark)':'var(--sand)')+';background:'+(sel?'var(--sage-light)':'white')+';color:'+(sel?'var(--sage-dark)':'var(--warm-gray)')+';font-size:12px;font-weight:700;cursor:pointer">'+f+'</button>';
        }).join('')+
      '</div>'+
      '<label class="fl" style="margin-top:10px">Notes (optional)</label>'+
      '<textarea id="boNotes" class="fi" rows="2"></textarea>'+
      '<div style="display:flex;gap:8px;margin-top:16px">'+
      '<button class="btn btn-s" style="flex:1" onclick="behaviorBackToList()">Back</button>'+
      '<button class="btn btn-p" style="flex:1" onclick="behaviorAbcSave()">Save</button>'+
      '</div></div>';
  }
```

- [ ] **Step 2: Add `onAbcAntPick` / `onAbcConsPick` helpers + replace `behaviorAbcSave`**

Find `function behaviorAbcFn(fn)` and `async function behaviorAbcSave()`. Add the two new helpers BEFORE them:

```javascript
function onAbcAntPick(value){
  behaviorOverlayState.abc.antecedent_id = value;
  if(value !== '__other') behaviorOverlayState.abc.antecedent_text = '';
  renderBehaviorOverlay();
}

function onAbcConsPick(value){
  behaviorOverlayState.abc.consequence_id = value;
  if(value !== '__other') behaviorOverlayState.abc.consequence_text = '';
  renderBehaviorOverlay();
}
```

Then REPLACE the existing `behaviorAbcSave` function with this new version that handles both FK and free-text cases:

```javascript
async function behaviorAbcSave(){
  var bo = behaviorOverlayState;
  if(bo.abc.antecedent_id === '__other') bo.abc.antecedent_text = document.getElementById('boAntText').value.trim();
  if(bo.abc.consequence_id === '__other') bo.abc.consequence_text = document.getElementById('boConsText').value.trim();
  bo.abc.notes = document.getElementById('boNotes').value.trim();
  var hasAny = bo.abc.antecedent_id || bo.abc.consequence_id || bo.abc.function_category;
  if(!hasAny){ showToast('Fill at least one field'); return; }
  var payload = {
    session_id: activeSession.id,
    behavior_definition_id: bo.current.id,
    observer_id: S.practiceMember.id,
    recording_type: 'abc',
    function_category: bo.abc.function_category || null,
    client_uuid: mvUuid()
  };
  if(bo.abc.antecedent_id && bo.abc.antecedent_id !== '__other'){
    payload.antecedent_id = bo.abc.antecedent_id;
  }
  if(bo.abc.consequence_id && bo.abc.consequence_id !== '__other'){
    payload.consequence_id = bo.abc.consequence_id;
  }
  var notesParts = [];
  if(bo.abc.antecedent_id === '__other' && bo.abc.antecedent_text) notesParts.push('A: ' + bo.abc.antecedent_text);
  if(bo.abc.consequence_id === '__other' && bo.abc.consequence_text) notesParts.push('C: ' + bo.abc.consequence_text);
  if(bo.abc.notes) notesParts.push(bo.abc.notes);
  if(notesParts.length) payload.notes = notesParts.join('\n');
  mvOffline.enqueue({ table: 'behavior_recordings', payload: payload });
  activeSession.last_behavior_label = bo.current.name + ' (ABC)';
  bo.abc = null;
  bo.libraries = null;
  closeBehaviorOverlay();
  renderActiveSession();
}
```

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba-behave): ABC entry upgrade — FK library pickers

Replaces #2's free-text antecedent/consequence textareas with
dropdowns populated from behavior_antecedents/behavior_consequences
libraries (both practice-wide and client-scoped). "Other (free-text)"
fallback preserved — those entries still flow to the notes field.
Library entries write antecedent_id / consequence_id FKs, enabling
ABC chart aggregation in Task 7.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6: Behavior Dashboard — Trend + Recent

### Task 6: Behavior Dashboard overlay — Trend chart + Recent list

**Files:** Modify `app.html`

Replaces the `openBehaviorDashboard` stub. Adds a full-screen overlay with three tabs (Trend, ABC, Recent). This task ships Trend + Recent; ABC ships in Task 7.

- [ ] **Step 1: Add the dashboard overlay HTML**

```html
<div id="behaviorDashboardPage" class="overlay-page">
  <div class="overlay-header">
    <button class="overlay-back" onclick="closeOverlay('behaviorDashboardPage')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D2D2D" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
    <h2 class="overlay-title" id="bdTitle">Behavior</h2>
  </div>
  <div class="overlay-inner" id="behaviorDashboardContent" style="padding-bottom:80px"></div>
</div>
```

- [ ] **Step 2: Replace the `openBehaviorDashboard` stub**

Find:

```javascript
function openBehaviorDashboard(id){ alert('Behavior dashboard lands in Task 6'); }
```

Replace with:

```javascript
var behaviorDashState = { behaviorId: null, behavior: null, tab: 'trend', combined: false };

async function openBehaviorDashboard(behaviorId){
  behaviorDashState = { behaviorId: behaviorId, behavior: null, tab: 'trend', combined: false };
  document.getElementById('behaviorDashboardPage').classList.add('open');
  var r = await sb.from('behavior_definitions').select('id,name,operational_definition,recording_type,classification').eq('id', behaviorId).single();
  if(r.error){ showToast(r.error.message); return; }
  behaviorDashState.behavior = r.data;
  document.getElementById('bdTitle').textContent = r.data.name;
  await renderBehaviorDashboard();
}

function switchBehaviorDashTab(tab){
  behaviorDashState.tab = tab;
  renderBehaviorDashboard();
}

function toggleBehaviorDashCombined(){
  behaviorDashState.combined = !behaviorDashState.combined;
  renderBehaviorDashboard();
}

async function renderBehaviorDashboard(){
  var el = document.getElementById('behaviorDashboardContent');
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--warm-gray)">Loading…</div>';
  var b = behaviorDashState.behavior;
  var combined = behaviorDashState.combined;
  // Tab bar + combined toggle
  var tabBar = '<div style="max-width:880px;margin:0 auto"><div style="display:flex;gap:0;border-bottom:1px solid var(--sand);margin-bottom:14px">'+
    ['trend','abc','recent'].map(function(t){
      var label = t === 'trend' ? 'Trend' : t === 'abc' ? 'ABC' : 'Recent';
      var active = behaviorDashState.tab === t;
      return '<button onclick="switchBehaviorDashTab(\x27'+t+'\x27)" style="padding:10px 16px;background:none;border:none;border-bottom:3px solid '+(active?'var(--sage-dark)':'transparent')+';color:'+(active?'var(--sage-dark)':'var(--warm-gray)')+';font-weight:700;font-size:14px;cursor:pointer">'+label+'</button>';
    }).join('')+
    '</div>'+
    '<div style="display:flex;gap:8px;align-items:center;margin-bottom:14px"><div style="font-size:12px;color:var(--warm-gray)">View:</div>'+
    '<button onclick="toggleBehaviorDashCombined()" style="padding:6px 12px;border-radius:14px;border:2px solid '+(!combined?'var(--sage-dark)':'var(--sand)')+';background:'+(!combined?'var(--sage-light)':'white')+';color:'+(!combined?'var(--sage-dark)':'var(--warm-gray)')+';font-size:12px;font-weight:700;cursor:pointer">This behavior</button>'+
    '<button onclick="toggleBehaviorDashCombined()" style="padding:6px 12px;border-radius:14px;border:2px solid '+(combined?'var(--sage-dark)':'var(--sand)')+';background:'+(combined?'var(--sage-light)':'white')+';color:'+(combined?'var(--sage-dark)':'var(--warm-gray)')+';font-size:12px;font-weight:700;cursor:pointer">All challenging behaviors</button>'+
    '</div>';
  // Tab content
  if(behaviorDashState.tab === 'trend'){
    tabBar += await renderTrendTab(combined);
  } else if(behaviorDashState.tab === 'recent'){
    tabBar += await renderRecentTab(combined);
  } else {
    tabBar += '<div style="padding:30px;text-align:center;color:var(--warm-gray)">ABC charts land in Task 7.</div>';
  }
  tabBar += '</div>';
  el.innerHTML = tabBar;
}

async function renderTrendTab(combined){
  var b = behaviorDashState.behavior;
  // Determine which definitions to include
  var defIds = combined ? null : [b.id];
  if(combined){
    var allR = await sb.from('behavior_definitions').select('id,name').eq('practice_client_id', currentClient.id).eq('classification', 'challenging').eq('status', 'active');
    defIds = (allR.data || []).map(function(d){ return d.id; });
    if(defIds.length === 0) return '<div style="padding:30px;text-align:center;color:var(--warm-gray)">No challenging behaviors yet.</div>';
  }
  var recR = await sb.from('behavior_recordings')
    .select('behavior_definition_id,recording_type,count,duration_seconds,interval_data,timestamp,session_id,behavior_definitions(name)')
    .in('behavior_definition_id', defIds)
    .is('superseded_by', null)
    .order('timestamp', { ascending: true });
  if(recR.error) return '<div style="padding:20px;color:var(--terracotta)">'+esc(recR.error.message)+'</div>';
  if(!recR.data || recR.data.length === 0) return '<div style="padding:30px;text-align:center;color:var(--warm-gray)">No data yet. Records collected in active sessions will appear here.</div>';
  // Group by session, then by definition
  var bySession = {};
  recR.data.forEach(function(r){
    if(!bySession[r.session_id]){
      bySession[r.session_id] = { timestamp: r.timestamp, defs: {} };
    }
    if(r.timestamp < bySession[r.session_id].timestamp) bySession[r.session_id].timestamp = r.timestamp;
    var defKey = r.behavior_definition_id;
    if(!bySession[r.session_id].defs[defKey]){
      bySession[r.session_id].defs[defKey] = { name: r.behavior_definitions ? r.behavior_definitions.name : '', value: 0 };
    }
    var d = bySession[r.session_id].defs[defKey];
    if(r.recording_type === 'frequency' || r.recording_type === 'abc') d.value += (r.count || (r.recording_type === 'abc' ? 1 : 0));
    else if(r.recording_type === 'duration') d.value += (r.duration_seconds || 0);
    else if(r.recording_type === 'interval' && r.interval_data) d.value += (r.interval_data.results || []).filter(function(x){ return x; }).length;
  });
  var sessions = Object.keys(bySession).map(function(sid){ return Object.assign({ session_id: sid }, bySession[sid]); }).sort(function(a,b){ return new Date(a.timestamp) - new Date(b.timestamp); });
  // Build a series per def
  var seriesByDef = {};
  defIds.forEach(function(did){ seriesByDef[did] = { name: '', points: [] }; });
  sessions.forEach(function(s){
    defIds.forEach(function(did){
      var d = s.defs[did];
      if(d){ seriesByDef[did].name = d.name; seriesByDef[did].points.push({ x: new Date(s.timestamp).getTime(), y: d.value }); }
      else { seriesByDef[did].points.push({ x: new Date(s.timestamp).getTime(), y: 0 }); }
    });
  });
  // Render SVG
  var w = 760, hht = 240, padL = 40, padR = 12, padT = 16, padB = 28;
  var allYs = [];
  Object.keys(seriesByDef).forEach(function(did){ seriesByDef[did].points.forEach(function(p){ allYs.push(p.y); }); });
  var maxY = Math.max.apply(null, allYs.length ? allYs : [10]);
  if(maxY === 0) maxY = 1;
  var allXs = sessions.map(function(s){ return new Date(s.timestamp).getTime(); });
  var minX = Math.min.apply(null, allXs);
  var maxX = Math.max.apply(null, allXs);
  if(maxX === minX) maxX = minX + 1;
  var colors = ['#7A9E7E','#C97B5C','#7B9BB8','#B59C7A','#9D7BB8'];
  var paths = '';
  Object.keys(seriesByDef).forEach(function(did, idx){
    var s = seriesByDef[did];
    var color = colors[idx % colors.length];
    var pathD = s.points.map(function(p, i){
      var x = padL + ((p.x - minX) / (maxX - minX)) * (w - padL - padR);
      var y = hht - padB - ((p.y / maxY) * (hht - padT - padB));
      return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    paths += '<path d="'+pathD+'" fill="none" stroke="'+color+'" stroke-width="2"/>';
    s.points.forEach(function(p){
      var x = padL + ((p.x - minX) / (maxX - minX)) * (w - padL - padR);
      var y = hht - padB - ((p.y / maxY) * (hht - padT - padB));
      paths += '<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="3" fill="'+color+'"/>';
    });
  });
  // Axes
  var axes = '<line x1="'+padL+'" y1="'+(hht-padB)+'" x2="'+(w-padR)+'" y2="'+(hht-padB)+'" stroke="var(--warm-gray-light)" stroke-width="1"/>'+
    '<line x1="'+padL+'" y1="'+padT+'" x2="'+padL+'" y2="'+(hht-padB)+'" stroke="var(--warm-gray-light)" stroke-width="1"/>'+
    '<text x="'+(padL-6)+'" y="'+padT+'" text-anchor="end" font-size="10" fill="var(--warm-gray)" alignment-baseline="middle">'+maxY+'</text>'+
    '<text x="'+(padL-6)+'" y="'+(hht-padB)+'" text-anchor="end" font-size="10" fill="var(--warm-gray)" alignment-baseline="middle">0</text>'+
    '<text x="'+padL+'" y="'+(hht-padB+18)+'" text-anchor="start" font-size="10" fill="var(--warm-gray)">'+new Date(minX).toLocaleDateString()+'</text>'+
    '<text x="'+(w-padR)+'" y="'+(hht-padB+18)+'" text-anchor="end" font-size="10" fill="var(--warm-gray)">'+new Date(maxX).toLocaleDateString()+'</text>';
  // Legend
  var legend = '';
  if(combined){
    legend = '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:12px">';
    Object.keys(seriesByDef).forEach(function(did, idx){
      var s = seriesByDef[did];
      var color = colors[idx % colors.length];
      legend += '<div style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:3px;background:'+color+';display:inline-block"></span>'+esc(s.name)+'</div>';
    });
    legend += '</div>';
  }
  var yLabel = b.recording_type === 'duration' ? 'seconds' : (b.recording_type === 'interval' ? 'occurrences' : 'count');
  return '<div style="background:white;border:1px solid var(--sand);border-radius:14px;padding:14px"><div style="font-size:12px;color:var(--warm-gray);margin-bottom:8px">'+sessions.length+' sessions · y-axis: '+yLabel+' per session</div>'+
    '<svg width="100%" viewBox="0 0 '+w+' '+hht+'" preserveAspectRatio="xMidYMid meet">'+axes+paths+'</svg>'+
    legend+
    '</div>';
}

async function renderRecentTab(combined){
  var b = behaviorDashState.behavior;
  var defIds = combined ? null : [b.id];
  if(combined){
    var allR = await sb.from('behavior_definitions').select('id').eq('practice_client_id', currentClient.id).eq('classification', 'challenging').eq('status', 'active');
    defIds = (allR.data || []).map(function(d){ return d.id; });
    if(defIds.length === 0) return '<div style="padding:30px;text-align:center;color:var(--warm-gray)">No challenging behaviors yet.</div>';
  }
  var r = await sb.from('behavior_recordings')
    .select('id,recording_type,count,duration_seconds,interval_data,function_category,notes,timestamp,behavior_definitions(name),observer:practice_members!observer_id(profiles(name,email)),sessions(start_time)')
    .in('behavior_definition_id', defIds)
    .is('superseded_by', null)
    .order('timestamp', { ascending: false })
    .limit(30);
  if(r.error) return '<div style="padding:20px;color:var(--terracotta)">'+esc(r.error.message)+'</div>';
  if(!r.data || r.data.length === 0) return '<div style="padding:30px;text-align:center;color:var(--warm-gray)">No recordings yet.</div>';
  var h = '<div style="display:flex;flex-direction:column;gap:6px">';
  r.data.forEach(function(rec){
    var when = new Date(rec.timestamp).toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
    var obs = rec.observer && rec.observer.profiles ? (rec.observer.profiles.name || rec.observer.profiles.email) : '';
    var defName = rec.behavior_definitions ? rec.behavior_definitions.name : '';
    var raw = '';
    if(rec.recording_type === 'frequency') raw = (rec.count || 0) + ' occurrences';
    else if(rec.recording_type === 'duration') raw = (rec.duration_seconds || 0) + ' seconds';
    else if(rec.recording_type === 'interval' && rec.interval_data){
      var occ = (rec.interval_data.results || []).filter(function(x){ return x; }).length;
      raw = occ + '/' + (rec.interval_data.results || []).length + ' intervals';
    } else if(rec.recording_type === 'abc'){
      raw = 'ABC' + (rec.function_category ? ' · '+rec.function_category : '');
    }
    h += '<div style="padding:10px 14px;border:1px solid var(--sand);border-radius:10px;background:white">'+
      '<div style="display:flex;justify-content:space-between;align-items:center"><div style="font-weight:700;font-size:13px">'+esc(defName)+' · '+raw+'</div><div style="font-size:11px;color:var(--warm-gray)">'+when+'</div></div>'+
      (rec.notes ? '<div style="font-size:11px;color:var(--warm-gray);margin-top:4px;white-space:pre-wrap">'+esc(rec.notes)+'</div>' : '')+
      (obs ? '<div style="font-size:10px;color:var(--warm-gray-light);margin-top:4px">'+esc(obs)+'</div>' : '')+
      '</div>';
  });
  h += '</div>';
  return h;
}
```

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba-behave): behavior dashboard — Trend + Recent tabs

Full-screen overlay per behavior. Tabs: Trend (SVG line chart per
session over time), Recent (last 30 recordings list), ABC (Task 7).
"Combined view" toggle aggregates across all challenging behaviors
for the client — multiple SVG lines with color-coded legend.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7: ABC bar charts

### Task 7: Behavior Dashboard — ABC tab

**Files:** Modify `app.html`

Replaces the ABC placeholder in `renderBehaviorDashboard` with three horizontal bar charts.

- [ ] **Step 1: Replace the ABC placeholder branch**

Find this block in `renderBehaviorDashboard`:

```javascript
  } else {
    tabBar += '<div style="padding:30px;text-align:center;color:var(--warm-gray)">ABC charts land in Task 7.</div>';
  }
```

Replace with:

```javascript
  } else if(behaviorDashState.tab === 'abc'){
    tabBar += await renderAbcTab(combined);
  }
```

- [ ] **Step 2: Add `renderAbcTab` + bar chart helper**

Insert the new functions (e.g., right after `renderRecentTab`):

```javascript
async function renderAbcTab(combined){
  var b = behaviorDashState.behavior;
  var defIds = combined ? null : [b.id];
  if(combined){
    var allR = await sb.from('behavior_definitions').select('id').eq('practice_client_id', currentClient.id).eq('classification', 'challenging').eq('status', 'active');
    defIds = (allR.data || []).map(function(d){ return d.id; });
    if(defIds.length === 0) return '<div style="padding:30px;text-align:center;color:var(--warm-gray)">No challenging behaviors yet.</div>';
  }
  var r = await sb.from('behavior_recordings')
    .select('antecedent_id,consequence_id,function_category,recording_type,notes,behavior_antecedents(name),behavior_consequences(name)')
    .in('behavior_definition_id', defIds)
    .is('superseded_by', null);
  if(r.error) return '<div style="padding:20px;color:var(--terracotta)">'+esc(r.error.message)+'</div>';
  var data = r.data || [];
  if(data.length === 0) return '<div style="padding:30px;text-align:center;color:var(--warm-gray)">No recordings yet.</div>';
  // Tally
  var antCount = {};   // {name -> count} from FK + legacy notes
  var consCount = {};
  var funcCount = { tangible:0, escape:0, attention:0, sensory:0 };
  data.forEach(function(rec){
    if(rec.behavior_antecedents){
      var n = rec.behavior_antecedents.name;
      antCount[n] = (antCount[n] || 0) + 1;
    } else if(rec.recording_type === 'abc' && rec.notes){
      // Try to extract legacy free-text antecedent ("A: ...")
      var m = rec.notes.match(/^A:\s*(.+?)(\n|$)/);
      if(m){
        var legacyAnt = m[1].trim().slice(0, 60) + ' (free-text)';
        antCount[legacyAnt] = (antCount[legacyAnt] || 0) + 1;
      }
    }
    if(rec.behavior_consequences){
      var nc = rec.behavior_consequences.name;
      consCount[nc] = (consCount[nc] || 0) + 1;
    } else if(rec.recording_type === 'abc' && rec.notes){
      var mc = rec.notes.match(/\nC:\s*(.+?)(\n|$)/);
      if(mc){
        var legacyCons = mc[1].trim().slice(0, 60) + ' (free-text)';
        consCount[legacyCons] = (consCount[legacyCons] || 0) + 1;
      }
    }
    if(rec.function_category && funcCount[rec.function_category] !== undefined){
      funcCount[rec.function_category] += 1;
    }
  });
  function topN(map, n){
    return Object.entries(map).sort(function(a,b){ return b[1] - a[1]; }).slice(0, n);
  }
  var topAnt = topN(antCount, 5);
  var topCons = topN(consCount, 5);
  var funcBars = Object.entries(funcCount).sort(function(a,b){ return b[1] - a[1]; });
  var html = '<div style="display:grid;grid-template-columns:1fr;gap:14px;max-width:760px">';
  html += renderAbcBarBlock('Top antecedents', topAnt, data.length);
  html += renderAbcBarBlock('Top consequences', topCons, data.length);
  html += renderAbcBarBlock('By function', funcBars, data.length);
  html += '</div>';
  return html;
}

function renderAbcBarBlock(title, entries, totalRecords){
  if(entries.length === 0 || entries.every(function(e){ return e[1] === 0; })){
    return '<div style="background:white;border:1px solid var(--sand);border-radius:14px;padding:14px"><div style="font-weight:700;font-size:14px;margin-bottom:8px">'+title+'</div>'+
      '<div style="color:var(--warm-gray);font-size:12px">No data yet.</div></div>';
  }
  var maxCount = Math.max.apply(null, entries.map(function(e){ return e[1]; }));
  if(maxCount === 0) maxCount = 1;
  var h = '<div style="background:white;border:1px solid var(--sand);border-radius:14px;padding:14px"><div style="font-weight:700;font-size:14px;margin-bottom:10px">'+title+'</div>';
  entries.forEach(function(e){
    var name = e[0];
    var count = e[1];
    if(count === 0) return;
    var pct = Math.round((count / maxCount) * 100);
    var pctTotal = totalRecords > 0 ? Math.round((count / totalRecords) * 100) : 0;
    h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'+
      '<div style="width:140px;font-size:12px;color:var(--warm-gray);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(name)+'">'+esc(name)+'</div>'+
      '<div style="flex:1;height:22px;background:var(--cream);border-radius:6px;position:relative;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:var(--sage-light);border-radius:6px"></div></div>'+
      '<div style="width:80px;font-size:12px;font-weight:700">'+count+' &middot; '+pctTotal+'%</div>'+
      '</div>';
  });
  h += '</div>';
  return h;
}
```

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba-behave): behavior dashboard — ABC bar charts

ABC tab shows three horizontal bar charts: top antecedents (FK +
legacy free-text parsed from notes), top consequences (same),
function category breakdown (tangible/escape/attention/sensory).
Single-behavior or combined-view aggregation respected. Backward-
compatible legacy notes parsing keeps pre-Task 5 ABC entries visible.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 8: Docs

### Task 8: Update ROADMAP / AGENT-CONTEXT / TESTING-GUIDE

**Files:**
- Modify: `docs/ROADMAP.md`, `docs/AGENT-CONTEXT.md`, `docs/TESTING-GUIDE.md`

- [ ] **Step 1: ROADMAP — add #3 completed entry**

In `docs/ROADMAP.md`, add to the top of the Completed section:

```markdown
### BCBA Data Collection — Behavior Reduction (2026-05-20)
**Sub-project #3 of 6** — spec: [docs/superpowers/specs/2026-05-19-bcba-behavior-reduction-design.md](docs/superpowers/specs/2026-05-19-bcba-behavior-reduction-design.md)

- [x] Migration — 3 indexes for behavior chart queries (no new tables)
- [x] Client detail tab switcher (Programs / Behaviors)
- [x] Behaviors list + add/edit/archive modal (challenging vs replacement, optional "pairs with")
- [x] Antecedent + Consequence library management (practice-wide vs client-scoped)
- [x] ABC entry upgrade — FK pickers replace #2's free-text inputs; backward-compatible with legacy free-text rows
- [x] Behavior Dashboard — Trend SVG chart, Recent recordings list, ABC bar charts (top antecedents/consequences/function)
- [x] Combined view toggle aggregates across challenging behaviors

**Next:** sub-project #4 — Analysis & Reporting (the iconic per-target line graphs with phase change lines, technical indicators, annotations).

Plan: [docs/superpowers/plans/2026-05-19-bcba-behavior-reduction.md](docs/superpowers/plans/2026-05-19-bcba-behavior-reduction.md)
```

Also update the in-flight section if present.

- [ ] **Step 2: AGENT-CONTEXT — update in-flight**

Find `## In-flight work — BCBA Data Collection` and update with:

```markdown
**Status as of 2026-05-20:** Sub-projects #1, #2, #3 **complete and merged**. Clinical workflow end-to-end: setup → live session → trial entry → behavior tracking → per-behavior dashboard with ABC analytics. Parents see "My BCBA" with sparklines.

**Sequence forward:**
1. **Mini-spec — per-patient Stripe billing** (before users sign up).
2. **Sub-project #4 — Analysis & Reporting.** Per-target line graphs with phase change lines, technical indicators, annotations. The iconic BCBA chart.
3. **Sub-project #5 — Documentation.** SOAP note auto-fill from session data; timesheet signatures.
4. **Sub-project #6 — Curriculum Libraries.** Ariana-authored Starter content; VB-MAPP / ABLLS-R / PEAK / AFLS licensing.

**Coverage vs Ensora (after #3):** ~90% data model, ~65% UI surface.
```

- [ ] **Step 3: TESTING-GUIDE — add #3 walkthrough**

After the Live Data Entry section, add:

```markdown
### Behavior Reduction (BCBA Data Collection — sub-project #3)

Sign in as `testprovider@modernvillage.app`.

- [ ] Client detail shows tab switcher (Programs / Behaviors)
- [ ] Behaviors tab: list grouped by classification, "Triggers/consequences" + "+ Add behavior" buttons visible for BCBA
- [ ] Add behavior modal: name, operational def (≥20), recording type, classification; replacement type shows optional "Pairs with"
- [ ] Triggers/consequences modal: add/delete antecedents + consequences with practice-wide or client-only scope
- [ ] In a live session, ABC overlay now shows FK dropdowns + "Other (free-text)" fallback
- [ ] Saving an ABC entry with library pick → `antecedent_id` / `consequence_id` set on recording row
- [ ] Behavior Dashboard opens; Trend tab shows line chart; Recent tab lists last 30; ABC tab shows three bar charts
- [ ] Combined view toggle aggregates across challenging behaviors (multiple chart lines)
```

- [ ] **Step 4: Commit all three**

```bash
git add docs/ROADMAP.md docs/AGENT-CONTEXT.md docs/TESTING-GUIDE.md
git commit -m "$(cat <<'EOF'
docs: BCBA Behavior Reduction status + testing walkthrough

ROADMAP: sub-project #3 complete, #4 next.
AGENT-CONTEXT: refresh — #1, #2, #3 shipped; ~65% UI coverage of Ensora.
TESTING-GUIDE: add Behavior Reduction walkthrough.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review checklist

- [ ] Migration applies cleanly
- [ ] Behaviors tab visible, defaults to Programs tab
- [ ] Behavior CRUD modal works for both classifications
- [ ] Library modal adds/deletes antecedents + consequences
- [ ] ABC entry shows FK pickers in live session
- [ ] Saving with library pick writes the FK
- [ ] Dashboard renders Trend chart, Recent list, ABC bar charts
- [ ] Combined view toggle aggregates correctly
- [ ] No regressions in #2's trial entry, behavior overlay (non-ABC modes), session summary
