# BCBA Analysis & Reporting Implementation Plan

> **For agentic workers:** Subagent-driven, one commit per task.

**Goal:** Ship the iconic BCBA per-target line graph (with phase change vertical lines + average overlay + mean-of-day connector), a per-practice Analysis Dashboard, and cross-client behavior trends.

**Spec:** [docs/superpowers/specs/2026-05-20-bcba-analysis-reporting-design.md](../specs/2026-05-20-bcba-analysis-reporting-design.md)

**Tech:** Supabase Postgres + RLS, vanilla HTML/JS `app.html`, inline SVG charts. Builds on Foundation + #2 + #3.

**Commit cadence:** one per task. Co-Authored-By trailer on each.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260521_bcba_analysis_reporting.sql` | phase_changes table + 2 indexes |
| `app.html` | Per-target graph overlay, phase change modal, Analysis sidebar item + dashboard |
| `docs/ROADMAP.md` + `docs/AGENT-CONTEXT.md` + `docs/TESTING-GUIDE.md` | Status + testing walkthrough |

---

## Task 1: Migration

**Files:** Create `supabase/migrations/20260521_bcba_analysis_reporting.sql`

- [ ] **Create the file with this content:**

```sql
-- ═══════════════════════════════════════════════════
-- BCBA Data Collection — Analysis & Reporting (sub-project #4)
-- 2026-05-21
-- Spec: docs/superpowers/specs/2026-05-20-bcba-analysis-reporting-design.md
-- Depends on: 20260518_bcba_data_collection_foundation.sql
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.phase_changes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  target_id uuid REFERENCES public.targets(id) ON DELETE CASCADE NOT NULL,
  occurred_at date NOT NULL,
  label text NOT NULL,
  notes text,
  created_by uuid REFERENCES public.practice_members(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(target_id, occurred_at, label)
);

CREATE INDEX IF NOT EXISTS idx_phase_changes_target ON public.phase_changes(target_id, occurred_at);

ALTER TABLE public.phase_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read phase changes" ON public.phase_changes
  FOR SELECT USING (
    public.is_practice_member((
      SELECT pc.practice_id FROM public.targets t
      JOIN public.programs p ON p.id = t.program_id
      JOIN public.practice_clients pc ON pc.id = p.practice_client_id
      WHERE t.id = target_id
    )) OR public.is_admin()
  );

CREATE POLICY "BCBA writes phase changes" ON public.phase_changes
  FOR ALL USING (
    public.is_practice_bcba((
      SELECT pc.practice_id FROM public.targets t
      JOIN public.programs p ON p.id = t.program_id
      JOIN public.practice_clients pc ON pc.id = p.practice_client_id
      WHERE t.id = target_id
    )) OR public.is_admin()
  )
  WITH CHECK (
    public.is_practice_bcba((
      SELECT pc.practice_id FROM public.targets t
      JOIN public.programs p ON p.id = t.program_id
      JOIN public.practice_clients pc ON pc.id = p.practice_client_id
      WHERE t.id = target_id
    )) OR public.is_admin()
  );

CREATE INDEX IF NOT EXISTS idx_targets_in_treatment
  ON public.targets(program_id, status, promoted_at)
  WHERE status IN ('baseline','in_treatment');
```

- [ ] **Commit:**

```bash
git add supabase/migrations/20260521_bcba_analysis_reporting.sql
git commit -m "$(cat <<'EOF'
feat(bcba-report): migration — phase_changes table + analysis indexes

New phase_changes table (target_id, occurred_at, label, notes) with
member-read / BCBA-write RLS scoped through targets→programs→
practice_clients. Plus a partial index on targets(program_id, status,
promoted_at) WHERE status IN ('baseline','in_treatment') for the
"needs reassessment" query.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Per-target line graph view + "View graph" button

**Files:** Modify `app.html`

Adds a "View graph" button on each target card in `renderTargets` (from Foundation Task 12). Opens a new overlay with the full SVG line chart.

- [ ] **Step 1: Add the graph overlay HTML**

Insert near other practice overlays:

```html
<div id="targetGraphPage" class="overlay-page">
  <div class="overlay-header">
    <button class="overlay-back" onclick="closeOverlay('targetGraphPage')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D2D2D" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
    <h2 class="overlay-title" id="tgTitle">Target graph</h2>
  </div>
  <div class="overlay-inner" id="targetGraphContent" style="padding-bottom:80px"></div>
</div>
```

- [ ] **Step 2: Add "View graph" button to each target card**

Find this block in `renderTargets` (Foundation Task 12):

```javascript
        (canWrite ? '<button class="btn btn-s" style="padding:6px 10px;font-size:11px" onclick="editTarget(\x27'+t.id+'\x27)">Edit</button>' : '')+
        '</div></div>';
```

Replace with (adds a Graph button alongside Edit):

```javascript
        '<div style="display:flex;flex-direction:column;gap:4px">'+
        '<button class="btn btn-s" style="padding:6px 10px;font-size:11px" onclick="openTargetGraph(\x27'+t.id+'\x27)">Graph &rarr;</button>'+
        (canWrite ? '<button class="btn btn-s" style="padding:6px 10px;font-size:11px" onclick="editTarget(\x27'+t.id+'\x27)">Edit</button>' : '')+
        '</div></div></div>';
```

Note: that change replaces the closing `</div></div>` on the target card row. Be careful to preserve the existing div nesting — the surrounding flex layout from Foundation Task 12 had a `display:flex;justify-content:space-between;align-items:start;gap:10px` on the row. The new structure wraps both buttons in a column flex container.

Verify by inspecting the rendered output: each target row should have a Graph button on top and (if canWrite) an Edit button below.

- [ ] **Step 3: Add the target graph module**

Insert near other practice JS functions:

```javascript
var targetGraphState = { targetId: null, showAverage: true, showMeanOfDay: false };

async function openTargetGraph(targetId){
  targetGraphState = { targetId: targetId, showAverage: true, showMeanOfDay: false };
  document.getElementById('targetGraphPage').classList.add('open');
  await renderTargetGraph();
}

async function renderTargetGraph(){
  var el = document.getElementById('targetGraphContent');
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--warm-gray)">Loading…</div>';
  var tR = await sb.from('targets').select('id,name,target_type,programs(name)').eq('id', targetGraphState.targetId).single();
  if(tR.error){ el.innerHTML = '<div style="padding:20px;color:var(--terracotta)">'+esc(tR.error.message)+'</div>'; return; }
  var t = tR.data;
  document.getElementById('tgTitle').textContent = t.name;
  var trR = await sb.from('trials')
    .select('response,prompt_level,timestamp,session_id,sessions(start_time)')
    .eq('target_id', targetGraphState.targetId)
    .is('superseded_by', null)
    .is('ioa_observer_id', null)
    .order('timestamp', { ascending: true });
  var pcR = await sb.from('phase_changes').select('id,occurred_at,label,notes').eq('target_id', targetGraphState.targetId).order('occurred_at');
  var canWrite = S.practiceMember.role === 'owner_bcba' || S.practiceMember.role === 'supervising_bcba';
  if(trR.error || pcR.error){ el.innerHTML = '<div style="padding:20px;color:var(--terracotta)">'+esc((trR.error||pcR.error).message)+'</div>'; return; }
  var trials = trR.data || [];
  var phaseChanges = pcR.data || [];
  // Aggregate trials by session → % correct per session
  var bySession = {};
  trials.forEach(function(tr){
    var sid = tr.session_id;
    if(!bySession[sid]) bySession[sid] = { date: tr.sessions && tr.sessions.start_time ? new Date(tr.sessions.start_time) : new Date(tr.timestamp), total: 0, correct: 0 };
    bySession[sid].total += 1;
    if(tr.response === 'correct') bySession[sid].correct += 1;
  });
  var sessions = Object.keys(bySession).map(function(sid){
    var s = bySession[sid];
    return { date: s.date, pct: s.total > 0 ? (s.correct / s.total) * 100 : 0 };
  }).sort(function(a,b){ return a.date - b.date; });
  // Header + toggles
  var hdr = '<div style="max-width:920px;margin:0 auto">'+
    '<div style="font-family:Fraunces,serif;font-size:20px;font-weight:700">'+esc(t.name)+'</div>'+
    '<div style="font-size:13px;color:var(--warm-gray);margin-bottom:14px">'+esc((t.programs && t.programs.name) || '')+' · '+sessions.length+' sessions · '+trials.length+' trials</div>'+
    '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">'+
    '<button onclick="toggleGraphAverage()" style="padding:6px 12px;border-radius:14px;border:2px solid '+(targetGraphState.showAverage?'var(--sage-dark)':'var(--sand)')+';background:'+(targetGraphState.showAverage?'var(--sage-light)':'white')+';color:'+(targetGraphState.showAverage?'var(--sage-dark)':'var(--warm-gray)')+';font-size:12px;font-weight:700;cursor:pointer">'+(targetGraphState.showAverage?'✓ ':'')+'Average</button>'+
    '<button onclick="toggleGraphMeanOfDay()" style="padding:6px 12px;border-radius:14px;border:2px solid '+(targetGraphState.showMeanOfDay?'var(--sage-dark)':'var(--sand)')+';background:'+(targetGraphState.showMeanOfDay?'var(--sage-light)':'white')+';color:'+(targetGraphState.showMeanOfDay?'var(--sage-dark)':'var(--warm-gray)')+';font-size:12px;font-weight:700;cursor:pointer">'+(targetGraphState.showMeanOfDay?'✓ ':'')+'Mean-of-day</button>'+
    '<span style="padding:6px 12px;border-radius:14px;border:2px solid var(--sand);color:var(--warm-gray-light);font-size:12px">Trend line — coming soon</span>'+
    '</div>';
  // Chart
  var chart = renderTargetGraphSvg(sessions, phaseChanges);
  // Phase changes list
  var pcList = '<div class="label" style="margin-top:18px;margin-bottom:8px">Phase changes</div>';
  if(phaseChanges.length === 0){
    pcList += '<div style="padding:10px;background:var(--cream);border-radius:10px;font-size:13px;color:var(--warm-gray)">None. '+(canWrite?'Click "+ Add phase change" to mark a clinical event (BIP change, target promoted, etc.).':'')+'</div>';
  } else {
    pcList += '<div style="display:flex;flex-direction:column;gap:6px">';
    phaseChanges.forEach(function(pc){
      pcList += '<div style="padding:10px 14px;border:1px solid var(--sand);border-radius:10px;background:white;display:flex;justify-content:space-between;align-items:center"><div><div style="font-weight:700;font-size:13px">'+esc(pc.label)+'</div><div style="font-size:11px;color:var(--warm-gray);margin-top:2px">'+new Date(pc.occurred_at).toLocaleDateString()+(pc.notes?' · '+esc(pc.notes):'')+'</div></div>'+
        (canWrite ? '<div style="display:flex;gap:4px"><button class="btn btn-s" style="padding:4px 8px;font-size:11px" onclick="editPhaseChange(\x27'+pc.id+'\x27)">Edit</button><button class="btn btn-s" style="padding:4px 8px;font-size:11px" onclick="deletePhaseChange(\x27'+pc.id+'\x27)">×</button></div>' : '')+
        '</div>';
    });
    pcList += '</div>';
  }
  if(canWrite) pcList += '<button class="btn btn-s" style="margin-top:8px;font-size:12px;padding:6px 12px" onclick="openPhaseChangeModal(null)">+ Add phase change</button>';
  el.innerHTML = hdr + chart + pcList + '</div>';
}

function renderTargetGraphSvg(sessions, phaseChanges){
  if(sessions.length === 0){
    return '<div style="background:white;border:1px solid var(--sand);border-radius:14px;padding:30px;text-align:center;color:var(--warm-gray)">No session data yet.</div>';
  }
  var w = 880, hht = 320, padL = 44, padR = 16, padT = 18, padB = 36;
  var minDate = sessions[0].date.getTime();
  var maxDate = sessions[sessions.length-1].date.getTime();
  if(maxDate === minDate) maxDate = minDate + 1;
  // Plot points
  var pathParts = [];
  var circles = '';
  sessions.forEach(function(s, i){
    var x = padL + ((s.date.getTime() - minDate) / (maxDate - minDate)) * (w - padL - padR);
    var y = hht - padB - (s.pct / 100) * (hht - padT - padB);
    pathParts.push((i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1));
    circles += '<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="3.5" fill="#7B9BB8"><title>'+s.date.toLocaleDateString()+': '+Math.round(s.pct)+'%</title></circle>';
  });
  var path = '<path d="'+pathParts.join(' ')+'" fill="none" stroke="#7B9BB8" stroke-width="2"/>';
  // Phase change lines
  var phaseLines = '';
  phaseChanges.forEach(function(pc){
    var d = new Date(pc.occurred_at).getTime();
    if(d < minDate || d > maxDate) return;
    var x = padL + ((d - minDate) / (maxDate - minDate)) * (w - padL - padR);
    phaseLines += '<line x1="'+x.toFixed(1)+'" y1="'+padT+'" x2="'+x.toFixed(1)+'" y2="'+(hht-padB)+'" stroke="var(--terracotta)" stroke-width="1.5" stroke-dasharray="4 4"/>'+
      '<text x="'+x.toFixed(1)+'" y="'+(padT - 4)+'" text-anchor="middle" font-size="10" fill="var(--terracotta)" font-weight="700">'+esc(pc.label).slice(0, 16)+'</text>';
  });
  // Average overlay
  var avgLine = '';
  if(targetGraphState.showAverage && sessions.length > 0){
    var avg = sessions.reduce(function(a,s){ return a + s.pct; }, 0) / sessions.length;
    var ay = hht - padB - (avg / 100) * (hht - padT - padB);
    avgLine = '<line x1="'+padL+'" y1="'+ay.toFixed(1)+'" x2="'+(w-padR)+'" y2="'+ay.toFixed(1)+'" stroke="var(--sage-dark)" stroke-width="1" stroke-dasharray="2 4"/>'+
      '<text x="'+(w-padR-2)+'" y="'+(ay - 4).toFixed(1)+'" text-anchor="end" font-size="10" fill="var(--sage-dark)">avg '+Math.round(avg)+'%</text>';
  }
  // Mean-of-day connector
  var meanLine = '';
  if(targetGraphState.showMeanOfDay){
    var byDay = {};
    sessions.forEach(function(s){
      var key = s.date.toDateString();
      if(!byDay[key]) byDay[key] = { date: s.date, total: 0, count: 0 };
      byDay[key].total += s.pct;
      byDay[key].count += 1;
    });
    var dayPoints = Object.keys(byDay).map(function(k){
      var dd = byDay[k];
      return { date: dd.date, pct: dd.total / dd.count };
    }).sort(function(a,b){ return a.date - b.date; });
    if(dayPoints.length > 1){
      var meanPath = dayPoints.map(function(s, i){
        var x = padL + ((s.date.getTime() - minDate) / (maxDate - minDate)) * (w - padL - padR);
        var y = hht - padB - (s.pct / 100) * (hht - padT - padB);
        return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ');
      meanLine = '<path d="'+meanPath+'" fill="none" stroke="#C97B5C" stroke-width="2" stroke-dasharray="6 3"/>';
    }
  }
  // Axes + gridlines
  var axes = '';
  // Y axis with 0/25/50/75/100 ticks
  [0, 25, 50, 75, 100].forEach(function(pct){
    var y = hht - padB - (pct / 100) * (hht - padT - padB);
    axes += '<line x1="'+padL+'" y1="'+y+'" x2="'+(w-padR)+'" y2="'+y+'" stroke="var(--warm-gray-light)" stroke-width="0.5" stroke-dasharray="2 4" opacity="0.5"/>'+
      '<text x="'+(padL-6)+'" y="'+y+'" text-anchor="end" font-size="10" fill="var(--warm-gray)" alignment-baseline="middle">'+pct+'%</text>';
  });
  // X axis with min/mid/max date
  var midDate = new Date((minDate + maxDate) / 2);
  axes += '<line x1="'+padL+'" y1="'+(hht-padB)+'" x2="'+(w-padR)+'" y2="'+(hht-padB)+'" stroke="var(--warm-gray-light)" stroke-width="1"/>'+
    '<line x1="'+padL+'" y1="'+padT+'" x2="'+padL+'" y2="'+(hht-padB)+'" stroke="var(--warm-gray-light)" stroke-width="1"/>'+
    '<text x="'+padL+'" y="'+(hht-padB+18)+'" text-anchor="start" font-size="10" fill="var(--warm-gray)">'+new Date(minDate).toLocaleDateString()+'</text>'+
    '<text x="'+((padL+w-padR)/2)+'" y="'+(hht-padB+18)+'" text-anchor="middle" font-size="10" fill="var(--warm-gray)">'+midDate.toLocaleDateString()+'</text>'+
    '<text x="'+(w-padR)+'" y="'+(hht-padB+18)+'" text-anchor="end" font-size="10" fill="var(--warm-gray)">'+new Date(maxDate).toLocaleDateString()+'</text>';
  return '<div style="background:white;border:1px solid var(--sand);border-radius:14px;padding:14px"><svg width="100%" viewBox="0 0 '+w+' '+hht+'" preserveAspectRatio="xMidYMid meet">'+axes+phaseLines+avgLine+meanLine+path+circles+'</svg></div>';
}

function toggleGraphAverage(){ targetGraphState.showAverage = !targetGraphState.showAverage; renderTargetGraph(); }
function toggleGraphMeanOfDay(){ targetGraphState.showMeanOfDay = !targetGraphState.showMeanOfDay; renderTargetGraph(); }

function openPhaseChangeModal(id){ alert('Phase change modal lands in Task 3'); }
function editPhaseChange(id){ openPhaseChangeModal(id); }
async function deletePhaseChange(id){ alert('Delete lands in Task 3'); }
```

- [ ] **Commit:**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba-report): per-target line graph with phase changes

