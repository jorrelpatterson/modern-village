# BCBA Data Collection — Live Data Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the keystone live-session clinical workflow — pre-session plan, big-button trial entry with auto-advance, floating behavior overlay, end-of-session summary, IOA secondary-observer flow, async cosign, offline IndexedDB sync queue, and the parent "My BCBA" flywheel tab — all on top of the Foundation data spine.

**Architecture:** All UI is added inline to `app.html` (vanilla HTML/JS, no build system — matches existing project style). A small schema migration adds `session_targets` (pre-session plan join table) and a parent-readable session view. The offline runtime is a single section of vanilla JS (`mvOffline.*`) using IndexedDB; all trial/behavior INSERTs route through its queue; idempotency comes from the Foundation `UNIQUE(session_id, client_uuid)` constraints. Parent flywheel view reads aggregated data via `child_access`-scoped RLS.

**Tech Stack:** Supabase Postgres + RLS + Auth, vanilla HTML/JS `app.html`, IndexedDB (browser native, no library).

**Spec:** [docs/superpowers/specs/2026-05-18-bcba-live-data-entry-design.md](../specs/2026-05-18-bcba-live-data-entry-design.md)

**Verification approach (no test framework in repo):** Each task ends with a manual verification block — Supabase SQL queries for schema/RLS checks, browser DevTools for offline behavior, walkthrough steps for UI. Existing test accounts: `testprovider@modernvillage.app / TestProvider123!`, `testparent@modernvillage.app / TestParent123!`, `testcaregiver@modernvillage.app / TestCaregiver123!`. Practice + client + program + targets already exist from Foundation smoke testing.

**Commit cadence:** one commit per task. Every commit message includes `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility | Phase |
|------|---------------|-------|
| `supabase/migrations/20260519_bcba_live_data_entry.sql` | `session_targets` table + RLS, `v_child_sessions` view, parent SELECT policy on `sessions` | 1 |
| `app.html` | Offline runtime, all 7 UI surfaces (Start/Plan/Active/Trial/Behavior/Summary/IOA/Cosign/Parent), supporting JS | 2-11 |
| `docs/ROADMAP.md` | Mark #2 done, link plan | 12 |
| `docs/AGENT-CONTEXT.md` | Refresh in-flight section | 12 |
| `docs/TESTING-GUIDE.md` | Add Live Data Entry walkthrough | 12 |

---

## Phase 1: Schema

### Task 1: Migration — session_targets table + parent read paths

**Files:**
- Create: `supabase/migrations/20260519_bcba_live_data_entry.sql`

- [ ] **Step 1: Create the migration file with this exact content**

```sql
-- ═══════════════════════════════════════════════════
-- BCBA Data Collection — Live Data Entry (sub-project #2)
-- 2026-05-19
-- Spec: docs/superpowers/specs/2026-05-18-bcba-live-data-entry-design.md
-- Depends on: 20260518_bcba_data_collection_foundation.sql
-- ═══════════════════════════════════════════════════

-- ─── PRE-SESSION PLAN ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.session_targets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES public.sessions(id) ON DELETE CASCADE NOT NULL,
  target_id uuid REFERENCES public.targets(id) ON DELETE CASCADE NOT NULL,
  planned_trials int,
  planned_at timestamptz DEFAULT now(),
  planned_by uuid REFERENCES public.practice_members(id),
  UNIQUE(session_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_session_targets_session ON public.session_targets(session_id);

ALTER TABLE public.session_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read session targets" ON public.session_targets
  FOR SELECT USING (
    public.is_practice_member((
      SELECT pc.practice_id FROM public.sessions s
      JOIN public.practice_clients pc ON pc.id = s.practice_client_id
      WHERE s.id = session_id
    )) OR public.is_admin()
  );

CREATE POLICY "Members write session targets" ON public.session_targets
  FOR ALL USING (
    public.is_practice_member((
      SELECT pc.practice_id FROM public.sessions s
      JOIN public.practice_clients pc ON pc.id = s.practice_client_id
      WHERE s.id = session_id
    )) OR public.is_admin()
  )
  WITH CHECK (
    public.is_practice_member((
      SELECT pc.practice_id FROM public.sessions s
      JOIN public.practice_clients pc ON pc.id = s.practice_client_id
      WHERE s.id = session_id
    )) OR public.is_admin()
  );

-- ─── PARENT READ ACCESS to sessions (aggregate-only) ──

CREATE POLICY "Parents read sessions via child_access" ON public.sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.practice_clients pc
      JOIN public.child_access ca ON ca.child_id = pc.child_id
      WHERE pc.id = sessions.practice_client_id
        AND ca.user_id = auth.uid()
        AND ca.access_level = 'full'
        AND ca.revoked_at IS NULL
        AND sessions.status IN ('completed','cosigned')
    )
  );

-- ─── PARENT-VISIBLE AGGREGATE VIEW ──

CREATE OR REPLACE VIEW public.v_child_sessions AS
SELECT
  pc.child_id,
  pc.practice_id,
  s.id AS session_id,
  s.start_time,
  s.end_time,
  s.location,
  s.cpt_code,
  s.status,
  (SELECT count(*) FROM public.trials t WHERE t.session_id = s.id AND t.superseded_by IS NULL) AS trial_count,
  (SELECT count(*) FROM public.behavior_recordings br WHERE br.session_id = s.id AND br.superseded_by IS NULL) AS behavior_count,
  EXTRACT(EPOCH FROM (s.end_time - s.start_time))/60 AS duration_minutes
FROM public.sessions s
JOIN public.practice_clients pc ON pc.id = s.practice_client_id
WHERE s.status IN ('completed','cosigned');

GRANT SELECT ON public.v_child_sessions TO authenticated;
ALTER VIEW public.v_child_sessions SET (security_invoker = on);

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
```

- [ ] **Step 2: Skip — user applies in Supabase Dashboard**

The migration is applied via Supabase SQL editor by the user post-merge.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260519_bcba_live_data_entry.sql
git commit -m "$(cat <<'EOF'
feat(bcba-live): migration — session_targets + parent read paths

Adds session_targets join table for pre-session planning (which
targets are scheduled for a session). Adds parent SELECT policy on
sessions for completed/cosigned visibility. Creates v_child_sessions
aggregate view for parent "My BCBA" tab.

Sub-project #2 of 6 (BCBA Data Collection).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2: Offline runtime

### Task 2: mvOffline — IndexedDB queue + sync

**Files:**
- Modify: `app.html` — add new section before existing `// ═══ HELPERS ═══` section

The offline runtime must exist BEFORE trial entry (Task 5) and behavior recording (Tasks 6-7) since both call `mvOffline.enqueue`.

- [ ] **Step 1: Add the `mvOffline` block**

Find the line `// ═══ HELPERS ═══` (introduced or pre-existing in app.html). Immediately BEFORE that line, insert:

```javascript
// ═══ OFFLINE SYNC (mvOffline) ═══
var mvOffline = {
  DB_NAME: 'mv-offline-v1',
  STORE: 'queue',
  db: null,
  online: navigator.onLine,
  syncing: false,
  queueCount: 0,
  failedOps: [],
  _flushTimer: null,
  _statusListeners: [],

  async init(){
    var self = this;
    await new Promise(function(resolve, reject){
      var req = indexedDB.open(self.DB_NAME, 1);
      req.onupgradeneeded = function(e){
        var db = e.target.result;
        if(!db.objectStoreNames.contains(self.STORE)){
          db.createObjectStore(self.STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = function(e){ self.db = e.target.result; resolve(); };
      req.onerror = function(e){ reject(e); };
    });
    await self._refreshCount();
    window.addEventListener('online', function(){ self.online = true; self._notify(); self.flush(); });
    window.addEventListener('offline', function(){ self.online = false; self._notify(); });
    window.addEventListener('focus', function(){ if(self.online) self.flush(); });
    self._flushTimer = setInterval(function(){ if(self.online && !self.syncing) self.flush(); }, 30000);
    if(self.online && self.queueCount > 0) self.flush();
  },

  async _refreshCount(){
    var self = this;
    self.queueCount = await new Promise(function(resolve){
      var tx = self.db.transaction(self.STORE, 'readonly');
      var store = tx.objectStore(self.STORE);
      var req = store.count();
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(){ resolve(0); };
    });
    self._notify();
  },

  async enqueue(op){
    var self = this;
    if(!self.db) await self.init();
    await new Promise(function(resolve, reject){
      var tx = self.db.transaction(self.STORE, 'readwrite');
      var store = tx.objectStore(self.STORE);
      var req = store.add({ table: op.table, payload: op.payload, attempt_count: 0, enqueued_at: Date.now() });
      req.onsuccess = function(){ resolve(); };
      req.onerror = function(e){ reject(e); };
    });
    await self._refreshCount();
    if(self.online && !self.syncing){
      // Fire-and-forget; UI doesn't wait
      self.flush();
    }
  },

  async flush(){
    var self = this;
    if(self.syncing || !self.online || !self.db) return;
    if(self.queueCount === 0) return;
    self.syncing = true;
    self._notify();
    try {
      var token = await getAuthToken();
      var batch = await new Promise(function(resolve){
        var tx = self.db.transaction(self.STORE, 'readonly');
        var store = tx.objectStore(self.STORE);
        var req = store.getAll();
        req.onsuccess = function(){ resolve((req.result || []).slice(0, 25)); };
        req.onerror = function(){ resolve([]); };
      });
      for(var i=0;i<batch.length;i++){
        var op = batch[i];
        var resp = await fetch(SUPA_URL+'/rest/v1/'+op.table, {
          method: 'POST',
          headers: {
            apikey: SUPA_KEY,
            Authorization: 'Bearer '+token,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
          },
          body: JSON.stringify(op.payload)
        });
        if(resp.ok || resp.status === 409){
          await self._deleteOp(op.id);
        } else if(resp.status >= 400 && resp.status < 500){
          // Permanent failure — surface to user
          self.failedOps.push({ op: op, status: resp.status, body: await resp.text() });
          await self._deleteOp(op.id);
          showToast('Sync error — see Sync Log');
        } else {
          // 5xx / network — leave in queue, will retry
          break;
        }
      }
    } catch(e){
      console.error('mvOffline.flush error', e);
    } finally {
      self.syncing = false;
      await self._refreshCount();
    }
  },

  async _deleteOp(id){
    var self = this;
    await new Promise(function(resolve){
      var tx = self.db.transaction(self.STORE, 'readwrite');
      tx.objectStore(self.STORE).delete(id);
      tx.oncomplete = resolve;
    });
  },

  statusBadge(){
    if(!this.online) return { status: 'offline', queueCount: this.queueCount };
    if(this.syncing || this.queueCount > 0) return { status: 'syncing', queueCount: this.queueCount };
    return { status: 'synced', queueCount: 0 };
  },

  renderBadge(){
    var s = this.statusBadge();
    if(s.status === 'synced') return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--sage-dark)">&#9899; Synced</span>';
    if(s.status === 'syncing') return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#7A6A10">&#128992; Syncing'+(s.queueCount?' ('+s.queueCount+')':'')+'</span>';
    return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--terracotta)">&#128308; Offline ('+s.queueCount+')</span>';
  },

  onStatusChange(fn){ this._statusListeners.push(fn); },
  _notify(){ var self = this; this._statusListeners.forEach(function(fn){ try { fn(self.statusBadge()); } catch(e){} }); }
};

function mvUuid(){
  // RFC4122 v4
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, function(c){
    return (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c/4).toString(16);
  });
}
```

- [ ] **Step 2: Initialize mvOffline at app boot**

Find where `loadProfile()` is called on initial app boot (around line 2440 in the auth init path). Add **immediately before** the first `await loadProfile()`:

```javascript
await mvOffline.init();
```

- [ ] **Step 3: Manual verification**

1. Open the app in a browser, sign in as testprovider.
2. Open DevTools console:
   ```javascript
   await mvOffline.enqueue({ table: 'fake_table', payload: { foo: 'bar', client_uuid: mvUuid() } });
   mvOffline.queueCount;
   // Expected: 1
   mvOffline.renderBadge();
   // Expected: HTML with "Syncing (1)" since flush will fail (table doesn't exist)
   ```
3. After ~10 seconds the failed op should be cleared (permanent 4xx). Verify:
   ```javascript
   mvOffline.failedOps.length;
   // Expected: 1
   mvOffline.queueCount;
   // Expected: 0
   ```

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba-live): mvOffline IndexedDB sync queue

Vanilla JS offline runtime: IndexedDB-backed queue, 30s background
flush, retry on reconnect, batches of 25, 4xx surfaces as failedOps
toast, 5xx leaves in queue. Initialized on app boot before loadProfile.
Idempotency via client_uuid + DB UNIQUE constraint (Foundation schema).

mvUuid() helper for RFC4122 v4 client UUIDs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: Start Session + Pre-session plan

### Task 3: Start Session button + Pre-session plan modal

**Files:**
- Modify: `app.html`

Replaces the "No sessions yet. Live data entry ships in the next sub-project." placeholder in `renderClientPrograms` (from Foundation Task 14). Adds the Pre-session plan modal HTML + JS.

- [ ] **Step 1: Add the Pre-session plan modal HTML**

Insert this `<div>` block near the other practice modals (e.g., after `addProgramModal`):

