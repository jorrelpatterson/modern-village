# Marketing AutoResearch Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generalized experimentation framework extending the Phase-3 email-optimizer pattern (Thompson bandit + Claude challenger + 90% Bayesian auto-promote) to any testable element of the funnel, plus Meta Pixel + UTM capture as the built-in attribution layer.

**Architecture:** Four new Supabase tables (`experiment_slots`, `experiment_variants`, `experiment_assignments`, `experiment_events`) + three new worker endpoints (`/experiment/variant`, `/experiment/event`, `/experiment/link-session`) + nightly optimizer cron + frontend helper (`lib/experiment.js`) + Meta Pixel integration + admin UX (slot dashboard, detail view, approval queue, attribution dashboard). First slot shipped: `landing_headline` on screener.html.

**Tech Stack:** Cloudflare Worker (vanilla JS), Supabase Postgres with RLS, Anthropic Claude API for variant generation, Meta Pixel for paid ads attribution, vanilla HTML admin + frontend, Vercel for static hosting.

**Spec:** [docs/superpowers/specs/2026-04-17-marketing-autoresearch-framework-design.md](../specs/2026-04-17-marketing-autoresearch-framework-design.md)

**Verification approach (no test framework in repo):** each task ends with a verify step using (a) `node --check` for JS syntax, (b) `wrangler dev` + curl + Supabase SQL inspection, or (c) browser spot-check. No Jest/Vitest scaffolding added — follow existing codebase pattern.

**Commit cadence:** one commit per task. Each commit message includes `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility | Task |
|------|---------------|------|
| `supabase/migrations/20260417_experiment_framework.sql` | 4 new tables + RLS + indexes | 1 |
| `supabase/migrations/20260417_seed_landing_headline.sql` | Initial slot config + 3 seed variants | 11 |
| `lib/experiment.js` | Frontend helper (getSessionId, getVariant, trackEvent, linkSession) | 2 |
| `lib/meta-pixel.js` | Meta Pixel loader + standard event mappings | 3 |
| `worker.js` | New endpoints + nightly optimizer cron block | 4, 5, 6, 7-10 |
| `screener.html` | Wire landing_headline slot + include Pixel + experiment.js | 12 |
| `index.html` | Include Pixel + experiment.js base | 3 |
| `app.html` | Include Pixel + experiment.js + fire pro_subscribe event on upgrade | 3 |
| `blog.html` | Include Pixel + experiment.js | 3 |
| `admin.html` | Experiment Slots Dashboard + Detail + Approval Queue + Sources | 14-17 |
| `marketing-experiments.md` | Repo-root human-readable research-org config | 13 |
| `docs/ROADMAP.md`, `AGENT-NOTES.md`, `jorrel-os.json`, memory | Final docs pass | 18 |

---

## Phase 1: Foundation

### Task 1: Schema Migration

**Files:**
- Create: `supabase/migrations/20260417_experiment_framework.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- ═══════════════════════════════════════════════════
-- Marketing AutoResearch Framework — core schema
-- 2026-04-17
-- Spec: docs/superpowers/specs/2026-04-17-marketing-autoresearch-framework-design.md
-- ═══════════════════════════════════════════════════

-- ─── experiment_slots: registry of testable elements ───
CREATE TABLE IF NOT EXISTS public.experiment_slots (
  id text PRIMARY KEY,
  description text,
  field_type text NOT NULL CHECK (field_type IN ('text', 'image_url', 'html_fragment')),
  deploy_mode text NOT NULL CHECK (deploy_mode IN ('auto', 'approval')),
  reward_metric jsonb NOT NULL,
  challenger_prompt text NOT NULL,
  min_sends_per_variant integer DEFAULT 50,
  confidence_threshold real DEFAULT 0.90 CHECK (confidence_threshold BETWEEN 0.5 AND 0.999),
  variant_stats jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'retired')),
  created_at timestamptz DEFAULT now(),
  last_optimized_at timestamptz
);
ALTER TABLE public.experiment_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage slots" ON public.experiment_slots
  FOR ALL USING (public.is_admin());
CREATE POLICY "Public read active slots" ON public.experiment_slots
  FOR SELECT USING (status = 'active');

-- ─── experiment_variants: the actual testable content ───
CREATE TABLE IF NOT EXISTS public.experiment_variants (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slot_id text REFERENCES public.experiment_slots(id) ON DELETE CASCADE NOT NULL,
  variant_key text NOT NULL,
  content text NOT NULL,
  generated_by text DEFAULT 'human' CHECK (generated_by IN ('human', 'claude', 'seed')),
  generated_from_variant text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'retired', 'pending_approval')),
  created_at timestamptz DEFAULT now(),
  activated_at timestamptz,
  retired_at timestamptz,
  UNIQUE(slot_id, variant_key)
);
ALTER TABLE public.experiment_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage variants" ON public.experiment_variants
  FOR ALL USING (public.is_admin());
CREATE POLICY "Public read active variants" ON public.experiment_variants
  FOR SELECT USING (status = 'active');