Full SVG line chart (~880×320) with 0/25/50/75/100% gridlines, date
axis, point markers per session with hover tooltips. Vertical dashed
red lines at each phase change with label. Average overlay (sage
dashed) and mean-of-day connector (terracotta dashed) toggle on.
Phase change list with add/edit/delete actions (stubs land Task 3).

"View graph" button added to each target card in Targets editor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Phase change CRUD modal

**Files:** Modify `app.html`

- [ ] **Step 1: Add modal HTML**

```html
<div id="phaseChangeModal" class="modal-overlay" style="display:none">
  <div class="modal-content" style="max-width:460px">
    <h3 id="pcmTitle" style="font-family:Fraunces,serif;font-size:22px;margin-bottom:12px">Add phase change</h3>
    <label class="fl">Date *</label>
    <input id="pcmDate" class="fi" type="date">
    <label class="fl" style="margin-top:12px">Label *</label>
    <select id="pcmLabel" class="fi">
      <option>BIP change</option>
      <option>Target promoted</option>
      <option>Reinforcer changed</option>
      <option>Intervention changed</option>
      <option>Other</option>
    </select>
    <label class="fl" style="margin-top:12px">Notes (optional)</label>
    <textarea id="pcmNotes" class="fi" rows="2"></textarea>
    <div style="display:flex;gap:8px;margin-top:18px">
      <button class="btn btn-s" style="flex:1" onclick="closePhaseChangeModal()">Cancel</button>
      <button class="btn btn-p" style="flex:1" onclick="submitPhaseChange()">Save</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Replace `openPhaseChangeModal` + `editPhaseChange` + `deletePhaseChange` stubs**

Find:

```javascript
function openPhaseChangeModal(id){ alert('Phase change modal lands in Task 3'); }
function editPhaseChange(id){ openPhaseChangeModal(id); }
async function deletePhaseChange(id){ alert('Delete lands in Task 3'); }
```

Replace with:

```javascript
var phaseChangeEditing = null;