```html
<div id="preSessionPlanModal" class="modal-overlay" style="display:none">
  <div class="modal-content" style="max-width:560px;max-height:90vh;overflow-y:auto">
    <h3 style="font-family:Fraunces,serif;font-size:22px;margin-bottom:6px">Start a session</h3>
    <div id="psClientName" style="color:var(--warm-gray);font-size:13px;margin-bottom:14px"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div><label class="fl">Location</label><select id="psLocation" class="fi"><option value="home">Home</option><option value="clinic">Clinic</option><option value="school">School</option><option value="telehealth">Telehealth</option></select></div>
      <div><label class="fl">CPT code</label><select id="psCpt" class="fi"><option value="97153">97153</option><option value="97155">97155</option><option value="97156">97156</option></select></div>
    </div>
    <div class="label" style="margin-bottom:8px">Targets for today</div>
    <div id="psTargetsList" style="margin-bottom:8px"></div>
    <div style="text-align:center;margin:8px 0">
      <a style="font-size:13px;color:var(--sage-dark);cursor:pointer;text-decoration:underline" onclick="planSkipAdHoc()">Run ad-hoc (skip plan)</a>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-s" style="flex:1" onclick="closePreSessionPlan()">Cancel</button>
      <button class="btn btn-p" style="flex:1" onclick="beginSession()">Begin session</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Replace the "No sessions yet" placeholder in `renderClientPrograms`**

Find this block inside `renderClientPrograms` (added in Foundation Task 14):

```javascript
  } else if(!sessR.data || sessR.data.length === 0){
    h += '<div style="padding:14px;background:var(--cream);border-radius:12px;font-size:13px;color:var(--warm-gray)">No sessions yet. Live data entry ships in the next sub-project.</div>';
  } else {
```

Replace with a Start Session button + sessions list when present:

```javascript
  } else {
    if(canWrite){
      h += '<button class="btn btn-p" style="width:100%;margin-bottom:12px" onclick="openPreSessionPlan()">Start session</button>';
    }
    if(!sessR.data || sessR.data.length === 0){
      h += '<div style="padding:14px;background:var(--cream);border-radius:12px;font-size:13px;color:var(--warm-gray)">No sessions yet.</div>';
    } else {
```

And update the closing of that block. The full updated `else if`/`else` chain in `renderClientPrograms` becomes:

```javascript
  } else {
    if(canWrite){
      h += '<button class="btn btn-p" style="width:100%;margin-bottom:12px" onclick="openPreSessionPlan()">Start session</button>';
    }
    if(!sessR.data || sessR.data.length === 0){
      h += '<div style="padding:14px;background:var(--cream);border-radius:12px;font-size:13px;color:var(--warm-gray)">No sessions yet.</div>';
    } else {
      sessR.data.forEach(function(s){
        var prov = s.provider && s.provider.profiles ? (s.provider.profiles.name || s.provider.profiles.email) : '(unknown)';
        var when = new Date(s.start_time).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
        h += '<div onclick="openSessionSummary(\x27'+s.id+'\x27)" style="border:1px solid var(--sand);border-radius:12px;padding:10px 14px;margin-bottom:6px;background:white;display:flex;justify-content:space-between;align-items:center;cursor:pointer">'+
          '<div><div style="font-weight:700;font-size:14px">'+when+'</div>'+
          '<div style="font-size:12px;color:var(--warm-gray)">'+esc(prov)+(s.cpt_code?' &middot; CPT '+s.cpt_code:'')+(s.location?' &middot; '+s.location:'')+'</div></div>'+
          '<span class="log-tag">'+s.status.replace(/_/g,' ')+'</span>'+
          '</div>';
      });
    }
  }
```

The `openSessionSummary` function is defined in Task 8. For now add a temporary stub above the Task 5 sections:

```javascript
function openSessionSummary(sessionId){ alert('Session summary opens in Task 8'); }
```

- [ ] **Step 3: Add Pre-session plan JS**

Insert this block near the other BCBA practice functions:

```javascript
var preSessionState = { client: null, targets: [] };

async function openPreSessionPlan(){
  if(!currentClient){ showToast('Open a client first'); return; }
  preSessionState.client = currentClient;
  preSessionState.targets = [];
  document.getElementById('psClientName').textContent = currentClient.children.name + ' · ' + new Date().toLocaleDateString();
  document.getElementById('psLocation').value = 'home';
  document.getElementById('psCpt').value = currentClient.service_type || '97156';
  document.getElementById('psTargetsList').innerHTML = '<div style="color:var(--warm-gray);font-size:13px;padding:8px">Loading targets…</div>';
  document.getElementById('preSessionPlanModal').style.display = 'flex';
  // Load all in-treatment / baseline / in-maintenance targets for this client
  var r = await sb.from('targets')
    .select('id,name,target_type,status,data_collection_config,programs!inner(id,name,practice_client_id)')
    .eq('programs.practice_client_id', currentClient.id)
    .in('status', ['baseline','in_treatment','in_maintenance']);
  if(r.error){ document.getElementById('psTargetsList').innerHTML = '<div style="color:var(--terracotta);padding:8px">'+esc(r.error.message)+'</div>'; return; }
  if(!r.data || r.data.length === 0){
    document.getElementById('psTargetsList').innerHTML = '<div style="padding:14px;background:var(--cream);border-radius:10px;font-size:13px;color:var(--warm-gray)">No in-treatment targets. Add targets to a program first, or use "Run ad-hoc".</div>';
    return;
  }
  var byProgram = {};
  r.data.forEach(function(t){
    var pname = t.programs.name;
    if(!byProgram[pname]) byProgram[pname] = [];
    byProgram[pname].push(t);
  });
  var h = '';
  Object.keys(byProgram).forEach(function(pname){
    h += '<div style="font-size:12px;color:var(--warm-gray);font-weight:700;margin-top:8px;margin-bottom:4px">'+esc(pname)+'</div>';
    byProgram[pname].forEach(function(t){
      preSessionState.targets.push({ id: t.id, name: t.name, target_type: t.target_type, planned_trials: (t.data_collection_config && t.data_collection_config.trials_per_session) || 10, checked: true });
      var idx = preSessionState.targets.length - 1;
      h += '<label style="display:flex;gap:8px;align-items:center;padding:8px 10px;border:1px solid var(--sand);border-radius:10px;margin-bottom:4px;cursor:pointer"><input type="checkbox" checked onchange="preSessionState.targets['+idx+'].checked=this.checked"><span style="flex:1"><strong>'+esc(t.name)+'</strong><span style="color:var(--warm-gray);font-size:11px;margin-left:6px">'+t.target_type.replace(/_/g,' ')+' · '+preSessionState.targets[idx].planned_trials+' trials</span></span></label>';
    });
  });
  document.getElementById('psTargetsList').innerHTML = h;
}

function closePreSessionPlan(){
  document.getElementById('preSessionPlanModal').style.display = 'none';
}

function planSkipAdHoc(){
  preSessionState.targets = preSessionState.targets.map(function(t){ t.checked = false; return t; });
  beginSession();
}

async function beginSession(){
  var selected = preSessionState.targets.filter(function(t){ return t.checked; });
  // Create the session row
  var sessR = await sb.from('sessions').insert({
    practice_client_id: preSessionState.client.id,
    provider_id: S.practiceMember.id,
    start_time: new Date().toISOString(),
    location: document.getElementById('psLocation').value,
    cpt_code: document.getElementById('psCpt').value,
    status: 'in_progress'
  }).select().single();
  if(sessR.error){ showToast('Could not start session: '+sessR.error.message); return; }
  // Insert session_targets rows for the selected
  if(selected.length){
    var rows = selected.map(function(t){
      return { session_id: sessR.data.id, target_id: t.id, planned_trials: t.planned_trials, planned_by: S.practiceMember.id };
    });
    var stR = await sb.from('session_targets').insert(rows);
    if(stR.error){ showToast('Plan saved partially: '+stR.error.message); }
  }
  closePreSessionPlan();
  openActiveSession(sessR.data.id);
}

function openActiveSession(sessionId){ alert('Active session UI lands in Task 4 — session created: '+sessionId); }
```

- [ ] **Step 4: Manual verification**

1. Sign in as testprovider, open the Test Practice from Foundation smoke test.
2. Navigate Clients → Maya → click "Start session" button (should now appear above the empty-state "No sessions yet" line).
3. Pre-session plan modal opens. Confirm:
   - Client name + today's date in header
   - Location defaults to home; CPT defaults to 97156 (Maya's service_type)
   - Targets list shows any in-treatment targets you added in Foundation smoke test (Manding Training targets, etc.), grouped by program, all pre-checked.
4. Uncheck one target. Click "Begin session". Toast confirms creation, then a stub alert fires for the active session view (Task 4).
5. SQL check:
   ```sql
   SELECT id, status, location, cpt_code FROM public.sessions
   WHERE practice_client_id = (SELECT id FROM public.practice_clients WHERE child_id = (SELECT id FROM public.children WHERE name='Maya' LIMIT 1) LIMIT 1)
   ORDER BY created_at DESC LIMIT 1;
   ```
   Expected: 1 row, status `in_progress`, location `home`, cpt `97156`.
   ```sql
   SELECT count(*) FROM public.session_targets WHERE session_id = '<sess id>';
   ```
   Expected: count = checked-count from the plan (e.g., if you had 2 targets pre-checked and unchecked 1, expect 1).

- [ ] **Step 5: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba-live): Start Session button + Pre-session plan modal

Replaces Foundation Task 14 placeholder. Modal loads in-treatment
targets grouped by program, all pre-checked. "Run ad-hoc" unchecks
all. Begin session inserts sessions row + session_targets rows then
transitions to active session view (stub for Task 4).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: Active session shell + target switching

### Task 4: Active session overlay + top bar + target picker

**Files:**
- Modify: `app.html`

Adds the active session overlay page, top bar with target switcher + sync badge + timer, and the target picker bottom-sheet. Trial entry buttons land in Task 5.

- [ ] **Step 1: Add the active session overlay HTML**

Insert near other practice overlays:

```html
<div id="activeSessionPage" class="overlay-page">
  <div class="overlay-inner" id="activeSessionContent" style="padding:0;height:100vh;display:flex;flex-direction:column;overflow:hidden"></div>
</div>

<div id="targetPickerSheet" style="display:none;position:fixed;left:0;right:0;bottom:0;background:white;border-radius:18px 18px 0 0;box-shadow:0 -8px 32px rgba(0,0,0,0.15);padding:20px;z-index:1100;max-height:60vh;overflow-y:auto">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <h3 style="font-family:Fraunces,serif;font-size:18px;font-weight:700">Switch target</h3>
    <button class="btn btn-s" style="padding:6px 12px;font-size:12px" onclick="closeTargetPicker()">Close</button>
  </div>
  <div id="targetPickerList"></div>
</div>
```

- [ ] **Step 2: Replace the `openActiveSession` stub with the real implementation**

Find:

```javascript
function openActiveSession(sessionId){ alert('Active session UI lands in Task 4 — session created: '+sessionId); }
```

Replace with the full active-session module:

```javascript
var activeSession = null;
// Shape: { id, practice_client_id, child_name, targets: [{id,name,target_type,steps,planned_trials,trials_run,trials_correct}], current_target_idx, trial_in_target, started_at, last_behavior_label }

async function openActiveSession(sessionId){
  // Hydrate session + targets + steps
  var sR = await sb.from('sessions')
    .select('id,practice_client_id,start_time,location,cpt_code,practice_clients(children(name))')
    .eq('id', sessionId)
    .single();
  if(sR.error){ showToast(sR.error.message); return; }
  var stR = await sb.from('session_targets')
    .select('target_id,planned_trials,targets(id,name,target_type,data_collection_config,target_steps(*))')
    .eq('session_id', sessionId);
  if(stR.error){ showToast(stR.error.message); return; }
  var targets = (stR.data || []).map(function(row){
    var t = row.targets;
    var steps = (t.target_steps || []).slice().sort(function(a,b){ return a.sequence - b.sequence; });
    return {
      id: t.id,
      name: t.name,
      target_type: t.target_type,
      steps: steps,
      planned_trials: row.planned_trials || 10,
      trials_run: 0,
      trials_correct: 0,
      step_idx: 0
    };
  });
  activeSession = {
    id: sR.data.id,
    practice_client_id: sR.data.practice_client_id,
    child_name: sR.data.practice_clients.children.name,
    targets: targets,
    current_target_idx: targets.length > 0 ? 0 : -1,
    trial_in_target: 0,
    started_at: new Date(sR.data.start_time),
    last_behavior_label: null
  };
  document.getElementById('activeSessionPage').classList.add('open');
  renderActiveSession();
  // Subscribe to sync status changes
  mvOffline.onStatusChange(function(){ updateSyncBadge(); });
  // Start the timer
  if(window._activeSessionTimer) clearInterval(window._activeSessionTimer);
  window._activeSessionTimer = setInterval(updateSessionTimer, 1000);
}

function renderActiveSession(){
  var el = document.getElementById('activeSessionContent');
  if(!activeSession){ el.innerHTML = ''; return; }
  var t = activeSession.current_target_idx >= 0 ? activeSession.targets[activeSession.current_target_idx] : null;
  // Top bar
  var top = '<div style="display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid var(--sand);background:white;gap:8px">'+
    '<button class="btn btn-s" style="padding:6px 10px;font-size:12px" onclick="confirmEndSession()">End</button>'+
    '<div style="flex:1;display:flex;align-items:center;gap:8px;overflow:hidden">'+
      '<div style="font-size:11px;color:var(--warm-gray);white-space:nowrap">'+esc(activeSession.child_name)+'</div>'+
      (t ? '<button onclick="openTargetPicker()" style="background:var(--sage-light);color:var(--sage-dark);border:none;border-radius:8px;padding:6px 10px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60vw">'+esc(t.name)+' &#9662;</button>' : '<button onclick="openTargetPicker()" style="background:var(--terracotta-light);color:var(--terracotta);border:none;border-radius:8px;padding:6px 10px;font-size:13px;font-weight:700;cursor:pointer">+ Pick target</button>')+
    '</div>'+
    '<div style="font-size:11px;color:var(--warm-gray)" id="asTrialCounter">'+(t ? (activeSession.trial_in_target+1)+'/'+t.planned_trials : '')+'</div>'+
    '<div style="font-size:11px;color:var(--warm-gray)" id="asTimer">0:00</div>'+
    '<div id="asSyncBadge">'+mvOffline.renderBadge()+'</div>'+
    '</div>';
  // Body — trial buttons land in Task 5; for now render a placeholder
  var body = '<div id="asBody" style="flex:1;overflow-y:auto;padding:20px">'+
    (t ? renderTrialEntry(t) : '<div style="text-align:center;padding:60px 20px;color:var(--warm-gray)">No target selected. Tap "+ Pick target" above.</div>')+
    '</div>';
  // Floating behavior button placeholder (real overlay in Tasks 6-7)
  var fab = '<button id="asBehaviorBtn" onclick="openBehaviorOverlay()" style="position:fixed;right:18px;bottom:18px;width:56px;height:56px;border-radius:50%;background:var(--terracotta);color:white;border:none;font-size:24px;box-shadow:0 4px 12px rgba(0,0,0,0.2);cursor:pointer;z-index:1050">+</button>';
  el.innerHTML = top + body + fab;
}

function renderTrialEntry(target){
  // Placeholder until Task 5 — shows "Trial entry buttons land in Task 5"
  return '<div style="text-align:center;padding:60px 20px;color:var(--warm-gray)">Trial entry buttons land in Task 5. Current target: '+esc(target.name)+'</div>';
}

function updateSessionTimer(){
  if(!activeSession) return;
  var el = document.getElementById('asTimer');
  if(!el) return;
  var secs = Math.floor((new Date() - activeSession.started_at) / 1000);
  var mm = Math.floor(secs/60);
  var ss = (secs % 60).toString().padStart(2, '0');
  el.textContent = mm+':'+ss;
}

function updateSyncBadge(){
  var el = document.getElementById('asSyncBadge');
  if(el) el.innerHTML = mvOffline.renderBadge();
}

async function openTargetPicker(){
  var sheet = document.getElementById('targetPickerSheet');
  var list = document.getElementById('targetPickerList');
  var h = '';
  // Show planned session targets first
  activeSession.targets.forEach(function(t, idx){
    var isCurrent = idx === activeSession.current_target_idx;
    h += '<div onclick="switchTarget('+idx+')" style="padding:12px;border:1px solid '+(isCurrent?'var(--sage-dark)':'var(--sand)')+';border-radius:10px;margin-bottom:6px;cursor:pointer;background:'+(isCurrent?'var(--sage-light)':'white')+'">'+
      '<div style="font-weight:700;font-size:14px">'+esc(t.name)+'</div>'+
      '<div style="font-size:11px;color:var(--warm-gray);margin-top:2px">'+t.target_type.replace(/_/g,' ')+' · '+t.trials_run+'/'+t.planned_trials+' trials</div>'+
      '</div>';
  });
  // "Add another in-treatment target" link
  h += '<button class="btn btn-s" style="width:100%;margin-top:8px;font-size:12px" onclick="addAdHocTarget()">+ Add another in-treatment target</button>';
  list.innerHTML = h;
  sheet.style.display = 'block';
}

function closeTargetPicker(){
  document.getElementById('targetPickerSheet').style.display = 'none';
}

function switchTarget(idx){
  activeSession.current_target_idx = idx;
  activeSession.trial_in_target = activeSession.targets[idx].trials_run;
  closeTargetPicker();
  renderActiveSession();
}

async function addAdHocTarget(){
  // Load any in-treatment target for this client not already in the session
  var existingIds = activeSession.targets.map(function(t){ return t.id; });
  var r = await sb.from('targets')
    .select('id,name,target_type,data_collection_config,target_steps(*),programs!inner(id,name,practice_client_id)')
    .eq('programs.practice_client_id', activeSession.practice_client_id)
    .in('status', ['baseline','in_treatment','in_maintenance']);
  if(r.error){ showToast(r.error.message); return; }
  var available = (r.data || []).filter(function(t){ return existingIds.indexOf(t.id) < 0; });
  if(available.length === 0){ showToast('No more in-treatment targets'); return; }
  // Pick the first available (simplest UX). A future iteration could surface a sub-picker.
  var t = available[0];
  var steps = (t.target_steps || []).slice().sort(function(a,b){ return a.sequence - b.sequence; });
  activeSession.targets.push({
    id: t.id, name: t.name, target_type: t.target_type, steps: steps,
    planned_trials: (t.data_collection_config && t.data_collection_config.trials_per_session) || 10,
    trials_run: 0, trials_correct: 0, step_idx: 0
  });
  // Persist as a session_target row so it shows up in summary
  await sb.from('session_targets').insert({
    session_id: activeSession.id,
    target_id: t.id,
    planned_trials: (t.data_collection_config && t.data_collection_config.trials_per_session) || 10,
    planned_by: S.practiceMember.id
  });
  switchTarget(activeSession.targets.length - 1);
}

function openBehaviorOverlay(){ alert('Behavior overlay lands in Task 6'); }
function confirmEndSession(){ alert('End session flow lands in Task 8'); }
```

- [ ] **Step 3: Manual verification**

1. As testprovider, open Maya → Start Session → keep all targets checked → Begin Session.
2. The active session overlay should open with a top bar showing:
   - "End" button (left)
   - Child name (small)
   - Current target name in a sage pill (tap-able)
   - Trial counter (1/N)
   - Live ticking timer (0:00 → 0:01 → 0:02…)
   - Sync badge (green "Synced")
   - Floating + button bottom-right
3. Body shows "Trial entry buttons land in Task 5"
4. Tap target pill → bottom sheet shows all planned targets. Tap a different target → sheet closes, top bar updates.
5. Tap "+ Add another in-treatment target" → if available, a new target appears at the end. Sheet closes, top bar shows the new target.
6. Tap End → stub alert (Task 8 wires this).
7. Tap + → stub alert (Tasks 6-7 wire this).

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba-live): active session overlay + target switching

Active session page with sticky top bar (end button, child name,
target pill, trial counter, session timer, sync badge), placeholder
body, floating behavior FAB. Target picker bottom-sheet lists planned
targets; "Add another in-treatment target" persists a new session_targets
row mid-session. Trial entry buttons in Task 5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5: Trial entry

### Task 5: Trial entry buttons with auto-advance

**Files:**
- Modify: `app.html`

Replaces the `renderTrialEntry` placeholder with the real 7-button trial recorder. Each tap enqueues a trial via `mvOffline.enqueue`, updates local state, auto-advances.

- [ ] **Step 1: Replace `renderTrialEntry` with the full implementation**

Find:

```javascript
function renderTrialEntry(target){
  return '<div style="text-align:center;padding:60px 20px;color:var(--warm-gray)">Trial entry buttons land in Task 5. Current target: '+esc(target.name)+'</div>';
}
```

Replace with:

```javascript
function renderTrialEntry(target){
  var stepLabel = '';
  if(target.target_type === 'task_analysis' && target.steps.length > 0){
    var step = target.steps[target.step_idx % target.steps.length];
    stepLabel = '<div style="text-align:center;font-size:12px;color:var(--warm-gray);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Step '+(target.step_idx % target.steps.length + 1)+' / '+target.steps.length+'</div>'+
      '<div style="text-align:center;font-family:Fraunces,serif;font-size:20px;font-weight:700;margin-bottom:16px">'+esc(step.name)+'</div>';
  } else if(target.target_type === 'frequency' || target.target_type === 'duration' || target.target_type === 'interval'){
    // These target types collect via behaviors mainly, but still show in trial mode for prompt-level recording
    stepLabel = '<div style="text-align:center;font-size:12px;color:var(--warm-gray);margin-bottom:16px">'+target.target_type.replace(/_/g,' ')+' target — log via "+ Behavior" if measuring occurrences</div>';
  }
  // 2x4 button grid
  var btns = [
    { lvl: 'independent', label: 'Independent', resp: 'correct', color: 'var(--sage-dark)', bg: 'var(--sage-light)' },
    { lvl: 'gestural', label: 'Gestural', resp: 'prompted', color: '#7A6A10', bg: 'rgba(232,200,74,0.18)' },
    { lvl: 'verbal', label: 'Verbal', resp: 'prompted', color: '#7A6A10', bg: 'rgba(232,200,74,0.18)' },
    { lvl: 'model', label: 'Model', resp: 'prompted', color: '#7A6A10', bg: 'rgba(232,200,74,0.18)' },
    { lvl: 'partial_physical', label: 'Partial Physical', resp: 'prompted', color: '#7A6A10', bg: 'rgba(232,200,74,0.18)' },
    { lvl: 'full_physical', label: 'Full Physical', resp: 'prompted', color: '#7A6A10', bg: 'rgba(232,200,74,0.18)' },
    { lvl: 'no_response', label: 'No Response', resp: 'incorrect', color: 'var(--terracotta)', bg: 'var(--terracotta-light)' }
  ];
  var grid = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:560px;margin:0 auto">';
  for(var i=0;i<6;i++){
    var b = btns[i];
    grid += '<button onclick="recordTrial(\x27'+b.lvl+'\x27,\x27'+b.resp+'\x27)" style="padding:24px 12px;background:'+b.bg+';color:'+b.color+';border:2px solid '+b.color+';border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;min-height:80px">'+b.label+'</button>';
  }
  grid += '</div>';
  // "No Response" full-width below
  var noResp = btns[6];
  grid += '<div style="max-width:560px;margin:10px auto 0"><button onclick="recordTrial(\x27'+noResp.lvl+'\x27,\x27'+noResp.resp+'\x27)" style="width:100%;padding:18px;background:'+noResp.bg+';color:'+noResp.color+';border:2px solid '+noResp.color+';border-radius:14px;font-size:15px;font-weight:700;cursor:pointer">'+noResp.label+'</button></div>';
  // Last-behavior pill (set by Task 6 logging)
  var lastBehavior = activeSession && activeSession.last_behavior_label ? '<div style="text-align:center;margin-top:14px;font-size:11px;color:var(--warm-gray)">Recently logged: '+esc(activeSession.last_behavior_label)+'</div>' : '';
  return stepLabel + grid + lastBehavior;
}

function recordTrial(promptLevel, response){
  if(!activeSession || activeSession.current_target_idx < 0) return;
  var t = activeSession.targets[activeSession.current_target_idx];
  var trialIndex = t.trials_run + 1;
  var stepId = null;
  if(t.target_type === 'task_analysis' && t.steps.length > 0){
    stepId = t.steps[t.step_idx % t.steps.length].id;
  }
  // Enqueue
  mvOffline.enqueue({
    table: 'trials',
    payload: {
      session_id: activeSession.id,
      target_id: t.id,
      target_step_id: stepId,
      prompt_level: promptLevel,
      response: response,
      trial_index: trialIndex,
      client_uuid: mvUuid()
    }
  });
  // Update local counters
  t.trials_run += 1;
  if(response === 'correct') t.trials_correct += 1;
  if(t.target_type === 'task_analysis' && t.steps.length > 0){
    t.step_idx = (t.step_idx + 1) % t.steps.length;
  }
  activeSession.trial_in_target = t.trials_run;
  // Re-render
  renderActiveSession();
  // Brief flash via toast for tactile confirmation (skip if rapid taps)
  // (Toast suppressed to keep flow fast — sync badge update + counter increment is the feedback)
  // If target hit planned trials, prompt switch
  if(t.trials_run >= t.planned_trials){
    showToast('Target complete (' + t.trials_run + '/' + t.planned_trials + ')');
  }
}
```

- [ ] **Step 2: Manual verification**

1. Open Maya → Start session → Begin session.
2. Active session shows 7 buttons (2x3 grid + No Response full-width at bottom). Counter shows "1/N".
3. Tap Independent. Counter → "2/N". Sync badge briefly shows "Syncing (1)" then "Synced". For task analysis targets, step label increments.
4. Tap a few more (mix of buttons). Each updates counter.
5. DevTools console:
   ```javascript
   mvOffline.queueCount;
   ```
   Should briefly show > 0 then return to 0 as flush completes.
6. SQL check:
   ```sql
   SELECT prompt_level, response, trial_index FROM public.trials
   WHERE session_id = '<active session id>'
   ORDER BY trial_index;
   ```
   Expected: rows matching the taps in order.
7. Turn off Wi-Fi (or DevTools → Network → Offline). Tap 5 more times. Counter still increments. Sync badge: "Offline (5)". Turn Wi-Fi back on. Within 30s, badge → "Synced" and SQL shows the 5 new rows.

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba-live): trial entry buttons with auto-advance + offline

7 big tap buttons (Independent/Gestural/Verbal/Model/Partial/Full
Physical/No Response). Auto-advance trial counter and (for task
analysis) step index. Records via mvOffline.enqueue so taps work
offline. Server UNIQUE(session_id, client_uuid) provides idempotency.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6: Behavior overlay — frequency + duration

### Task 6: Behavior overlay — list + frequency + duration

**Files:**
- Modify: `app.html`

Replaces the `openBehaviorOverlay` stub with the slide-up overlay. Implements frequency tally and duration timer. Interval + ABC land in Task 7.

- [ ] **Step 1: Add behavior overlay HTML**

Insert near other overlays:

```html
<div id="behaviorOverlay" style="display:none;position:fixed;left:0;right:0;bottom:0;top:auto;background:white;border-radius:18px 18px 0 0;box-shadow:0 -8px 32px rgba(0,0,0,0.2);max-height:80vh;overflow-y:auto;z-index:1100">
  <div style="position:sticky;top:0;background:white;padding:14px 16px;border-bottom:1px solid var(--sand);display:flex;justify-content:space-between;align-items:center;z-index:2">
    <h3 id="boTitle" style="font-family:Fraunces,serif;font-size:18px;font-weight:700">Log a behavior</h3>
    <button class="btn btn-s" style="padding:6px 12px;font-size:12px" onclick="closeBehaviorOverlay()">Close</button>
  </div>
  <div id="boContent" style="padding:16px"></div>
</div>
```

- [ ] **Step 2: Replace the stub `openBehaviorOverlay` with the full module**

Find:

```javascript
function openBehaviorOverlay(){ alert('Behavior overlay lands in Task 6'); }
```

Replace with:

```javascript
var behaviorOverlayState = { mode: 'list', definitions: [], current: null, count: 0, durationStart: null, durationElapsed: 0, durationTimer: null };

async function openBehaviorOverlay(){
  if(!activeSession){ return; }
  // Load behavior definitions for this client
  var r = await sb.from('behavior_definitions')
    .select('id,name,recording_type,classification,operational_definition')
    .eq('practice_client_id', activeSession.practice_client_id)
    .eq('status', 'active')
    .order('name');
  behaviorOverlayState.definitions = r.data || [];
  behaviorOverlayState.mode = 'list';
  behaviorOverlayState.current = null;
  document.getElementById('behaviorOverlay').style.display = 'block';
  renderBehaviorOverlay();
}

function closeBehaviorOverlay(){
  if(behaviorOverlayState.durationTimer){ clearInterval(behaviorOverlayState.durationTimer); behaviorOverlayState.durationTimer = null; }
  document.getElementById('behaviorOverlay').style.display = 'none';
}

function renderBehaviorOverlay(){
  var el = document.getElementById('boContent');
  var title = document.getElementById('boTitle');
  if(behaviorOverlayState.mode === 'list'){
    title.textContent = 'Log a behavior';
    if(behaviorOverlayState.definitions.length === 0){
      el.innerHTML = '<div style="padding:30px 16px;text-align:center;color:var(--warm-gray);font-size:13px">No behaviors defined for this client yet. A BCBA can add them from the Client → Behaviors tab (sub-project #3). For now, define one quickly:</div>'+
        '<div style="padding:0 16px"><label class="fl">Behavior name</label><input id="boQuickName" class="fi" placeholder="e.g. Aggression — hitting">'+
        '<label class="fl" style="margin-top:8px">Recording type</label><select id="boQuickType" class="fi"><option value="frequency">Frequency</option><option value="duration">Duration</option></select>'+
        '<label class="fl" style="margin-top:8px">Operational definition</label><textarea id="boQuickDef" class="fi" rows="3"></textarea>'+
        '<button class="btn btn-p" style="width:100%;margin-top:12px" onclick="quickAddBehavior()">Add behavior</button></div>';
      return;
    }
    var h = '<div style="display:flex;flex-direction:column;gap:6px">';
    behaviorOverlayState.definitions.forEach(function(b){
      var typeLabel = {frequency:'Frequency',duration:'Duration',interval:'Interval',abc:'ABC',rate:'Rate'}[b.recording_type] || b.recording_type;
      h += '<button onclick="behaviorPick(\x27'+b.id+'\x27)" style="text-align:left;padding:14px;border:1px solid var(--sand);border-radius:12px;background:white;cursor:pointer;display:flex;justify-content:space-between;align-items:center">'+
        '<div style="flex:1"><div style="font-weight:700;font-size:14px">'+esc(b.name)+'</div>'+
        '<div style="font-size:11px;color:var(--warm-gray);margin-top:2px">'+esc((b.operational_definition || '').slice(0, 100))+(b.operational_definition && b.operational_definition.length > 100 ? '…' : '')+'</div></div>'+
        '<span class="log-tag" style="background:var(--sage-light)">'+typeLabel+'</span>'+
        '</button>';
    });
    h += '</div>';
    el.innerHTML = h;
  } else if(behaviorOverlayState.mode === 'frequency'){
    title.textContent = behaviorOverlayState.current.name;
    el.innerHTML = '<div style="text-align:center;padding:20px 0">'+
      '<div style="font-family:Fraunces,serif;font-size:64px;font-weight:800;color:var(--terracotta);line-height:1">'+behaviorOverlayState.count+'</div>'+
      '<div style="font-size:13px;color:var(--warm-gray);margin-top:4px">occurrences</div>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:400px;margin:0 auto">'+
      '<button onclick="behaviorFreqDelta(-1)" style="padding:24px;background:var(--cream);border:2px solid var(--warm-gray);border-radius:14px;font-size:24px;font-weight:700;cursor:pointer">−</button>'+
      '<button onclick="behaviorFreqDelta(1)" style="padding:24px;background:var(--terracotta-light);border:2px solid var(--terracotta);color:var(--terracotta);border-radius:14px;font-size:24px;font-weight:700;cursor:pointer">+</button>'+
      '</div>'+
      '<div style="display:flex;gap:8px;margin-top:20px;max-width:400px;margin-left:auto;margin-right:auto">'+
      '<button class="btn btn-s" style="flex:1" onclick="behaviorBackToList()">Back</button>'+
      '<button class="btn btn-p" style="flex:1" onclick="behaviorFreqSave()">Save</button>'+
      '</div>';
  } else if(behaviorOverlayState.mode === 'duration'){
    title.textContent = behaviorOverlayState.current.name;
    var elapsed = Math.floor(behaviorOverlayState.durationElapsed / 1000);
    var mm = Math.floor(elapsed / 60);
    var ss = (elapsed % 60).toString().padStart(2, '0');
    el.innerHTML = '<div style="text-align:center;padding:20px 0">'+
      '<div style="font-family:Fraunces,serif;font-size:56px;font-weight:800;color:var(--terracotta);line-height:1">'+mm+':'+ss+'</div>'+
      '<div style="font-size:13px;color:var(--warm-gray);margin-top:4px">'+(behaviorOverlayState.durationStart ? 'running' : 'paused')+'</div>'+
      '</div>'+
      '<div style="max-width:400px;margin:0 auto">'+
      (behaviorOverlayState.durationStart
        ? '<button onclick="behaviorDurationToggle()" style="width:100%;padding:24px;background:var(--sage-light);color:var(--sage-dark);border:2px solid var(--sage-dark);border-radius:14px;font-size:18px;font-weight:700;cursor:pointer">Pause</button>'
        : '<button onclick="behaviorDurationToggle()" style="width:100%;padding:24px;background:var(--terracotta-light);color:var(--terracotta);border:2px solid var(--terracotta);border-radius:14px;font-size:18px;font-weight:700;cursor:pointer">Start</button>')+
      '<div style="display:flex;gap:8px;margin-top:14px">'+
      '<button class="btn btn-s" style="flex:1" onclick="behaviorBackToList()">Back</button>'+
      '<button class="btn btn-p" style="flex:1" onclick="behaviorDurationSave()">Save</button>'+
      '</div></div>';
  } else if(behaviorOverlayState.mode === 'abc' || behaviorOverlayState.mode === 'interval'){
    // Task 7 implements these — temporary fallback
    title.textContent = behaviorOverlayState.current.name + ' (Task 7)';
    el.innerHTML = '<div style="padding:30px 16px;text-align:center;color:var(--warm-gray);font-size:13px">'+behaviorOverlayState.current.recording_type+' entry lands in Task 7.</div>'+
      '<div style="padding:0 16px"><button class="btn btn-s" style="width:100%" onclick="behaviorBackToList()">Back</button></div>';
  }
}

function behaviorPick(id){
  behaviorOverlayState.current = behaviorOverlayState.definitions.find(function(b){ return b.id === id; });
  behaviorOverlayState.count = 0;
  behaviorOverlayState.durationStart = null;
  behaviorOverlayState.durationElapsed = 0;
  if(behaviorOverlayState.durationTimer){ clearInterval(behaviorOverlayState.durationTimer); behaviorOverlayState.durationTimer = null; }
  behaviorOverlayState.mode = behaviorOverlayState.current.recording_type;
  renderBehaviorOverlay();
}

function behaviorBackToList(){
  if(behaviorOverlayState.durationTimer){ clearInterval(behaviorOverlayState.durationTimer); behaviorOverlayState.durationTimer = null; }
  behaviorOverlayState.mode = 'list';
  behaviorOverlayState.current = null;
  renderBehaviorOverlay();
}

function behaviorFreqDelta(delta){
  behaviorOverlayState.count = Math.max(0, behaviorOverlayState.count + delta);
  renderBehaviorOverlay();
}

async function behaviorFreqSave(){
  if(behaviorOverlayState.count === 0){ showToast('Count is 0 — increment first'); return; }
  mvOffline.enqueue({
    table: 'behavior_recordings',
    payload: {
      session_id: activeSession.id,
      behavior_definition_id: behaviorOverlayState.current.id,
      observer_id: S.practiceMember.id,
      recording_type: 'frequency',
      count: behaviorOverlayState.count,
      client_uuid: mvUuid()
    }
  });
  activeSession.last_behavior_label = behaviorOverlayState.current.name + ' (' + behaviorOverlayState.count + ')';
  closeBehaviorOverlay();
  renderActiveSession();
}

function behaviorDurationToggle(){
  if(behaviorOverlayState.durationStart){
    behaviorOverlayState.durationElapsed += new Date() - behaviorOverlayState.durationStart;
    behaviorOverlayState.durationStart = null;
    if(behaviorOverlayState.durationTimer){ clearInterval(behaviorOverlayState.durationTimer); behaviorOverlayState.durationTimer = null; }
  } else {
    behaviorOverlayState.durationStart = new Date();
    if(behaviorOverlayState.durationTimer) clearInterval(behaviorOverlayState.durationTimer);
    behaviorOverlayState.durationTimer = setInterval(function(){
      // Force re-render by recalculating elapsed
      var d = behaviorOverlayState.durationElapsed + (behaviorOverlayState.durationStart ? (new Date() - behaviorOverlayState.durationStart) : 0);
      var el = document.querySelector('#boContent div:first-child div:first-child');
      if(el){
        var elapsed = Math.floor(d / 1000);
        var mm = Math.floor(elapsed / 60);
        var ss = (elapsed % 60).toString().padStart(2, '0');
        el.textContent = mm+':'+ss;
      }
    }, 1000);
  }
  renderBehaviorOverlay();
}

async function behaviorDurationSave(){
  var d = behaviorOverlayState.durationElapsed;
  if(behaviorOverlayState.durationStart) d += new Date() - behaviorOverlayState.durationStart;
  var seconds = Math.round(d / 1000);
  if(seconds === 0){ showToast('Timer not started'); return; }
  if(behaviorOverlayState.durationTimer){ clearInterval(behaviorOverlayState.durationTimer); behaviorOverlayState.durationTimer = null; }
  mvOffline.enqueue({
    table: 'behavior_recordings',
    payload: {
      session_id: activeSession.id,
      behavior_definition_id: behaviorOverlayState.current.id,
      observer_id: S.practiceMember.id,
      recording_type: 'duration',
      duration_seconds: seconds,
      client_uuid: mvUuid()
    }
  });
  activeSession.last_behavior_label = behaviorOverlayState.current.name + ' (' + seconds + 's)';
  closeBehaviorOverlay();
  renderActiveSession();
}

async function quickAddBehavior(){
  var name = document.getElementById('boQuickName').value.trim();
  var recordingType = document.getElementById('boQuickType').value;
  var def = document.getElementById('boQuickDef').value.trim();
  if(!name || !def){ showToast('Name and definition required'); return; }
  var r = await sb.from('behavior_definitions').insert({
    practice_client_id: activeSession.practice_client_id,
    name: name,
    operational_definition: def,
    recording_type: recordingType,
    classification: 'challenging',
    status: 'active'
  }).select().single();
  if(r.error){ showToast(r.error.message); return; }
  behaviorOverlayState.definitions.push(r.data);
  behaviorOverlayState.current = r.data;
  behaviorOverlayState.count = 0;
  behaviorOverlayState.mode = recordingType;
  renderBehaviorOverlay();
}
```

- [ ] **Step 3: Manual verification**

1. Open Maya's active session.
2. Tap the floating + button. Overlay slides up. Empty state shows the "Add behavior" form.
3. Add a quick behavior: name "Aggression — hitting", type "frequency", definition "Open-hand contact with another person".
4. Counter view appears. Tap + a few times (counter goes up). Tap − (counter goes down, floor at 0). Tap Save.
5. Overlay closes. Top bar still shows trial state. "Recently logged: Aggression — hitting (3)" appears below trial buttons.
6. Tap + again. List view shows the saved behavior. Tap it. Counter view appears (count resets to 0).
7. SQL:
   ```sql
   SELECT recording_type, count, duration_seconds FROM public.behavior_recordings
   WHERE session_id = '<active session id>'
   ORDER BY timestamp;
   ```
   Expected: rows with recording_type='frequency', count=3.
8. Open + → list → re-tap behavior. This time pick a duration-type behavior if one exists, OR add a quick "Crying" with type=duration. Start/Pause/Save → duration_seconds row.

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba-live): behavior overlay — list + frequency + duration

Slide-up overlay listing behavior_definitions for the client. Frequency
view: large counter + and − buttons. Duration view: start/pause timer.
Both routed through mvOffline.enqueue (offline-safe). Quick-add form
when no behaviors are defined. Interval + ABC land in Task 7.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7: Behavior overlay — interval + ABC

### Task 7: Interval recording + ABC entry

**Files:**
- Modify: `app.html`

Extends the behavior overlay with two more recording types. Replaces the Task 6 fallback stub.

- [ ] **Step 1: Replace the `else if (mode === 'abc' || mode === 'interval')` fallback in `renderBehaviorOverlay`**

Find the placeholder block:

```javascript
  } else if(behaviorOverlayState.mode === 'abc' || behaviorOverlayState.mode === 'interval'){
    // Task 7 implements these — temporary fallback
    title.textContent = behaviorOverlayState.current.name + ' (Task 7)';
    el.innerHTML = '<div style="padding:30px 16px;text-align:center;color:var(--warm-gray);font-size:13px">'+behaviorOverlayState.current.recording_type+' entry lands in Task 7.</div>'+
      '<div style="padding:0 16px"><button class="btn btn-s" style="width:100%" onclick="behaviorBackToList()">Back</button></div>';
  }