CREATE INDEX IF NOT EXISTS idx_variants_slot_active ON public.experiment_variants(slot_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_variants_pending_approval ON public.experiment_variants(slot_id, created_at) WHERE status = 'pending_approval';

-- ─── experiment_assignments: sticky per-session variant mapping ───
CREATE TABLE IF NOT EXISTS public.experiment_assignments (
  session_id text NOT NULL,
  slot_id text REFERENCES public.experiment_slots(id) ON DELETE CASCADE NOT NULL,
  variant_key text NOT NULL,
  user_id uuid REFERENCES public.profiles(id),
  initial_utm jsonb,
  assigned_at timestamptz DEFAULT now(),
  PRIMARY KEY (session_id, slot_id)
);
ALTER TABLE public.experiment_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read assignments" ON public.experiment_assignments
  FOR SELECT USING (public.is_admin());
-- Writes happen via worker service key, which bypasses RLS

CREATE INDEX IF NOT EXISTS idx_assignments_user ON public.experiment_assignments(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assignments_slot ON public.experiment_assignments(slot_id, assigned_at);

-- ─── experiment_events: outcomes firehose ───
CREATE TABLE IF NOT EXISTS public.experiment_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slot_id text REFERENCES public.experiment_slots(id) ON DELETE CASCADE,
  variant_key text,
  session_id text,
  user_id uuid REFERENCES public.profiles(id),
  event_type text NOT NULL,
  event_data jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.experiment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read events" ON public.experiment_events
  FOR SELECT USING (public.is_admin());
-- Writes via worker service key

CREATE INDEX IF NOT EXISTS idx_events_slot_variant_type ON public.experiment_events(slot_id, variant_key, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_events_session ON public.experiment_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_user ON public.experiment_events(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_type_created ON public.experiment_events(event_type, created_at);
```

- [ ] **Step 2: Apply migration to Supabase**

User (Jorrel) applies this manually via SQL Editor → New query → paste → Run. Verify with:

```sql
SELECT table_name FROM information_schema.tables
  WHERE table_name LIKE 'experiment_%';
-- Expected: 4 rows (slots, variants, assignments, events)

SELECT policyname FROM pg_policies WHERE tablename LIKE 'experiment_%';
-- Expected: 8 policies (2 per table)
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260417_experiment_framework.sql
git commit -m "$(cat <<'EOF'
feat: schema for marketing autoresearch framework

Four new tables: experiment_slots (testable-element registry with
reward_metric + challenger_prompt + variant_stats), experiment_variants
(per-slot content with status lifecycle), experiment_assignments
(sticky per-session variant + initial_utm stamp), experiment_events
(outcomes firehose).

RLS admin-managed; public-read for active slots and active variants so
the /experiment/variant endpoint can serve them.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2: Frontend helper + Meta Pixel

### Task 2: Create `lib/experiment.js`

**Files:**
- Create: `lib/experiment.js`

- [ ] **Step 1: Create the file**

```javascript
// lib/experiment.js — Marketing AutoResearch frontend helper
// Loaded on every page. Manages session_id, variant assignment, event tracking.

(function() {
  'use strict';

  const WORKER_URL = 'https://village-api.jorrelpatterson.workers.dev';

  function getSessionId() {
    let sid = localStorage.getItem('mv_session');
    if (!sid) {
      sid = (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('mv_session', sid);
    }
    return sid;
  }

  function captureUtmOnce() {
    if (localStorage.getItem('mv_utm_initial')) return;
    const p = new URLSearchParams(window.location.search);
    const utm = {
      source: p.get('utm_source'),
      medium: p.get('utm_medium'),
      campaign: p.get('utm_campaign'),
      term: p.get('utm_term'),
      content: p.get('utm_content')
    };
    if (utm.source || utm.medium || utm.campaign) {
      localStorage.setItem('mv_utm_initial', JSON.stringify(utm));
    }
  }
  captureUtmOnce();

  async function getVariant(slot) {
    try {
      const sid = getSessionId();
      const utm = localStorage.getItem('mv_utm_initial');
      const url = WORKER_URL + '/experiment/variant?slot=' + encodeURIComponent(slot)
        + '&session=' + encodeURIComponent(sid)
        + (utm ? '&utm=' + encodeURIComponent(utm) : '');
      const r = await fetch(url);
      if (!r.ok) return { variant_key: null, content: null };
      return await r.json();
    } catch (e) {
      return { variant_key: null, content: null };
    }
  }

  function trackEvent(slot, event_type, event_data) {
    try {
      const body = JSON.stringify({
        session_id: getSessionId(),
        slot_id: slot,
        event_type: event_type,
        event_data: event_data || null
      });
      fetch(WORKER_URL + '/experiment/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true
      }).catch(function() {});

      // Mirror to Meta Pixel if loaded
      if (window.fbq) {
        const pixelMap = {
          'click': 'InitiateCheckout',
          'screener_complete': 'CompleteRegistration',
          'signup': 'Lead',
          'pro_subscribe': 'Subscribe'
        };
        if (pixelMap[event_type]) {
          const opts = {};
          if (event_type === 'pro_subscribe' && event_data && event_data.amount) {
            opts.value = event_data.amount;
            opts.currency = 'USD';
          }
          window.fbq('track', pixelMap[event_type], opts);
        }
      }
    } catch (e) {
      // swallow — never break visitor experience
    }
  }

  function linkSession(user_id) {
    try {
      fetch(WORKER_URL + '/experiment/link-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: getSessionId(), user_id: user_id }),
        keepalive: true
      }).catch(function() {});
    } catch (e) {
      // swallow
    }
  }

  // Expose globally
  window.mvExperiment = {
    getSessionId: getSessionId,
    getVariant: getVariant,
    trackEvent: trackEvent,
    linkSession: linkSession
  };
})();
```

- [ ] **Step 2: Syntax check**

```bash
node --check lib/experiment.js
```

Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add lib/experiment.js
git commit -m "$(cat <<'EOF'
feat: lib/experiment.js — frontend helper for autoresearch framework

Exposes window.mvExperiment.{getSessionId,getVariant,trackEvent,linkSession}.
Captures UTM on first load, stores session_id in localStorage, fires
events to worker + mirrors standard events to Meta Pixel if present.
Gracefully degrades if network/pixel unavailable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Meta Pixel integration

**Files:**
- Create: `lib/meta-pixel.js`
- Modify: `index.html`, `screener.html`, `app.html`, `blog.html` (add script tags near end of `<head>`)

- [ ] **Step 1: Create the Meta Pixel loader**

```javascript
// lib/meta-pixel.js — Meta Pixel loader + auto PageView
// Pixel ID is set in window.META_PIXEL_ID BEFORE this file loads.
// If no pixel ID set, all Pixel calls are no-ops (safe for dev).

(function() {
  'use strict';
  const PIXEL_ID = window.META_PIXEL_ID;
  if (!PIXEL_ID) {
    window.fbq = function() {};
    return;
  }

  !function(f,b,e,v,n,t,s){
    if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)
  }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');

  window.fbq('init', PIXEL_ID);
  window.fbq('track', 'PageView');
})();
```

- [ ] **Step 2: Add script tags to HTML files**

For each of `index.html`, `screener.html`, `app.html`, `blog.html`: find the `<head>` section. Immediately before `</head>`, add:

```html
<!-- Meta Pixel + Autoresearch Experiment Framework -->
<script>window.META_PIXEL_ID = 'REPLACE_WITH_REAL_PIXEL_ID';</script>
<script src="/lib/meta-pixel.js"></script>
<script src="/lib/experiment.js"></script>
```

Use grep to locate each file's `</head>`:

```bash
for f in index.html screener.html app.html blog.html; do
  grep -n "</head>" "$f"
done
```

For each file, use the Edit tool to insert the 4 lines immediately before the first `</head>` match.

Jorrel will replace `REPLACE_WITH_REAL_PIXEL_ID` with the real ID after creating the Pixel in Meta Business Manager. Code is safe with the placeholder (pixel loader returns no-op if ID is not a valid pixel).

- [ ] **Step 3: Syntax check + sanity grep**

```bash
node --check lib/meta-pixel.js
grep -c "lib/experiment.js" index.html screener.html app.html blog.html
# expect 1 match per file (4 total)
grep -c "META_PIXEL_ID" index.html screener.html app.html blog.html
# expect 1 match per file (4 total)
```

- [ ] **Step 4: Commit**

```bash
git add lib/meta-pixel.js index.html screener.html app.html blog.html
git commit -m "$(cat <<'EOF'
feat: Meta Pixel loader + integrate pixel + experiment.js into HTML pages

lib/meta-pixel.js loads the Pixel base code + fires PageView if PIXEL_ID
is set. Safe no-op otherwise. index.html, screener.html, app.html, and
blog.html all load Pixel + experiment.js in head.

Pixel ID placeholder (REPLACE_WITH_REAL_PIXEL_ID) — Jorrel sets the real
ID after creating Pixel in Meta Business Manager.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: Worker endpoints

### Task 4: `GET /experiment/variant`

**Files:**
- Modify: `worker.js` (add new endpoint after existing `/webhook/resend-inbound` block, around line ~155)

- [ ] **Step 1: Add the endpoint**

Find `// ═══ RESEND INBOUND WEBHOOK` block and its closing `}`. Immediately after that closing `}`, insert:

```javascript
    // ═══ EXPERIMENT FRAMEWORK — GET /experiment/variant?slot=X&session=Y&utm=<encoded-json> ═══
    if (url.pathname === '/experiment/variant' && request.method === 'GET') {
      const supaH = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' };
      const slotId = url.searchParams.get('slot');
      const sessionId = url.searchParams.get('session');
      if (!slotId || !sessionId) {
        return new Response('{"error":"missing slot or session"}', { status: 400, headers: h });
      }

      // Check existing sticky assignment
      const assignRes = await fetch(env.SUPABASE_URL + '/rest/v1/experiment_assignments?session_id=eq.' + encodeURIComponent(sessionId) + '&slot_id=eq.' + encodeURIComponent(slotId) + '&select=variant_key', { headers: supaH });
      const assignRows = await assignRes.json();
      if (assignRows && assignRows.length) {
        // Return the assigned variant's current content
        const vRes = await fetch(env.SUPABASE_URL + '/rest/v1/experiment_variants?slot_id=eq.' + encodeURIComponent(slotId) + '&variant_key=eq.' + encodeURIComponent(assignRows[0].variant_key) + '&select=content', { headers: supaH });
        const vRows = await vRes.json();
        const content = (vRows && vRows[0]) ? vRows[0].content : null;
        return new Response(JSON.stringify({ variant_key: assignRows[0].variant_key, content: content }), { headers: h });
      }

      // Load slot + active variants
      const slotRes = await fetch(env.SUPABASE_URL + '/rest/v1/experiment_slots?id=eq.' + encodeURIComponent(slotId) + '&status=eq.active&select=id,variant_stats,min_sends_per_variant', { headers: supaH });
      const slots = await slotRes.json();
      if (!slots || !slots.length) {
        return new Response('{"error":"slot not found or not active"}', { status: 404, headers: h });
      }
      const slot = slots[0];

      const variantsRes = await fetch(env.SUPABASE_URL + '/rest/v1/experiment_variants?slot_id=eq.' + encodeURIComponent(slotId) + '&status=eq.active&select=variant_key,content', { headers: supaH });
      const variants = await variantsRes.json();
      if (!variants || !variants.length) {
        return new Response('{"error":"no active variants"}', { status: 404, headers: h });
      }

      // Ensure variant_stats has entry for each active variant
      const stats = slot.variant_stats || {};
      for (const v of variants) {
        if (!stats[v.variant_key]) stats[v.variant_key] = { alpha: 1, beta: 1, sends: 0 };
      }

      // Pick variant using existing pickVariant helper (defined elsewhere in worker.js)
      const chosenKey = pickVariant(stats);
      const chosen = variants.find(v => v.variant_key === chosenKey) || variants[0];

      // Parse UTM if provided
      let initialUtm = null;
      const utmParam = url.searchParams.get('utm');
      if (utmParam) {
        try { initialUtm = JSON.parse(decodeURIComponent(utmParam)); } catch (e) {}
      }

      // Insert assignment
      await fetch(env.SUPABASE_URL + '/rest/v1/experiment_assignments', {
        method: 'POST',
        headers: { ...supaH, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          session_id: sessionId,
          slot_id: slotId,
          variant_key: chosenKey,
          initial_utm: initialUtm
        })
      });

      // Fire view event
      await fetch(env.SUPABASE_URL + '/rest/v1/experiment_events', {
        method: 'POST',
        headers: { ...supaH, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          slot_id: slotId,
          variant_key: chosenKey,
          session_id: sessionId,
          event_type: 'view',
          event_data: initialUtm ? { utm: initialUtm } : null
        })
      });

      // Bump variant_stats.sends for bandit cold-start tracking
      stats[chosenKey].sends = (stats[chosenKey].sends || 0) + 1;
      await fetch(env.SUPABASE_URL + '/rest/v1/experiment_slots?id=eq.' + encodeURIComponent(slotId), {
        method: 'PATCH',
        headers: supaH,
        body: JSON.stringify({ variant_stats: stats })
      });

      return new Response(JSON.stringify({ variant_key: chosenKey, content: chosen.content }), { headers: h });
    }
```

- [ ] **Step 2: Syntax check**

```bash
node --check worker.js
```

- [ ] **Step 3: Commit**

```bash
git add worker.js
git commit -m "$(cat <<'EOF'
feat: GET /experiment/variant endpoint for autoresearch framework

Returns sticky variant for a (session, slot) pair. On first request:
loads active variants, runs Thompson bandit pickVariant() (reuses
Phase 3 helper), inserts experiment_assignments row, fires view event,
bumps variant_stats.sends.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `POST /experiment/event`

**Files:**
- Modify: `worker.js` (immediately after `/experiment/variant` block)

- [ ] **Step 1: Add the endpoint**

Immediately after Task 4's closing `}`, insert:

```javascript
    // ═══ POST /experiment/event — outcome tracking ═══
    if (url.pathname === '/experiment/event' && request.method === 'POST') {
      const supaH = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' };
      const eventBody = body || await request.json().catch(() => ({}));
      const { session_id, slot_id, event_type, event_data, user_id } = eventBody;
      if (!session_id || !slot_id || !event_type) {
        return new Response('{"error":"missing session_id, slot_id, or event_type"}', { status: 400, headers: h });
      }

      // Look up variant_key from assignment
      const assignRes = await fetch(env.SUPABASE_URL + '/rest/v1/experiment_assignments?session_id=eq.' + encodeURIComponent(session_id) + '&slot_id=eq.' + encodeURIComponent(slot_id) + '&select=variant_key,user_id', { headers: supaH });
      const assigns = await assignRes.json();
      const variant_key = (assigns && assigns[0]) ? assigns[0].variant_key : null;

      // If user_id provided and assignment.user_id is null, link it
      if (user_id && assigns && assigns[0] && !assigns[0].user_id) {
        await fetch(env.SUPABASE_URL + '/rest/v1/experiment_assignments?session_id=eq.' + encodeURIComponent(session_id) + '&slot_id=eq.' + encodeURIComponent(slot_id), {
          method: 'PATCH', headers: supaH,
          body: JSON.stringify({ user_id: user_id })
        });
      }

      // Insert event
      await fetch(env.SUPABASE_URL + '/rest/v1/experiment_events', {
        method: 'POST',
        headers: { ...supaH, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          slot_id: slot_id,
          variant_key: variant_key,
          session_id: session_id,
          user_id: user_id || (assigns && assigns[0] ? assigns[0].user_id : null),
          event_type: event_type,
          event_data: event_data || null
        })
      });

      return new Response('{"ok":true}', { headers: h });
    }
```

- [ ] **Step 2: Syntax check + commit**

```bash
node --check worker.js
git add worker.js
git commit -m "$(cat <<'EOF'
feat: POST /experiment/event for outcome tracking

Looks up variant_key from assignment, optionally stamps user_id
on the assignment if newly linked, inserts row into experiment_events.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `POST /experiment/link-session`

**Files:**
- Modify: `worker.js` (immediately after Task 5's block)

- [ ] **Step 1: Add the endpoint**

```javascript
    // ═══ POST /experiment/link-session — stamp user_id on all session assignments + events ═══
    if (url.pathname === '/experiment/link-session' && request.method === 'POST') {
      const supaH = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' };
      const linkBody = body || await request.json().catch(() => ({}));
      const { session_id, user_id } = linkBody;
      if (!session_id || !user_id) {
        return new Response('{"error":"missing session_id or user_id"}', { status: 400, headers: h });
      }

      // Update all assignments for this session
      await fetch(env.SUPABASE_URL + '/rest/v1/experiment_assignments?session_id=eq.' + encodeURIComponent(session_id) + '&user_id=is.null', {
        method: 'PATCH', headers: supaH,
        body: JSON.stringify({ user_id: user_id })
      });

      // Update all events for this session
      await fetch(env.SUPABASE_URL + '/rest/v1/experiment_events?session_id=eq.' + encodeURIComponent(session_id) + '&user_id=is.null', {
        method: 'PATCH', headers: supaH,
        body: JSON.stringify({ user_id: user_id })
      });

      return new Response('{"ok":true}', { headers: h });
    }
```

- [ ] **Step 2: Syntax check + commit**

```bash
node --check worker.js
git add worker.js
git commit -m "$(cat <<'EOF'
feat: POST /experiment/link-session for session-to-user attribution

Stamps user_id on all experiment_assignments + experiment_events for
a session. Called from lib/experiment.js linkSession() after successful
auth, completing the attribution chain: utm_source → session →
variant → user → conversion.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: Nightly optimizer cron

### Task 7: Reward rollup helper

**Files:**
- Modify: `worker.js` (add helper function near existing `rewardFromSend` / `posteriorFromSends` around line ~185-205)

- [ ] **Step 1: Add the new helper**

Find `function posteriorFromSends(sends)` and after its closing `}`, insert:

```javascript
// Compute reward for a single event given the slot's reward_metric weights.
// reward_metric is a flat object: { "view": 0, "click": 1, "screener_complete": 5, "pro_subscribe": 100 }
function rewardFromEvent(event, rewardMetric) {
  const w = rewardMetric[event.event_type];
  return (typeof w === 'number') ? w : 0;
}

// Compute Beta posterior (alpha, beta, sends) for a variant from its events.
// Events are weighted by reward_metric; normalized to [0,1] by max possible reward per view.
function posteriorFromEvents(events, rewardMetric, sendCount) {
  // Max reward per view = sum of all weights (upper bound assuming one of each event type)
  const maxReward = Object.values(rewardMetric || {}).reduce((a, b) => a + Math.abs(b), 0) || 1;
  let totalReward = 0;
  for (const e of events) totalReward += rewardFromEvent(e, rewardMetric);
  const effective = Math.max(sendCount, 1);
  const normAvg = Math.max(0, Math.min(1, (totalReward / effective) / maxReward));
  return {
    alpha: 1 + normAvg * effective,
    beta: 1 + (1 - normAvg) * effective,
    sends: sendCount
  };
}
```

- [ ] **Step 2: Syntax check + commit**

```bash
node --check worker.js
git add worker.js
git commit -m "$(cat <<'EOF'
feat: rewardFromEvent + posteriorFromEvents helpers for slot optimizer

Generalizes the email bandit's reward math to arbitrary event types
weighted by slot.reward_metric. Max reward per view = sum of absolute
weights, normalized to [0,1] for Beta(α,β) posterior update.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Nightly optimizer cron block — winner detection

**Files:**
- Modify: `worker.js` (add new block in `runDailyTasks(env)` function, after existing `AUTORESEARCH: Email Campaign Auto-Optimization` block around line ~1702)

- [ ] **Step 1: Add the optimizer block (winner detection only — challenger gen in Task 9)**

Find `} catch (e) { console.error('Email optimization error:', e); }` (end of existing email optimizer) and insert AFTER its closing line:

```javascript
  // ── AUTORESEARCH: Experiment Slots Optimizer (landing pages, paywall, ads, etc) ──
  try {
    const slotsRes = await fetch(supaUrl + '/rest/v1/experiment_slots?status=eq.active&select=id,description,reward_metric,challenger_prompt,min_sends_per_variant,confidence_threshold,variant_stats,deploy_mode,last_optimized_at', { headers });
    const slots = await slotsRes.json();

    for (const slot of (slots || [])) {
      try {
        // Pull active variants for this slot
        const varRes = await fetch(supaUrl + '/rest/v1/experiment_variants?slot_id=eq.' + encodeURIComponent(slot.id) + '&status=eq.active&select=variant_key,content', { headers });
        const variants = await varRes.json();
        if (!variants || variants.length < 2) continue;

        // Pull events since last_optimized_at (or 30 days ago if never)
        const sinceIso = slot.last_optimized_at || new Date(Date.now() - 30 * 86400000).toISOString();
        const evtRes = await fetch(supaUrl + '/rest/v1/experiment_events?slot_id=eq.' + encodeURIComponent(slot.id) + '&created_at=gte.' + sinceIso + '&variant_key=not.is.null&select=variant_key,event_type', { headers });
        const events = await evtRes.json();

        // Group events by variant
        const eventsByVariant = {};
        for (const v of variants) eventsByVariant[v.variant_key] = [];
        for (const e of (events || [])) {
          if (eventsByVariant[e.variant_key]) eventsByVariant[e.variant_key].push(e);
        }

        // Compute posterior per variant
        const newStats = { ...(slot.variant_stats || {}) };
        const minSends = slot.min_sends_per_variant || 50;
        let allEnough = true;
        for (const v of variants) {
          const existing = newStats[v.variant_key] || { alpha: 1, beta: 1, sends: 0 };
          const sendCount = existing.sends || 0;  // sends counter bumped per assignment in /experiment/variant
          const posterior = posteriorFromEvents(eventsByVariant[v.variant_key], slot.reward_metric, sendCount);
          newStats[v.variant_key] = posterior;
          if (sendCount < minSends) allEnough = false;
        }

        // Persist updated stats
        await fetch(supaUrl + '/rest/v1/experiment_slots?id=eq.' + encodeURIComponent(slot.id), {
          method: 'PATCH', headers,
          body: JSON.stringify({ variant_stats: newStats, last_optimized_at: new Date().toISOString() })
        });

        if (!allEnough) continue;

        // Sample 1000× from each posterior, count wins
        const N_SAMPLES = 1000;
        const activeKeys = variants.map(v => v.variant_key);
        const wins = {};
        for (const k of activeKeys) wins[k] = 0;
        for (let i = 0; i < N_SAMPLES; i++) {
          let bestK = activeKeys[0], bestS = -1;
          for (const k of activeKeys) {
            const s = sampleBeta(newStats[k].alpha, newStats[k].beta);
            if (s > bestS) { bestS = s; bestK = k; }
          }
          wins[bestK]++;
        }

        // Find winner at threshold
        const threshold = slot.confidence_threshold || 0.90;
        let winnerKey = null;
        for (const k of activeKeys) {
          if (wins[k] / N_SAMPLES > threshold) { winnerKey = k; break; }
        }
        if (!winnerKey) continue;

        // Has this optimization cycle already been run? (idempotency)
        const recentLogRes = await fetch(supaUrl + '/rest/v1/experiment_events?slot_id=eq.' + encodeURIComponent(slot.id) + '&event_type=eq.winner_picked&created_at=gte.' + new Date(Date.now() - 7 * 86400000).toISOString() + '&select=id&limit=1', { headers });
        const recentLog = await recentLogRes.json();
        if (recentLog && recentLog.length) continue;  // already optimized this slot in last 7 days

        const winnerVariant = variants.find(v => v.variant_key === winnerKey);
        const losers = activeKeys.filter(k => k !== winnerKey);
        const winProbability = wins[winnerKey] / N_SAMPLES;

        // Log winner_picked event
        await fetch(supaUrl + '/rest/v1/experiment_events', {
          method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            slot_id: slot.id,
            variant_key: winnerKey,
            event_type: 'winner_picked',
            event_data: { losers: losers, win_probability: winProbability, winner_content: winnerVariant.content }
          })
        });

        // Challenger generation happens in a follow-on block (Task 9) — for clean task decomposition
        // Persist a signal that challenger needs generation: temporary stash in event_data on the winner_picked log
      } catch (slotErr) {
        console.error('Experiment slot ' + slot.id + ' optimization error:', slotErr);
      }
    }
  } catch (e) { console.error('Experiment slots optimizer error:', e); }
```

- [ ] **Step 2: Syntax check + commit**

```bash
node --check worker.js
git add worker.js
git commit -m "$(cat <<'EOF'
feat: nightly optimizer cron block — winner detection for experiment slots

Iterates active experiment_slots, rolls up per-variant events since
last_optimized_at, updates Beta posteriors via posteriorFromEvents(),
runs 1000-sample Thompson win probability check, emits winner_picked
event when confidence_threshold met + min_sends_per_variant satisfied.

Challenger generation in follow-on Task 9.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Challenger generation (Claude) + auto-deploy

**Files:**
- Modify: `worker.js` — enhance the Task 8 block to generate + deploy challengers

- [ ] **Step 1: Replace the "Challenger generation happens in a follow-on block" comment**

Find the comment `// Challenger generation happens in a follow-on block (Task 9)` (inside the experiment slots optimizer block from Task 8). Replace those two comment lines with:

```javascript
        // Generate challenger via Claude
        let newVariantContent = null;
        try {
          const prompt = slot.challenger_prompt
            .replace(/\{\{winner\}\}/g, winnerVariant.content)
            .replace(/\{\{win_probability\}\}/g, Math.round(winProbability * 100));

          const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 300,
              messages: [{ role: 'user', content: prompt }]
            })
          });
          const aiData = await aiRes.json();
          const aiText = (aiData.content && aiData.content[0] ? aiData.content[0].text : '').trim().replace(/^["']|["']$/g, '');
          if (aiText) newVariantContent = aiText;
        } catch (aiErr) {
          console.error('Challenger gen error for slot ' + slot.id + ':', aiErr);
        }

        if (!newVariantContent) continue;  // skip deploy if Claude failed

        // Allocate next variant key (a, b, c, ... aa, ab if overflow)
        const allVariantsRes = await fetch(supaUrl + '/rest/v1/experiment_variants?slot_id=eq.' + encodeURIComponent(slot.id) + '&select=variant_key', { headers });
        const allVariants = await allVariantsRes.json();
        const usedKeys = new Set((allVariants || []).map(v => v.variant_key));
        let newKey = null;
        for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
          if (!usedKeys.has(ch)) { newKey = ch; break; }
        }
        if (!newKey) {
          // 2-letter overflow (aa, ab, ...)
          for (const c1 of 'abcdefghijklmnopqrstuvwxyz') {
            for (const c2 of 'abcdefghijklmnopqrstuvwxyz') {
              if (!usedKeys.has(c1 + c2)) { newKey = c1 + c2; break; }
            }
            if (newKey) break;
          }
        }
        if (!newKey) continue;  // astronomically unlikely

        const isAutoDeploy = slot.deploy_mode === 'auto';

        // Insert new variant
        await fetch(supaUrl + '/rest/v1/experiment_variants', {
          method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            slot_id: slot.id,
            variant_key: newKey,
            content: newVariantContent,
            generated_by: 'claude',
            generated_from_variant: winnerKey,
            status: isAutoDeploy ? 'active' : 'pending_approval',
            activated_at: isAutoDeploy ? new Date().toISOString() : null
          })
        });

        // Log the generation event
        await fetch(supaUrl + '/rest/v1/experiment_events', {
          method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            slot_id: slot.id,
            variant_key: newKey,
            event_type: isAutoDeploy ? 'challenger_generated' : 'challenger_pending_approval',
            event_data: { winner: winnerKey, win_probability: winProbability, new_content: newVariantContent, replaced_losers: isAutoDeploy ? losers : [] }
          })
        });

        // If auto-deploy: retire losers + reset posteriors
        if (isAutoDeploy) {
          for (const loserKey of losers) {
            await fetch(supaUrl + '/rest/v1/experiment_variants?slot_id=eq.' + encodeURIComponent(slot.id) + '&variant_key=eq.' + encodeURIComponent(loserKey), {
              method: 'PATCH', headers,
              body: JSON.stringify({ status: 'retired', retired_at: new Date().toISOString() })
            });
          }

          // Rebuild variant_stats: keep winner's, drop losers', init new variant
          const rebuiltStats = { [winnerKey]: newStats[winnerKey], [newKey]: { alpha: 1, beta: 1, sends: 0 } };
          await fetch(supaUrl + '/rest/v1/experiment_slots?id=eq.' + encodeURIComponent(slot.id), {
            method: 'PATCH', headers,
            body: JSON.stringify({ variant_stats: rebuiltStats })
          });
        }
```

- [ ] **Step 2: Syntax check + commit**

```bash
node --check worker.js
git add worker.js
git commit -m "$(cat <<'EOF'
feat: challenger generation + auto-deploy for experiment slots

When a winner is declared (90% Bayesian confidence + min sends met):
call Claude with slot.challenger_prompt (interpolating {{winner}} +
{{win_probability}}), parse the returned text as a new variant, assign
next variant_key (a-z, overflow aa-zz), insert as active (auto-deploy
mode) or pending_approval, retire losers, reset posteriors.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Admin approval deploy trigger

**Files:**
- Modify: `worker.js` — new endpoint for admin approval/rejection actions

- [ ] **Step 1: Add approval endpoint**

After the `/experiment/link-session` block (Task 6), add:

```javascript
    // ═══ POST /experiment/approve — admin approves a pending_approval variant ═══
    if (url.pathname === '/experiment/approve' && request.method === 'POST') {
      if (!user || !user.id) return new Response('{"error":"unauthorized"}', { status: 401, headers: h });
      // Verify admin
      const supaH = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' };
      const adminCheck = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&is_admin=eq.true&select=id', { headers: supaH });
      const adminRows = await adminCheck.json();
      if (!adminRows || !adminRows.length) return new Response('{"error":"not admin"}', { status: 403, headers: h });

      const reqBody = body || await request.json().catch(() => ({}));
      const { variant_id, action, edited_content } = reqBody;
      if (!variant_id || !['approve', 'reject'].includes(action)) {
        return new Response('{"error":"missing or invalid variant_id/action"}', { status: 400, headers: h });
      }

      // Load the variant
      const vRes = await fetch(env.SUPABASE_URL + '/rest/v1/experiment_variants?id=eq.' + variant_id + '&select=*', { headers: supaH });
      const variants = await vRes.json();
      if (!variants || !variants.length) return new Response('{"error":"variant not found"}', { status: 404, headers: h });
      const v = variants[0];
      if (v.status !== 'pending_approval') return new Response('{"error":"variant not pending approval"}', { status: 400, headers: h });

      if (action === 'reject') {
        await fetch(env.SUPABASE_URL + '/rest/v1/experiment_variants?id=eq.' + variant_id, {
          method: 'PATCH', headers: supaH,
          body: JSON.stringify({ status: 'retired', retired_at: new Date().toISOString() })
        });
        await fetch(env.SUPABASE_URL + '/rest/v1/experiment_events', {
          method: 'POST', headers: { ...supaH, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ slot_id: v.slot_id, variant_key: v.variant_key, event_type: 'challenger_rejected', event_data: { by: user.id } })
        });
        return new Response('{"ok":true,"action":"rejected"}', { headers: h });
      }

      // Approve path: optionally accept edited content, activate variant, retire losers, reset posteriors
      const finalContent = (edited_content && edited_content.trim()) ? edited_content.trim() : v.content;

      await fetch(env.SUPABASE_URL + '/rest/v1/experiment_variants?id=eq.' + variant_id, {
        method: 'PATCH', headers: supaH,
        body: JSON.stringify({ status: 'active', activated_at: new Date().toISOString(), content: finalContent })
      });

      // Retire all other non-winner active variants for this slot
      const activeOthersRes = await fetch(env.SUPABASE_URL + '/rest/v1/experiment_variants?slot_id=eq.' + encodeURIComponent(v.slot_id) + '&status=eq.active&variant_key=neq.' + encodeURIComponent(v.variant_key) + '&variant_key=neq.' + encodeURIComponent(v.generated_from_variant || '') + '&select=variant_key', { headers: supaH });
      const activeOthers = await activeOthersRes.json();
      for (const other of (activeOthers || [])) {
        await fetch(env.SUPABASE_URL + '/rest/v1/experiment_variants?slot_id=eq.' + encodeURIComponent(v.slot_id) + '&variant_key=eq.' + encodeURIComponent(other.variant_key), {
          method: 'PATCH', headers: supaH,
          body: JSON.stringify({ status: 'retired', retired_at: new Date().toISOString() })
        });
      }

      // Reset posteriors: keep winner (generated_from_variant), add new variant
      const slotRes = await fetch(env.SUPABASE_URL + '/rest/v1/experiment_slots?id=eq.' + encodeURIComponent(v.slot_id) + '&select=variant_stats', { headers: supaH });
      const slots = await slotRes.json();
      const existingStats = (slots && slots[0] && slots[0].variant_stats) || {};
      const winnerStats = existingStats[v.generated_from_variant] || { alpha: 1, beta: 1, sends: 0 };
      const newStats = { [v.variant_key]: { alpha: 1, beta: 1, sends: 0 } };
      if (v.generated_from_variant) newStats[v.generated_from_variant] = winnerStats;
      await fetch(env.SUPABASE_URL + '/rest/v1/experiment_slots?id=eq.' + encodeURIComponent(v.slot_id), {
        method: 'PATCH', headers: supaH,
        body: JSON.stringify({ variant_stats: newStats })
      });

      await fetch(env.SUPABASE_URL + '/rest/v1/experiment_events', {
        method: 'POST', headers: { ...supaH, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ slot_id: v.slot_id, variant_key: v.variant_key, event_type: 'challenger_approved', event_data: { by: user.id, edited: finalContent !== v.content } })
      });

      return new Response('{"ok":true,"action":"approved","variant_key":"' + v.variant_key + '"}', { headers: h });
    }