async function openPhaseChangeModal(id){
  phaseChangeEditing = null;
  document.getElementById('pcmTitle').textContent = 'Add phase change';
  document.getElementById('pcmDate').value = new Date().toISOString().slice(0,10);
  document.getElementById('pcmLabel').value = 'BIP change';
  document.getElementById('pcmNotes').value = '';
  if(id){
    var r = await sb.from('phase_changes').select('*').eq('id', id).single();
    if(r.error){ showToast(r.error.message); return; }
    phaseChangeEditing = r.data;
    document.getElementById('pcmTitle').textContent = 'Edit phase change';
    document.getElementById('pcmDate').value = r.data.occurred_at;
    document.getElementById('pcmLabel').value = r.data.label;
    document.getElementById('pcmNotes').value = r.data.notes || '';
  }
  document.getElementById('phaseChangeModal').style.display = 'flex';
}

function editPhaseChange(id){ openPhaseChangeModal(id); }

function closePhaseChangeModal(){
  document.getElementById('phaseChangeModal').style.display = 'none';
}

async function submitPhaseChange(){
  var occurredAt = document.getElementById('pcmDate').value;
  var label = document.getElementById('pcmLabel').value;
  var notes = document.getElementById('pcmNotes').value.trim() || null;
  if(!occurredAt || !label){ showToast('Date and label required'); return; }
  var payload = {
    target_id: targetGraphState.targetId,
    occurred_at: occurredAt,
    label: label,
    notes: notes,
    created_by: S.practiceMember.id
  };
  if(phaseChangeEditing){
    var upd = await sb.from('phase_changes').update(payload).eq('id', phaseChangeEditing.id);
    if(upd.error){ showToast(upd.error.message); return; }
  } else {
    var ins = await sb.from('phase_changes').insert(payload);
    if(ins.error){ showToast(ins.error.message); return; }
  }
  closePhaseChangeModal();
  renderTargetGraph();
}