```

Replace with the two real handlers:

```javascript
  } else if(behaviorOverlayState.mode === 'interval'){
    title.textContent = behaviorOverlayState.current.name;
    var bo = behaviorOverlayState;
    if(!bo.interval){
      // First entry — initialize state from definition's data_collection_config (not stored on def directly; use config defaults)
      bo.interval = { totalIntervals: 12, intervalSecs: 10, currentIdx: 0, results: [], started: false };
    }
    var iv = bo.interval;
    var pctComplete = Math.round((iv.currentIdx / iv.totalIntervals) * 100);
    el.innerHTML = '<div style="padding:0 4px">'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">'+
      '<div><label class="fl">Total intervals</label><input id="boIvTotal" class="fi" type="number" min="1" value="'+iv.totalIntervals+'" onchange="behaviorOverlayState.interval.totalIntervals=parseInt(this.value,10)||12"></div>'+
      '<div><label class="fl">Seconds each</label><input id="boIvSecs" class="fi" type="number" min="1" value="'+iv.intervalSecs+'" onchange="behaviorOverlayState.interval.intervalSecs=parseInt(this.value,10)||10"></div>'+
      '</div>'+
      '<div style="text-align:center;padding:10px 0">'+
      '<div style="font-family:Fraunces,serif;font-size:36px;font-weight:800">Interval '+(iv.currentIdx+1)+'/'+iv.totalIntervals+'</div>'+
      '<div style="font-size:12px;color:var(--warm-gray)">'+pctComplete+'% complete</div>'+
      '</div>'+
      (iv.started && iv.currentIdx < iv.totalIntervals
        ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:400px;margin:0 auto">'+
          '<button onclick="behaviorIntervalMark(false)" style="padding:24px;background:var(--cream);border:2px solid var(--warm-gray);color:var(--warm-gray);border-radius:14px;font-size:16px;font-weight:700;cursor:pointer">Did not occur</button>'+
          '<button onclick="behaviorIntervalMark(true)" style="padding:24px;background:var(--terracotta-light);border:2px solid var(--terracotta);color:var(--terracotta);border-radius:14px;font-size:16px;font-weight:700;cursor:pointer">Occurred</button>'+
          '</div>'
        : (iv.currentIdx >= iv.totalIntervals
            ? '<div style="text-align:center;padding:14px;background:var(--sage-light);border-radius:12px;color:var(--sage-dark);font-weight:700">All intervals recorded. Tap Save.</div>'
            : '<button onclick="behaviorIntervalStart()" style="width:100%;padding:18px;background:var(--terracotta-light);border:2px solid var(--terracotta);color:var(--terracotta);border-radius:14px;font-size:16px;font-weight:700;cursor:pointer">Start</button>'))+
      '<div style="display:flex;gap:8px;margin-top:14px">'+
      '<button class="btn btn-s" style="flex:1" onclick="behaviorBackToList()">Back</button>'+
      '<button class="btn btn-p" style="flex:1" onclick="behaviorIntervalSave()">Save</button>'+
      '</div></div>';
  } else if(behaviorOverlayState.mode === 'abc'){
    title.textContent = behaviorOverlayState.current.name;
    var bo = behaviorOverlayState;
    if(!bo.abc) bo.abc = { antecedent: '', consequence: '', function_category: '', notes: '' };
    el.innerHTML = '<div style="padding:0 4px">'+
      '<label class="fl">Antecedent (what happened just before)</label>'+
      '<textarea id="boAnt" class="fi" rows="2" placeholder="e.g. Asked to come to table">'+esc(bo.abc.antecedent)+'</textarea>'+
      '<label class="fl" style="margin-top:10px">Behavior</label>'+
      '<div style="padding:10px;background:var(--cream);border-radius:10px;font-size:13px"><strong>'+esc(bo.current.name)+'</strong><br><span style="color:var(--warm-gray);font-size:11px">'+esc(bo.current.operational_definition || '')+'</span></div>'+
      '<label class="fl" style="margin-top:10px">Consequence (what happened after)</label>'+
      '<textarea id="boCons" class="fi" rows="2" placeholder="e.g. Given iPad to calm down">'+esc(bo.abc.consequence)+'</textarea>'+
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

- [ ] **Step 2: Add the interval + ABC handler functions**

After the existing behavior helper functions, add:

```javascript
function behaviorIntervalStart(){
  var iv = behaviorOverlayState.interval;
  iv.started = true;
  renderBehaviorOverlay();
}

function behaviorIntervalMark(occurred){
  var iv = behaviorOverlayState.interval;
  iv.results.push(occurred);
  iv.currentIdx += 1;
  renderBehaviorOverlay();
}

async function behaviorIntervalSave(){
  var iv = behaviorOverlayState.interval;
  if(iv.results.length === 0){ showToast('Mark at least one interval'); return; }
  mvOffline.enqueue({
    table: 'behavior_recordings',
    payload: {
      session_id: activeSession.id,
      behavior_definition_id: behaviorOverlayState.current.id,
      observer_id: S.practiceMember.id,
      recording_type: 'interval',
      interval_data: { results: iv.results, intervalSecs: iv.intervalSecs, totalIntervals: iv.totalIntervals },
      client_uuid: mvUuid()
    }
  });
  var occurrences = iv.results.filter(function(x){ return x; }).length;
  activeSession.last_behavior_label = behaviorOverlayState.current.name + ' (' + occurrences + '/' + iv.results.length + ' intervals)';
  behaviorOverlayState.interval = null;
  closeBehaviorOverlay();
  renderActiveSession();
}

function behaviorAbcFn(fn){
  behaviorOverlayState.abc.function_category = fn;
  renderBehaviorOverlay();
}

async function behaviorAbcSave(){
  var bo = behaviorOverlayState;
  bo.abc.antecedent = document.getElementById('boAnt').value.trim();
  bo.abc.consequence = document.getElementById('boCons').value.trim();
  bo.abc.notes = document.getElementById('boNotes').value.trim();
  if(!bo.abc.antecedent && !bo.abc.consequence && !bo.abc.function_category){
    showToast('Fill at least one field');
    return;
  }
  // ABC stores antecedent/consequence as free-text in notes (FK lookup to behavior_antecedents library is optional polish)
  mvOffline.enqueue({
    table: 'behavior_recordings',
    payload: {
      session_id: activeSession.id,
      behavior_definition_id: bo.current.id,
      observer_id: S.practiceMember.id,
      recording_type: 'abc',
      function_category: bo.abc.function_category || null,
      notes: 'A: ' + bo.abc.antecedent + '\nC: ' + bo.abc.consequence + (bo.abc.notes ? '\nNotes: ' + bo.abc.notes : ''),
      client_uuid: mvUuid()
    }
  });
  activeSession.last_behavior_label = bo.current.name + ' (ABC)';
  bo.abc = null;
  closeBehaviorOverlay();
  renderActiveSession();
}
```

- [ ] **Step 3: Manual verification**

1. In Maya's active session, tap +. Add or pick a behavior with recording_type='interval' (you may need to use quick-add).
2. Interval view appears. Set Total=4, Seconds=5. Start. Mark "Occurred", "Did not occur", "Occurred", "Did not occur". Counter shows 4/4. Save.
3. SQL: `SELECT recording_type, interval_data FROM behavior_recordings WHERE recording_type='interval' ORDER BY timestamp DESC LIMIT 1;` — should show jsonb with `results: [true,false,true,false]`.
4. Add or pick a behavior with recording_type='abc'. Form shows antecedent textarea, behavior summary, consequence textarea, function chips (tangible/escape/attention/sensory), notes. Fill in, pick "escape", save.
5. SQL: `SELECT recording_type, function_category, notes FROM behavior_recordings WHERE recording_type='abc' ORDER BY timestamp DESC LIMIT 1;`

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba-live): behavior overlay — interval + ABC