```

- [ ] **Step 2: Syntax check + commit**

```bash
node --check worker.js
git add worker.js
git commit -m "$(cat <<'EOF'
feat: POST /experiment/approve — admin approval/rejection for pending variants

Admin-only endpoint. Verifies user is_admin. Accepts action='approve'
(optionally with edited_content override) or action='reject'. On
approve: activates variant, retires losers, resets posteriors. Logs
challenger_approved or challenger_rejected event.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5: Seed first slot + marketing-experiments.md

### Task 11: Seed `landing_headline` slot migration

**Files:**
- Create: `supabase/migrations/20260417_seed_landing_headline.sql`

- [ ] **Step 1: Create seed migration**

```sql
-- ═══════════════════════════════════════════════════
-- Seed: landing_headline slot (the first production slot)
-- 2026-04-17
-- ═══════════════════════════════════════════════════

INSERT INTO public.experiment_slots (id, description, field_type, deploy_mode, reward_metric, challenger_prompt, min_sends_per_variant, confidence_threshold)
VALUES (
  'landing_headline',
  'H1 headline on screener.html — first thing visitors see.',
  'text',
  'auto',
  '{
    "view": 0,
    "click": 1,
    "screener_complete": 5,
    "signup": 20,
    "pro_subscribe": 100
  }'::jsonb,
  'You optimize landing page headlines for Modern Village, an ABA-powered AI coaching platform for neurodivergent families. The visitor is typically a mother in her 30s, exhausted, searching at 11pm for answers about her child. Brand voice: warm, peer-to-peer, empathetic, never clinical. Avoid words like disorder, deficit, abnormal. The winning headline is: "{{winner}}" ({{win_probability}}% confidence over losing variants). Write ONE new challenger headline that tests a different emotional angle but keeps the winner''s warmth and specificity. Max 65 characters. Respond with ONLY the headline text, no quotes, no preamble.',
  50,
  0.90
)
ON CONFLICT (id) DO NOTHING;

-- Three seed variants based on proven hooks from the acquisition funnel doc
INSERT INTO public.experiment_variants (slot_id, variant_key, content, generated_by, status, activated_at)
VALUES
  ('landing_headline', 'a', 'You''re not failing. The system wasn''t built for your child.', 'seed', 'active', now()),
  ('landing_headline', 'b', 'Free autism + ADHD screener — built by a BCBA, for parents', 'seed', 'active', now()),
  ('landing_headline', 'c', '3 strategies that work whether or not your child has a diagnosis', 'seed', 'active', now())
ON CONFLICT (slot_id, variant_key) DO NOTHING;
```