async function deletePhaseChange(id){
  if(!confirm('Delete this phase change?')) return;
  var r = await sb.from('phase_changes').delete().eq('id', id);
  if(r.error){ showToast(r.error.message); return; }
  renderTargetGraph();
}
```

- [ ] **Commit:**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba-report): phase change CRUD modal

Add/edit phase change with date picker, label dropdown (BIP change /
Target promoted / Reinforcer changed / Intervention changed / Other),
optional notes. Delete with confirm. Re-renders the target graph
after save/delete so the vertical line updates immediately.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Analysis Dashboard — Targets tab

**Files:** Modify `app.html`

- [ ] **Step 1: Add "Analysis" sidebar item**

Find the `allItems` array. Add a new entry for practice members:

```javascript
{label:"Analysis", action:"openAnalysisDashboard()", roles:['provider'], requiresPractice:true},
```

(Insert near the other practice-gated items.)

- [ ] **Step 2: Add Analysis Dashboard overlay HTML**

```html
<div id="analysisDashboardPage" class="overlay-page">
  <div class="overlay-header">
    <button class="overlay-back" onclick="closeOverlay('analysisDashboardPage')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D2D2D" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
    <h2 class="overlay-title">Analysis</h2>
  </div>
  <div class="overlay-inner" id="analysisDashboardContent" style="padding-bottom:80px"></div>
