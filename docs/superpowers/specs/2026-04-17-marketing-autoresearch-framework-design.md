# Marketing AutoResearch Framework — Design

**Date:** 2026-04-17
**Status:** Approved scope, pending implementation plan
**Inspiration:** [karpathy/autoresearch](https://github.com/karpathy/autoresearch) — autonomous experimentation loop where an agent modifies a bounded system, measures outcomes, keeps winners, and iterates.

---

## Goal

Build a generalized experimentation framework that applies the Phase-3 email-optimizer pattern (Thompson bandit + Claude-generated challengers + auto-promote with Bayesian confidence gate) to every testable element of Modern Village's marketing and conversion funnel: landing page headlines, paywall copy, ad creative, onboarding, blog CTAs, in-product coach prompts.

## Scope

**In scope:**
1. Four new Supabase tables: `experiment_slots`, `experiment_variants`, `experiment_assignments`, `experiment_events`
2. Two worker endpoints: `GET /experiment/variant` (sticky variant assignment), `POST /experiment/event` (outcome tracking)
3. Nightly optimizer cron: posterior updates, winner detection, Claude challenger generation, auto-deploy or approval queue
4. Frontend helper: `lib/experiment.js` with `getVariant()` and `trackEvent()`
5. Meta Pixel + UTM capture (the attribution prerequisite that was the original ask)
6. Admin UX: Experiment Slots Dashboard, Slot Detail View, Approval Queue, Performance Attribution Dashboard
7. `marketing-experiments.md` — human-readable config companion
8. Rollout plan: landing_headline slot first, then Meta ad hooks, paywall, blog CTAs, onboarding

**Out of scope (Phase 2 — deferred):**
- Migrating the existing email subject bandit into the framework (works today, refactor later)
- Multivariate testing (multiple fields per slot simultaneously)
- Contextual bandit (per-visitor personalization)
- Self-directed agent that picks WHICH slot to focus on (Karpathy's fuller vision)

## Why

**Marketing side:** Parent acquisition is the current revenue gate. You have an email drip funnel LIVE but every other element (landing page, paywall, ads, onboarding) is static. Static = not learning. Each static element is a daily drag on CAC.

**Engineering side:** You already proved the bandit + Claude challenger pattern works in Phase 3 email optimizer. The math, the confidence gate, the Claude integration — all working. Generalizing this to all testable elements is a scale-up of proven infra, not new R&D.

**Business side:** Karpathy's insight — "you program the research org itself" by iterating on instructions, not experiments — means this framework compounds value over time. Add a slot once, it optimizes forever. This is the difference between "run an A/B test" (human decides everything, one-off) and "the marketing funnel optimizes itself nightly" (human sets goals, system executes).

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ EXPERIMENT SLOTS (DB + marketing-experiments.md companion)        │
│                                                                   │
│  landing_headline      (text, auto-deploy)                       │
│  landing_subheadline   (text, auto-deploy)                       │
│  landing_cta_button    (text, auto-deploy)                       │
│  paywall_heading       (text, APPROVAL)                          │
│  paywall_price_copy    (text, APPROVAL)                          │
│  onboard_welcome       (text, APPROVAL)                          │
│  meta_ad_hook_v1..N    (text, auto-deploy)                       │
│  blog_cta_<slug>       (text, auto-deploy)                       │
│  email_subject_*       (Phase 2 — migrate existing bandit)       │
└──────────────────────────────────────┬───────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ VISITOR PAGE LOAD                                                 │
│                                                                   │
│  const SID = localStorage.getItem('mv_session') ||               │
│              crypto.randomUUID();                                │
│  const v = await getVariant('landing_headline');                 │
│  // → GET /experiment/variant?slot=...&session=SID               │
│  // Returns { variant_key, content }                             │
│  // Worker: pickVariant() from variant_stats, insert assignment, │
│  //         fire 'view' event                                    │
└──────────────────────────────────────┬───────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ OUTCOMES                                                          │
│                                                                   │
│  trackEvent('landing_headline', 'click');                        │
│  trackEvent('landing_headline', 'screener_complete',             │
│             { score, risk_level });                              │
│  // → POST /experiment/event                                     │
│  // Worker: look up assignment, insert experiment_event row      │
└──────────────────────────────────────┬───────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ NIGHTLY AUTORESEARCH CRON                                         │
│                                                                   │
│  For each active slot:                                           │
│    1. Roll up events per variant since last_optimized_at         │
│    2. Compute posterior (Beta α,β) via reward_metric weights    │
│    3. Update slot.variant_stats                                  │
│    4. If min_sends_per_variant met AND winner at ≥ 90% confidence│
│       → log 'winner_picked'                                      │
│       → call Claude with slot.challenger_prompt                  │
│       → insert new variant                                       │
│       → if deploy_mode='auto': retire losers + activate new      │
│         else: variant.status='pending_approval' → admin review   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### `experiment_slots`
Registry of what's being tested. One row per slot.

```sql
CREATE TABLE public.experiment_slots (
  id text PRIMARY KEY,
    -- 'landing_headline', 'paywall_heading', 'meta_ad_hook_v1', 'blog_cta_autism_meltdowns'
  description text,
    -- human-readable purpose
  field_type text NOT NULL,
    -- 'text' | 'image_url' | 'html_fragment'
  deploy_mode text NOT NULL,
    -- 'auto' | 'approval'
  reward_metric jsonb NOT NULL,
    -- { "view": 0, "click": 1, "screener_complete": 5, "pro_subscribe": 100 }
  challenger_prompt text NOT NULL,
    -- Claude prompt template (must include {{winner}}, {{win_probability}} placeholders)
  min_sends_per_variant integer DEFAULT 50,
  confidence_threshold real DEFAULT 0.90,
  variant_stats jsonb DEFAULT '{}',
    -- { "a": {"alpha": 5, "beta": 12, "sends": 16}, "b": {...} }
  status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'retired')),
  created_at timestamptz DEFAULT now(),
  last_optimized_at timestamptz
);
ALTER TABLE public.experiment_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage slots" ON public.experiment_slots FOR ALL USING (public.is_admin());
CREATE POLICY "Anyone reads active slots" ON public.experiment_slots FOR SELECT USING (status = 'active');
  -- Enables the worker's /experiment/variant endpoint to read slot config without auth
```

### `experiment_variants`
The actual content. Many per slot.

```sql
CREATE TABLE public.experiment_variants (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slot_id text REFERENCES public.experiment_slots(id) ON DELETE CASCADE NOT NULL,
  variant_key text NOT NULL,
    -- 'a', 'b', 'c', ... incrementally. Overflows 'z' → 'aa', 'ab' via a simple
    -- base-26 counter in the challenger-gen code. Unlikely to hit at normal cadence.
  content text NOT NULL,
    -- the actual headline / CTA / image URL / HTML fragment
  generated_by text DEFAULT 'human' CHECK (generated_by IN ('human', 'claude', 'seed')),
  generated_from_variant text,
    -- if claude-generated, which winner it iterated on
  status text DEFAULT 'active' CHECK (status IN ('active', 'retired', 'pending_approval')),
  created_at timestamptz DEFAULT now(),
  activated_at timestamptz,
  retired_at timestamptz,
  UNIQUE(slot_id, variant_key)
);
ALTER TABLE public.experiment_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage variants" ON public.experiment_variants FOR ALL USING (public.is_admin());
CREATE POLICY "Anyone reads active variants" ON public.experiment_variants FOR SELECT USING (status = 'active');

CREATE INDEX idx_variants_slot_active ON public.experiment_variants(slot_id) WHERE status = 'active';
```

### `experiment_assignments`
Sticky per-session mapping. Primary write on first variant request.

```sql
CREATE TABLE public.experiment_assignments (
  session_id text NOT NULL,
  slot_id text REFERENCES public.experiment_slots(id) ON DELETE CASCADE NOT NULL,
  variant_key text NOT NULL,
  user_id uuid REFERENCES public.profiles(id),
    -- populated later when session → account link happens
  initial_utm jsonb,
    -- { "source": "meta_ads", "medium": "paid", "campaign": "mom_11pm_v1" } — stamped on first view
  assigned_at timestamptz DEFAULT now(),
  PRIMARY KEY (session_id, slot_id)
);
ALTER TABLE public.experiment_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read all assignments" ON public.experiment_assignments FOR SELECT USING (public.is_admin());
  -- Writes come from worker via service key, bypassing RLS
CREATE INDEX idx_assignments_user ON public.experiment_assignments(user_id) WHERE user_id IS NOT NULL;
```

### `experiment_events`
Outcomes firehose. High-volume append-only.

```sql
CREATE TABLE public.experiment_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slot_id text REFERENCES public.experiment_slots(id) ON DELETE CASCADE,
  variant_key text,
  session_id text,
  user_id uuid REFERENCES public.profiles(id),
  event_type text NOT NULL,
    -- 'view', 'click', 'screener_complete', 'signup', 'pro_subscribe', 'dismiss',
    -- 'winner_picked', 'challenger_generated', 'challenger_approved',
    -- 'challenger_rejected', 'slot_paused', 'slot_resumed'
  event_data jsonb,
    -- arbitrary: score, campaign_id, amount, etc.
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.experiment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read events" ON public.experiment_events FOR SELECT USING (public.is_admin());
  -- Writes via service key from worker

CREATE INDEX idx_events_slot_variant_type ON public.experiment_events(slot_id, variant_key, event_type, created_at);
CREATE INDEX idx_events_session ON public.experiment_events(session_id);
CREATE INDEX idx_events_user ON public.experiment_events(user_id) WHERE user_id IS NOT NULL;
```

---

## Runtime API

### `GET /experiment/variant?slot=<id>&session=<session_id>`

**Logic:**
1. Validate `slot` exists and `status='active'`
2. Check `experiment_assignments` for (session_id, slot_id) — if exists, return the existing variant's content (sticky)
3. Otherwise:
   - Load `experiment_variants` where `slot_id=X AND status='active'`
   - Load `experiment_slots.variant_stats`
   - Ensure every active variant has a posterior entry (seed `{alpha:1, beta:1, sends:0}` if missing)
   - Call `pickVariant(variant_stats)` — reuses Thompson sampler + cold-start logic from worker.js
   - Insert `experiment_assignments` row
   - Insert `experiment_events` row with `event_type='view'`, stamp `initial_utm` from URL if present
   - Bump `variant_stats[chosen].sends += 1`, persist to slot
4. Return `{ variant_key, content }`

**Caching:** none at first. Can add Cloudflare KV in a later phase if the variant endpoint becomes a hot path.

### `POST /experiment/event`

**Body:** `{ session_id, slot_id, event_type, event_data?, user_id? }`

**Logic:**
1. Look up `experiment_assignments` to find `variant_key`. If no assignment exists, accept the event with `variant_key=null` (still useful for raw event logging).
2. If `user_id` provided and `experiment_assignments.user_id` is null, stamp it (session → user link).
3. Insert `experiment_events` row.
4. Return `{ ok: true }`

**Rate limiting:** same pattern as existing worker endpoints (5 req/sec per IP). High-volume slots should batch events client-side.

### Frontend helper: `lib/experiment.js`

```js
const WORKER_URL = 'https://village-api.jorrelpatterson.workers.dev';

function getSessionId() {
  let sid = localStorage.getItem('mv_session');
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem('mv_session', sid);
  }
  return sid;
}

async function getVariant(slot) {
  const r = await fetch(WORKER_URL + '/experiment/variant?slot=' + encodeURIComponent(slot) + '&session=' + getSessionId());
  if (!r.ok) return { variant_key: 'a', content: null };  // graceful fallback
  return r.json();
}

function trackEvent(slot, event_type, event_data) {
  // Fire-and-forget; don't block page
  fetch(WORKER_URL + '/experiment/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: getSessionId(),
      slot_id: slot,
      event_type,
      event_data: event_data || null
    }),
    keepalive: true  // allows event to fire even during page unload
  }).catch(() => {});  // swallow errors; don't break the visitor's experience
}

// Conversion cascade: stamp user_id on all this session's assignments
async function linkSession(user_id) {
  fetch(WORKER_URL + '/experiment/link-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: getSessionId(), user_id })
  }).catch(() => {});
}
```

Loaded on every page via `<script src="/lib/experiment.js"></script>`.

### Example wiring: `landing_headline`

In `screener.html`:

```html
<h1 id="headline">[baseline headline — renders if JS fails]</h1>
<button id="startBtn">Take the free screener</button>

<script src="/lib/experiment.js"></script>
<script>
(async () => {
  const v = await getVariant('landing_headline');
  if (v.content) {
    document.getElementById('headline').textContent = v.content;
  }
})();

document.getElementById('startBtn').addEventListener('click', () => {
  trackEvent('landing_headline', 'click');
});

// When screener is submitted successfully:
function onScreenerComplete(score, risk_level) {
  trackEvent('landing_headline', 'screener_complete', { score, risk_level });
}
</script>
```

When the user signs up later:
```js
linkSession(user.id);
trackEvent('landing_headline', 'signup');
// Later when they subscribe:
trackEvent('landing_headline', 'pro_subscribe', { amount: 19.99 });
```

---

## Reward function + bandit logic

Reuses Phase 3 email-optimizer math. Per-slot `reward_metric` defines the linear weighting across event types. For a variant:

```
reward = Σ (event_count[type] × reward_metric[type]) for each type
normalized_reward = reward / (sends × max_possible_reward_per_send)
alpha = 1 + normalized_reward
beta  = 1 + (1 - normalized_reward)
```

On each variant assignment the `sends` counter increments. Bandit uses `pickVariant()` (Thompson sampling with cold-start uniform-random for first 5 sends).

**Example computations:**

| Event types logged | Variant A (100 sends) | Variant B (100 sends) |
|--------------------|----------------------|------------------------|
| view: 100, click: 15, screener: 5, pro: 1 | reward = 0 + 15 + 25 + 100 = 140 | — |
| view: 100, click: 40, screener: 12, pro: 3 | — | reward = 0 + 40 + 60 + 300 = 400 |
| max_reward per send = sum of rewards | 140/100 = 1.4 avg | 400/100 = 4.0 avg |
| Posterior | Beta(1+norm(1.4/106), 1+norm(0.014)) | Beta(1+0.038, 1+0.961) |

Where max_reward_per_send for the landing_headline slot is `0 + 1 + 5 + 100 = 106` (sum of weights, assuming at most one of each event per session).

**Winner detection (nightly cron per slot):**
1. Pull events since `last_optimized_at` for this slot
2. Recompute posteriors per active variant
3. If < `min_sends_per_variant` (50 default): continue
4. Sample 1000 times from each Beta → count wins per variant
5. If any variant wins > `confidence_threshold` (0.90 default): declare winner
6. Emit `winner_picked` event
7. Call `generateChallenger(slot, winner_content, win_probability)` via Claude
8. Insert new variant. If `deploy_mode='auto'`: retire losers + activate new immediately within the same cron run. Else: `status='pending_approval'`, no deploy until admin approves in UI. New assignments for this slot start using the updated variant set on the next `/experiment/variant` call.
9. Reset posterior for new variant to `{alpha:1, beta:1, sends:0}`; winner keeps posterior; losers removed.
10. Update `last_optimized_at`

**Why 50 sends minimum:** prevents premature convergence on small samples. A slot with 5 sends per variant is noise.

**Why 90% confidence:** Bayesian analog to classical p<0.1. Tighter thresholds (95%, 99%) delay winners when traffic is limited, leaving money on the table. 90% has been validated in Phase 3 email-optimizer.

---

## Meta Pixel + UTM capture (attribution layer)

**This was the original ask that led to this larger design.** Built into the framework so attribution is free.

### Meta Pixel
Add pixel snippet to base template of `index.html`, `screener.html`, `app.html`, `blog.html`. Emit standard events:

- `PageView` on every page load
- `InitiateCheckout` → fires from `trackEvent('landing_headline', 'click')`
- `CompleteRegistration` → fires from `trackEvent('landing_headline', 'screener_complete')`
- `Subscribe` → fires from `trackEvent(..., 'pro_subscribe')`

Hook: `lib/experiment.js` can emit Pixel events as a side effect of `trackEvent()` when the browser has `fbq` available. Zero extra code on individual pages.

### UTM capture
`getSessionId()` extended: on first call, parse `window.location.search` for `utm_source`, `utm_medium`, `utm_campaign`. Store in localStorage as `mv_utm_initial`. Pass to worker on first variant assignment — worker stamps into `experiment_assignments.initial_utm`.

All downstream conversions attribute through the chain: utm_source → session → variant → conversion.

### Sources Dashboard
New admin view:

```sql
-- Per-source Pro conversion funnel
SELECT
  ea.initial_utm->>'source' AS utm_source,
  count(DISTINCT ea.session_id) AS sessions,
  count(DISTINCT CASE WHEN ee.event_type = 'screener_complete' THEN ee.session_id END) AS screener_completes,
  count(DISTINCT CASE WHEN ee.event_type = 'signup' THEN ee.session_id END) AS signups,
  count(DISTINCT CASE WHEN ee.event_type = 'pro_subscribe' THEN ee.session_id END) AS pro_subs
FROM experiment_assignments ea
LEFT JOIN experiment_events ee ON ee.session_id = ea.session_id
WHERE ea.assigned_at > now() - interval '30 days'
GROUP BY ea.initial_utm->>'source';
```

---

## `marketing-experiments.md` — the program.md equivalent

Single file at repo root. Human-readable. Companion to the DB.

**Format:**

```markdown
# Marketing Experiments — Instructions to the AutoResearch Agent

Last human review: 2026-04-17 by Jorrel

## Brand constraints (apply to all challenger prompts)

- Voice: warm, direct, never clinical. Avoid "disorder", "deficit", "abnormal", "low-functioning".
- Tone: peer-to-peer (parent talking to parent), not authority-to-subordinate.
- Pricing: never discount below $14.99. Current Pro is $19.99/mo.
- No false urgency, no fear-mongering, no shaming. Empathy is the brand.
- Claude challenger prompts must respect these.

## Active slots

| Slot | Priority | Deploy mode | Kill threshold |
|------|----------|-------------|----------------|
| landing_headline | P0 | auto | if screener-complete drops 30%, revert |
| paywall_heading | P1 | approval | if Pro conversion drops 20% for 3 days, revert |
| meta_ad_hook_v1 | P1 | auto | if CPA > $100 for 7 days, pause slot |
...

## Experiment backlog (slots to add next)

- meta_ad_image_v1 — test image creative variants in Meta ads
- onboarding_first_coach_prompt — test what AI coach says first

## Kill switches

The following will automatically pause optimization:
- Bounce rate > 5% on any email-related slot in 24 hours (already in email cron)
- Pro conversion rate drops below baseline × 0.7 for 48 hours
- Anyone reports legal/HIPAA concern

## Quarterly review
Review this doc + each slot's performance every 90 days.
Retire stagnating slots. Add new ones per backlog.
```

The nightly cron doesn't parse this file. Humans edit it. The file IS the research-org programming. Brand constraints are included in each slot's `challenger_prompt` as a preamble so Claude stays in-bounds.

---

## Admin UX

### Experiment Slots Dashboard

List view at `admin.html` (new section on Leads page, or new tab). Columns:
- Slot ID, description, status, deploy_mode
- Active variants count
- Top variant's win probability (mini bar)
- Total sends today
- Last optimized

Click row → Slot Detail View.

### Slot Detail View (modal or dedicated section)

- Slot config (editable: prompt, reward_metric, confidence_threshold, min_sends)
- Variants table: variant_key, content preview, status, α, β, sends, win_prob
- Outcomes chart: line plot of reward over time, per variant
- Recent 100 events
- Actions: pause slot, generate challenger now (bypass min_sends gate), edit challenger_prompt

### Approval Queue

List of `experiment_variants.status='pending_approval'`:
- Shows proposed content next to current winner
- "Why this was generated" — the `winner_picked` event data (reward history of the winner it's iterating on)
- Approve → activates it, retires losers
- Reject → variant stays with `status='retired'` and a note; the Claude prompt is tweaked for next attempt
- Edit → modify Claude's suggestion before approving

### Performance Attribution Dashboard

- Funnel view per slot: variants → clicks → screener completes → signups → Pro
- Source breakdown: per slot × per utm_source
- "What's working?" panel: 3 slots with most recent winners + their content

---

## Integration with existing Phase 3 email bandit

**Phase 1 (this build):** don't migrate. Build the framework for new slots. Email bandit keeps running in `worker.js`.

**Phase 2 (later, separate build):** migrate email bandit. Each email step becomes a slot (`email_screener_day_3`, `email_bcba_step_5`, etc). `campaigns.sequence_steps[N].variants[]` migrates into `experiment_variants`. `campaign_sends` outcomes migrate into `experiment_events`. Retire the old `AUTORESEARCH: Email Campaign Auto-Optimization` cron block.

Phase 2 is deferred because:
- Email bandit works today — don't risk regression
- Email has unique semantics (send queue, reply tracking) not present in other slots
- Better to prove the framework on net-new slots first

---

## Rollout priority

Within the framework build, ship slots in this order (each one ~1 hour of work once framework is up):

| Order | Slot | Why |
|-------|------|-----|
| 1 | `landing_headline` | Highest traffic, highest drop-off point |
| 2 | `landing_cta_button` | Cheap test, compounds with headline |
| 3 | `meta_ad_hook_v1..N` | Directly reduces CAC on paid ads |
| 4 | `paywall_heading` | Biggest $ per conversion |
| 5 | `blog_cta_*` (per post) | Passive SEO optimization |
| 6 | `onboarding_welcome` | Retention lever |
| 7 (Phase 2) | Email bandit migration | Unify under framework |

---

## Key design tradeoffs (decisions locked)

| Decision | Alternative | Rationale |
|----------|-------------|-----------|
| Each slot tests ONE field | Multivariate combinations | Simpler, works with lower traffic, clearer winner semantics |
| Variants in DB | Variants in code via feature flags | Add variants without deploy; supports Claude auto-generation |
| Session_id in localStorage | Signed cookie with HMAC | Simpler; not auth-sensitive, just a stable ID |
| `marketing-experiments.md` human-only | Parsed config driving agent | Source of truth is DB; markdown is human-readable companion |
| Thompson sampling + Beta posterior | Contextual bandit (ML model per slot) | Phase 3 proved this works; reuse math |
| Parallel to email bandit, no migration | Migrate email bandit first | Don't risk regression on working infra |
| Per-slot reward_metric JSONB | Global metric | Different slots optimize different things |
| Sticky assignment per session | Re-randomize per visit | Avoids confusing "different headline now" experience |
| Challenger auto-deploys for auto slots | Always human review | Email pattern proved auto-deploy works with significance gate |
| `deploy_mode='approval'` for high-stakes slots | Everything auto | Paywall / onboarding / pricing deserve human sanity check |

---

## Success metrics (how we know it's working)

| Metric | Target Month 1 | Target Month 3 |
|--------|---------------|-----------------|
| Slots live | 5 | 15 |
| Winners declared | 2 | 10 |
| Auto-deployed challengers | 2 | 8 |
| Approval-gate challengers reviewed | 0 | 3 |
| Landing headline CTR improvement | +10% | +30% |
| Paywall conversion improvement | baseline | +15% |
| CAC from Meta Ads | baseline | -25% |
| Attribution clarity (% of conversions with utm_source) | 80% | 95% |

---

## Open implementation questions

(Defer to writing-plans phase, not blocking spec.)

1. Where does `lib/experiment.js` live? Served from Worker, or from Supabase Storage, or from `modernvillage.app/lib/experiment.js` (Vercel)?
2. How are baseline variants seeded? Manually in admin UI, or via a seed migration?
3. Should `experiment_events` be partitioned by month to prevent table bloat? (Postgres doesn't auto-partition; could add on Year 2.)
4. Meta Pixel loading — script-tag in base template, or npm-installed + built? (Modern Village has no build system, so script-tag.)
5. How long does an unfinished experiment persist before a human reviews? Kill-switch if no winner for 30 days?