- [ ] **Step 2: Apply migration (Jorrel manually in Supabase SQL Editor)**

Verify:
```sql
SELECT id, status, deploy_mode FROM public.experiment_slots WHERE id = 'landing_headline';
-- Expected: 1 row, status='active', deploy_mode='auto'

SELECT variant_key, content FROM public.experiment_variants WHERE slot_id = 'landing_headline' ORDER BY variant_key;
-- Expected: 3 rows (a, b, c)
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260417_seed_landing_headline.sql
git commit -m "$(cat <<'EOF'
feat: seed landing_headline slot with 3 initial variants

Reward: view=0, click=1, screener_complete=5, signup=20, pro_subscribe=100.
Deploy mode: auto. Threshold: 90% Bayesian confidence + 50 sends/variant.

Three seed variants from acquisition funnel doc: 'you're not failing',
BCBA-built screener, and 3-strategies framing. Challenger prompt
instructs Claude to keep warm peer-to-peer tone, ≤65 chars, no clinical
words.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Wire landing_headline into screener.html

**Files:**
- Modify: `screener.html`

- [ ] **Step 1: Find the current headline + start button**

```bash
grep -n "<h1" screener.html | head -5
grep -n "Take the" screener.html
grep -n "onSubmit\|submitScreener\|completeScreener" screener.html | head -5
```

- [ ] **Step 2: Add `id="landingHeadline"` to the first H1 and wire the JS**

Edit the first `<h1>` in screener.html so it has `id="landingHeadline"`. Leave the existing text as a fallback.

Find the existing script block (or create one near end of `<body>`) and add:

```html
<script>
// Autoresearch: landing_headline slot
(async function() {
  try {
    if (!window.mvExperiment) return;
    const v = await window.mvExperiment.getVariant('landing_headline');
    if (v && v.content) {
      const el = document.getElementById('landingHeadline');
      if (el) el.textContent = v.content;
    }
  } catch (e) {}
})();