</div>
```

- [ ] **Step 3: Add the Analysis Dashboard module**

```javascript
var analysisDashTab = 'targets'; // 'targets' | 'behaviors'

async function openAnalysisDashboard(){
  if(!S.practiceMember){ showToast('Set up your practice first'); return; }
  analysisDashTab = 'targets';
  document.getElementById('analysisDashboardPage').classList.add('open');
  await renderAnalysisDashboard();
}

async function renderAnalysisDashboard(){
  var el = document.getElementById('analysisDashboardContent');
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--warm-gray)">Loading…</div>';
  var tabBar = '<div style="max-width:920px;margin:0 auto"><div style="display:flex;gap:0;border-bottom:1px solid var(--sand);margin-bottom:14px">'+
    ['targets','behaviors'].map(function(t){
      var label = t === 'targets' ? 'Skill targets' : 'Behaviors';
      var active = analysisDashTab === t;
      return '<button onclick="switchAnalysisTab(\x27'+t+'\x27)" style="padding:10px 16px;background:none;border:none;border-bottom:3px solid '+(active?'var(--sage-dark)':'transparent')+';color:'+(active?'var(--sage-dark)':'var(--warm-gray)')+';font-weight:700;font-size:14px;cursor:pointer">'+label+'</button>';
    }).join('')+
    '</div>';
  if(analysisDashTab === 'targets'){
    tabBar += await renderAnalysisTargetsTab();
  } else {
    tabBar += await renderAnalysisBehaviorsTab();
  }
  tabBar += '</div>';
  el.innerHTML = tabBar;
}

function switchAnalysisTab(t){ analysisDashTab = t; renderAnalysisDashboard(); }