Interval recording: configurable total intervals + seconds, mark each
as occurred/not. ABC entry: antecedent/consequence free-text, function
category chips (tangible/escape/attention/sensory), notes. All routed
through mvOffline. Completes the behavior overlay surface.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 8: End-of-session summary

### Task 8: End-of-session summary + submit

**Files:**
- Modify: `app.html`

Replaces the `confirmEndSession` stub and `openSessionSummary` stub. Adds the summary screen with trial counts per target, behavior counts, session metadata, and the Submit/Save buttons. Submitting marks session `status='completed'`.

- [ ] **Step 1: Add session summary HTML overlay**

Insert near other practice overlays:

```html
<div id="sessionSummaryPage" class="overlay-page">
  <div class="overlay-header">
    <button class="overlay-back" onclick="closeSessionSummary()"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D2D2D" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
    <h2 class="overlay-title">Session summary</h2>
  </div>
  <div class="overlay-inner" id="sessionSummaryContent" style="padding-bottom:80px"></div>
</div>
```

- [ ] **Step 2: Replace `confirmEndSession` and `openSessionSummary` with real handlers**

Find:

```javascript
function confirmEndSession(){ alert('End session flow lands in Task 8'); }
function openSessionSummary(sessionId){ alert('Session summary opens in Task 8'); }
```