// Fire click event on the start button
(function() {
  const startBtn = document.getElementById('startBtn') || document.querySelector('button[type="submit"]') || document.querySelector('.cta');
  if (startBtn && window.mvExperiment) {
    startBtn.addEventListener('click', function() {
      window.mvExperiment.trackEvent('landing_headline', 'click');
    });
  }
})();

// Fire screener_complete event when screener is submitted successfully
// (hook into existing completeScreener / showResults function)
window.addEventListener('mv-screener-complete', function(ev) {
  if (window.mvExperiment) {
    window.mvExperiment.trackEvent('landing_headline', 'screener_complete', ev.detail || null);
  }
});
</script>
```

And find the existing screener completion handler — somewhere there's a function that fires when the screener submits. Add after the score computation, something like:

```js
window.dispatchEvent(new CustomEvent('mv-screener-complete', { detail: { score: score, risk_level: riskLevel } }));
```

(Grep for where `score` and `risk_level` are computed; inject the dispatchEvent right after.)

- [ ] **Step 3: Test locally**

```bash
node --check screener.html  # won't work — HTML not JS. Instead:
# Just open in a browser. Check DevTools console for errors.
# Verify window.mvExperiment is defined.
# Verify fetch to /experiment/variant fires with correct params.
```

- [ ] **Step 4: Commit**

```bash
git add screener.html
git commit -m "$(cat <<'EOF'
feat: wire landing_headline slot into screener.html

H1 now gets replaced by variant content from /experiment/variant on
page load. 'click' event fires on start button. Custom
'mv-screener-complete' event dispatched from screener submission
handler fires 'screener_complete' experiment event with score + risk.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Create `marketing-experiments.md`

**Files:**
- Create: `marketing-experiments.md` (repo root)

- [ ] **Step 1: Write the file**