async function renderAnalysisTargetsTab(){
  // Get all in-treatment targets for this practice with their recent trial data
  var pcR = await sb.from('practice_clients').select('id,children(name)').eq('practice_id', S.practiceMember.practice_id).eq('status', 'active');
  var pcIds = (pcR.data || []).map(function(c){ return c.id; });
  if(pcIds.length === 0) return '<div style="padding:30px;text-align:center;color:var(--warm-gray)">No active clients yet.</div>';
  var pgR = await sb.from('programs').select('id,name,practice_client_id').in('practice_client_id', pcIds).eq('status', 'active');
  var pgIds = (pgR.data || []).map(function(p){ return p.id; });
  if(pgIds.length === 0) return '<div style="padding:30px;text-align:center;color:var(--warm-gray)">No active programs.</div>';
  var tR = await sb.from('targets').select('id,name,status,promoted_at,created_at,program_id').in('program_id', pgIds).in('status', ['baseline','in_treatment']);
  var targets = tR.data || [];
  if(targets.length === 0) return '<div style="padding:30px;text-align:center;color:var(--warm-gray)">No targets in treatment.</div>';
  var targetIds = targets.map(function(t){ return t.id; });
  // Fetch all trials for these targets (last 60 days)
  var sixtyDaysAgo = new Date(Date.now() - 60*24*60*60*1000).toISOString();
  var trR = await sb.from('trials').select('target_id,response,timestamp,session_id').in('target_id', targetIds).is('superseded_by', null).is('ioa_observer_id', null).gte('timestamp', sixtyDaysAgo);
  var trialsByTarget = {};
  (trR.data || []).forEach(function(tr){
    if(!trialsByTarget[tr.target_id]) trialsByTarget[tr.target_id] = [];
    trialsByTarget[tr.target_id].push(tr);
  });
  // For each target, compute % correct over last 5 sessions
  function recentPct(targetId){
    var ts = trialsByTarget[targetId] || [];
    if(ts.length === 0) return null;
    // Group by session, take last 5
    var bySess = {};
    ts.forEach(function(tr){ if(!bySess[tr.session_id]) bySess[tr.session_id] = { total: 0, correct: 0, ts: tr.timestamp }; var s = bySess[tr.session_id]; s.total += 1; if(tr.response === 'correct') s.correct += 1; if(tr.timestamp > s.ts) s.ts = tr.timestamp; });
    var sessList = Object.values(bySess).sort(function(a,b){ return new Date(b.ts) - new Date(a.ts); }).slice(0, 5);
    var totalCorrect = sessList.reduce(function(a,s){ return a + s.correct; }, 0);
    var totalTrials = sessList.reduce(function(a,s){ return a + s.total; }, 0);
    return totalTrials > 0 ? (totalCorrect / totalTrials) * 100 : null;
  }
  // Programs lookup for client name
  var pgMap = {};
  (pgR.data || []).forEach(function(p){ pgMap[p.id] = p; });
  var pcMap = {};
  (pcR.data || []).forEach(function(c){ pcMap[c.id] = c; });
  function clientName(targetId){
    var t = targets.find(function(x){ return x.id === targetId; });
    if(!t) return '';
    var pg = pgMap[t.program_id];
    if(!pg) return '';
    var pc = pcMap[pg.practice_client_id];
    return pc && pc.children ? pc.children.name : '';
  }
  // Build scored list
  var scored = targets.map(function(t){
    var pct = recentPct(t.id);
    var startedAt = t.promoted_at || t.created_at;
    var daysInTreatment = Math.floor((Date.now() - new Date(startedAt).getTime()) / 86400000);
    return { target: t, pct: pct, daysInTreatment: daysInTreatment, clientName: clientName(t.id), programName: pgMap[t.program_id] ? pgMap[t.program_id].name : '' };
  });
  var needsReassessment = scored.filter(function(s){ return s.daysInTreatment > 30 && s.pct !== null && s.pct < 80; }).sort(function(a,b){ return a.pct - b.pct; }).slice(0, 10);
  var best = scored.filter(function(s){ return s.pct !== null; }).sort(function(a,b){ return b.pct - a.pct; }).slice(0, 5);
  var worst = scored.filter(function(s){ return s.pct !== null; }).sort(function(a,b){ return a.pct - b.pct; }).slice(0, 5);
  // RBT activity
  var pmR = await sb.from('practice_members').select('id,role,profiles(name,email)').eq('practice_id', S.practiceMember.practice_id).eq('active', true);
  var members = pmR.data || [];
  var memberMap = {};
  members.forEach(function(m){ memberMap[m.id] = m; });
  var thirtyDaysAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString();
  var sessR = await sb.from('sessions').select('id,provider_id').in('practice_client_id', pcIds).gte('start_time', thirtyDaysAgo);
  var sessByProvider = {};
  (sessR.data || []).forEach(function(s){ sessByProvider[s.provider_id] = (sessByProvider[s.provider_id] || 0) + 1; });
  var sessIds = (sessR.data || []).map(function(s){ return s.id; });
  var allTrR = sessIds.length > 0 ? await sb.from('trials').select('session_id').in('session_id', sessIds).is('superseded_by', null).is('ioa_observer_id', null) : { data: [] };
  var trialsByProvider = {};
  (allTrR.data || []).forEach(function(tr){
    var sess = (sessR.data || []).find(function(s){ return s.id === tr.session_id; });
    if(sess){ trialsByProvider[sess.provider_id] = (trialsByProvider[sess.provider_id] || 0) + 1; }
  });
  // Render
  var h = '';
  h += renderAnalysisCard('Targets needing reassessment', needsReassessment, function(s){
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--sand);cursor:pointer" onclick="openTargetGraph(\x27'+s.target.id+'\x27)">'+
      '<div><div style="font-weight:700;font-size:13px">'+esc(s.target.name)+'</div><div style="font-size:11px;color:var(--warm-gray)">'+esc(s.clientName)+' · '+esc(s.programName)+' · '+s.daysInTreatment+' days</div></div>'+
      '<div style="font-size:13px;font-weight:700;color:'+(s.pct < 60 ? 'var(--terracotta)' : '#7A6A10')+'">'+Math.round(s.pct)+'%</div>'+
      '</div>';
  }, 'In treatment >30 days with <80% recent mastery. Click to open graph.');
  h += renderAnalysisCard('Best performing targets', best, function(s){
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--sand);cursor:pointer" onclick="openTargetGraph(\x27'+s.target.id+'\x27)">'+
      '<div><div style="font-weight:700;font-size:13px">'+esc(s.target.name)+'</div><div style="font-size:11px;color:var(--warm-gray)">'+esc(s.clientName)+'</div></div>'+
      '<div style="font-size:13px;font-weight:700;color:var(--sage-dark)">'+Math.round(s.pct)+'%</div>'+
      '</div>';
  });
  h += renderAnalysisCard('Worst performing targets', worst, function(s){
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--sand);cursor:pointer" onclick="openTargetGraph(\x27'+s.target.id+'\x27)">'+
      '<div><div style="font-weight:700;font-size:13px">'+esc(s.target.name)+'</div><div style="font-size:11px;color:var(--warm-gray)">'+esc(s.clientName)+'</div></div>'+
      '<div style="font-size:13px;font-weight:700;color:var(--terracotta)">'+Math.round(s.pct)+'%</div>'+
      '</div>';
  });
  // RBT activity card
  var rbtRows = members.filter(function(m){ return (sessByProvider[m.id] || 0) > 0; }).map(function(m){
    var name = m.profiles ? (m.profiles.name || m.profiles.email) : '(member)';
    return { name: name, role: m.role, sessions: sessByProvider[m.id] || 0, trials: trialsByProvider[m.id] || 0 };
  }).sort(function(a,b){ return b.trials - a.trials; });
  h += renderAnalysisCard('Team activity (last 30 days)', rbtRows, function(r){
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--sand)">'+
      '<div><div style="font-weight:700;font-size:13px">'+esc(r.name)+'</div><div style="font-size:11px;color:var(--warm-gray)">'+r.role.replace(/_/g,' ')+'</div></div>'+
      '<div style="font-size:12px;text-align:right"><div style="font-weight:700">'+r.sessions+' sessions</div><div style="color:var(--warm-gray)">'+r.trials+' trials</div></div>'+
      '</div>';
  });
  return h;
}

function renderAnalysisCard(title, items, rowRenderer, subtitle){
  var h = '<div style="background:white;border:1px solid var(--sand);border-radius:14px;padding:16px;margin-bottom:14px">'+
    '<div style="font-family:Fraunces,serif;font-size:16px;font-weight:700;margin-bottom:'+(subtitle?'2':'10')+'px">'+title+'</div>'+
    (subtitle ? '<div style="font-size:11px;color:var(--warm-gray);margin-bottom:10px">'+subtitle+'</div>' : '');
  if(!items || items.length === 0){
    h += '<div style="color:var(--warm-gray);font-size:13px">Nothing yet.</div>';
  } else {
    items.forEach(function(item){ h += rowRenderer(item); });
  }
  h += '</div>';
  return h;
}

