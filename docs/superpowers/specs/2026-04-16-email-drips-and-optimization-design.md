# Email Drips + Continual Optimization — Design

**Date:** 2026-04-16
**Status:** Approved scope, pending implementation plan

---

## Goal

Wire the remaining email drip sequences (parent + B2B cold) and ship a continual optimization layer alongside them, so every send produces data that improves the next one.

## Scope

**In scope (one bundled effort):**
1. **Sequence A — Screener follow-up** (Days 3, 7, 10) for screener leads who completed M-CHAT-R but didn't sign up for the app
2. **Sequence B — Multi-touch re-engagement** (Days 7, 14, 21) for inactive parent accounts, replacing the current single-email re-engage at [worker.js:719-778](../../../worker.js#L719-L778)
3. **Sequence C — B2B cold sequences** (9 emails × 3 cohorts: BCBAs, Districts, Regional Centers) loaded as `status='draft'` for in-place editing in admin
4. **Optimization layer** — reply tracking, conversion attribution, auto-promote winners, per-step + per-cohort scope, multi-armed bandit (Thompson sampling), send-time learning
5. **Deliverability isolation** — `outreach.modernvillage.app` subdomain in Resend with per-cohort sub-subdomains (`bcba.outreach`, `district.outreach`, `rc.outreach`)
6. **Auto-enroll lead queue** with daily warmup-aware cap + admin override

**Out of scope (deferred to Phase 3):**
- Per-recipient AI rewrites (high cost, marginal gain over cohort-level tuning, no safety gate yet)
- Body copy optimization (layer on after subject lines stabilize)
- Inbox placement testing / seed lists

## Why

- **Marketing-side:** 16K+ scraped leads sitting idle. The infra exists (`campaigns`, `sequence_enrollments`, `campaign_sends`, autoresearch cron) but content + glue is missing.
- **Optimization-side:** the existing autoresearch cron at [worker.js:1098-1171](../../../worker.js#L1098-L1171) only handles one-shot blasts (`is_sequence=false`), only measures opens+clicks, and logs new variants without deploying them. To make "continual optimization" a real claim for cold sequences we need the six features above shipped together.
- **Deliverability:** blasting 15K cold from `hello@modernvillage.app` would tank the domain reputation that delivers parent transactional emails (Stripe receipts, Pro signups, booking reminders). Subdomain isolation is non-negotiable.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ DAILY CRON (worker.js scheduled)                                 │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ Sequence A       │  │ Sequence B       │  │ Sequence C    │ │
│  │ Screener D3/7/10 │  │ Re-engage 7/14/21│  │ Cold (queue)  │ │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬───────┘ │
│           │                     │                    │         │
│           └─────────┬───────────┴──────────┬─────────┘         │
│                     ▼                      ▼                    │
│            ┌─────────────────┐    ┌────────────────────┐       │
│            │ Send Queue      │    │ Per-Recipient      │       │
│            │ Daily cap aware │    │ Send-Time Selector │       │
│            └────────┬────────┘    └────────┬───────────┘       │
│                     └─────────┬────────────┘                    │
│                               ▼                                 │
│                  ┌────────────────────────┐                     │
│                  │ Bandit Variant Picker  │ (Thompson sampling) │
│                  │ Per cohort × step      │                     │
│                  └────────┬───────────────┘                     │
│                           ▼                                     │
│                  ┌────────────────────────┐                     │
│                  │ Resend POST            │ (outreach subdomain)│
│                  │ Tagged: cohort/step/v  │                     │
│                  └────────┬───────────────┘                     │
└───────────────────────────┼─────────────────────────────────────┘
                            ▼
        ┌──────────────────────────────────────────┐
        │ campaign_sends row written               │
        │ status=sent, sequence_step, variant set  │
        └──────────────┬───────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────────┐
        │ INBOUND SIGNALS (webhooks + cron checks) │
        │  • Resend webhook → opened/clicked/bounce│
        │  • Resend inbound → replied              │
        │  • Auth.signups + bookings → converted   │
        └──────────────┬───────────────────────────┘
                       ▼
        ┌──────────────────────────────────────────┐
        │ NIGHTLY OPTIMIZER CRON                   │
        │  1. Update bandit posteriors per variant │
        │  2. If significance reached → AI-gen new │
        │     variant, rotate loser out            │
        │  3. Update lead.best_open_hour           │
        │  4. Log to email_optimization_logs       │
        └──────────────────────────────────────────┘
```

---

## Schema Changes

### New columns on `campaigns`
```sql
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS cohort text;
  -- 'screener', 're_engage', 'bcba', 'district', 'rc', 'parent_welcome'
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS subdomain text;
  -- e.g., 'bcba.outreach.modernvillage.app'
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS variant_stats jsonb DEFAULT '{}';
  -- per-step Thompson sampling state: { "step_0": { "a": {alpha: 5, beta: 12}, ... } }
```

### New columns on `campaign_sends`
```sql
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS sequence_step integer;
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS replied_at timestamptz;
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS converted_at timestamptz;
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS conversion_type text;
  -- 'signup', 'booking', 'demo_scheduled', 'subscribed'
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS sent_hour smallint;
  -- 0-23, used for send-time analysis
```

### New columns on `leads`
```sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS unsubscribed boolean DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS unsubscribe_token text DEFAULT encode(gen_random_bytes(16), 'hex');
ALTER TABLE leads ADD COLUMN IF NOT EXISTS bounced boolean DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS best_open_hour smallint;
  -- learned per-recipient send time (NULL = use cohort default)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_user_id uuid REFERENCES profiles(id);
  -- if this lead became a real user, link them
```

### New table: `email_send_queue`
```sql
CREATE TABLE email_send_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  cohort text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  priority integer DEFAULT 100,  -- lower = sent first; admin can bump
  status text DEFAULT 'queued',  -- 'queued', 'sent', 'skipped'
  created_at timestamptz DEFAULT now(),
  UNIQUE(campaign_id, lead_id)
);
CREATE INDEX idx_send_queue_due ON email_send_queue(scheduled_for, priority) WHERE status = 'queued';
```

### Sequence step format (campaigns.sequence_steps JSONB)
```json
[
  {
    "step": 0,
    "day": 0,
    "variants": [
      {"id": "a", "subject": "Quick question about your ABA documentation workflow", "body_html": "..."},
      {"id": "b", "subject": "How much time do you spend on session notes each week?", "body_html": "..."}
    ]
  }
]
```
Currently the `sequence_steps` JSONB stores a single subject/body per step. We're extending each step to hold a `variants` array.

**Backward compatibility:** the sequence processor at [worker.js:881-960](../../../worker.js#L881-L960) currently reads `step.subject` and `step.html`. Update the reader to: if `step.variants` exists, use bandit picker; otherwise fall back to treating the step itself as a single 'a' variant. This keeps any existing draft sequences working without a forced data migration.

### Source-table mapping (clarifies which table each sequence reads from)

| Sequence | Audience source table | Enrollment mechanism |
|----------|----------------------|----------------------|
| A. Screener follow-up | `screener_leads` | `screener_leads.last_step_sent` int + dedicated cron block |
| B. Re-engagement | `profiles` | `profiles.last_re_engage_step` int + dedicated cron block |
| C. B2B cold | `leads` | `sequence_enrollments` table + `email_send_queue` (the new general-purpose pipe) |

The send queue + bandit + optimization layer are shared across all three. The enrollment trigger differs because the audiences live in different tables.

---

## Components

### 1. Sequence A — Screener Follow-up (Days 3, 7, 10)
**Trigger:** `screener_leads` table where `enrolled_in_sequence=true`, `unsubscribed=false`, age relative to `created_at` matches a step day, and that step hasn't been sent (track via new `screener_leads.last_step_sent` column).

Day 0 already fires at [worker.js:780-822](../../../worker.js#L780-L822). New steps:
- **Day 3:** "What ABA actually looks like at home" — reframes screener outcome into actionable next-step
- **Day 7:** "3 strategies that work whether or not your child has a diagnosis" — value drop, soft CTA
- **Day 10:** "Last reminder — your free strategies are waiting" — final pitch with social proof

Content: pull from `_reference/modern-village-email-sequences.docx` (Sequence 1).

### 2. Sequence B — Multi-touch Re-engagement (Days 7, 14, 21)
**Trigger:** parent profiles with `email_marketing_opted_in=true`, no `behavior_logs` in N days, and `last_re_engage_step_sent_at` not within last 7 days.

Replace the single-email re-engage at [worker.js:719-778](../../../worker.js#L719-L778). New columns on `profiles`:
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_re_engage_step integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_re_engage_sent_at timestamptz;
```

Steps:
- **Day 7 inactive:** "We noticed you've been quiet — anything we can help with?" (gentle, no pressure)
- **Day 14 inactive:** "Pro tip you missed" (value-driven, single tip aimed at a common stuck point)
- **Day 21 inactive:** "We're holding your spot — come back when you're ready" (final touch, then stop)

Content: pull from docx (Sequence 3).

### 3. Sequence C — B2B Cold (BCBAs / Districts / Regional Centers)
**Three campaigns**, each with `is_sequence=true`, `cohort` set, `status='draft'`. 9 steps each. Loaded into the campaigns table by a one-time seed migration.

**Cadence per cohort:** Day 0, 3, 7, 10, 14, 21, 28, 35, 45.

**Cohort-specific angles (themes for the 9 emails):**
- **BCBA:** documentation pain → time-saved framing → AI clinical narrative demo → superbill walkthrough → Ariana's testimonial → marketplace earning potential → free trial CTA → final value drop → break-up email
- **District:** parent-engagement gap → IEP dispute reduction → pricing breakdown → case study → SELPA fit → coordinator dashboard demo → pilot proposal → final pitch → break-up
- **Regional Center:** Family Support Services tie-in → caregiver mental health pillar → waitlist relief framing → Ariana credentials → 1-on-1 demo offer → small pilot proposal → outcome data sharing → final pitch → break-up

Loaded as drafts. Ariana edits BCBA copy in admin panel before flipping `status` to `active`.

### 4. Lead Queue + Warmup (Hybrid C from brainstorming)
**Auto-enroll:** when scrapers add new leads, insert a row into `email_send_queue` for the appropriate cohort sequence (Day 0, scheduled for "today + position-in-warmup").

**Daily cap (per subdomain) — configurable in admin:**
- Week 1: 50/day
- Week 2: 100/day
- Week 3: 250/day
- Week 4+: 500/day, scale based on bounce rate

**Cron logic:**
1. Pull next N items from `email_send_queue` where `status='queued' AND scheduled_for <= now()` ordered by `priority, scheduled_for`
2. For each: skip if lead is `unsubscribed` or `bounced`; otherwise send
3. Mark queue row `status='sent'`, advance `sequence_enrollments.current_step`

**Admin override:** UI to (a) pause a cohort's queue, (b) bump specific lead IDs to `priority=1`.

### 5. Optimization Layer — six features

#### 5a. Reply tracking
Set up Resend inbound webhook → POST to new endpoint `/webhook/resend-inbound` in worker.js. Match incoming email's `In-Reply-To` header to a `campaign_sends.resend_id` → set `replied_at`. Reply weighted **10x opens** in the bandit reward function.

#### 5b. Conversion attribution
On signup ([worker.js:204-244](../../../worker.js#L204-L244)) and booking creation, check if the email matches a `campaign_sends.email`. If yes, set `campaign_sends.converted_at` and `conversion_type`. Also link `leads.converted_user_id`.

Conversion weighted **100x opens** in the bandit reward function.

**Reward function:** `reward = 1*opens + 5*clicks + 10*replies + 100*conversions` per send.

#### 5c. Auto-promote winners (with significance gate)
Nightly optimizer cron, per `(campaign_id, sequence_step)`:
1. Compute reward per variant
2. **Significance gate:** require min 50 sends per variant AND Bayesian probability that winner > loser > 90% (Thompson sampling makes this natural — see 5e)
3. If gate passed: log `winner_picked`, call Claude to generate 1 new challenger variant iterating on the winner's hook, **insert it into `campaigns.sequence_steps[step].variants`** and remove the loser. Bandit state for the step resets for the new variant only (winner keeps its posterior).

#### 5d. Per-step + per-cohort scope
All optimization queries are scoped by `(cohort, sequence_step)`. BCBA step 3 optimizes against BCBA step 3 only. Use `campaigns.cohort` + `campaign_sends.sequence_step` as the join key.

#### 5e. Thompson sampling (multi-armed bandit)
Replaces pure A/B for variant selection. Each variant tracks Beta distribution `(alpha, beta)` per step in `campaigns.variant_stats`:
- `alpha = successes + 1` (where success = weighted reward)
- `beta = failures + 1`
- On each send: sample one number from each variant's Beta distribution, pick the variant with the highest sample
- Naturally explores under-tested variants while exploiting winners
- Handles RC's 21 leads (no min sample needed) AND BCBA's 15K elegantly

#### 5f. Send-time learning (per-recipient)
Track open hour per recipient. Cron rolls up `leads.best_open_hour = mode(hour FROM opened campaign_sends WHERE lead_id = X)`. Send-time selector schedules tomorrow's queued sends at each lead's best hour (cohort default fallback for new leads).

---

## Admin UX

Existing admin panel has campaign management. New views needed:

1. **Sequence builder** — extend existing builder to support multiple variants per step (currently single subject/body)
2. **Cohort dashboard** — per-cohort: send queue depth, daily cap progress, bounce/unsubscribe rate, top winning subjects, Bandit posterior visualization
3. **Optimization log viewer** — recent `winner_picked` and `new_variant_generated` events, with one-click "approve & deploy" or "reject" for AI-generated variants (default: auto-deploy if confidence > 90%)
4. **Lead queue manager** — view queued sends, bump priority, pause cohort

---

## Deliverability Setup

**Resend:**
1. Add `outreach.modernvillage.app` domain (verify SPF/DKIM/DMARC)
2. Add per-cohort sub-subdomains: `bcba.outreach.modernvillage.app`, `district.outreach.modernvillage.app`, `rc.outreach.modernvillage.app`
3. Each cohort sends from its own subdomain (e.g., `team@bcba.outreach.modernvillage.app`)

**DNS:**
- SPF, DKIM, DMARC records per subdomain (Resend provides values)
- BIMI later (after reputation is established)

**Warmup:**
- Daily cap config in admin (defaults above)
- Cron rejects sends above daily cap, leaves them queued for next day
- Bounce rate >5% in 24hr window → cron auto-pauses cohort, alerts admin

---

## Testing Approach

1. **Unit-style cron tests:** stub Supabase + Resend, run cron with seeded scenarios (lead at day 7, lead unsubscribed, queue depth > cap, etc.)
2. **End-to-end test cohort:** seed 10 test leads with `email LIKE '%@modernvillage-test.app'`, run full sequences against them, verify bandit state advances correctly
3. **Manual smoke:** Jorrel runs the cron locally with Wrangler, sends to his own email + Ariana's
4. **Production warmup:** first week sends only to a 50-lead test cohort hand-picked by Jorrel

Add to TESTING-GUIDE.md once shipped.

---

## Out of Scope (Deferred Phases)

**Phase 3 (revisit at 1K conversions):**
- Per-recipient AI rewrites (NPI specialty / district demographics → personalized opening line)
- Body copy multivariate testing (CTA wording, length, opening line as separate bandit arms)
- Inbox placement testing (seed list across Gmail/Outlook/Yahoo/etc.)
- Reply sentiment classification (positive vs negative reply → different next step)

These all require either more lead enrichment data or more conversion volume than we have at launch. Revisit when sequences are stable and producing meaningful win/loss data.

---

## Open Questions for Implementation

(To resolve in writing-plans phase, not blocking spec approval.)

1. Resend inbound webhook setup — does Resend support inbound parsing on subdomains, or do we need a separate inbound provider?
2. Send-time selector when warmup cap is binding — do we send at cap regardless of best hour, or hold for next day?
3. Bandit cold-start — first 3-5 sends per variant should be uniform random before Thompson kicks in?
4. Ariana's review workflow for BCBA copy — does she edit in admin, or do we mirror to a Google Doc?