```markdown
# Marketing Experiments — Instructions to the AutoResearch Agent

**Last human review:** 2026-04-17 by Jorrel
**Spec:** [docs/superpowers/specs/2026-04-17-marketing-autoresearch-framework-design.md](docs/superpowers/specs/2026-04-17-marketing-autoresearch-framework-design.md)

---

## Brand constraints (apply to all challenger prompts)

- **Voice:** warm, direct, peer-to-peer. Avoid clinical jargon: no "disorder", "deficit", "abnormal", "low-functioning", "high-functioning".
- **Tone:** empathetic, never fear-mongering or shaming.
- **Pricing:** never discount below $14.99. Current Pro is $19.99/mo.
- **Audience:** primary is exhausted moms 28-44 searching for answers at 11pm; secondary is BCBAs, teachers, caregivers.
- **No false urgency**, no fake scarcity, no "limited spots" without proof.
- **Claude challenger prompts must be constructed to respect these constraints.**

## Active slots

| Slot | Priority | Deploy mode | Min sends/variant | Confidence | Kill threshold |
|------|----------|-------------|-------------------|-----------|----------------|
| landing_headline | P0 | auto | 50 | 90% | screener-complete rate drops 30%, revert |

(More slots added as they're wired — this table is the source of truth for what's live.)

## Experiment backlog (slots to add next, in priority order)

1. `landing_cta_button` — text on the "Take the free screener" button
2. `landing_subheadline` — sub-headline below H1
3. `meta_ad_hook_v1` — first Meta ad headline
4. `meta_ad_body_v1` — Meta ad body copy
5. `paywall_heading` — text on the upgrade-to-Pro modal (APPROVAL required)
6. `paywall_cta_button` — upgrade button text (APPROVAL required)
7. `onboarding_welcome` — first screen after signup (APPROVAL required)
8. `blog_cta_autism_meltdowns` — CTA at bottom of autism-meltdowns blog post
9. (repeat for each blog post: ~10 slots)

## Kill switches

Automatically pause optimization when any of these fire:
- Bounce rate > 5% on any email-related slot in 24 hours (already implemented in email cron)
- Pro conversion rate drops below `baseline × 0.7` for 48 hours (post-launch, add to optimizer cron)
- Legal/HIPAA concern raised manually — admin can flip slot.status='paused' in admin UI

## Quarterly review checklist

Every 90 days:
- [ ] Review each slot's winning variant — does it still match the current brand?
- [ ] Retire slots that haven't produced a new winner in 30 days AND aren't receiving traffic
- [ ] Add the next slot from the backlog
- [ ] Update brand constraints if positioning has shifted
- [ ] Check that Claude-generated challengers are staying in-bounds (sample 10, red-flag any that violate brand constraints — retrain the prompt if needed)

## How this file is used by the system

The nightly optimizer cron does NOT parse this file. Humans edit it. When a slot's challenger_prompt is updated in the DB (via admin UI), the editor should include the relevant brand constraints from this doc as a preamble to Claude's prompt. This keeps the source of truth in the DB while giving humans a single readable place to steer the research organization.
```

- [ ] **Step 2: Commit**

```bash
git add marketing-experiments.md
git commit -m "$(cat <<'EOF'
docs: marketing-experiments.md — research-org programming companion

Human-readable config at repo root. Documents brand constraints,
active slots, experiment backlog, kill switches, and quarterly review
checklist. Editable by humans; nightly cron does not parse it (DB is
source of truth).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6: Admin UX

### Task 14: Experiment Slots Dashboard

**Files:**
- Modify: `admin.html` (add new collapsible section near the existing Cohort Dashboard / Opt Log)

- [ ] **Step 1: Find the existing admin sections**

```bash
grep -n "Cohort Dashboard\|Optimization Log\|Lead Queue Manager\|<details" admin.html | head -10
```

- [ ] **Step 2: Add Experiment Slots Dashboard section**

Immediately after the existing "Lead Queue Manager" `</details>` block, insert:

```html
<details style="margin-bottom:16px;background:#fff;border-radius:12px;padding:12px;border:1px solid #eee">
  <summary style="cursor:pointer;font-weight:700" onclick="loadExperimentSlots()">🧪 Experiment Slots (Marketing AutoResearch)</summary>
  <div id="expSlotsContainer" style="padding:12px"></div>
</details>

<script>
async function loadExperimentSlots() {
  const c = document.getElementById('expSlotsContainer');
  c.innerHTML = '<div style="padding:20px;text-align:center;color:#999">Loading...</div>';
  try {
    const { data: slots, error } = await sb.from('experiment_slots').select('*').order('id');
    if (error) throw error;
    if (!slots || !slots.length) { c.innerHTML = '<p style="color:#999">No slots yet. Add via migration or admin.</p>'; return; }

    let html = '<table style="width:100%;font-size:13px">';
    html += '<tr><th>Slot</th><th>Status</th><th>Mode</th><th>Variants</th><th>Top win %</th><th>Last optimized</th><th></th></tr>';

    for (const s of slots) {
      const { data: variants } = await sb.from('experiment_variants').select('variant_key,status').eq('slot_id', s.id);
      const activeCount = (variants || []).filter(v => v.status === 'active').length;
      const pendingCount = (variants || []).filter(v => v.status === 'pending_approval').length;

      // Compute top win probability from variant_stats (rough Thompson preview)
      const stats = s.variant_stats || {};
      let topWinPct = '—';
      const keys = Object.keys(stats).filter(k => stats[k].sends > 0);
      if (keys.length >= 2) {
        // Mean of Beta(α,β) = α / (α+β)
        const means = keys.map(k => ({ k, mean: stats[k].alpha / (stats[k].alpha + stats[k].beta) }));
        means.sort((a, b) => b.mean - a.mean);
        topWinPct = '<strong>' + means[0].k + '</strong> (' + (means[0].mean * 100).toFixed(1) + '%)';
      }

      html += '<tr style="border-top:1px solid #eee">' +
        '<td style="padding:6px"><strong>' + esc(s.id) + '</strong><br><span style="color:#999;font-size:11px">' + esc(s.description || '') + '</span></td>' +
        '<td style="padding:6px">' + esc(s.status) + '</td>' +
        '<td style="padding:6px">' + esc(s.deploy_mode) + (pendingCount ? ' <span style="background:#fa0;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px">+' + pendingCount + ' pending</span>' : '') + '</td>' +
        '<td style="padding:6px">' + activeCount + '</td>' +
        '<td style="padding:6px">' + topWinPct + '</td>' +
        '<td style="padding:6px;color:#999;font-size:11px">' + (s.last_optimized_at ? new Date(s.last_optimized_at).toLocaleDateString() : 'never') + '</td>' +
        '<td style="padding:6px"><button class="btn btn-sm btn-outline" onclick="viewSlotDetail(\'' + esc(s.id) + '\')">Detail</button></td>' +
        '</tr>';
    }
    html += '</table>';
    c.innerHTML = html;
  } catch (e) {
    c.innerHTML = '<p style="color:red">Error: ' + esc(String(e)) + '</p>';
    console.error(e);
  }
}
</script>
```

- [ ] **Step 3: Sanity grep + commit**

```bash
grep -c "loadExperimentSlots\|expSlotsContainer" admin.html
# expect 3+ (declaration + onclick + id)
git add admin.html
git commit -m "$(cat <<'EOF'
feat: admin Experiment Slots Dashboard

New collapsible section on Leads page listing all experiment_slots
with status, deploy mode (auto/approval with pending badge), active
variant count, top variant win probability (Beta mean), last optimized
timestamp, and a Detail button.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Slot Detail View

**Files:**
- Modify: `admin.html` — add detail modal

- [ ] **Step 1: Add the detail modal HTML + function**

Append to the admin.html `<script>` block (or near the `loadExperimentSlots` function):