Replace with:

```javascript
function confirmEndSession(){
  if(!activeSession) return;
  if(!confirm('End session? You\x27ll see a summary before it\x27s saved.')) return;
  // Flush pending ops before showing summary
  mvOffline.flush().finally(function(){
    setTimeout(function(){ openSessionSummary(activeSession.id, true); }, 600);
  });
}

var summaryState = { sessionId: null, fromActive: false, ioaByTarget: null };

async function openSessionSummary(sessionId, fromActive){
  summaryState = { sessionId: sessionId, fromActive: !!fromActive, ioaByTarget: null };
  document.getElementById('sessionSummaryPage').classList.add('open');
  await renderSessionSummary();
}

function closeSessionSummary(){
  document.getElementById('sessionSummaryPage').classList.remove('open');
  if(summaryState.fromActive){
    // Returning from end-flow but didn't submit: re-open active session
    summaryState.fromActive = false;
    if(activeSession){ document.getElementById('activeSessionPage').classList.add('open'); }
  }
}

async function renderSessionSummary(){
  var el = document.getElementById('sessionSummaryContent');
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--warm-gray)">Loading summary…</div>';
  var sR = await sb.from('sessions')
    .select('id,start_time,end_time,location,cpt_code,status,parent_present,practice_clients(children(name)),provider:practice_members!provider_id(profiles(name,email))')
    .eq('id', summaryState.sessionId)
    .single();
  if(sR.error){ el.innerHTML = '<div style="padding:20px;color:var(--terracotta)">'+esc(sR.error.message)+'</div>'; return; }
  var session = sR.data;
  var stR = await sb.from('session_targets')
    .select('target_id,planned_trials,targets(id,name,target_type)')
    .eq('session_id', summaryState.sessionId);
  var trR = await sb.from('trials')
    .select('target_id,prompt_level,response,ioa_observer_id')
    .eq('session_id', summaryState.sessionId)
    .is('superseded_by', null);
  var brR = await sb.from('behavior_recordings')
    .select('behavior_definition_id,recording_type,count,duration_seconds,interval_data,behavior_definitions(name)')
    .eq('session_id', summaryState.sessionId)
    .is('superseded_by', null);
  // Aggregate trials per target
  var trialsByTarget = {};
  var ioaTrialsByTarget = {};
  (trR.data || []).forEach(function(t){
    if(t.ioa_observer_id){
      if(!ioaTrialsByTarget[t.target_id]) ioaTrialsByTarget[t.target_id] = [];
      ioaTrialsByTarget[t.target_id].push(t);
    } else {
      if(!trialsByTarget[t.target_id]) trialsByTarget[t.target_id] = [];
      trialsByTarget[t.target_id].push(t);
    }
  });
  // Compute IOA % per target (matching primary vs IOA by response)
  var ioaByTarget = {};
  Object.keys(ioaTrialsByTarget).forEach(function(tid){
    var primary = trialsByTarget[tid] || [];
    var ioa = ioaTrialsByTarget[tid];
    var n = Math.min(primary.length, ioa.length);
    var match = 0;
    for(var i=0;i<n;i++){
      if(primary[i].response === ioa[i].response) match++;
    }
    ioaByTarget[tid] = n > 0 ? Math.round((match/n)*100) : null;
  });
  summaryState.ioaByTarget = ioaByTarget;
  // Aggregate behaviors per definition
  var behaviorsByDef = {};
  (brR.data || []).forEach(function(br){
    var key = br.behavior_definition_id;
    if(!behaviorsByDef[key]){
      behaviorsByDef[key] = { name: (br.behavior_definitions && br.behavior_definitions.name) || '(unnamed)', frequency: 0, duration: 0, interval_occurred: 0, interval_total: 0, abc_count: 0 };
    }
    var entry = behaviorsByDef[key];
    if(br.recording_type === 'frequency') entry.frequency += (br.count || 0);
    else if(br.recording_type === 'duration') entry.duration += (br.duration_seconds || 0);
    else if(br.recording_type === 'interval' && br.interval_data){
      entry.interval_occurred += (br.interval_data.results || []).filter(function(x){ return x; }).length;
      entry.interval_total += (br.interval_data.results || []).length;
    } else if(br.recording_type === 'abc') entry.abc_count += 1;
  });
  // Duration
  var startedAt = new Date(session.start_time);
  var endedAt = session.end_time ? new Date(session.end_time) : new Date();
  var durMin = Math.round((endedAt - startedAt) / 60000);
  var providerName = session.provider && session.provider.profiles ? (session.provider.profiles.name || session.provider.profiles.email) : '';
  // Render
  var h = '<div style="max-width:760px;margin:0 auto">';
  h += '<div style="font-family:Fraunces,serif;font-size:22px;font-weight:700">'+esc(session.practice_clients.children.name)+' &middot; '+startedAt.toLocaleDateString()+'</div>'+
    '<div style="font-size:13px;color:var(--warm-gray);margin-bottom:18px">'+esc(providerName)+' &middot; '+durMin+' min &middot; '+esc(session.location || '')+' &middot; CPT '+esc(session.cpt_code || '')+' &middot; status: '+session.status+'</div>';
  // Trial summary
  h += '<div class="label" style="margin-bottom:8px">Trials</div>';
  if(!stR.data || stR.data.length === 0){
    h += '<div style="padding:14px;background:var(--cream);border-radius:12px;font-size:13px;color:var(--warm-gray)">No targets in this session.</div>';
  } else {
    h += '<table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:18px"><thead><tr style="border-bottom:1px solid var(--sand);text-align:left"><th style="padding:6px 4px">Target</th><th style="padding:6px 4px;text-align:right">Run/Plan</th><th style="padding:6px 4px;text-align:right">% correct</th><th style="padding:6px 4px;text-align:right">% indep</th><th style="padding:6px 4px;text-align:right">IOA</th></tr></thead><tbody>';
    stR.data.forEach(function(row){
      var t = row.targets || {};
      var trials = trialsByTarget[row.target_id] || [];
      var total = trials.length;
      var correct = trials.filter(function(x){ return x.response === 'correct'; }).length;
      var indep = trials.filter(function(x){ return x.prompt_level === 'independent'; }).length;
      var pctCorrect = total > 0 ? Math.round((correct/total)*100) : 0;
      var pctIndep = total > 0 ? Math.round((indep/total)*100) : 0;
      var ioaPct = ioaByTarget[row.target_id];
      var ioaCell = ioaPct === undefined || ioaPct === null ? '—' : (ioaPct >= 80 ? '<span style="color:var(--sage-dark);font-weight:700">'+ioaPct+'%</span>' : '<span style="color:#7A6A10;font-weight:700">'+ioaPct+'%</span>');
      h += '<tr style="border-bottom:1px solid var(--sand)"><td style="padding:8px 4px">'+esc(t.name)+'</td><td style="padding:8px 4px;text-align:right">'+total+'/'+(row.planned_trials||'?')+'</td><td style="padding:8px 4px;text-align:right">'+pctCorrect+'%</td><td style="padding:8px 4px;text-align:right">'+pctIndep+'%</td><td style="padding:8px 4px;text-align:right">'+ioaCell+'</td></tr>';
    });
    h += '</tbody></table>';
  }
  // Behavior summary
  h += '<div class="label" style="margin-bottom:8px;margin-top:16px">Behaviors</div>';
  var defs = Object.keys(behaviorsByDef);
  if(defs.length === 0){
    h += '<div style="padding:14px;background:var(--cream);border-radius:12px;font-size:13px;color:var(--warm-gray)">No behaviors recorded.</div>';
  } else {
    h += '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:18px">';
    defs.forEach(function(key){
      var b = behaviorsByDef[key];
      var parts = [];
      if(b.frequency) parts.push(b.frequency + ' occurrences');
      if(b.duration) parts.push((b.duration/60).toFixed(1) + ' min total');
      if(b.interval_total) parts.push(b.interval_occurred + '/' + b.interval_total + ' intervals');
      if(b.abc_count) parts.push(b.abc_count + ' ABC entries');
      h += '<div style="padding:10px 14px;border:1px solid var(--sand);border-radius:10px"><div style="font-weight:700;font-size:14px">'+esc(b.name)+'</div><div style="font-size:12px;color:var(--warm-gray);margin-top:2px">'+parts.join(' &middot; ')+'</div></div>';
    });
    h += '</div>';
  }
  // Metadata form + actions (only if status='in_progress' and viewer is the provider)
  var canEdit = session.status === 'in_progress' && summaryState.fromActive;
  if(canEdit){
    h += '<div class="label" style="margin-bottom:8px">Session details</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'+
      '<div><label class="fl">CPT</label><select id="ssCpt" class="fi"><option value="97153"'+(session.cpt_code==='97153'?' selected':'')+'>97153</option><option value="97155"'+(session.cpt_code==='97155'?' selected':'')+'>97155</option><option value="97156"'+(session.cpt_code==='97156'?' selected':'')+'>97156</option></select></div>'+
      '<div style="display:flex;align-items:flex-end"><label style="display:flex;gap:6px;font-size:13px"><input id="ssParentPresent" type="checkbox"'+(session.parent_present?' checked':'')+'> Parent present</label></div>'+
      '</div>'+
      '<label class="fl">Notes (placeholder — full SOAP in sub-project #5)</label>'+
      '<textarea id="ssNotes" class="fi" rows="3" placeholder="Brief session notes"></textarea>'+
      '<div style="display:flex;gap:8px;margin-top:18px">'+
      '<button class="btn btn-s" style="flex:1" onclick="closeSessionSummary()">Save &amp; continue editing</button>'+
      '<button class="btn btn-p" style="flex:1" onclick="submitSession()">Submit session</button>'+
      '</div>';
  } else {
    // Read-only view: show notes/status, no submit
    h += '<div style="padding:14px;background:var(--sage-light);border-radius:12px;font-size:13px;color:var(--sage-dark)">Session is <strong>'+session.status+'</strong>. Read-only view.</div>';
  }
  h += '</div>';
  el.innerHTML = h;
}

async function submitSession(){
  var cpt = document.getElementById('ssCpt').value;
  var parentPresent = document.getElementById('ssParentPresent').checked;
  var notesText = document.getElementById('ssNotes').value.trim();
  var upd = await sb.from('sessions').update({
    status: 'completed',
    end_time: new Date().toISOString(),
    cpt_code: cpt,
    parent_present: parentPresent
  }).eq('id', summaryState.sessionId);
  if(upd.error){ showToast(upd.error.message); return; }
  // Save notes as a session_notes row if any
  if(notesText){
    await sb.from('session_notes').insert({
      provider_id: S.user.id,
      child_id: activeSession ? null : null,
      session_id: summaryState.sessionId,
      session_date: new Date().toISOString().slice(0,10),
      duration_minutes: Math.round((new Date() - activeSession.started_at)/60000),
      cpt_code: cpt,
      session_type: 'session',
      interventions: notesText,
      shared_with_parent: false,
      billing_status: 'draft'
    });
  }
  // Stop active session timer
  if(window._activeSessionTimer){ clearInterval(window._activeSessionTimer); window._activeSessionTimer = null; }
  activeSession = null;
  closeSessionSummary();
  document.getElementById('activeSessionPage').classList.remove('open');
  showToast('Session submitted');
  // Refresh client detail
  if(currentClient) renderClientPrograms();
}
```