async function renderAnalysisBehaviorsTab(){
  return '<div style="padding:30px;text-align:center;color:var(--warm-gray)">Cross-client behavior trends land in Task 5.</div>';
}
```

- [ ] **Commit:**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba-report): Analysis sidebar item + Targets tab

New "Analysis" sidebar entry for practice members. Tab switcher
between Skill targets (this task) and Behaviors (Task 5). Skill
targets tab surfaces 4 cards: targets needing reassessment (>30 days
in treatment, <80% recent), best performers, worst performers, team
activity (sessions + trials per member last 30 days). All target rows
click through to the target graph.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Analysis Dashboard — cross-client behavior trends

**Files:** Modify `app.html`

- [ ] **Step 1: Replace the `renderAnalysisBehaviorsTab` stub with a real cross-client trend chart**

Find:

```javascript
async function renderAnalysisBehaviorsTab(){
  return '<div style="padding:30px;text-align:center;color:var(--warm-gray)">Cross-client behavior trends land in Task 5.</div>';
}
```

Replace with:

```javascript
async function renderAnalysisBehaviorsTab(){
  // Total challenging-behavior occurrences across all clients, per session-day, last 90 days
  var pcR = await sb.from('practice_clients').select('id,children(name)').eq('practice_id', S.practiceMember.practice_id).eq('status', 'active');
  var pcs = pcR.data || [];
  if(pcs.length === 0) return '<div style="padding:30px;text-align:center;color:var(--warm-gray)">No active clients.</div>';
  var pcIds = pcs.map(function(c){ return c.id; });
  var defR = await sb.from('behavior_definitions').select('id,practice_client_id').in('practice_client_id', pcIds).eq('classification', 'challenging').eq('status', 'active');
  var defIds = (defR.data || []).map(function(d){ return d.id; });
  if(defIds.length === 0) return '<div style="padding:30px;text-align:center;color:var(--warm-gray)">No challenging behaviors defined.</div>';
  var defToPc = {};
  (defR.data || []).forEach(function(d){ defToPc[d.id] = d.practice_client_id; });
  var ninetyDaysAgo = new Date(Date.now() - 90*24*60*60*1000).toISOString();
  var brR = await sb.from('behavior_recordings')
    .select('behavior_definition_id,recording_type,count,duration_seconds,interval_data,timestamp')
    .in('behavior_definition_id', defIds)
    .is('superseded_by', null)
    .gte('timestamp', ninetyDaysAgo)
    .order('timestamp', { ascending: true });
  if(brR.error) return '<div style="padding:20px;color:var(--terracotta)">'+esc(brR.error.message)+'</div>';
  var recordings = brR.data || [];
  if(recordings.length === 0) return '<div style="padding:30px;text-align:center;color:var(--warm-gray)">No behavior recordings in the last 90 days.</div>';
  // Aggregate occurrences per day per client
  var pcMap = {};
  pcs.forEach(function(c){ pcMap[c.id] = c.children ? c.children.name : '(client)'; });
  var byDayByClient = {};
  recordings.forEach(function(r){
    var pcId = defToPc[r.behavior_definition_id];
    var dayKey = new Date(r.timestamp).toISOString().slice(0,10);
    if(!byDayByClient[dayKey]) byDayByClient[dayKey] = {};
    var occ = 0;
    if(r.recording_type === 'frequency' || r.recording_type === 'abc') occ = (r.count || (r.recording_type === 'abc' ? 1 : 0));
    else if(r.recording_type === 'interval' && r.interval_data) occ = (r.interval_data.results || []).filter(function(x){ return x; }).length;
    else if(r.recording_type === 'duration') occ = (r.duration_seconds || 0) > 0 ? 1 : 0;
    byDayByClient[dayKey][pcId] = (byDayByClient[dayKey][pcId] || 0) + occ;
  });
  var allDays = Object.keys(byDayByClient).sort();
  // Build a series per client
  var seriesByPc = {};
  pcIds.forEach(function(pid){ seriesByPc[pid] = { name: pcMap[pid], points: [] }; });
  allDays.forEach(function(day){
    pcIds.forEach(function(pid){
      var v = (byDayByClient[day] || {})[pid] || 0;
      seriesByPc[pid].points.push({ x: new Date(day).getTime(), y: v });
    });
  });
  // Drop clients with all-zero series
  Object.keys(seriesByPc).forEach(function(pid){
    var sum = seriesByPc[pid].points.reduce(function(a,p){ return a + p.y; }, 0);
    if(sum === 0) delete seriesByPc[pid];
  });
  var activePcIds = Object.keys(seriesByPc);
  if(activePcIds.length === 0) return '<div style="padding:30px;text-align:center;color:var(--warm-gray)">No challenging behavior recordings in the last 90 days.</div>';
  // Render
  var w = 880, hht = 320, padL = 44, padR = 16, padT = 18, padB = 36;
  var allYs = [];
  activePcIds.forEach(function(pid){ seriesByPc[pid].points.forEach(function(p){ allYs.push(p.y); }); });
  var maxY = Math.max.apply(null, allYs);
  if(maxY === 0) maxY = 1;
  var minX = new Date(allDays[0]).getTime();
  var maxX = new Date(allDays[allDays.length-1]).getTime();
  if(maxX === minX) maxX = minX + 1;
  var colors = ['#C97B5C','#7A9E7E','#7B9BB8','#B59C7A','#9D7BB8','#D4A05B','#6BA3A6','#9D8FBE'];
  var paths = '';
  activePcIds.forEach(function(pid, idx){
    var s = seriesByPc[pid];
    var color = colors[idx % colors.length];
    var pathD = s.points.map(function(p, i){
      var x = padL + ((p.x - minX) / (maxX - minX)) * (w - padL - padR);
      var y = hht - padB - ((p.y / maxY) * (hht - padT - padB));
      return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    paths += '<path d="'+pathD+'" fill="none" stroke="'+color+'" stroke-width="2" opacity="0.85"/>';
  });
  var axes = '<line x1="'+padL+'" y1="'+(hht-padB)+'" x2="'+(w-padR)+'" y2="'+(hht-padB)+'" stroke="var(--warm-gray-light)" stroke-width="1"/>'+
    '<line x1="'+padL+'" y1="'+padT+'" x2="'+padL+'" y2="'+(hht-padB)+'" stroke="var(--warm-gray-light)" stroke-width="1"/>'+
    '<text x="'+(padL-6)+'" y="'+padT+'" text-anchor="end" font-size="10" fill="var(--warm-gray)" alignment-baseline="middle">'+maxY+'</text>'+
    '<text x="'+(padL-6)+'" y="'+(hht-padB)+'" text-anchor="end" font-size="10" fill="var(--warm-gray)" alignment-baseline="middle">0</text>'+
    '<text x="'+padL+'" y="'+(hht-padB+18)+'" text-anchor="start" font-size="10" fill="var(--warm-gray)">'+new Date(minX).toLocaleDateString()+'</text>'+
    '<text x="'+(w-padR)+'" y="'+(hht-padB+18)+'" text-anchor="end" font-size="10" fill="var(--warm-gray)">'+new Date(maxX).toLocaleDateString()+'</text>';
  var legend = '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:12px">';
  activePcIds.forEach(function(pid, idx){
    var color = colors[idx % colors.length];
    legend += '<div style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:3px;background:'+color+';display:inline-block"></span>'+esc(seriesByPc[pid].name)+'</div>';
  });
  legend += '</div>';
  return '<div style="background:white;border:1px solid var(--sand);border-radius:14px;padding:14px">'+
    '<div style="font-family:Fraunces,serif;font-size:16px;font-weight:700;margin-bottom:4px">Challenging behavior — daily occurrences per client</div>'+
    '<div style="font-size:12px;color:var(--warm-gray);margin-bottom:10px">Last 90 days. Higher line = more occurrences that day.</div>'+
    '<svg width="100%" viewBox="0 0 '+w+' '+hht+'" preserveAspectRatio="xMidYMid meet">'+axes+paths+'</svg>'+
    legend+
    '</div>';
}
```

- [ ] **Commit:**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba-report): Analysis Dashboard — cross-client behavior trends

Behaviors tab shows daily challenging-behavior occurrences per client
over the last 90 days. One color-coded SVG line per active client.
Aggregates frequency counts, interval occurrences, ABC entries, and
duration presence into a single per-day occurrence count.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Docs

**Files:** Modify `docs/ROADMAP.md`, `docs/AGENT-CONTEXT.md`, `docs/TESTING-GUIDE.md`

- [ ] **Step 1: ROADMAP — add #4 entry at top of Completed**

```markdown
### BCBA Data Collection — Analysis & Reporting (2026-05-21)
**Sub-project #4 of 6** — spec: [docs/superpowers/specs/2026-05-20-bcba-analysis-reporting-design.md](docs/superpowers/specs/2026-05-20-bcba-analysis-reporting-design.md)

- [x] phase_changes table + index for "targets needing reassessment" query
- [x] Per-target line graph (SVG) with axes, gridlines, point markers, hover tooltips
- [x] Vertical dashed phase change lines with labels
- [x] Average overlay + mean-of-day connector toggles
- [x] Phase change CRUD modal (date, label, notes)
- [x] Analysis sidebar item + Skill targets tab (4 cards: needs reassessment, best, worst, team activity)
- [x] Cross-client behavior trends — daily occurrences per client over 90 days, color-coded SVG lines

**Deferred to polish pass:** trend line regression, std dev band, cumulative count, annotations, PDF export.

**Next:** sub-project #5 — Documentation (SOAP note auto-fill from session data; timesheet signatures).

Plan: [docs/superpowers/plans/2026-05-20-bcba-analysis-reporting.md](docs/superpowers/plans/2026-05-20-bcba-analysis-reporting.md)
```

Also update the "Currently in flight" section if present.

- [ ] **Step 2: AGENT-CONTEXT — refresh**

Find `## In-flight work — BCBA Data Collection`. Replace contents with:

```markdown
**Status as of 2026-05-21:** Sub-projects #1, #2, #3, #4 **complete and merged**. End-to-end clinical workflow + iconic BCBA chart shipped.

**Sequence forward:**
1. **Mini-spec — per-patient Stripe billing** (before users sign up).
2. **Sub-project #5 — Documentation.** SOAP note auto-fill from session data; timesheet signatures.
3. **Sub-project #6 — Curriculum Libraries.** Ariana-authored Starter content; VB-MAPP / ABLLS-R licensing.

**Coverage vs Ensora (after #4):** ~92% data model, ~80% UI surface. Skill-target line graphs with phase change lines ship; the iconic Ensora chart is now in Modern Village. What's missing: SOAP auto-fill, licensed curricula, polish indicators (trend line, std dev, annotations, PDF export).

Memory: `project_bcba_data_collection.md`.
```

- [ ] **Step 3: TESTING-GUIDE — add #4 walkthrough**

After the Behavior Reduction section, add:

```markdown
### Analysis & Reporting (BCBA Data Collection — sub-project #4)

Sign in as `testprovider@modernvillage.app`.

- [ ] Open a target (Clients → Maya → program → "Graph →" button on a target card)
- [ ] Target graph shows axes (0/25/50/75/100% gridlines, date axis), session points, line
- [ ] Toggle Average — sage dashed line appears at running mean
- [ ] Toggle Mean-of-day — terracotta dashed line connects daily averages
- [ ] Add a phase change with a past date → vertical dashed red line appears with label
- [ ] Edit a phase change → updates inline; delete → confirms and removes
- [ ] Sidebar → Analysis → Skill targets tab shows 4 cards (reassessment / best / worst / team activity)
- [ ] Click a target row in any card → opens that target's graph
- [ ] Switch to Behaviors tab → cross-client line chart over last 90 days, color-coded per client
```

- [ ] **Step 4: Commit all three**

```bash
git add docs/ROADMAP.md docs/AGENT-CONTEXT.md docs/TESTING-GUIDE.md
git commit -m "$(cat <<'EOF'
docs: BCBA Analysis & Reporting status + testing walkthrough

ROADMAP: sub-project #4 complete, #5 next.
AGENT-CONTEXT: refresh — 4 of 6 sub-projects shipped; ~80% UI coverage.
TESTING-GUIDE: add Analysis & Reporting walkthrough.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