```html
<div id="slotDetailModal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;padding:40px">
  <div style="background:#fff;border-radius:12px;padding:20px;max-width:900px;width:100%;max-height:90vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 id="slotDetailTitle" style="margin:0">Slot Detail</h2>
      <button class="btn btn-sm btn-outline" onclick="closeSlotDetail()">Close</button>
    </div>
    <div id="slotDetailBody"></div>
  </div>
</div>

<script>
function closeSlotDetail() {
  document.getElementById('slotDetailModal').style.display = 'none';
}

async function viewSlotDetail(slotId) {
  document.getElementById('slotDetailModal').style.display = 'flex';
  const title = document.getElementById('slotDetailTitle');
  const body = document.getElementById('slotDetailBody');
  title.textContent = slotId;
  body.innerHTML = '<div style="padding:20px;text-align:center;color:#999">Loading...</div>';

  try {
    const { data: slotData } = await sb.from('experiment_slots').select('*').eq('id', slotId).single();
    const { data: variants } = await sb.from('experiment_variants').select('*').eq('slot_id', slotId).order('created_at');
    const { data: recentEvents } = await sb.from('experiment_events').select('*').eq('slot_id', slotId).order('created_at', { ascending: false }).limit(50);

    const stats = slotData.variant_stats || {};

    let html = '<h3>Config</h3>';
    html += '<pre style="background:#f5f5f5;padding:12px;border-radius:8px;font-size:11px;overflow-x:auto">' + esc(JSON.stringify({
      description: slotData.description,
      field_type: slotData.field_type,
      deploy_mode: slotData.deploy_mode,
      reward_metric: slotData.reward_metric,
      min_sends_per_variant: slotData.min_sends_per_variant,
      confidence_threshold: slotData.confidence_threshold,
      status: slotData.status
    }, null, 2)) + '</pre>';

    html += '<h3 style="margin-top:16px">Variants</h3>';
    html += '<table style="width:100%;font-size:12px"><tr><th>Key</th><th>Status</th><th>Source</th><th>Content</th><th>α</th><th>β</th><th>Sends</th></tr>';
    for (const v of (variants || [])) {
      const st = stats[v.variant_key] || {};
      html += '<tr style="border-top:1px solid #eee">' +
        '<td style="padding:6px"><strong>' + esc(v.variant_key) + '</strong></td>' +
        '<td style="padding:6px">' + esc(v.status) + '</td>' +
        '<td style="padding:6px">' + esc(v.generated_by) + (v.generated_from_variant ? ' (from ' + esc(v.generated_from_variant) + ')' : '') + '</td>' +
        '<td style="padding:6px;max-width:300px"><em>' + esc(v.content) + '</em></td>' +
        '<td style="padding:6px">' + (st.alpha || 1).toFixed(2) + '</td>' +
        '<td style="padding:6px">' + (st.beta || 1).toFixed(2) + '</td>' +
        '<td style="padding:6px">' + (st.sends || 0) + '</td>' +
        '</tr>';
    }
    html += '</table>';

    html += '<h3 style="margin-top:16px">Recent 50 events</h3>';
    html += '<table style="width:100%;font-size:11px"><tr><th>When</th><th>Type</th><th>Variant</th><th>Data</th></tr>';
    for (const e of (recentEvents || [])) {
      html += '<tr style="border-top:1px solid #eee">' +
        '<td style="padding:4px">' + esc(new Date(e.created_at).toLocaleString()) + '</td>' +
        '<td style="padding:4px">' + esc(e.event_type) + '</td>' +
        '<td style="padding:4px">' + esc(e.variant_key || '—') + '</td>' +
        '<td style="padding:4px;font-family:monospace;max-width:400px">' + esc(JSON.stringify(e.event_data || {})) + '</td>' +
        '</tr>';
    }
    html += '</table>';

    html += '<div style="margin-top:16px;display:flex;gap:8px">';
    html += '<button class="btn btn-sm btn-outline" onclick="toggleSlotStatus(\'' + esc(slotId) + '\',\'' + esc(slotData.status) + '\')">' + (slotData.status === 'paused' ? 'Resume' : 'Pause') + ' slot</button>';
    html += '</div>';

    body.innerHTML = html;
  } catch (e) {
    body.innerHTML = '<p style="color:red">Error: ' + esc(String(e)) + '</p>';
  }
}

async function toggleSlotStatus(slotId, currentStatus) {
  const newStatus = currentStatus === 'paused' ? 'active' : 'paused';
  if (!confirm(newStatus === 'paused' ? 'Pause slot ' + slotId + '?' : 'Resume slot ' + slotId + '?')) return;
  await sb.from('experiment_slots').update({ status: newStatus }).eq('id', slotId);
  showToast('Slot ' + newStatus);
  viewSlotDetail(slotId);
}
</script>
```

- [ ] **Step 2: Commit**

```bash
git add admin.html
git commit -m "$(cat <<'EOF'
feat: admin Slot Detail View — config + variants + events

Modal opened via Detail button from Slots Dashboard. Shows slot
config JSON, variants table (keys + status + source + content + α/β/
sends), recent 50 events (type + variant + event_data). Pause/resume
button.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Approval Queue

**Files:**
- Modify: `admin.html` — add approval queue section

- [ ] **Step 1: Add approval queue section after Experiment Slots Dashboard**

```html
<details style="margin-bottom:16px;background:#fff;border-radius:12px;padding:12px;border:1px solid #eee">
  <summary style="cursor:pointer;font-weight:700" onclick="loadApprovalQueue()">✋ Challenger Approval Queue</summary>
  <div id="approvalQueueContainer" style="padding:12px"></div>
</details>

<script>
async function loadApprovalQueue() {
  const c = document.getElementById('approvalQueueContainer');
  c.innerHTML = '<div style="padding:20px;text-align:center;color:#999">Loading...</div>';
  try {
    const { data: pending } = await sb.from('experiment_variants').select('*').eq('status', 'pending_approval').order('created_at', { ascending: false });
    if (!pending || !pending.length) { c.innerHTML = '<p style="color:#999">No pending challengers.</p>'; return; }

    let html = '';
    for (const p of pending) {
      // Fetch the winner it iterated on
      const { data: winnerRows } = await sb.from('experiment_variants').select('content').eq('slot_id', p.slot_id).eq('variant_key', p.generated_from_variant || '').limit(1);
      const winnerContent = (winnerRows && winnerRows[0]) ? winnerRows[0].content : '(no winner on file)';

      html += '<div style="border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:10px;background:#fafafa">' +
        '<div style="font-weight:700">' + esc(p.slot_id) + ' — variant ' + esc(p.variant_key) + '</div>' +
        '<div style="color:#999;font-size:11px">generated ' + esc(new Date(p.created_at).toLocaleString()) + ' from winner variant ' + esc(p.generated_from_variant || '?') + '</div>' +
        '<div style="margin-top:8px"><strong>Current winner:</strong> <em>' + esc(winnerContent) + '</em></div>' +
        '<div style="margin-top:4px"><strong>Proposed challenger:</strong> <em>' + esc(p.content) + '</em></div>' +
        '<div style="margin-top:8px">' +
          '<textarea id="edit_' + p.id + '" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;font-family:inherit" rows="2" placeholder="Optional: edit before approving">' + esc(p.content) + '</textarea>' +
        '</div>' +
        '<div style="margin-top:8px;display:flex;gap:8px">' +
          '<button class="btn btn-sm btn-sage" onclick="approveChallenger(\'' + p.id + '\')">Approve</button>' +
          '<button class="btn btn-sm btn-outline" onclick="rejectChallenger(\'' + p.id + '\')">Reject</button>' +
        '</div>' +
        '</div>';
    }
    c.innerHTML = html;
  } catch (e) {
    c.innerHTML = '<p style="color:red">Error: ' + esc(String(e)) + '</p>';
  }
}

async function approveChallenger(variantId) {
  const edited = document.getElementById('edit_' + variantId).value.trim();
  const session = await sb.auth.getSession();
  const token = session.data.session && session.data.session.access_token;
  const r = await fetch('https://village-api.jorrelpatterson.workers.dev/experiment/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ variant_id: variantId, action: 'approve', edited_content: edited })
  });
  const res = await r.json();
  showToast(r.ok ? 'Approved' : 'Error: ' + (res.error || 'unknown'));
  loadApprovalQueue();
}

async function rejectChallenger(variantId) {
  if (!confirm('Reject this challenger?')) return;
  const session = await sb.auth.getSession();
  const token = session.data.session && session.data.session.access_token;
  const r = await fetch('https://village-api.jorrelpatterson.workers.dev/experiment/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ variant_id: variantId, action: 'reject' })
  });
  showToast(r.ok ? 'Rejected' : 'Error');
  loadApprovalQueue();
}
</script>
```

- [ ] **Step 2: Commit**

```bash
git add admin.html
git commit -m "$(cat <<'EOF'
feat: admin Challenger Approval Queue

Lists all experiment_variants with status='pending_approval'. Each
entry shows: slot, variant_key, timestamp, current winner content vs
proposed challenger, editable textarea (override before approve),
Approve + Reject buttons. Calls /experiment/approve endpoint with
Authorization header.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Attribution / Sources Dashboard

**Files:**
- Modify: `admin.html` — add sources dashboard section

- [ ] **Step 1: Add the section**