The `session_notes.child_id` insert above is set to `null` because the session_id is the authoritative link; the existing schema has `child_id NOT NULL` though. Look up the child_id for the insert:

Actually adjust the notes insert to fetch the child_id (which lives on `practice_clients.child_id`):

Replace the `session_notes.insert` block with:

```javascript
  if(notesText){
    // Look up child_id via practice_clients
    var pcR = await sb.from('practice_clients').select('child_id').eq('id', activeSession ? activeSession.practice_client_id : null).single();
    var childId = pcR && pcR.data ? pcR.data.child_id : null;
    if(childId){
      await sb.from('session_notes').insert({
        provider_id: S.user.id,
        child_id: childId,
        session_id: summaryState.sessionId,
        session_date: new Date().toISOString().slice(0,10),
        duration_minutes: Math.round((new Date() - activeSession.started_at)/60000),
        cpt_code: cpt,
        session_type: 'session',
        interventions: notesText,
        shared_with_parent: false,
        billing_status: 'draft'
      });
    }
  }
```

- [ ] **Step 3: Manual verification**

1. Run a quick session: Open Maya → Start session → Begin → record 5-10 trials → log 1 behavior → tap End.
2. Confirm modal fires → click OK → summary opens.
3. Summary shows: header (Maya, date, provider, duration, location, CPT), Trials table (per target with counts + %), Behaviors list, Session details form with CPT dropdown, Parent present checkbox, Notes textarea.
4. Enter notes "test session". Tap Submit. Toast "Session submitted". Active session closes; you return to Maya's client detail. Refresh — the new completed session shows in the Recent Sessions list with status pill.
5. SQL:
   ```sql
   SELECT status, end_time, parent_present, cpt_code FROM public.sessions WHERE id = '<id>';
   ```
   Expected: status='completed', end_time set, parent_present matches, cpt_code matches.
   ```sql
   SELECT session_id, interventions FROM public.session_notes WHERE session_id = '<id>';
   ```
   Expected: 1 row with the notes text.
6. From client detail, tap the new completed session row → summary opens in read-only mode (no Submit button, "Session is completed" banner).

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba-live): end-of-session summary + submit

Pre-submit flush of mvOffline queue. Summary shows per-target trial
counts (Run/Plan, % correct, % independent, IOA% if applicable),
per-behavior aggregates (frequency, duration, intervals, ABC count),
session metadata form. Submit sets status='completed', saves a draft
session_notes row if notes provided. Read-only summary view when
opened on already-completed sessions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 9: IOA observer flow

### Task 9: Active sessions card on Practice Dashboard + IOA observer mode

**Files:**
- Modify: `app.html`

Surfaces in-progress sessions on the Practice Dashboard. When a non-primary user opens one, they enter a lite IOA mode (target name + 7 buttons; no behavior overlay, no target switching, no end-session).

- [ ] **Step 1: Add an "Active sessions" card to Practice Dashboard**

Find the `openPracticeDashboard` function. Find the line where the dashboard inner HTML is set (`var h = '<div style="max-width:760px...` block). Find the closing `'<div style="display:flex;gap:8px;flex-wrap:wrap">'+` row of quick-action buttons. Above that flex row, add an Active sessions section:

Locate this part of the existing dashboard render:

```javascript
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:24px">'+
      '<div class="billing-stat"><div class="bs-num">'+active+'</div><div class="bs-lbl">Active clients</div></div>'+
      '<div class="billing-stat"><div class="bs-num">'+intake+'</div><div class="bs-lbl">In intake</div></div>'+
      '<div class="billing-stat"><div class="bs-num">'+(mR.count || 0)+'</div><div class="bs-lbl">Team members</div></div>'+
    '</div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
```

Modify the `openPracticeDashboard` function so before the `'<div style="display:flex;gap:8px;flex-wrap:wrap">'` row, it inserts a fetched "Active sessions" card. Add this fetch at the top of the function (after the existing fetches) and inject HTML before the action buttons:

Add this after the existing `var mR = ...` line:

```javascript
  var activeSR = await sb.from('sessions')
    .select('id,start_time,location,provider:practice_members!provider_id(profiles(name,email)),practice_clients!inner(practice_id,children(name))')
    .eq('status', 'in_progress')
    .eq('practice_clients.practice_id', S.practiceMember.practice_id)
    .order('start_time', { ascending: false });
  var cosignSR = await sb.from('sessions')
    .select('id,start_time,end_time,practice_clients!inner(practice_id,children(name)),provider:practice_members!provider_id(profiles(name,email))')
    .eq('status', 'completed')
    .is('cosigner_id', null)
    .eq('practice_clients.practice_id', S.practiceMember.practice_id)
    .order('end_time', { ascending: false });
```

Then modify the `h` HTML construction to inject:

Replace the dashboard's `h += '<div style="display:flex;gap:8px;flex-wrap:wrap">'` line and the lines around it. Find this block in `openPracticeDashboard`:

```javascript
    '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
      '<button class="btn btn-p" onclick="openPracticeClients()">Manage clients</button>'+
      '<button class="btn btn-s" onclick="openPracticeMembers()">Team</button>'+
      '<button class="btn btn-s" onclick="openCurriculumBrowser()">Curriculum library</button>'+
      '<button class="btn btn-s" onclick="openPracticeSettings()">Settings</button>'+
    '</div>'+
    '<div style="margin-top:24px;padding:14px;background:var(--sage-light);border-radius:14px;font-size:13px;color:var(--sage-dark)">Live data entry, graphs, and SOAP auto-fill ship in the next sub-projects. This is the foundation.</div>'+
```