```html
<details style="margin-bottom:16px;background:#fff;border-radius:12px;padding:12px;border:1px solid #eee">
  <summary style="cursor:pointer;font-weight:700" onclick="loadSources()">📊 Attribution Sources (last 30 days)</summary>
  <div id="sourcesContainer" style="padding:12px"></div>
</details>

<script>
async function loadSources() {
  const c = document.getElementById('sourcesContainer');
  c.innerHTML = '<div style="padding:20px;text-align:center;color:#999">Loading...</div>';
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const { data: assigns } = await sb.from('experiment_assignments')
      .select('session_id,initial_utm,user_id')
      .gte('assigned_at', thirtyDaysAgo);

    // Group by utm_source
    const bySource = {};
    for (const a of (assigns || [])) {
      const src = (a.initial_utm && a.initial_utm.source) || 'direct';
      if (!bySource[src]) bySource[src] = { sessions: new Set(), userIds: new Set() };
      bySource[src].sessions.add(a.session_id);
      if (a.user_id) bySource[src].userIds.add(a.user_id);
    }

    // For each source, fetch conversion events
    const { data: events } = await sb.from('experiment_events')
      .select('session_id,event_type')
      .gte('created_at', thirtyDaysAgo)
      .in('event_type', ['screener_complete', 'signup', 'pro_subscribe']);

    const eventsBySession = {};
    for (const e of (events || [])) {
      if (!eventsBySession[e.session_id]) eventsBySession[e.session_id] = {};
      eventsBySession[e.session_id][e.event_type] = true;
    }

    // Tally per source
    const rows = [];
    for (const src of Object.keys(bySource)) {
      const stats = { src, sessions: bySource[src].sessions.size, users: bySource[src].userIds.size, screener_complete: 0, signup: 0, pro_subscribe: 0 };
      for (const sid of bySource[src].sessions) {
        const ev = eventsBySession[sid] || {};
        if (ev.screener_complete) stats.screener_complete++;
        if (ev.signup) stats.signup++;
        if (ev.pro_subscribe) stats.pro_subscribe++;
      }
      rows.push(stats);
    }
    rows.sort((a, b) => b.sessions - a.sessions);

    let html = '<table style="width:100%;font-size:13px"><tr><th>Source</th><th>Sessions</th><th>Signed-up users</th><th>Screener complete</th><th>Signups</th><th>Pro subs</th><th>Pro CVR</th></tr>';
    for (const r of rows) {
      const cvr = r.sessions ? (r.pro_subscribe / r.sessions * 100).toFixed(2) + '%' : '—';
      html += '<tr style="border-top:1px solid #eee">' +
        '<td style="padding:6px"><strong>' + esc(r.src) + '</strong></td>' +
        '<td style="padding:6px">' + r.sessions + '</td>' +
        '<td style="padding:6px">' + r.users + '</td>' +
        '<td style="padding:6px">' + r.screener_complete + '</td>' +
        '<td style="padding:6px">' + r.signup + '</td>' +
        '<td style="padding:6px">' + r.pro_subscribe + '</td>' +
        '<td style="padding:6px">' + cvr + '</td>' +
        '</tr>';
    }
    html += '</table>';
    c.innerHTML = html;
  } catch (e) {
    c.innerHTML = '<p style="color:red">Error: ' + esc(String(e)) + '</p>';
  }
}
</script>
```

- [ ] **Step 2: Commit**

```bash
git add admin.html
git commit -m "$(cat <<'EOF'
feat: admin Attribution Sources Dashboard

Shows per-utm_source (last 30 days): sessions, linked users, screener
completions, signups, Pro subs, Pro conversion rate. Data joined from
experiment_assignments.initial_utm + experiment_events event types.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7: Finish + docs

### Task 18: Docs update

**Files:**
- Modify: `docs/ROADMAP.md`, `docs/PARENT-ACQUISITION-FUNNEL.md`, `AGENT-NOTES.md`, `jorrel-os.json`
- Update memory: `project_build_queue.md`, add `project_autoresearch_framework.md`

- [ ] **Step 1: Update ROADMAP.md**

Add to the relevant section:

```markdown
- [x] **Marketing AutoResearch Framework (2026-04-17)** — generalized experiment system on the Phase-3 email optimizer pattern. Slots: landing_headline shipped first. Meta Pixel + UTM capture built in. Admin has Slots Dashboard, Detail View, Approval Queue, Attribution Sources. Expands over time as new slots are added. See [docs/superpowers/plans/2026-04-17-marketing-autoresearch-framework.md](superpowers/plans/2026-04-17-marketing-autoresearch-framework.md).
```

- [ ] **Step 2: Update PARENT-ACQUISITION-FUNNEL.md**

In the "Attribution & Tracking (NEEDS BUILD)" section, change "NEEDS BUILD" to "LIVE" and update body:

```markdown
## Attribution & Tracking (LIVE as of 2026-04-17)

Meta Pixel + UTM capture shipped as part of the Marketing AutoResearch Framework. Every page load captures UTM on first visit (localStorage), every conversion event is tracked, attribution chain survives session-to-user link on signup. Admin → Attribution Sources dashboard shows per-channel conversion funnels for last 30 days.

See [docs/superpowers/plans/2026-04-17-marketing-autoresearch-framework.md](superpowers/plans/2026-04-17-marketing-autoresearch-framework.md) for implementation details.
```

- [ ] **Step 3: Update AGENT-NOTES.md**

Update the "Active work in progress" section to reflect the new state:

```markdown
## Marketing AutoResearch Framework — LIVE in production (2026-04-17)

Generalized experimentation framework built on the Phase-3 email-optimizer pattern. First slot (landing_headline) live, shipping new slots incrementally from the backlog in marketing-experiments.md.
```

- [ ] **Step 4: Update jorrel-os.json**

Add to `current.completed_today`:
```
"Marketing AutoResearch Framework — 4 new tables, 3 worker endpoints, nightly optimizer cron, lib/experiment.js frontend helper, Meta Pixel + UTM capture, admin UX (Slots Dashboard + Detail + Approval Queue + Attribution Sources), first slot (landing_headline) shipped with 3 seed variants"
```

Remove the now-resolved blocker ("Attribution not yet built" from earlier if present). Update `next_action` to reflect the new state.

- [ ] **Step 5: Add memory file `project_autoresearch_framework.md`**

```markdown
---
name: Marketing AutoResearch Framework
description: Generalized experimentation system built 2026-04-17, extending Phase-3 email optimizer pattern to any testable element of the funnel
type: project
---

**Status:** LIVE in production as of 2026-04-17. First slot shipped: landing_headline.

**Branch:** feat/email-drips-optimization (not yet merged — extension of drips build)

**Architecture:** Four tables (experiment_slots, experiment_variants, experiment_assignments, experiment_events) + three worker endpoints (/experiment/variant, /experiment/event, /experiment/link-session) + nightly optimizer cron + lib/experiment.js frontend + Meta Pixel integration + admin UX.

**Core loop:** per active slot, nightly cron rolls up events, updates Beta posteriors via posteriorFromEvents() (per-slot reward_metric), runs 1000-sample Thompson win probability check, when confidence > 90% + min_sends met: calls Claude with slot.challenger_prompt, inserts new variant as 'active' (auto) or 'pending_approval' (approval mode), retires losers, resets posteriors.

**Rollout backlog (in marketing-experiments.md):** landing_cta_button, landing_subheadline, meta_ad_hook_v1, meta_ad_body_v1, paywall_heading (approval), paywall_cta_button (approval), onboarding_welcome (approval), per-blog-post CTAs.

**Phase 2 (deferred):** migrate existing email subject bandit into the framework. Currently lives separately in worker.js.

**Config companion:** marketing-experiments.md at repo root — human-readable brand constraints, active slots, kill switches, quarterly review. NOT parsed by the cron (DB is source of truth).

**Resume instructions:** to add a new slot, (1) write migration inserting experiment_slots + seed experiment_variants rows, (2) wire the slot into the page with getVariant() + trackEvent(), (3) optional: test locally via wrangler dev + curl /experiment/variant, (4) deploy.
```

Then update `MEMORY.md` index to include the new entry.

- [ ] **Step 6: Commit all**

```bash
git add docs/ROADMAP.md docs/PARENT-ACQUISITION-FUNNEL.md AGENT-NOTES.md jorrel-os.json
# plus memory files (handled separately — they live outside repo)
git commit -m "$(cat <<'EOF'
docs: Marketing AutoResearch Framework live — ROADMAP / funnel / agent-notes / jorrel-os updates

Framework shipped: 4 tables, 3 worker endpoints, nightly optimizer cron,
frontend helper, Meta Pixel + UTM capture, admin UX. First slot
(landing_headline) active with 3 seed variants. Attribution now built-in.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Then update memory files manually (outside repo, in ~/.claude/projects/...):

```bash
# Update project_build_queue.md to add autoresearch framework as a shipped item
# Write project_autoresearch_framework.md (full memory file)
# Update MEMORY.md index
```

- [ ] **Step 7: Tag the milestone**

```bash
git tag autoresearch-live
git log --oneline | head -20
```

---

## Self-Review Checklist (applied)

**Spec coverage:**
- ✅ Schema (4 tables) → Task 1
- ✅ Frontend helper (lib/experiment.js) → Task 2
- ✅ Meta Pixel + UTM capture → Task 3
- ✅ GET /experiment/variant → Task 4
- ✅ POST /experiment/event → Task 5
- ✅ POST /experiment/link-session → Task 6
- ✅ Reward function + posterior helpers → Task 7
- ✅ Nightly optimizer cron (winner detection) → Task 8
- ✅ Challenger generation + auto-deploy → Task 9
- ✅ POST /experiment/approve for admin approval path → Task 10
- ✅ Seed landing_headline slot → Task 11
- ✅ Wire landing_headline into screener.html → Task 12
- ✅ marketing-experiments.md → Task 13
- ✅ Experiment Slots Dashboard → Task 14
- ✅ Slot Detail View → Task 15
- ✅ Approval Queue → Task 16
- ✅ Attribution Sources Dashboard → Task 17
- ✅ Docs update + tag → Task 18

**Placeholder scan:** all code blocks complete; no TBD/TODO in implementation steps.

**Type/name consistency:**
- `pickVariant()` — defined in Phase 3 worker.js, used in Task 4 ✓
- `posteriorFromSends()` — defined in Phase 3, pattern extended in Task 7 to `posteriorFromEvents()` ✓
- `sampleBeta()` — Phase 3, used in Task 8 ✓
- Table column references consistent with Task 1 schema ✓
- Endpoint paths consistent across frontend (Task 2) and worker (Tasks 4/5/6/10) ✓
- `window.mvExperiment` API consistent between Task 2 and Task 12 ✓