Replace with (this builds in the active sessions + pending cosign cards, drops the "next sub-project" banner since #2 is shipping):

```javascript
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">'+
      '<button class="btn btn-p" onclick="openPracticeClients()">Manage clients</button>'+
      '<button class="btn btn-s" onclick="openPracticeMembers()">Team</button>'+
      '<button class="btn btn-s" onclick="openCurriculumBrowser()">Curriculum library</button>'+
      '<button class="btn btn-s" onclick="openPracticeSettings()">Settings</button>'+
    '</div>'+
    renderActiveSessionsCard(activeSR.data || [])+
    renderPendingCosignCard(cosignSR.data || [])+
```

- [ ] **Step 2: Add `renderActiveSessionsCard` and `renderPendingCosignCard`**

Insert these functions near `openPracticeDashboard`:

```javascript
function renderActiveSessionsCard(sessions){
  if(!sessions.length) return '';
  var h = '<div style="margin-bottom:14px"><div class="label" style="margin-bottom:8px">Active sessions ('+sessions.length+')</div>';
  sessions.forEach(function(s){
    var when = new Date(s.start_time).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
    var prov = s.provider && s.provider.profiles ? (s.provider.profiles.name || s.provider.profiles.email) : '(unknown)';
    var child = s.practice_clients && s.practice_clients.children ? s.practice_clients.children.name : '(unknown)';
    h += '<div onclick="joinAsIoaObserver(\x27'+s.id+'\x27,\x27'+esc(prov)+'\x27)" style="border:1px solid var(--sage-dark);background:var(--sage-light);border-radius:12px;padding:12px 14px;margin-bottom:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center">'+
      '<div><div style="font-weight:700;font-size:14px">'+esc(child)+'</div>'+
      '<div style="font-size:11px;color:var(--sage-dark);margin-top:2px">'+esc(prov)+' &middot; started '+when+' &middot; tap to join as IOA observer</div></div>'+
      '<span style="font-size:18px">&#128065;</span>'+
      '</div>';
  });
  h += '</div>';
  return h;
}

function renderPendingCosignCard(sessions){
  if(!sessions.length) return '';
  var canCosign = S.practiceMember.role === 'owner_bcba' || S.practiceMember.role === 'supervising_bcba';
  if(!canCosign) return '';
  var h = '<div style="margin-bottom:14px"><div class="label" style="margin-bottom:8px">Pending cosign ('+sessions.length+')</div>';
  sessions.forEach(function(s){
    var when = new Date(s.end_time || s.start_time).toLocaleDateString();
    var prov = s.provider && s.provider.profiles ? (s.provider.profiles.name || s.provider.profiles.email) : '(unknown)';
    var child = s.practice_clients && s.practice_clients.children ? s.practice_clients.children.name : '(unknown)';
    h += '<div onclick="openCosignReview(\x27'+s.id+'\x27)" style="border:1px solid var(--terracotta);background:var(--terracotta-light);border-radius:12px;padding:12px 14px;margin-bottom:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center">'+
      '<div><div style="font-weight:700;font-size:14px">'+esc(child)+'</div>'+
      '<div style="font-size:11px;color:var(--terracotta);margin-top:2px">'+esc(prov)+' &middot; '+when+' &middot; review &amp; cosign</div></div>'+
      '<span style="font-size:18px">&#9997;&#65039;</span>'+
      '</div>';
  });
  h += '</div>';
  return h;
}

function openCosignReview(sessionId){ alert('Cosign review opens in Task 10'); }
```

- [ ] **Step 3: Implement IOA observer mode**

Add this function near `openActiveSession`:

```javascript
async function joinAsIoaObserver(sessionId, primaryName){
  // Confirm intent (and clarify)
  if(!confirm('Join this session as an IOA observer for ' + primaryName + '?\n\nYou will see the primary observer\x27s current target and can record on the same trials. The system computes IOA % per target after the session ends.')) return;
  // Hydrate the session in IOA mode (no targets prefetched — observer follows primary's current target)
  var sR = await sb.from('sessions')
    .select('id,practice_client_id,start_time,location,practice_clients(children(name))')
    .eq('id', sessionId)
    .single();
  if(sR.error){ showToast(sR.error.message); return; }
  activeSession = {
    id: sR.data.id,
    practice_client_id: sR.data.practice_client_id,
    child_name: sR.data.practice_clients.children.name,
    targets: [],
    current_target_idx: -1,
    trial_in_target: 0,
    started_at: new Date(sR.data.start_time),
    ioa_mode: true,
    primary_current_target_id: null,
    primary_current_target_name: null,
    last_behavior_label: null
  };
  document.getElementById('practiceDashboardPage').classList.remove('open');
  document.getElementById('activeSessionPage').classList.add('open');
  renderActiveSessionIoa();
  // Poll primary observer's most-recent trial every 5s to detect target switches
  if(window._ioaPoll) clearInterval(window._ioaPoll);
  window._ioaPoll = setInterval(pollIoaTarget, 5000);
  pollIoaTarget();
}

async function pollIoaTarget(){
  if(!activeSession || !activeSession.ioa_mode) return;
  // Fetch latest non-IOA trial to learn current target
  var r = await sb.from('trials')
    .select('target_id,trial_index,targets(id,name,target_type,target_steps(*))')
    .eq('session_id', activeSession.id)
    .is('ioa_observer_id', null)
    .order('timestamp', { ascending: false })
    .limit(1);
  if(r.data && r.data.length > 0){
    var t = r.data[0];
    if(t.target_id !== activeSession.primary_current_target_id){
      activeSession.primary_current_target_id = t.target_id;
      activeSession.primary_current_target_name = t.targets.name;
      var steps = (t.targets.target_steps || []).slice().sort(function(a,b){ return a.sequence - b.sequence; });
      activeSession.targets = [{
        id: t.targets.id,
        name: t.targets.name,
        target_type: t.targets.target_type,
        steps: steps,
        planned_trials: 0,  // unused in IOA mode
        trials_run: 0,
        trials_correct: 0,
        step_idx: 0
      }];
      activeSession.current_target_idx = 0;
      renderActiveSessionIoa();
    }
  } else if(!activeSession.primary_current_target_id){
    renderActiveSessionIoa();
  }
}

function renderActiveSessionIoa(){
  var el = document.getElementById('activeSessionContent');
  var top = '<div style="display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid var(--sand);background:white;gap:8px">'+
    '<button class="btn btn-s" style="padding:6px 10px;font-size:12px" onclick="exitIoaMode()">Exit</button>'+
    '<div style="flex:1"><div style="font-size:11px;color:var(--warm-gray)">IOA observer · '+esc(activeSession.child_name)+'</div>'+
      (activeSession.primary_current_target_name ? '<div style="font-size:14px;font-weight:700;color:var(--sage-dark)">'+esc(activeSession.primary_current_target_name)+'</div>' : '<div style="font-size:12px;color:var(--warm-gray)">Waiting for primary to start trials…</div>')+
    '</div>'+
    '<div id="asSyncBadge">'+mvOffline.renderBadge()+'</div>'+
    '</div>';
  var body;
  if(!activeSession.primary_current_target_id){
    body = '<div id="asBody" style="flex:1;padding:30px 20px;text-align:center;color:var(--warm-gray)">Waiting for the primary observer to record a trial. This view will update automatically.</div>';
  } else {
    // Use the same trial entry grid as primary, but record with ioa_observer_id
    body = '<div id="asBody" style="flex:1;overflow-y:auto;padding:20px">'+ renderTrialEntryIoa(activeSession.targets[0]) +'</div>';
  }
  el.innerHTML = top + body;
}

function renderTrialEntryIoa(target){
  // Reuse the same button grid as primary; bind to recordTrialIoa
  var btns = [
    { lvl: 'independent', label: 'Independent', resp: 'correct', color: 'var(--sage-dark)', bg: 'var(--sage-light)' },
    { lvl: 'gestural', label: 'Gestural', resp: 'prompted', color: '#7A6A10', bg: 'rgba(232,200,74,0.18)' },
    { lvl: 'verbal', label: 'Verbal', resp: 'prompted', color: '#7A6A10', bg: 'rgba(232,200,74,0.18)' },
    { lvl: 'model', label: 'Model', resp: 'prompted', color: '#7A6A10', bg: 'rgba(232,200,74,0.18)' },
    { lvl: 'partial_physical', label: 'Partial Physical', resp: 'prompted', color: '#7A6A10', bg: 'rgba(232,200,74,0.18)' },
    { lvl: 'full_physical', label: 'Full Physical', resp: 'prompted', color: '#7A6A10', bg: 'rgba(232,200,74,0.18)' },
    { lvl: 'no_response', label: 'No Response', resp: 'incorrect', color: 'var(--terracotta)', bg: 'var(--terracotta-light)' }
  ];
  var grid = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:560px;margin:0 auto">';
  for(var i=0;i<6;i++){
    var b = btns[i];
    grid += '<button onclick="recordTrialIoa(\x27'+b.lvl+'\x27,\x27'+b.resp+'\x27)" style="padding:24px 12px;background:'+b.bg+';color:'+b.color+';border:2px solid '+b.color+';border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;min-height:80px">'+b.label+'</button>';
  }
  grid += '</div>';
  var noResp = btns[6];
  grid += '<div style="max-width:560px;margin:10px auto 0"><button onclick="recordTrialIoa(\x27'+noResp.lvl+'\x27,\x27'+noResp.resp+'\x27)" style="width:100%;padding:18px;background:'+noResp.bg+';color:'+noResp.color+';border:2px solid '+noResp.color+';border-radius:14px;font-size:15px;font-weight:700;cursor:pointer">'+noResp.label+'</button></div>';
  return grid;
}

function recordTrialIoa(promptLevel, response){
  if(!activeSession || !activeSession.ioa_mode || !activeSession.primary_current_target_id) return;
  var t = activeSession.targets[0];
  var trialIndex = t.trials_run + 1;
  var stepId = null;
  if(t.target_type === 'task_analysis' && t.steps.length > 0){
    stepId = t.steps[t.step_idx % t.steps.length].id;
  }
  mvOffline.enqueue({
    table: 'trials',
    payload: {
      session_id: activeSession.id,
      target_id: t.id,
      target_step_id: stepId,
      prompt_level: promptLevel,
      response: response,
      trial_index: trialIndex,
      ioa_observer_id: S.practiceMember.id,
      client_uuid: mvUuid()
    }
  });
  t.trials_run += 1;
  if(response === 'correct') t.trials_correct += 1;
  if(t.target_type === 'task_analysis' && t.steps.length > 0) t.step_idx = (t.step_idx + 1) % t.steps.length;
  renderActiveSessionIoa();
}

function exitIoaMode(){
  if(window._ioaPoll){ clearInterval(window._ioaPoll); window._ioaPoll = null; }
  activeSession = null;
  document.getElementById('activeSessionPage').classList.remove('open');
}
```

- [ ] **Step 4: Manual verification**

1. Sign in as testprovider in one browser. Start a session (don't end it). Record 3 trials.
2. In a second browser (incognito or different browser), sign in as testcaregiver. Important: testcaregiver must be an active practice_members row with role='supervising_bcba' (you may need to manually update their member row to have role='supervising_bcba' for this test, OR add them as a supervising BCBA via the Members page).
3. As testcaregiver, open Practice Dashboard. Should see "Active sessions (1)" card with Maya's session.
4. Click the active session card. Confirm dialog → Yes → IOA mode opens, top bar shows "IOA observer · Maya" + the current target name.
5. Record 2 trials. The 7-button grid works.
6. Switch back to testprovider's browser. Record 2 more primary trials.
7. Within 5s, the IOA observer view updates to the new target if testprovider switched targets.
8. Testprovider taps End Session → submits → session summary shows IOA% per target.
9. SQL:
   ```sql
   SELECT count(*) FROM public.trials WHERE session_id='<id>' AND ioa_observer_id IS NOT NULL;
   ```
   Expected: count = number of trials testcaregiver recorded.

- [ ] **Step 5: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba-live): IOA observer flow

Practice Dashboard surfaces "Active sessions" card. Non-primary
practice members tap to join as IOA observer — lite mode with target
name + 7 trial buttons, no behavior overlay, no target switching.
Polls primary observer's most-recent trial every 5s to follow target
switches. Recorded trials carry ioa_observer_id; end-of-session
summary reconciles IOA % per target.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 10: Cosign flow

### Task 10: Cosign review screen + cosign action

**Files:**
- Modify: `app.html`

Replaces `openCosignReview` stub. Opens the session summary in read-only mode, adds a "Cosign" button at the bottom for owner_bcba / supervising_bcba.

- [ ] **Step 1: Replace `openCosignReview` and extend summary render with cosign action**

Find the `openCosignReview` stub:

```javascript
function openCosignReview(sessionId){ alert('Cosign review opens in Task 10'); }
```

Replace with:

```javascript
async function openCosignReview(sessionId){
  // Closes Practice Dashboard, opens session summary in read-only mode + cosign action
  document.getElementById('practiceDashboardPage').classList.remove('open');
  summaryState = { sessionId: sessionId, fromActive: false, ioaByTarget: null, cosignMode: true };
  document.getElementById('sessionSummaryPage').classList.add('open');
  await renderSessionSummary();
}

async function cosignSession(){
  if(!confirm('Cosign this session? This locks the data; status transitions to "cosigned".')) return;
  var upd = await sb.from('sessions').update({
    cosigner_id: S.practiceMember.id,
    cosigned_at: new Date().toISOString(),
    status: 'cosigned'
  }).eq('id', summaryState.sessionId);
  if(upd.error){ showToast(upd.error.message); return; }
  showToast('Session cosigned');
  document.getElementById('sessionSummaryPage').classList.remove('open');
  openPracticeDashboard();
}
```

- [ ] **Step 2: Modify `renderSessionSummary` to render the cosign button when in cosignMode**

Find the read-only branch in `renderSessionSummary`:

```javascript
  } else {
    // Read-only view: show notes/status, no submit
    h += '<div style="padding:14px;background:var(--sage-light);border-radius:12px;font-size:13px;color:var(--sage-dark)">Session is <strong>'+session.status+'</strong>. Read-only view.</div>';
  }
```

Replace with:

```javascript
  } else {
    h += '<div style="padding:14px;background:var(--sage-light);border-radius:12px;font-size:13px;color:var(--sage-dark);margin-bottom:14px">Session is <strong>'+session.status+'</strong>. Read-only view.</div>';
    var canCosign = summaryState.cosignMode &&
      session.status === 'completed' &&
      (S.practiceMember.role === 'owner_bcba' || S.practiceMember.role === 'supervising_bcba');
    if(canCosign){
      h += '<button class="btn btn-p" style="width:100%" onclick="cosignSession()">Cosign session</button>';
    }
  }
```

- [ ] **Step 3: Manual verification**

1. As testprovider (an owner_bcba), open Practice Dashboard.
2. Should see "Pending cosign (N)" card listing the session you submitted in Task 8.
3. Click it. Summary opens in read-only mode with "Cosign session" button at bottom.
4. Tap Cosign. Confirm. Toast "Session cosigned". Returns to dashboard. Pending cosign count decrements.
5. SQL:
   ```sql
   SELECT status, cosigner_id, cosigned_at FROM public.sessions WHERE id='<id>';
   ```
   Expected: status='cosigned', cosigner_id set, cosigned_at set.
6. Re-open the session from client detail → summary view shows "Session is cosigned" banner, no cosign button.

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba-live): cosign flow

Practice Dashboard "Pending cosign" card lists completed sessions
needing supervising BCBA cosign. Tap opens session summary in
read-only mode plus a Cosign button (gated to owner_bcba /
supervising_bcba). Cosigning sets cosigner_id, cosigned_at, and
transitions status to 'cosigned'. Locks the session from further
edits (RLS already blocks update/delete on trials/recordings).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 11: Parent "My BCBA" tab

### Task 11: Parent flywheel surface

**Files:**
- Modify: `app.html`

Adds a new sidebar item for parents whose child has at least one `practice_clients` row. Renders programs in treatment, recent sessions (aggregate), per-target SVG sparklines.

- [ ] **Step 1: Add the "My BCBA" sidebar item**

Find the `allItems` array in the sidebar render function. Add this entry near the other parent items (e.g., after "Session Notes"):

```javascript
{label:"My BCBA", action:"openMyBcba()", roles:['parent'], requiresMyBcba:true, highlight:true},
```

- [ ] **Step 2: Update the sidebar filter to honor `requiresMyBcba`**

Find the filter:

```javascript
var items=allItems.filter(function(item){
  if(item.roles && item.roles.indexOf(S.role) < 0) return false;
  if(item.requiresPractice && !S.practiceMember) return false;
  if(item.requiresNoPractice && S.practiceMember) return false;
  return true;
});
```

Add the new condition:

```javascript
var items=allItems.filter(function(item){
  if(item.roles && item.roles.indexOf(S.role) < 0) return false;
  if(item.requiresPractice && !S.practiceMember) return false;
  if(item.requiresNoPractice && S.practiceMember) return false;
  if(item.requiresMyBcba && !S.hasMyBcba) return false;
  return true;
});
```

- [ ] **Step 3: Add `S.hasMyBcba` detection in `loadChildren`**

The lookup needs `S.children` to be populated, which only happens inside the `if(S.role==='parent')` branch. Find that branch in `loadChildren`. Just after `S.children=r.data||[];` (where `r` is the children fetch), add:

```javascript
    // Parent flywheel: detect if any child has a practice_clients linkage
    S.hasMyBcba = false;
    if(S.children.length > 0){
      var childIds = S.children.map(function(c){ return c.id; });
      var pcCount = await sb.from('practice_clients').select('id', { count:'exact', head:true }).in('child_id', childIds);
      S.hasMyBcba = (pcCount.count || 0) > 0;
    }
```

Also initialize `S.hasMyBcba = false` near the top of `loadChildren` (right after `S.role` is set, before any branching) so non-parent roles have the property defined:

```javascript
  S.hasMyBcba = false;
```

- [ ] **Step 4: Add the My BCBA overlay HTML**

Insert near other overlays:

```html
<div id="myBcbaPage" class="overlay-page">
  <div class="overlay-header">
    <button class="overlay-back" onclick="closeOverlay('myBcbaPage')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D2D2D" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
    <h2 class="overlay-title">My BCBA</h2>
  </div>
  <div class="overlay-inner" id="myBcbaContent" style="padding-bottom:80px"></div>
</div>
```

- [ ] **Step 5: Implement `openMyBcba` + rendering helpers**

Add these functions near other parent-side functions:

```javascript
async function openMyBcba(){
  if(!S.hasMyBcba){ showToast('Your BCBA hasn\x27t set up a practice for you yet.'); return; }
  document.getElementById('myBcbaPage').classList.add('open');
  var el = document.getElementById('myBcbaContent');
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--warm-gray)">Loading…</div>';
  // Per active child, render programs + sessions + sparklines
  var activeChild = S.activeChild;
  if(!activeChild && S.children && S.children.length > 0) activeChild = S.children[0];
  if(!activeChild){ el.innerHTML = '<div style="padding:20px;color:var(--warm-gray)">No child on file.</div>'; return; }
  // Practice + BCBA context
  var pcR = await sb.from('practice_clients')
    .select('id,status,service_type,intake_date,practices(name),primary_bcba:practice_members!primary_bcba_id(profiles(name,email))')
    .eq('child_id', activeChild.id)
    .limit(1)
    .maybeSingle();
  if(pcR.error || !pcR.data){ el.innerHTML = '<div style="padding:20px;color:var(--terracotta)">'+esc((pcR.error && pcR.error.message) || 'No practice link found')+'</div>'; return; }
  var pc = pcR.data;
  var bcbaName = pc.primary_bcba && pc.primary_bcba.profiles ? (pc.primary_bcba.profiles.name || pc.primary_bcba.profiles.email) : 'Your BCBA';
  // Programs + targets via v_child_target_progress
  var progR = await sb.from('v_child_target_progress')
    .select('*')
    .eq('child_id', activeChild.id);
  // Sessions via v_child_sessions
  var sessR = await sb.from('v_child_sessions')
    .select('*')
    .eq('child_id', activeChild.id)
    .order('start_time', { ascending: false })
    .limit(10);
  // Build HTML
  var h = '<div style="max-width:760px;margin:0 auto">';
  h += '<div style="padding:14px;background:var(--sage-light);border-radius:14px;margin-bottom:18px">'+
    '<div style="font-family:Fraunces,serif;font-size:18px;font-weight:700">'+esc(activeChild.name || 'Your child')+' is working with '+esc(bcbaName)+'</div>'+
    '<div style="font-size:12px;color:var(--sage-dark);margin-top:4px">at '+esc((pc.practices && pc.practices.name) || 'their practice')+' &middot; status: '+pc.status+(pc.service_type ? ' &middot; CPT '+pc.service_type : '')+'</div>'+
    '</div>';
  // Programs in treatment
  h += '<div class="label" style="margin-bottom:8px">Programs in treatment</div>';
  var progs = progR.data || [];
  if(progs.length === 0){
    h += '<div style="padding:14px;background:var(--cream);border-radius:12px;color:var(--warm-gray);font-size:13px">No programs yet.</div>';
  } else {
    // Group by program_id
    var byProgram = {};
    progs.forEach(function(p){
      if(!byProgram[p.program_id]) byProgram[p.program_id] = { name: p.program_name, category: p.program_category, domain: p.program_domain, targets: [] };
      byProgram[p.program_id].targets.push(p);
    });
    Object.keys(byProgram).forEach(function(pid){
      var prog = byProgram[pid];
      h += '<div style="border:1px solid var(--sand);border-radius:12px;padding:12px 14px;margin-bottom:8px;background:white">'+
        '<div style="display:flex;justify-content:space-between;align-items:center"><div style="font-weight:700;font-size:14px">'+esc(prog.name)+'</div>'+
        '<div style="font-size:11px;color:var(--warm-gray)">'+prog.targets.length+' target'+(prog.targets.length!==1?'s':'')+'</div></div>';
      prog.targets.forEach(function(t){
        var pct = t.trial_count > 0 ? Math.round((t.correct_count / t.trial_count) * 100) : 0;
        h += '<div style="margin-top:10px;padding:10px;background:var(--cream);border-radius:10px"><div style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:13px;font-weight:700">'+esc(t.target_name)+'</div><span class="log-tag">'+t.target_status.replace(/_/g,' ')+'</span></div>'+
          '<div style="font-size:11px;color:var(--warm-gray);margin-top:4px">'+t.trial_count+' trials &middot; '+pct+'% correct</div></div>';
      });
      h += '</div>';
    });
  }
  // Sparklines per target
  h += '<div class="label" style="margin-top:18px;margin-bottom:8px">Progress charts</div>';
  if(progs.length === 0){
    h += '<div style="padding:14px;background:var(--cream);border-radius:12px;color:var(--warm-gray);font-size:13px">No charts yet.</div>';
  } else {
    h += '<div style="display:flex;flex-direction:column;gap:8px">';
    progs.forEach(function(t){
      h += '<div id="sparkWrap_'+t.target_id+'" style="border:1px solid var(--sand);border-radius:12px;padding:10px 14px;background:white"><div style="font-size:13px;font-weight:700;margin-bottom:6px">'+esc(t.target_name)+'</div><div id="spark_'+t.target_id+'" style="height:48px">loading…</div></div>';
    });
    h += '</div>';
  }
  // Recent sessions
  h += '<div class="label" style="margin-top:18px;margin-bottom:8px">Recent sessions</div>';
  if(!sessR.data || sessR.data.length === 0){
    h += '<div style="padding:14px;background:var(--cream);border-radius:12px;color:var(--warm-gray);font-size:13px">No sessions yet.</div>';
  } else {
    h += '<div style="display:flex;flex-direction:column;gap:6px">';
    sessR.data.forEach(function(s){
      var when = new Date(s.start_time).toLocaleDateString();
      h += '<div style="padding:10px 14px;border:1px solid var(--sand);border-radius:10px;background:white;display:flex;justify-content:space-between;align-items:center">'+
        '<div><div style="font-weight:700;font-size:13px">'+when+'</div>'+
        '<div style="font-size:11px;color:var(--warm-gray);margin-top:2px">'+esc(s.location || '')+(s.cpt_code ? ' &middot; CPT '+s.cpt_code : '')+' &middot; '+(s.duration_minutes ? Math.round(s.duration_minutes)+' min' : '')+'</div></div>'+
        '<div style="font-size:11px;color:var(--warm-gray)">'+s.trial_count+' trials</div>'+
        '</div>';
    });
    h += '</div>';
  }
  h += '</div>';
  el.innerHTML = h;
  // Fill sparklines — one fetch per target (small; could be batched later)
  progs.forEach(function(t){ renderTargetSparkline(t.target_id); });
}

async function renderTargetSparkline(targetId){
  var wrap = document.getElementById('spark_' + targetId);
  if(!wrap) return;
  var r = await sb.from('trials')
    .select('session_id,response')
    .eq('target_id', targetId)
    .is('superseded_by', null)
    .order('timestamp', { ascending: true });
  if(r.error || !r.data || r.data.length === 0){
    wrap.innerHTML = '<div style="font-size:11px;color:var(--warm-gray)">No data yet.</div>';
    return;
  }
  // Group by session and compute % correct per session
  var bySession = {};
  r.data.forEach(function(t){
    if(!bySession[t.session_id]) bySession[t.session_id] = { total: 0, correct: 0 };
    bySession[t.session_id].total += 1;
    if(t.response === 'correct') bySession[t.session_id].correct += 1;
  });
  var points = Object.keys(bySession).map(function(sid){
    var s = bySession[sid];
    return s.total > 0 ? (s.correct / s.total) * 100 : 0;
  });
  if(points.length === 1) points = [points[0], points[0]];  // ensure visible line
  // Map to SVG path
  var w = 280, hht = 48;
  var step = w / (points.length - 1);
  var pathD = points.map(function(y, i){ return (i === 0 ? 'M' : 'L') + (i*step).toFixed(1) + ',' + ((100-y)/100 * hht).toFixed(1); }).join(' ');
  var lastPct = Math.round(points[points.length-1]);
  wrap.innerHTML = '<svg width="100%" height="'+hht+'" viewBox="0 0 '+w+' '+hht+'" preserveAspectRatio="none"><path d="'+pathD+'" fill="none" stroke="var(--sage-dark)" stroke-width="2"/></svg>'+
    '<div style="font-size:11px;color:var(--warm-gray);text-align:right">latest: '+lastPct+'% correct</div>';
}
```

- [ ] **Step 6: Manual verification**

1. Sign in as testparent. Sidebar should now show "My BCBA" (highlighted) — confirm `S.hasMyBcba` worked.
2. Tap My BCBA. Page loads showing:
   - Header card: "Maya is working with [testprovider name] at Test Practice"
   - Programs in treatment list with targets + % correct
   - Progress charts with sparklines per target (lines drawn based on sessions you ran)
   - Recent sessions list (10 most recent)
3. Confirm no row-level trial data is visible (no individual trial rows).
4. DevTools console: `await sb.from('trials').select('*');` — should return empty array (RLS blocks).

- [ ] **Step 7: Commit**

```bash
git add app.html
git commit -m "$(cat <<'EOF'
feat(bcba-live): parent "My BCBA" tab

New sidebar item for parents whose child has a practice_clients row.
Renders practice + BCBA context, programs in treatment (grouped with
targets + % correct + status), per-target SVG sparklines (% correct
per session), recent sessions list (aggregate only — date, location,
CPT, duration, trial count). RLS prevents row-level trial access;
data flows through v_child_target_progress and v_child_sessions views.

This is the flywheel monetization surface. Parents see clinical
progress without churning.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 12: Docs

### Task 12: ROADMAP + AGENT-CONTEXT + TESTING-GUIDE

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/AGENT-CONTEXT.md`
- Modify: `docs/TESTING-GUIDE.md`

- [ ] **Step 1: ROADMAP — mark #2 complete**

Find the BCBA Data Collection Foundation entry near the top of the Completed section. **Above** it, insert:

```markdown
### BCBA Data Collection — Live Data Entry (2026-05-19)
**Sub-project #2 of 6** — full initiative spec: [docs/superpowers/specs/2026-05-18-bcba-data-collection-foundation-design.md](docs/superpowers/specs/2026-05-18-bcba-data-collection-foundation-design.md)

- [x] session_targets join table + parent SELECT policy on sessions + v_child_sessions view
- [x] mvOffline IndexedDB sync queue with 30s background flush + retry + UNIQUE-constraint idempotency
- [x] Start Session button + Pre-session plan modal (target multi-select, ad-hoc skip)
- [x] Active session overlay with sticky top bar, target picker bottom-sheet, mid-session target add
- [x] Trial entry — 7 big buttons, auto-advance, task analysis step cycling, offline-safe
- [x] Behavior overlay — frequency tally, duration timer, interval recording, ABC entry, quick-add
- [x] End-of-session summary with per-target trial counts, per-behavior aggregates, IOA % per target
- [x] IOA observer flow — Active sessions card on Dashboard, lite parallel view, 5s polling of primary's target
- [x] Cosign flow — Pending cosign card, read-only summary review, cosign action
- [x] Parent "My BCBA" tab — programs/targets, SVG sparklines, recent sessions (aggregate-only)

**Next:** sub-project #3 — Behavior Reduction (dedicated ABC graphs, frequency rate trends, behavior dashboard per client). Plus a per-patient Stripe billing mini-spec sequenced before users sign up.

Plan: [docs/superpowers/plans/2026-05-18-bcba-live-data-entry.md](docs/superpowers/plans/2026-05-18-bcba-live-data-entry.md)
```

Also update the "Currently in flight" section at the top: replace the BCBA item to reflect that sub-project #2 is done and #3 is next.

- [ ] **Step 2: AGENT-CONTEXT — update in-flight section**

Find `## In-flight work — BCBA Data Collection`. Replace the contents with:

```markdown
## In-flight work — BCBA Data Collection (Ensora-parity initiative)

**Status as of 2026-05-19:** Sub-projects #1 (Foundation) and #2 (Live Data Entry) both **complete and merged**. Clinical data collection works end-to-end: BCBA/RBT can start a session, run trials, log behaviors, end + submit + cosign. Parents see "My BCBA" with sparklines. Offline support via IndexedDB.

**Sequence forward:**
1. **Mini-spec — per-patient Stripe billing** (before users sign up). Wire `practices.stripe_*` fields to a real Stripe checkout + webhook, implement the $10/active-Family-subscriber credit.
2. **Sub-project #3 — Behavior Reduction.** Dedicated ABC graphs, frequency rate trends, behavior dashboard per client.
3. **Sub-project #4 — Analysis & Reporting.** Per-target line graphs with phase change lines, technical indicators (avg, trend line, std dev), annotations. The iconic BCBA chart.
4. **Sub-project #5 — Documentation.** SOAP note auto-fill from session data; timesheet signatures.
5. **Sub-project #6 — Curriculum Libraries.** Ariana-authored Starter content replacing placeholders; VB-MAPP / ABLLS-R / PEAK / AFLS licensing.

**Coverage vs Ensora (after #2):** ~85% data model, ~50% UI surface. Setup + live data entry pipeline complete. What's missing: dedicated analysis/reporting screens, SOAP auto-fill, licensed curricula. Approximately 8-10 weeks of build remaining for full parity.

Memory: `project_bcba_data_collection.md`.
```

- [ ] **Step 3: TESTING-GUIDE — add Live Data Entry walkthrough**

Find the `### Practice (BCBA Data Collection — sub-project #1)` section. **After** it, add:

```markdown
### Live Data Entry (BCBA Data Collection — sub-project #2)

Sign in as `testprovider@modernvillage.app` / `TestProvider123!` (must have set up Test Practice with Maya as a client and at least one program with targets).

- [ ] Clients → Maya → "Start session" button visible
- [ ] Pre-session plan modal: in-treatment targets pre-checked, location/CPT dropdowns, "Run ad-hoc" link
- [ ] Begin session → active session overlay opens with target name, trial counter, session timer ticking, sync badge "Synced"
- [ ] 7 trial buttons (Independent / Gestural / Verbal / Model / Partial / Full Physical / No Response) all clickable
- [ ] Tap Independent → trial counter increments, badge briefly shows "Syncing (1)" → "Synced"
- [ ] Task-analysis target: step label increments through steps then loops
- [ ] Tap target pill → bottom sheet → pick another target → top bar updates
- [ ] "Add another in-treatment target" inserts a new session_targets row mid-session
- [ ] Tap "+" → behavior overlay opens with list (or quick-add if empty)
- [ ] Frequency behavior: + / − tally, Save persists count
- [ ] Duration behavior: Start/Pause timer, Save persists seconds
- [ ] Interval behavior: configurable totals/seconds, "Occurred" / "Did not occur" marking, Save persists interval_data jsonb
- [ ] ABC behavior: antecedent/consequence textareas, function chips (tangible/escape/attention/sensory), Save persists
- [ ] "Recently logged: X" pill appears in trial entry after behavior save
- [ ] Offline test: DevTools → Network → Offline → tap 5 trials + 1 behavior → re-enable network → within 30s all rows synced to Supabase
- [ ] End Session → confirm → summary screen shows trial counts, IOA % column (em-dash if no IOA), behavior aggregates, session metadata form
- [ ] Submit → session row goes to status='completed', client detail Recent Sessions list shows it
- [ ] Re-open completed session → summary opens read-only (no Submit button)

**As testcaregiver (added to Test Practice as supervising_bcba):**

- [ ] Practice Dashboard shows "Active sessions" card while testprovider is running a session
- [ ] Tap → confirm → IOA mode opens (top bar "IOA observer · Maya", current target name)
- [ ] 7-button grid records trials with ioa_observer_id set
- [ ] Target follows primary's switches within 5s
- [ ] End-of-session summary (when primary submits) shows IOA % per target

**As testprovider (owner_bcba, after a completed session):**

- [ ] Practice Dashboard shows "Pending cosign" card
- [ ] Tap → summary opens read-only with "Cosign session" button
- [ ] Cosign → status='cosigned', cosigner_id set

**As testparent:**

- [ ] Sidebar shows "My BCBA" (highlighted) if Maya has a practice_clients row
- [ ] Page shows: practice/BCBA header, programs in treatment with targets + % correct, SVG sparklines per target, recent sessions list (aggregate)
- [ ] DevTools `await sb.from('trials').select('*')` returns empty array (RLS blocks row-level access)
```

- [ ] **Step 4: Commit all three docs**

```bash
git add docs/ROADMAP.md docs/AGENT-CONTEXT.md docs/TESTING-GUIDE.md
git commit -m "$(cat <<'EOF'
docs: BCBA Live Data Entry status + testing walkthrough

ROADMAP: mark sub-project #2 complete, sequence #3 + Stripe mini-spec
AGENT-CONTEXT: refresh — Foundation + Live Data Entry both shipped
TESTING-GUIDE: add Live Data Entry walkthrough covering trial entry,
behavior overlay, offline sync, IOA, cosign, parent My BCBA tab

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review checklist

Before opening a PR, verify:

- [ ] Migration `20260519_bcba_live_data_entry.sql` applied in Supabase prod (run the table+view existence checks)
- [ ] All 12 task commits land on `feat/bcba-live-data-entry` branch
- [ ] `node --check worker.js` returns clean (worker has zero changes in this sub-project, but sanity-check anyway)
- [ ] As testprovider: full live session walkthrough works (start, plan, run trials, log behaviors, end, submit, cosign)
- [ ] As testcaregiver (as supervising_bcba member): IOA observer flow works
- [ ] As testparent: My BCBA tab renders without errors, sparklines show data, no row-level trial visibility
- [ ] Offline test: trials/behaviors recorded with network disabled sync cleanly on reconnect
- [ ] No console errors in browser DevTools during any flow

## Open carry-overs (handled later)

1. **Trial response over-ride** (long-press to mark prompted as incorrect) — defer to a polish pass
2. **IOA observer offline** — late-arriving IOA data shows banner "IOA data still arriving" until queue empty; trivial addition, can land in #3 polish
3. **Session pause/resume** — currently no explicit pause state; timer keeps running. Reconsider after Ariana feedback
4. **Behavior antecedents/consequences library FK** — currently ABC stores antecedent/consequence as free-text in notes; sub-project #3 adds the FK pickers with the dedicated library UI
5. **Parent session detail view** — clicking a session in My BCBA could open a detail view showing per-target counts; left as future polish
