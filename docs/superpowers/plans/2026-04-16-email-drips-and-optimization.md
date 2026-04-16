# Email Drips + Continual Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire all remaining email drip sequences (parent-facing + B2B cold) plus a continual optimization layer (reply tracking, conversion attribution, Thompson sampling bandit, send-time learning, auto-promote winners) so every send produces data that improves the next one.

**Architecture:** All sends flow through a daily cron in `worker.js` that writes to Supabase. Three sequence types share the same optimization layer and `campaign_sends` table. Cold B2B sequences additionally use a new `email_send_queue` table for warmup-aware pacing, and a new `outreach.modernvillage.app` Resend subdomain for reputation isolation.

**Tech Stack:** Cloudflare Worker (vanilla JS), Supabase Postgres, Resend (transactional + inbound), Anthropic Claude API for variant generation, vanilla HTML admin panel.

**Spec:** [docs/superpowers/specs/2026-04-16-email-drips-and-optimization-design.md](../specs/2026-04-16-email-drips-and-optimization-design.md)

**Verification approach (no test framework in repo):** Each task ends with a verify step using either (a) `wrangler dev` + curl + Supabase SQL inspection, or (b) seeded test rows + manual cron invocation. Real test cohort uses `email LIKE '%@modernvillage-test.app'` (Jorrel's verified inbox).

**Commit cadence:** one commit per task. Each commit message includes `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility | Phase |
|------|---------------|-------|
| `supabase/migrations/20260416_email_drips_optimization.sql` | All schema changes (new columns + email_send_queue table) | 1 |
| `worker.js` | Cron logic (sequence dispatch, queue processor, optimization, webhooks) | 2-5 |
| `admin.html` | Admin UI extensions (variants, cohort dashboard, queue manager, optimization log viewer) | 6 |
| `docs/ROADMAP.md` | Mark email drips done, link this plan | 7 |
| `docs/SUPPLEMENTARY.md` | Update §5 (Email Drips) with optimization layer notes | 7 |
| `docs/TESTING-GUIDE.md` | Add testing section for sequences + bandit | 7 |
| `docs/legal/RESEND-SUBDOMAIN-SETUP.md` | New: DNS setup instructions for outreach subdomain | 1 |

---

## Phase 1: Foundation

### Task 1: Schema Migration

**Files:**
- Create: `supabase/migrations/20260416_email_drips_optimization.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- ═══════════════════════════════════════════════════
-- Email Drips + Continual Optimization
-- 2026-04-16
-- Spec: docs/superpowers/specs/2026-04-16-email-drips-and-optimization-design.md
-- ═══════════════════════════════════════════════════

-- ─── campaigns: cohort scoping + bandit state ───
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS cohort text;
  -- 'screener', 're_engage', 'bcba', 'district', 'rc', 'parent_welcome'
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS subdomain text;
  -- e.g., 'bcba.outreach.modernvillage.app'
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS variant_stats jsonb DEFAULT '{}'::jsonb;
  -- per-step Thompson posterior:
  -- { "step_0": { "a": {"alpha": 5, "beta": 12, "sends": 16}, "b": {...} }, ... }
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS daily_cap integer DEFAULT 50;
  -- per-subdomain warmup cap, configurable in admin
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS auto_paused_at timestamptz;
  -- set by bounce-rate guard, cleared manually in admin

CREATE INDEX IF NOT EXISTS idx_campaigns_cohort ON public.campaigns(cohort) WHERE cohort IS NOT NULL;

-- ─── campaign_sends: per-step + reply/conversion + send-time tracking ───
ALTER TABLE public.campaign_sends ADD COLUMN IF NOT EXISTS sequence_step integer;
ALTER TABLE public.campaign_sends ADD COLUMN IF NOT EXISTS replied_at timestamptz;
ALTER TABLE public.campaign_sends ADD COLUMN IF NOT EXISTS converted_at timestamptz;
ALTER TABLE public.campaign_sends ADD COLUMN IF NOT EXISTS conversion_type text;
  -- 'signup', 'booking', 'demo_scheduled', 'subscribed'
ALTER TABLE public.campaign_sends ADD COLUMN IF NOT EXISTS sent_hour smallint;
  -- 0-23, used for send-time analysis

CREATE INDEX IF NOT EXISTS idx_sends_step ON public.campaign_sends(campaign_id, sequence_step);
CREATE INDEX IF NOT EXISTS idx_sends_email_lookup ON public.campaign_sends(email, created_at);
  -- for conversion attribution by email match

-- ─── leads: unsubscribe / bounce / send-time / conversion link ───
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS unsubscribed boolean DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS unsubscribe_token text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS bounced boolean DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS best_open_hour smallint;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS converted_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS converted_user_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS cohort text;
  -- if NULL, lead.lead_type drives cohort selection at enroll time

-- Backfill unsubscribe_token for existing leads
UPDATE public.leads SET unsubscribe_token = encode(gen_random_bytes(16), 'hex')
  WHERE unsubscribe_token IS NULL;

-- ─── screener_leads: track which step in screener follow-up was last sent ───
ALTER TABLE public.screener_leads ADD COLUMN IF NOT EXISTS last_step_sent integer DEFAULT 0;
ALTER TABLE public.screener_leads ADD COLUMN IF NOT EXISTS last_step_sent_at timestamptz;

-- ─── profiles: track multi-touch re-engagement progression ───
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_re_engage_step integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_re_engage_sent_at timestamptz;

-- ─── new table: email_send_queue (warmup-aware pacing) ───
CREATE TABLE IF NOT EXISTS public.email_send_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  cohort text NOT NULL,
  sequence_step integer NOT NULL DEFAULT 0,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  priority integer DEFAULT 100,  -- lower = sent first; admin can bump to 1
  status text DEFAULT 'queued',  -- 'queued', 'sent', 'skipped'
  skipped_reason text,
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  UNIQUE(campaign_id, lead_id, sequence_step)
);

ALTER TABLE public.email_send_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage send queue" ON public.email_send_queue FOR ALL USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_send_queue_due
  ON public.email_send_queue(cohort, scheduled_for, priority)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_send_queue_lead
  ON public.email_send_queue(lead_id);
```

- [ ] **Step 2: Apply migration to Supabase**

Run via Supabase SQL Editor or `supabase db push` (whichever workflow Jorrel uses for this repo). Verify success with:

```sql
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'campaigns' AND column_name IN ('cohort', 'subdomain', 'variant_stats', 'daily_cap', 'auto_paused_at');
-- Expected: 5 rows

SELECT column_name FROM information_schema.columns
  WHERE table_name = 'campaign_sends' AND column_name IN ('sequence_step', 'replied_at', 'converted_at', 'conversion_type', 'sent_hour');
-- Expected: 5 rows

SELECT column_name FROM information_schema.columns
  WHERE table_name = 'email_send_queue';
-- Expected: 11 rows
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260416_email_drips_optimization.sql
git commit -m "$(cat <<'EOF'
feat: schema for email drip sequences + optimization layer

Adds cohort scoping, bandit variant stats, reply/conversion tracking,
send-time learning, and email_send_queue table for warmup-aware pacing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Document Resend Subdomain Setup (manual DNS work for Jorrel)

**Files:**
- Create: `docs/legal/RESEND-SUBDOMAIN-SETUP.md`

- [ ] **Step 1: Write setup instructions**

```markdown
# Resend Subdomain Setup — Outreach (Cold B2B)

Manual steps for Jorrel to isolate cold-outbound reputation from transactional
email reputation. Do this BEFORE flipping any cold sequence to `status='active'`.

## 1. Add subdomains in Resend dashboard

In https://resend.com/domains add three subdomains:

- `bcba.outreach.modernvillage.app`
- `district.outreach.modernvillage.app`
- `rc.outreach.modernvillage.app`

Resend will show DNS records (SPF/DKIM/DMARC) per subdomain.

## 2. Add DNS records in your DNS provider

For each subdomain, add the records Resend provides. Three TXT records per subdomain:

- SPF (`v=spf1 include:_spf.resend.com ~all`)
- DKIM (`resend._domainkey.<sub>` → long key Resend provides)
- DMARC (`_dmarc.<sub>` → `v=DMARC1; p=none; rua=mailto:dmarc@modernvillage.app`)

Wait ~10 minutes for propagation, then click "Verify" in Resend.

## 3. Set Cloudflare Worker secrets (per-subdomain sender addresses)

```bash
wrangler secret put SENDER_BCBA       # value: "Modern Village BCBA Network <team@bcba.outreach.modernvillage.app>"
wrangler secret put SENDER_DISTRICT   # value: "Modern Village for Districts <team@district.outreach.modernvillage.app>"
wrangler secret put SENDER_RC         # value: "Modern Village for Regional Centers <team@rc.outreach.modernvillage.app>"
wrangler secret put SENDER_TRANSACTIONAL  # value: "Modern Village <hello@modernvillage.app>"
```

## 4. Update each cold campaign row to use its subdomain

After creating the BCBA/District/RC campaign rows (Task 19), set
`campaigns.subdomain` to match. The cron reads this when picking the sender.

## 5. Warmup pacing

DO NOT activate cold campaigns until you've confirmed:
- All three subdomains show "Verified" in Resend
- DMARC reports start flowing (24-48hr)
- `daily_cap` is set to 50 for week 1 (default in schema)
```

- [ ] **Step 2: Commit**

```bash
git add docs/legal/RESEND-SUBDOMAIN-SETUP.md
git commit -m "$(cat <<'EOF'
docs: Resend subdomain setup for cold outreach reputation isolation

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2: Sequence A — Screener Follow-up (Days 3, 7, 10)

### Task 3: Wire Screener Days 3/7/10 in Daily Cron

**Files:**
- Modify: `worker.js` (insert new cron block after the existing screener Day 0 logic at line 822)

Day 0 already exists at [worker.js:780-822](../../worker.js#L780-L822). We add Days 3, 7, 10 as a single new block that uses `screener_leads.last_step_sent` to advance.

**Content sourcing:** before this task, manually extract the Day 3/7/10 emails from `_reference/modern-village-email-sequences.docx` (Sequence 1) into the code below as `BODY_DAY_3`, `BODY_DAY_7`, `BODY_DAY_10`. If docx is unavailable or stale, use the placeholder copy below as a starting point — Jorrel approves the final copy before activating.

- [ ] **Step 1: Insert the new cron block**

In `worker.js`, after the closing `}` of the screener auto-enroll block (around line 822, just before `// -- WEEKLY DIGEST: Fridays only --`), insert:

```javascript
  // -- SCREENER FOLLOW-UP: Days 3, 7, 10 --
  // Advance screener_leads through the 4-email sequence (Day 0 = on signup, handled above).
  try {
    const STEPS = [
      // Day 3: reframe screener outcome into actionable next step
      { day: 3, subject: 'What ABA actually looks like at home', heading: 'A glimpse of what works', html_body:
        '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:0 0 20px">Hi {NAME}, when parents take the M-CHAT-R, the next question is usually: now what?</p>' +
        '<div style="background:#FDF8F0;border-radius:12px;padding:20px;margin:16px 0;border-left:4px solid #7A9E7E">' +
        '<p style="margin:0;color:#2D2D2D;font-size:15px;line-height:1.6">ABA at home isn\'t about clinical drills. It\'s small things: pairing a request with a visual, giving a 2-minute warning before transitions, noticing what triggers meltdowns and what calms them.</p>' +
        '</div>' +
        '<p style="color:#6B6560;font-size:15px;line-height:1.6">Modern Village walks you through these one at a time, personalized to your child &mdash; whether or not you have a diagnosis yet.</p>' +
        '<div style="text-align:center;margin:24px 0">' +
        '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 32px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px">Try it free</a>' +
        '</div>'
      },
      // Day 7: 3 strategies, value drop, soft CTA
      { day: 7, subject: '3 strategies that work whether or not your child has a diagnosis', heading: 'Three things you can try this week', html_body:
        '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:0 0 20px">Hi {NAME}, no platform sign-up needed &mdash; just three strategies that come up again and again from the BCBA-led families on Modern Village.</p>' +
        '<div style="background:#FDF8F0;border-radius:12px;padding:20px;margin:16px 0;border-left:4px solid #7A9E7E">' +
        '<p style="margin:0 0 12px;font-size:15px;color:#2D2D2D"><strong>1. First-Then language.</strong> "First shoes, then iPad." Reduces transition resistance by ~40% in most kids.</p>' +
        '<p style="margin:0 0 12px;font-size:15px;color:#2D2D2D"><strong>2. Visual schedules.</strong> Pictures of the morning routine on the fridge. Removes the "what\'s next" anxiety.</p>' +
        '<p style="margin:0;font-size:15px;color:#2D2D2D"><strong>3. Catch-them-being-good.</strong> Specific praise within 5 seconds. Builds the behaviors you want.</p>' +
        '</div>' +
        '<p style="color:#6B6560;font-size:15px;line-height:1.6">If any of these resonate, the AI Coach in Modern Village will tailor the rest to your child.</p>' +
        '<div style="text-align:center;margin:24px 0">' +
        '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 32px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px">Open Modern Village</a>' +
        '</div>'
      },
      // Day 10: final pitch with social proof
      { day: 10, subject: 'Last reminder — your free strategies are waiting', heading: 'Before we stop reaching out', html_body:
        '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:0 0 20px">Hi {NAME}, this is the last email in this series. We don\'t want to clutter your inbox.</p>' +
        '<div style="background:#FDF8F0;border-radius:12px;padding:20px;margin:16px 0;border-left:4px solid #C4745A">' +
        '<p style="margin:0;color:#2D2D2D;font-size:15px;line-height:1.6">Thousands of families &mdash; with and without diagnoses &mdash; use Modern Village daily for ABA-based strategies, behavior tracking, and a community that gets it.</p>' +
        '</div>' +
        '<p style="color:#6B6560;font-size:15px;line-height:1.6">Your screening result is still on file and free strategies are still waiting whenever you\'re ready.</p>' +
        '<div style="text-align:center;margin:24px 0">' +
        '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 32px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px">Get Started Free</a>' +
        '</div>'
      }
    ];

    for (let i = 0; i < STEPS.length; i++) {
      const step = STEPS[i];
      const stepNum = i + 1;  // step 1 = Day 3, step 2 = Day 7, step 3 = Day 10 (Day 0 was step 0)
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - step.day);
      const cutoffStart = cutoff.toISOString().split('T')[0] + 'T00:00:00';
      const cutoffEnd = cutoff.toISOString().split('T')[0] + 'T23:59:59';

      const dueRes = await fetch(supaUrl + '/rest/v1/screener_leads?marketing_consent=eq.true&unsubscribed=eq.false&enrolled_in_sequence=eq.true&last_step_sent=eq.' + (stepNum - 1) + '&created_at=gte.' + cutoffStart + '&created_at=lte.' + cutoffEnd + '&select=id,email,parent_name,unsubscribe_token', { headers });
      const dueLeads = await dueRes.json();

      for (const sl of (dueLeads || [])) {
        if (!sl.email) continue;
        const unsubUrl = 'https://village-api.jorrelpatterson.workers.dev/unsubscribe?token=' + encodeURIComponent(sl.unsubscribe_token) + '&source=screener';
        const personalized = step.html_body.replace(/\{NAME\}/g, sl.parent_name || 'there');

        const fullBody = (
          '<h1 style="font-size:24px;font-weight:800;color:#2D2D2D;margin:0 0 8px">' + step.heading + ' &#127807;</h1>' +
          personalized
        );

        try {
          const sendR = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Modern Village <hello@modernvillage.app>',
              to: sl.email,
              subject: step.subject,
              html: emailWrapper(fullBody, unsubUrl),
              tags: [{ name: 'sequence', value: 'screener' }, { name: 'step', value: String(stepNum) }]
            })
          });
          if (sendR.ok) {
            await fetch(supaUrl + '/rest/v1/screener_leads?id=eq.' + sl.id, {
              method: 'PATCH', headers,
              body: JSON.stringify({ last_step_sent: stepNum, last_step_sent_at: new Date().toISOString() })
            });
          }
        } catch (e) { console.error('Screener step ' + stepNum + ' send error:', e); }

        await new Promise(r => setTimeout(r, 500));
      }
    }
  } catch (e) { console.error('Screener follow-up error:', e); }
```

- [ ] **Step 2: Also update Day 0 enroll block to set `last_step_sent = 0`**

The existing Day 0 logic at [worker.js:780-822](../../worker.js#L780-L822) already sets `enrolled_in_sequence: true`. Update the PATCH body around line 816 to also include `last_step_sent: 0`:

Find:
```javascript
      await fetch(supaUrl + '/rest/v1/screener_leads?id=eq.' + sl.id, {
        method: 'PATCH', headers,
        body: JSON.stringify({ enrolled_in_sequence: true })
      });
```

Replace with:
```javascript
      await fetch(supaUrl + '/rest/v1/screener_leads?id=eq.' + sl.id, {
        method: 'PATCH', headers,
        body: JSON.stringify({ enrolled_in_sequence: true, last_step_sent: 0, last_step_sent_at: new Date().toISOString() })
      });
```

- [ ] **Step 3: Verify locally**

Seed a test screener lead created 3 days ago via Supabase SQL Editor:

```sql
INSERT INTO public.screener_leads (email, parent_name, marketing_consent, enrolled_in_sequence, unsubscribed, last_step_sent, unsubscribe_token, score, risk_level, created_at)
VALUES ('jorrelpatterson+screen3@gmail.com', 'Test Parent', true, true, false, 0, encode(gen_random_bytes(16), 'hex'), 5, 'medium', now() - interval '3 days');
```

Run worker locally:
```bash
wrangler dev --test-scheduled
# In another terminal:
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

Then in Supabase:
```sql
SELECT email, last_step_sent, last_step_sent_at FROM public.screener_leads
  WHERE email = 'jorrelpatterson+screen3@gmail.com';
-- Expected: last_step_sent = 1, timestamp set
```

Check Jorrel's inbox at jorrelpatterson+screen3@gmail.com for the Day 3 email.

- [ ] **Step 4: Commit**

```bash
git add worker.js
git commit -m "$(cat <<'EOF'
feat: wire screener follow-up sequence (Days 3, 7, 10)

Completes the 4-email screener lead → subscriber sequence. Day 0 already
fires on screener completion; this adds the remaining three educational/
conversion-focused emails advancing via screener_leads.last_step_sent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: Sequence B — Multi-touch Re-engagement (Days 7, 14, 21)

### Task 4: Replace Single Re-engage with 3-Email Progressive Sequence

**Files:**
- Modify: `worker.js` (replace lines ~719-778, the existing single-email re-engage block)

- [ ] **Step 1: Replace the existing re-engagement block**

In `worker.js`, find the block starting `// -- RE-ENGAGEMENT: Users inactive 7+ days --` at ~line 719 and ending at the corresponding catch block (~line 778). Replace the entire block with:

```javascript
  // -- RE-ENGAGEMENT: 3-email progressive sequence at days 7, 14, 21 --
  // Triggers on profiles where there is no behavior_log activity within step.day,
  // and last re-engage email was sent more than 7 days ago.
  try {
    const RE_STEPS = [
      // Step 1: gentle (no pressure)
      { step: 1, inactive_days: 7, subject: "We noticed you've been quiet — anything we can help with?", heading: 'No pressure', html_body:
        '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:0 0 20px">Hi {NAME}, we noticed you haven\'t logged in this week. Parenting is a lot &mdash; we\'re not here to add to it.</p>' +
        '<div style="background:#FDF8F0;border-radius:12px;padding:20px;margin:16px 0;border-left:4px solid #7A9E7E">' +
        '<p style="margin:0;font-size:15px;color:#2D2D2D">If something\'s on your mind, your AI Coach is one tap away. If you\'re just busy, that\'s totally fine. Your village will be here whenever you\'re ready.</p>' +
        '</div>' +
        '<div style="text-align:center;margin:24px 0">' +
        '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 32px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px">Open Modern Village</a>' +
        '</div>'
      },
      // Step 2: value drop (one tip)
      { step: 2, inactive_days: 14, subject: 'A pro tip you might have missed', heading: 'One tip from this week', html_body:
        '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:0 0 20px">Hi {NAME}, here\'s one strategy parents in the village have been celebrating this week.</p>' +
        '<div style="background:#FDF8F0;border-radius:12px;padding:20px;margin:16px 0;border-left:4px solid #C4745A">' +
        '<p style="margin:0 0 8px;font-weight:700;color:#C4745A;font-size:13px;text-transform:uppercase;letter-spacing:0.5px">Try This Tonight</p>' +
        '<p style="margin:0;color:#2D2D2D;font-size:15px;line-height:1.6">Set a 5-minute "transition timer" before bedtime. The timer (not you) tells them it\'s time to start getting ready. Removes you from the power struggle.</p>' +
        '</div>' +
        '<p style="color:#6B6560;font-size:15px;line-height:1.6">Log how it goes &mdash; the AI Coach will adapt next week\'s suggestion based on what worked.</p>' +
        '<div style="text-align:center;margin:24px 0">' +
        '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 32px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px">Log a Behavior</a>' +
        '</div>'
      },
      // Step 3: final touch, then stop
      { step: 3, inactive_days: 21, subject: "We're holding your spot — come back when you're ready", heading: 'We\'ll stop reaching out', html_body:
        '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:0 0 20px">Hi {NAME}, this is the last automatic email we\'ll send for now. Your account, your child\'s data, and your AI Coach are all preserved &mdash; come back whenever life slows down.</p>' +
        '<div style="background:#FDF8F0;border-radius:12px;padding:20px;margin:16px 0;border-left:4px solid #7A9E7E">' +
        '<p style="margin:0;font-size:15px;color:#2D2D2D">If you ever want to permanently delete your account, reply to this email and we\'ll handle it. Otherwise, we\'re here when you\'re ready.</p>' +
        '</div>' +
        '<div style="text-align:center;margin:24px 0">' +
        '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 32px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px">Come Back to the Village</a>' +
        '</div>'
      }
    ];

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    for (const rs of RE_STEPS) {
      const inactiveCutoff = new Date();
      inactiveCutoff.setDate(inactiveCutoff.getDate() - rs.inactive_days);
      const inactiveCutoffIso = inactiveCutoff.toISOString();

      // Find candidates: profiles at the previous step, last re-engage send > 7 days ago (or never)
      const candRes = await fetch(supaUrl + '/rest/v1/profiles?role=eq.parent&email_marketing_opted_in=eq.true&last_re_engage_step=eq.' + (rs.step - 1) + '&select=id,email,name,last_re_engage_sent_at', { headers });
      const candidates = await candRes.json();

      for (const u of (candidates || [])) {
        if (!u.email) continue;

        // Throttle: don't send within 7 days of last re-engage email
        if (u.last_re_engage_sent_at && new Date(u.last_re_engage_sent_at) > sevenDaysAgo) continue;

        // Confirm inactive: no behavior_logs in last `inactive_days` days
        const logsRes = await fetch(supaUrl + '/rest/v1/behavior_logs?user_id=eq.' + u.id + '&logged_at=gte.' + inactiveCutoffIso + '&select=id&limit=1', { headers });
        const logs = await logsRes.json();
        if (logs && logs.length > 0) {
          // Active again — reset their re-engage step
          await fetch(supaUrl + '/rest/v1/profiles?id=eq.' + u.id, {
            method: 'PATCH', headers,
            body: JSON.stringify({ last_re_engage_step: 0, last_re_engage_sent_at: null })
          });
          continue;
        }

        const personalized = rs.html_body.replace(/\{NAME\}/g, u.name || 'there');
        const fullBody = (
          '<h1 style="font-size:24px;font-weight:800;color:#2D2D2D;margin:0 0 8px">' + rs.heading + ' &#127807;</h1>' +
          personalized
        );

        try {
          const sendR = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Modern Village <hello@modernvillage.app>',
              to: u.email,
              subject: rs.subject,
              html: emailWrapper(fullBody),
              tags: [{ name: 'sequence', value: 're_engage' }, { name: 'step', value: String(rs.step) }]
            })
          });
          if (sendR.ok) {
            await fetch(supaUrl + '/rest/v1/profiles?id=eq.' + u.id, {
              method: 'PATCH', headers,
              body: JSON.stringify({ last_re_engage_step: rs.step, last_re_engage_sent_at: new Date().toISOString() })
            });
          }
        } catch (e) { console.error('Re-engage step ' + rs.step + ' send error:', e); }

        await new Promise(r => setTimeout(r, 300));
      }
    }
  } catch (e) { console.error('Re-engagement error:', e); }
```

- [ ] **Step 2: Verify locally**

Seed a test inactive profile:

```sql
-- Create a test profile inactive for 7 days, no re-engage sent yet
UPDATE public.profiles
  SET last_re_engage_step = 0, last_re_engage_sent_at = null
  WHERE email = 'jorrelpatterson+inactive@gmail.com';

-- (Or insert one if needed.)
INSERT INTO public.profiles (id, email, name, role, email_marketing_opted_in, last_re_engage_step, created_at)
VALUES (gen_random_uuid(), 'jorrelpatterson+inactive@gmail.com', 'Test Inactive Parent', 'parent', true, 0, now() - interval '30 days')
ON CONFLICT (email) DO NOTHING;

-- Ensure no behavior logs:
DELETE FROM public.behavior_logs WHERE user_id IN (SELECT id FROM public.profiles WHERE email = 'jorrelpatterson+inactive@gmail.com');
```

Run cron locally as in Task 3 Step 3, then verify:

```sql
SELECT email, last_re_engage_step, last_re_engage_sent_at FROM public.profiles
  WHERE email = 'jorrelpatterson+inactive@gmail.com';
-- Expected: step = 1, timestamp set
```

Check inbox for the Day 7 re-engage email.

- [ ] **Step 3: Commit**

```bash
git add worker.js
git commit -m "$(cat <<'EOF'
feat: 3-email progressive re-engagement (days 7, 14, 21)

Replaces single-email re-engage with progressive sequence: gentle nudge
→ value drop → final break-up. Resets to step 0 if user becomes active
again, and throttles 7 days between sends.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: Optimization Foundation (shared by all sequences)

### Task 5: Resend Inbound Webhook (Reply Tracking)

**Files:**
- Modify: `worker.js` (add new webhook endpoint near existing `/webhook/resend`)

Resend supports inbound parsing — when someone replies to a Resend-sent email, Resend POSTs the parsed reply to a configured webhook URL. We add a handler that finds the original `campaign_sends` row by `In-Reply-To` header and marks it `replied`.

- [ ] **Step 1: Add the inbound webhook handler**

In `worker.js`, find the existing `/webhook/resend` block at line ~95-114. Right after its closing `}`, add a new endpoint:

```javascript
    // ═══ RESEND INBOUND WEBHOOK (reply tracking — no auth required) ═══
    if (url.pathname === '/webhook/resend-inbound') {
      const event = await request.json().catch(() => ({}));
      // Resend inbound payload includes headers and message body
      // We match on In-Reply-To which contains the original Resend email_id
      const headers_in = event.headers || {};
      const inReplyTo = headers_in['in-reply-to'] || headers_in['In-Reply-To'] || '';
      // In-Reply-To format: "<resend-id@resend.email>" — strip the brackets and domain
      const m = inReplyTo.match(/<([a-f0-9-]+)@/i);
      if (!m) return new Response('{"ok":true,"matched":false}', { headers: h });
      const originalResendId = m[1];

      const sendRes = await fetch(env.SUPABASE_URL + '/rest/v1/campaign_sends?resend_id=eq.' + originalResendId + '&select=id,campaign_id,lead_id', { headers: supaH });
      const sends = await sendRes.json();
      if (!sends || !sends.length) return new Response('{"ok":true,"matched":false}', { headers: h });

      const send = sends[0];
      const now = new Date().toISOString();

      await fetch(env.SUPABASE_URL + '/rest/v1/campaign_sends?id=eq.' + send.id, {
        method: 'PATCH', headers: supaH,
        body: JSON.stringify({ status: 'replied', replied_at: now })
      });

      // Bump campaign-level reply counter (use a generic increment via RPC if you have one;
      // for now we just track at send level — campaign rollups happen in optimizer cron)

      return new Response('{"ok":true,"matched":true,"send_id":"' + send.id + '"}', { headers: h });
    }
```

- [ ] **Step 2: Configure Resend inbound (manual one-time setup)**

In Resend dashboard → Inbound → Create new inbound route:
- **Domain:** `outreach.modernvillage.app` (covers all sub-subdomains)
- **Webhook URL:** `https://village-api.jorrelpatterson.workers.dev/webhook/resend-inbound`
- **Action:** POST parsed payload

Document this in `docs/legal/RESEND-SUBDOMAIN-SETUP.md` (append to Task 2's file):

```markdown
## 6. Inbound webhook (replies)

In Resend dashboard → Inbound:
- Domain: `outreach.modernvillage.app`
- Webhook: `https://village-api.jorrelpatterson.workers.dev/webhook/resend-inbound`
- Action: POST parsed
```

- [ ] **Step 3: Verify with curl**

```bash
curl -X POST https://village-api.jorrelpatterson.workers.dev/webhook/resend-inbound \
  -H "Content-Type: application/json" \
  -d '{"headers": {"in-reply-to": "<00000000-0000-0000-0000-000000000000@resend.email>"}}'
# Expected: {"ok":true,"matched":false}
```

Then seed a real campaign_sends row and POST a matching In-Reply-To:

```sql
INSERT INTO public.campaign_sends (campaign_id, email, resend_id, status)
VALUES ((SELECT id FROM campaigns LIMIT 1), 'test@example.com', 'aaaaaaaa-1111-2222-3333-444444444444', 'sent');
```

```bash
curl -X POST https://village-api.jorrelpatterson.workers.dev/webhook/resend-inbound \
  -H "Content-Type: application/json" \
  -d '{"headers": {"in-reply-to": "<aaaaaaaa-1111-2222-3333-444444444444@resend.email>"}}'
# Expected: {"ok":true,"matched":true,"send_id":"..."}
```

Verify: `SELECT status, replied_at FROM campaign_sends WHERE resend_id = 'aaaaaaaa-1111-2222-3333-444444444444';` — status should be `replied`.

- [ ] **Step 4: Commit**

```bash
git add worker.js docs/legal/RESEND-SUBDOMAIN-SETUP.md
git commit -m "$(cat <<'EOF'
feat: Resend inbound webhook for reply tracking

Matches incoming replies to original campaign_sends via In-Reply-To
header, marks send as replied. Reply will weight 10x opens in the
bandit reward function (Task 9).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Conversion Attribution (Signup + Booking)

**Files:**
- Modify: `worker.js` (add helper function + hook into signup endpoint)

When a new user signs up or books a session, check if their email matches any recent `campaign_sends`. If yes, attribute the conversion back.

- [ ] **Step 1: Add attribution helper near top of worker.js (after `function emailWrapper`)**

```javascript
// Attribute a conversion (signup, booking, subscribe) back to the most recent
// campaign_sends row for this email, within the last 60 days.
async function attributeConversion(env, email, conversionType, userId) {
  if (!email) return;
  const supaH = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' };
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);

  // Find the most recent send to this email that hasn't been attributed yet
  const sendsRes = await fetch(env.SUPABASE_URL + '/rest/v1/campaign_sends?email=eq.' + encodeURIComponent(email.toLowerCase()) + '&converted_at=is.null&created_at=gte.' + cutoff.toISOString() + '&order=created_at.desc&limit=1&select=id,lead_id', { headers: supaH });
  const sends = await sendsRes.json();
  if (!sends || !sends.length) return;

  const now = new Date().toISOString();
  await fetch(env.SUPABASE_URL + '/rest/v1/campaign_sends?id=eq.' + sends[0].id, {
    method: 'PATCH', headers: supaH,
    body: JSON.stringify({ converted_at: now, conversion_type: conversionType })
  });

  // Also stamp the lead row if linked
  if (sends[0].lead_id) {
    await fetch(env.SUPABASE_URL + '/rest/v1/leads?id=eq.' + sends[0].lead_id, {
      method: 'PATCH', headers: supaH,
      body: JSON.stringify({ converted_at: now, converted_user_id: userId || null })
    });
  }
}
```

- [ ] **Step 2: Hook into the signup endpoint**

In `worker.js`, find the admin user creation endpoint at [worker.js:204-244](../../worker.js#L204-L244). For *self-service* signup (Supabase handles this directly via Google OAuth or email/password through `supabase-js` on the client), there's no worker hook — instead, hook on the first profile fetch from the client.

The cleanest hook is the existing `loadProfile()` flow on the client side. But since the worker is the single source of truth for cron-driven attribution, add it on the booking creation endpoint AND add a one-time backfill cron.

For the booking creation hook, find the existing booking POST endpoint or insert into bookings (search worker.js for `bookings` POST). If no such endpoint exists in worker.js (because the client writes directly to Supabase), instead add a daily backfill cron block:

```javascript
  // -- ATTRIBUTION BACKFILL: link new signups + bookings to recent campaign_sends --
  try {
    // Yesterday's new signups (profiles created yesterday)
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const yestStart = yest.toISOString().split('T')[0] + 'T00:00:00';
    const yestEnd = yest.toISOString().split('T')[0] + 'T23:59:59';

    const newProfilesRes = await fetch(supaUrl + '/rest/v1/profiles?created_at=gte.' + yestStart + '&created_at=lte.' + yestEnd + '&select=id,email', { headers });
    const newProfiles = await newProfilesRes.json();
    for (const p of (newProfiles || [])) {
      await attributeConversion(env, p.email, 'signup', p.id);
    }

    // Yesterday's new bookings
    const newBookRes = await fetch(supaUrl + '/rest/v1/bookings?created_at=gte.' + yestStart + '&created_at=lte.' + yestEnd + '&select=id,user_id', { headers });
    const newBookings = await newBookRes.json();
    for (const b of (newBookings || [])) {
      // get email
      const profRes = await fetch(supaUrl + '/rest/v1/profiles?id=eq.' + b.user_id + '&select=email', { headers });
      const prof = await profRes.json();
      if (prof && prof.length && prof[0].email) {
        await attributeConversion(env, prof[0].email, 'booking', b.user_id);
      }
    }

    // Yesterday's new Pro subscribers (profiles where subscription_status changed to 'pro')
    // We look at the audit log if it exists; otherwise check anyone with subscription_started_at = yesterday
    const newProRes = await fetch(supaUrl + '/rest/v1/profiles?subscription_status=eq.pro&subscription_started_at=gte.' + yestStart + '&subscription_started_at=lte.' + yestEnd + '&select=id,email', { headers });
    const newPro = await newProRes.json();
    for (const p of (newPro || [])) {
      await attributeConversion(env, p.email, 'subscribed', p.id);
    }
  } catch (e) { console.error('Attribution backfill error:', e); }
```

Insert this block in the daily cron, after the email drip blocks and before the optimizer block.

- [ ] **Step 3: Verify**

Seed a campaign_send and a matching new profile:

```sql
-- Seed the send
INSERT INTO public.campaign_sends (campaign_id, email, resend_id, status, created_at)
VALUES ((SELECT id FROM campaigns LIMIT 1), 'jorrelpatterson+convert@gmail.com', 'conv-' || gen_random_uuid(), 'opened', now() - interval '5 days');

-- Seed a "new" profile from yesterday with that email
INSERT INTO public.profiles (id, email, name, role, created_at)
VALUES (gen_random_uuid(), 'jorrelpatterson+convert@gmail.com', 'Converted Lead', 'parent', now() - interval '1 day');
```

Run cron locally, then:

```sql
SELECT email, converted_at, conversion_type FROM campaign_sends
  WHERE email = 'jorrelpatterson+convert@gmail.com';
-- Expected: converted_at populated, conversion_type = 'signup'
```

- [ ] **Step 4: Commit**

```bash
git add worker.js
git commit -m "$(cat <<'EOF'
feat: conversion attribution for signups, bookings, subscribes

Daily backfill cron matches yesterday's new signups/bookings/subscribers
back to the most recent campaign_sends within 60 days. Conversion will
weight 100x opens in the bandit reward function (Task 9).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Thompson Sampling Bandit Picker

**Files:**
- Modify: `worker.js` (add helper function near `attributeConversion`)

Thompson sampling: each variant has a Beta(α, β) posterior. To pick a variant for the next send, sample a number from each variant's distribution and pick the highest.

- [ ] **Step 1: Add bandit picker helpers**

```javascript
// Sample from a Beta(alpha, beta) distribution using two gamma samples.
// Standard inverse-transform Beta sampler is complex; we use a simple approximation:
// Beta(a,b) ≈ X / (X+Y) where X~Gamma(a,1), Y~Gamma(b,1).
// For small integer a,b we use sum-of-exponentials approximation.
function sampleGamma(shape) {
  // Marsaglia & Tsang for shape >= 1; for shape < 1 use boost trick
  if (shape < 1) return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  const d = shape - 1/3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x, v;
    do {
      // Box-Muller for normal sample
      const u1 = Math.random(), u2 = Math.random();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
function sampleBeta(alpha, beta) {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}

// Pick a variant by Thompson sampling. variantStats is { "a": {alpha, beta}, ... }.
// Returns the variant ID with the highest sampled value.
function pickVariantThompson(variantStats) {
  const ids = Object.keys(variantStats);
  if (!ids.length) return null;
  let bestId = ids[0];
  let bestSample = -1;
  for (const id of ids) {
    const s = variantStats[id] || { alpha: 1, beta: 1 };
    const sample = sampleBeta(s.alpha || 1, s.beta || 1);
    if (sample > bestSample) {
      bestSample = sample;
      bestId = id;
    }
  }
  return bestId;
}

// Cold-start: if any variant has fewer than COLD_START_SENDS, pick uniformly random
// among under-explored variants instead of Thompson.
const COLD_START_SENDS = 5;
function pickVariant(variantStats) {
  const ids = Object.keys(variantStats);
  if (!ids.length) return null;
  const underExplored = ids.filter(id => (variantStats[id]?.sends || 0) < COLD_START_SENDS);
  if (underExplored.length) return underExplored[Math.floor(Math.random() * underExplored.length)];
  return pickVariantThompson(variantStats);
}
```

- [ ] **Step 2: Verify the picker is sane**

Add a temporary debug endpoint to verify (delete after verify, or leave behind a feature flag):

```javascript
    // TEMP: bandit sanity check
    if (url.pathname === '/__debug/bandit') {
      // Variant 'a' clearly worse, 'b' clearly better — Thompson should pick 'b' most of the time
      const stats = { a: { alpha: 2, beta: 50, sends: 52 }, b: { alpha: 30, beta: 22, sends: 52 } };
      const picks = { a: 0, b: 0 };
      for (let i = 0; i < 1000; i++) {
        picks[pickVariant(stats)]++;
      }
      return new Response(JSON.stringify(picks), { headers: h });
    }
```

```bash
wrangler dev
curl http://localhost:8787/__debug/bandit
# Expected: { "a": ~50-150, "b": ~850-950 } — b clearly favored, but a still explored
```

After verifying, remove the debug endpoint.

- [ ] **Step 3: Commit**

```bash
git add worker.js
git commit -m "$(cat <<'EOF'
feat: Thompson sampling bandit picker with cold-start exploration

pickVariant() samples from Beta(α,β) posteriors per variant. First
COLD_START_SENDS sends per variant use uniform random for exploration,
then switches to Thompson. Naturally handles low-volume cohorts (RC: 21
leads) and high-volume (BCBA: 15K).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Reward Function + Posterior Update

**Files:**
- Modify: `worker.js` (add helpers near bandit picker)

The reward function turns each `campaign_sends` row into a numeric reward, and we update the Beta posterior by treating reward as success-weighted "trials."

- [ ] **Step 1: Add reward + posterior update helpers**

```javascript
// Reward function: weight signals by business value.
// opens=1, clicks=5, replies=10, conversions=100.
function rewardFromSend(send) {
  let r = 0;
  if (send.status === 'opened' || send.opened_at) r += 1;
  if (send.status === 'clicked' || send.clicked_at) r += 5;
  if (send.status === 'replied' || send.replied_at) r += 10;
  if (send.converted_at) r += 100;
  return r;
}

// Compute new (alpha, beta, sends) for a variant from its sends.
// Treat each send as one "trial"; reward / 116 (max possible per send) as success probability.
// alpha = sum of normalized rewards + 1, beta = sum of (1 - normalized) + 1.
const MAX_REWARD_PER_SEND = 1 + 5 + 10 + 100; // 116
function posteriorFromSends(sends) {
  let totalSuccess = 0;
  let totalFailure = 0;
  let count = 0;
  for (const s of sends) {
    const r = rewardFromSend(s);
    const norm = r / MAX_REWARD_PER_SEND; // 0..1
    totalSuccess += norm;
    totalFailure += (1 - norm);
    count++;
  }
  return {
    alpha: 1 + totalSuccess,
    beta: 1 + totalFailure,
    sends: count
  };
}
```

- [ ] **Step 2: Verify with seeded data**

```bash
# Quick mental check via debug endpoint:
# 10 sends all opened (no clicks/replies/conversions): alpha = 1 + 10*(1/116) ≈ 1.086, beta ≈ 10.91
# 10 sends with 5 conversions: alpha ≈ 1 + 5*(101/116) + 5*(1/116) ≈ 5.43, beta ≈ 5.57
```

- [ ] **Step 3: Commit**

```bash
git add worker.js
git commit -m "$(cat <<'EOF'
feat: bandit reward function + posterior update

Reward weights: opens=1, clicks=5, replies=10, conversions=100. Posterior
treats each send as a Bernoulli trial with success rate = reward/max_reward.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Send-Time Learning (Per-Recipient Best Hour)

**Files:**
- Modify: `worker.js` (add cron block in daily tasks)

- [ ] **Step 1: Add the rollup block**

In `worker.js` daily cron (after attribution backfill block), add:

```javascript
  // -- SEND-TIME LEARNING: roll up best_open_hour per lead --
  try {
    // Pull all opened sends in last 30 days, group by lead_id + extract hour
    // Strategy: for each lead with >= 3 opens, set best_open_hour to the mode hour.
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get distinct lead_ids with recent opens
    const openedRes = await fetch(supaUrl + '/rest/v1/campaign_sends?opened_at=gte.' + thirtyDaysAgo.toISOString() + '&lead_id=not.is.null&select=lead_id,opened_at', { headers });
    const opened = await openedRes.json();

    const byLead = {};
    for (const s of (opened || [])) {
      const h = new Date(s.opened_at).getUTCHours();
      if (!byLead[s.lead_id]) byLead[s.lead_id] = {};
      byLead[s.lead_id][h] = (byLead[s.lead_id][h] || 0) + 1;
    }

    for (const leadId of Object.keys(byLead)) {
      const hours = byLead[leadId];
      const total = Object.values(hours).reduce((a, b) => a + b, 0);
      if (total < 3) continue; // not enough signal
      let bestHour = 0, bestCount = 0;
      for (const h of Object.keys(hours)) {
        if (hours[h] > bestCount) { bestCount = hours[h]; bestHour = parseInt(h); }
      }
      await fetch(supaUrl + '/rest/v1/leads?id=eq.' + leadId, {
        method: 'PATCH', headers,
        body: JSON.stringify({ best_open_hour: bestHour })
      });
    }
  } catch (e) { console.error('Send-time learning error:', e); }
```

- [ ] **Step 2: Verify with seeded data**

```sql
-- Seed: lead with 5 opens at hour 14 UTC
WITH lead AS (INSERT INTO leads (lead_type, source, email, name) VALUES ('bcba', 'manual', 'test@a.com', 'Test') RETURNING id)
INSERT INTO campaign_sends (campaign_id, lead_id, email, opened_at, status, resend_id)
SELECT (SELECT id FROM campaigns LIMIT 1), lead.id, 'test@a.com', now() - (n || ' days')::interval + interval '14 hours', 'opened', 'st-' || gen_random_uuid()
FROM lead, generate_series(1, 5) n;
```

Run cron, then:

```sql
SELECT email, best_open_hour FROM leads WHERE email = 'test@a.com';
-- Expected: best_open_hour = 14
```

- [ ] **Step 3: Commit**

```bash
git add worker.js
git commit -m "$(cat <<'EOF'
feat: send-time learning — per-recipient best_open_hour rollup

Daily cron rolls up the mode hour-of-day from each lead's opens in the
last 30 days (min 3 opens). Send-time selector (Task 12) uses this to
schedule cold sends at each lead's best window.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Auto-Promote Winners (Optimizer Cron Extension)

**Files:**
- Modify: `worker.js` (replace the existing optimizer block at lines ~1098-1171)

Current optimizer skips sequences entirely. Replace with: per-step + per-cohort scoping, posterior-based winner detection, AI-generated challenger that replaces the loser.

- [ ] **Step 1: Replace the optimizer block**

Find the block starting `// ── AUTORESEARCH: Email Campaign Auto-Optimization ──` at ~line 1098 and replace through its closing `} catch ... }` with:

```javascript
  // ── AUTORESEARCH: Email Campaign Auto-Optimization (sequence-aware) ──
  try {
    // Process active campaigns (sequences AND blasts)
    const campRes = await fetch(supaUrl + '/rest/v1/campaigns?status=eq.active&select=id,name,cohort,sequence_steps,variant_stats', { headers });
    const camps = await campRes.json();

    for (const camp of (camps || [])) {
      const steps = (camp.sequence_steps && camp.sequence_steps.length) ? camp.sequence_steps : [{ step: 0, variants: null }];
      const newVariantStats = camp.variant_stats || {};

      for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
        const step = steps[stepIdx];
        const stepKey = 'step_' + stepIdx;
        // Variants for this step (variants array if new format, else single 'a' implicit)
        const variants = step.variants || (step.subject ? [{ id: 'a', subject: step.subject, body_html: step.html }] : []);
        if (!variants.length) continue;

        // Pull all sends for this campaign+step
        const sendsRes = await fetch(supaUrl + '/rest/v1/campaign_sends?campaign_id=eq.' + camp.id + '&sequence_step=eq.' + stepIdx + '&select=variant,status,opened_at,clicked_at,replied_at,converted_at', { headers });
        const sends = await sendsRes.json();
        if (!sends || !sends.length) continue;

        // Group sends by variant
        const sendsByVariant = {};
        for (const s of sends) {
          const v = s.variant || 'a';
          if (!sendsByVariant[v]) sendsByVariant[v] = [];
          sendsByVariant[v].push(s);
        }

        // Update posterior per variant
        const stepStats = {};
        for (const v of Object.keys(sendsByVariant)) {
          stepStats[v] = posteriorFromSends(sendsByVariant[v]);
        }
        newVariantStats[stepKey] = stepStats;

        // Check significance gate: min 50 sends per variant + clear winner
        const activeVariants = Object.keys(stepStats);
        if (activeVariants.length < 2) continue;
        const allEnough = activeVariants.every(v => stepStats[v].sends >= 50);
        if (!allEnough) continue;

        // Has this step already been auto-optimized?
        const optCheck = await fetch(supaUrl + '/rest/v1/email_optimization_logs?campaign_id=eq.' + camp.id + '&action=eq.winner_picked&details->>step=eq.' + stepIdx + '&select=id&limit=1', { headers });
        const optExists = await optCheck.json();
        if (optExists && optExists.length) continue;

        // Estimate P(winner > loser) by sampling
        let winnerId = activeVariants[0];
        const samples = {};
        for (const v of activeVariants) samples[v] = [];
        const N_SAMPLES = 1000;
        for (let i = 0; i < N_SAMPLES; i++) {
          let bestV = activeVariants[0], bestSample = -1;
          for (const v of activeVariants) {
            const s = sampleBeta(stepStats[v].alpha, stepStats[v].beta);
            samples[v].push(s);
            if (s > bestSample) { bestSample = s; bestV = v; }
          }
          if (i === 0) winnerId = bestV;
        }
        // Count how often each variant won
        const winCounts = {};
        for (const v of activeVariants) winCounts[v] = 0;
        for (let i = 0; i < N_SAMPLES; i++) {
          let bestV = activeVariants[0], bestSample = samples[activeVariants[0]][i];
          for (const v of activeVariants) {
            if (samples[v][i] > bestSample) { bestSample = samples[v][i]; bestV = v; }
          }
          winCounts[bestV]++;
        }
        // Find variant with > 90% win rate
        let actualWinner = null;
        for (const v of activeVariants) {
          if (winCounts[v] / N_SAMPLES > 0.90) { actualWinner = v; break; }
        }
        if (!actualWinner) continue; // No clear winner yet

        const winnerVariant = variants.find(v => v.id === actualWinner) || variants[0];
        const losers = activeVariants.filter(v => v !== actualWinner);

        // Log winner_picked
        await fetch(supaUrl + '/rest/v1/email_optimization_logs', {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            campaign_id: camp.id,
            action: 'winner_picked',
            details: { step: stepIdx, winner: actualWinner, losers, win_probability: winCounts[actualWinner] / N_SAMPLES, winning_subject: winnerVariant.subject }
          })
        });

        // Generate a new challenger variant via Claude
        try {
          const optimizePrompt = 'You are an email subject-line optimizer for Modern Village (an ABA-powered platform for neurodivergent families). Cohort: ' + (camp.cohort || 'general') + '.\n\nWinning subject: "' + winnerVariant.subject + '"\nIt won by ' + Math.round(winCounts[actualWinner] / N_SAMPLES * 100) + '% probability over ' + losers.map(l => '"' + (variants.find(v => v.id === l)?.subject || '?') + '"').join(', ') + '.\n\nWrite ONE new challenger subject line that keeps what made the winner work (its emotional hook, length, specificity) but tests a different angle. Respond with ONLY the subject text, nothing else.';

          const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 100, messages: [{ role: 'user', content: optimizePrompt }] })
          });
          const aiData = await aiRes.json();
          const newSubject = (aiData.content && aiData.content[0] ? aiData.content[0].text : '').trim().replace(/^["']|["']$/g, '');

          if (newSubject) {
            // Find next variant ID (a, b, c, d, ...)
            const usedIds = new Set(variants.map(v => v.id));
            let newId = 'a';
            for (const c of 'abcdefghijklmnop') { if (!usedIds.has(c)) { newId = c; break; } }

            // Update the step's variants: remove losers, add new variant
            const newVariants = variants.filter(v => !losers.includes(v.id));
            newVariants.push({ id: newId, subject: newSubject, body_html: winnerVariant.body_html });
            steps[stepIdx].variants = newVariants;

            // Reset posterior for the new variant only
            newVariantStats[stepKey] = newVariantStats[stepKey] || {};
            for (const l of losers) delete newVariantStats[stepKey][l];
            newVariantStats[stepKey][newId] = { alpha: 1, beta: 1, sends: 0 };

            await fetch(supaUrl + '/rest/v1/email_optimization_logs', {
              method: 'POST',
              headers: { ...headers, 'Prefer': 'return=minimal' },
              body: JSON.stringify({
                campaign_id: camp.id,
                action: 'new_variant_generated',
                details: { step: stepIdx, new_variant_id: newId, new_subject: newSubject, replaced_losers: losers, kept_winner: actualWinner }
              })
            });
          }
        } catch (aiErr) { console.error('AI optimization error:', aiErr); }
      }

      // Persist updated sequence_steps + variant_stats
      await fetch(supaUrl + '/rest/v1/campaigns?id=eq.' + camp.id, {
        method: 'PATCH', headers,
        body: JSON.stringify({ sequence_steps: steps, variant_stats: newVariantStats })
      });
    }
  } catch (e) { console.error('Email optimization error:', e); }
```

- [ ] **Step 2: Verify with seeded data**

```sql
-- Seed a campaign with 2 variants on step 0, 60 sends per variant, 'b' clearly better
INSERT INTO campaigns (name, subject_a, body_html, status, is_sequence, cohort, sequence_steps)
VALUES ('Test Bandit', 'placeholder', '<p>placeholder</p>', 'active', true, 'bcba',
  '[{"step":0,"day":0,"variants":[{"id":"a","subject":"Quick question","body_html":"<p>x</p>"},{"id":"b","subject":"Time is money","body_html":"<p>x</p>"}]}]'::jsonb)
RETURNING id;
-- Note the returned id, use as $CAMP_ID

-- Insert 60 sends for 'a' with 5 opens, no conversions
INSERT INTO campaign_sends (campaign_id, email, variant, sequence_step, status, opened_at, resend_id)
SELECT $CAMP_ID, 'a' || n || '@x.com', 'a', 0,
  CASE WHEN n <= 5 THEN 'opened' ELSE 'sent' END,
  CASE WHEN n <= 5 THEN now() - interval '1 day' ELSE NULL END,
  'a-' || n
FROM generate_series(1, 60) n;

-- Insert 60 sends for 'b' with 30 opens + 5 replies + 3 conversions
INSERT INTO campaign_sends (campaign_id, email, variant, sequence_step, status, opened_at, replied_at, converted_at, resend_id)
SELECT $CAMP_ID, 'b' || n || '@x.com', 'b', 0,
  CASE WHEN n <= 30 THEN 'opened' ELSE 'sent' END,
  CASE WHEN n <= 30 THEN now() - interval '1 day' ELSE NULL END,
  CASE WHEN n <= 5 THEN now() - interval '1 day' ELSE NULL END,
  CASE WHEN n <= 3 THEN now() - interval '1 day' ELSE NULL END,
  'b-' || n
FROM generate_series(1, 60) n;
```

Run cron locally, then:

```sql
SELECT details FROM email_optimization_logs
  WHERE campaign_id = $CAMP_ID AND action = 'winner_picked';
-- Expected: details.winner = 'b', win_probability > 0.90

SELECT sequence_steps->0->'variants' FROM campaigns WHERE id = $CAMP_ID;
-- Expected: 'a' removed, 'b' kept, new variant 'c' added with AI-generated subject
```

- [ ] **Step 3: Commit**

```bash
git add worker.js
git commit -m "$(cat <<'EOF'
feat: sequence-aware optimizer with auto-promote + significance gate

Replaces the old optimizer (skipped sequences, only opens+clicks). New
version: per-step + per-cohort scope, Bayesian winner detection (90%+
win probability over 1000 samples), Claude-generated challenger replaces
the loser, posterior persisted to campaigns.variant_stats.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5: Sequence C — Cold B2B (BCBAs / Districts / RCs)

### Task 11: Update Sequence Step Format (Variants Array, Backward Compat)

**Files:**
- Modify: `worker.js` (the existing sequence processor at lines ~881-960)

The current processor reads `step.subject` and `step.html` per step. Update it to read `step.variants[]` if present, falling back to legacy single-subject behavior.

- [ ] **Step 1: Update the sequence processor block**

Find the `// ── EMAIL SEQUENCES: Process daily sends ──` block (~line 881-960) and replace with:

```javascript
  // ── EMAIL SEQUENCES: Process daily sends (variant-aware, bandit-picked) ──
  try {
    const seqR = await fetch(supaUrl + '/rest/v1/campaigns?is_sequence=eq.true&status=eq.active&auto_paused_at=is.null&select=id,name,cohort,subdomain,sequence_steps,variant_stats', { headers });
    const sequences = await seqR.json();

    for (const seq of (sequences || [])) {
      const steps = seq.sequence_steps || [];
      if (!steps.length) continue;

      // Active enrollments (not completed, not unsubscribed)
      const enrollR = await fetch(supaUrl + '/rest/v1/sequence_enrollments?campaign_id=eq.' + seq.id + '&completed=eq.false&unsubscribed=eq.false&select=id,lead_id,current_step,enrolled_at,last_sent_at', { headers });
      const enrollments = await enrollR.json();

      for (const enr of (enrollments || [])) {
        const step = steps[enr.current_step];
        if (!step) {
          await fetch(supaUrl + '/rest/v1/sequence_enrollments?id=eq.' + enr.id, { method: 'PATCH', headers, body: JSON.stringify({ completed: true }) });
          continue;
        }

        // Time gate
        const enrollDate = new Date(enr.enrolled_at);
        const daysSinceEnroll = Math.floor((Date.now() - enrollDate.getTime()) / 86400000);
        if (daysSinceEnroll < step.day) continue;

        // Skip if already sent today
        if (enr.last_sent_at) {
          const lastSent = new Date(enr.last_sent_at);
          if (lastSent.toISOString().split('T')[0] === new Date().toISOString().split('T')[0]) continue;
        }

        // Get lead + bail if unsubscribed/bounced
        const leadR = await fetch(supaUrl + '/rest/v1/leads?id=eq.' + enr.lead_id + '&select=id,email,name,first_name,unsubscribed,bounced,unsubscribe_token,best_open_hour', { headers });
        const leads = await leadR.json();
        if (!leads.length || !leads[0].email || leads[0].unsubscribed || leads[0].bounced) {
          await fetch(supaUrl + '/rest/v1/sequence_enrollments?id=eq.' + enr.id, { method: 'PATCH', headers, body: JSON.stringify({ unsubscribed: true }) });
          continue;
        }
        const lead = leads[0];

        // Pick variant (bandit if multiple, else 'a' or legacy single)
        const variants = step.variants || (step.subject ? [{ id: 'a', subject: step.subject, body_html: step.html }] : null);
        if (!variants || !variants.length) continue;

        const stepKey = 'step_' + enr.current_step;
        const stepStats = (seq.variant_stats && seq.variant_stats[stepKey]) || {};
        // Ensure every variant has a posterior
        for (const v of variants) {
          if (!stepStats[v.id]) stepStats[v.id] = { alpha: 1, beta: 1, sends: 0 };
        }
        const chosenId = pickVariant(stepStats);
        const chosen = variants.find(v => v.id === chosenId) || variants[0];

        // Pick sender by subdomain (cohort-aware)
        const sender = pickSender(env, seq.cohort, seq.subdomain);

        // Personalize
        const name = lead.first_name || lead.name || 'there';
        const unsubUrl = 'https://village-api.jorrelpatterson.workers.dev/unsubscribe?token=' + encodeURIComponent(lead.unsubscribe_token || '') + '&source=lead';
        const subject = (chosen.subject || '').replace(/\{NAME\}/g, name);
        const body = (chosen.body_html || '').replace(/\{NAME\}/g, name);

        try {
          const sendR = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: sender,
              to: lead.email,
              subject: subject,
              html: emailWrapper(body, unsubUrl),
              tags: [
                { name: 'campaign', value: seq.id },
                { name: 'cohort', value: seq.cohort || 'unknown' },
                { name: 'step', value: String(enr.current_step) },
                { name: 'variant', value: chosenId }
              ]
            })
          });
          const sendData = await sendR.json();

          if (sendR.ok && sendData.id) {
            const now = new Date();
            // Record send
            await fetch(supaUrl + '/rest/v1/campaign_sends', {
              method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' },
              body: JSON.stringify({
                campaign_id: seq.id,
                lead_id: lead.id,
                resend_id: sendData.id,
                email: lead.email,
                variant: chosenId,
                sequence_step: enr.current_step,
                sent_hour: now.getUTCHours(),
                status: 'sent'
              })
            });
            // Bump variant send count immediately for cold-start gating
            stepStats[chosenId].sends = (stepStats[chosenId].sends || 0) + 1;
            const newVarStats = seq.variant_stats || {};
            newVarStats[stepKey] = stepStats;
            await fetch(supaUrl + '/rest/v1/campaigns?id=eq.' + seq.id, {
              method: 'PATCH', headers,
              body: JSON.stringify({ variant_stats: newVarStats })
            });
            // Advance enrollment
            await fetch(supaUrl + '/rest/v1/sequence_enrollments?id=eq.' + enr.id, {
              method: 'PATCH', headers,
              body: JSON.stringify({ current_step: enr.current_step + 1, last_sent_at: now.toISOString() })
            });
          }
        } catch (e) { console.error('Sequence send error:', e); }

        await new Promise(r => setTimeout(r, 300));
      }
    }
  } catch (e) { console.error('Sequence processing error:', e); }
```

- [ ] **Step 2: Add the sender picker helper near top of worker.js**

```javascript
function pickSender(env, cohort, subdomain) {
  // If campaign has explicit subdomain, build from-address from it
  if (subdomain) return 'Modern Village <team@' + subdomain + '>';
  // Otherwise fall back to cohort-mapped secrets
  if (cohort === 'bcba') return env.SENDER_BCBA || 'Modern Village BCBA Network <team@bcba.outreach.modernvillage.app>';
  if (cohort === 'district') return env.SENDER_DISTRICT || 'Modern Village for Districts <team@district.outreach.modernvillage.app>';
  if (cohort === 'rc') return env.SENDER_RC || 'Modern Village for Regional Centers <team@rc.outreach.modernvillage.app>';
  return env.SENDER_TRANSACTIONAL || 'Modern Village <hello@modernvillage.app>';
}
```

- [ ] **Step 3: Verify backward compat with an existing legacy sequence**

If any existing campaign has `sequence_steps` in the old `{subject, html}` format, run the cron and confirm it still sends correctly. (Spot-check by reading one existing active sequence's `sequence_steps` JSON and verifying the processor handles it.)

```sql
SELECT id, sequence_steps FROM campaigns WHERE is_sequence = true AND status = 'active' LIMIT 3;
```

- [ ] **Step 4: Commit**

```bash
git add worker.js
git commit -m "$(cat <<'EOF'
feat: variant-aware sequence processor with bandit picker + sender selection

Sequence processor now reads step.variants[] (bandit-picked) with backward
compat for legacy step.subject/step.html. Skips unsubscribed/bounced leads.
Tags every send with campaign/cohort/step/variant for downstream attribution.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Send Queue Processor + Daily Warmup Cap

**Files:**
- Modify: `worker.js` (add queue processor block in daily cron, before the sequence processor)

For cold sequences (Sequence C), instead of enrolling leads directly into `sequence_enrollments`, scrapers add them to `email_send_queue` with a scheduled time. Cron pulls N per day per cohort, respecting the cohort campaign's `daily_cap` and each lead's `best_open_hour`.

- [ ] **Step 1: Add the queue processor block**

In `worker.js` daily cron, **before** the sequence processor block from Task 11, add:

```javascript
  // ── COLD SEND QUEUE: drain warmup-aware, per-cohort ──
  try {
    // For each active cold campaign, pull up to daily_cap items from queue
    const coldR = await fetch(supaUrl + '/rest/v1/campaigns?is_sequence=eq.true&status=eq.active&auto_paused_at=is.null&cohort=in.(bcba,district,rc)&select=id,cohort,daily_cap,subdomain', { headers });
    const coldCampaigns = await coldR.json();

    for (const camp of (coldCampaigns || [])) {
      const cap = camp.daily_cap || 50;

      // Count today's sends for this campaign
      const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
      const sentTodayR = await fetch(supaUrl + '/rest/v1/email_send_queue?campaign_id=eq.' + camp.id + '&status=eq.sent&sent_at=gte.' + todayStart.toISOString() + '&select=id', { headers: { ...headers, 'Prefer': 'count=exact' } });
      await sentTodayR.json(); // realize body
      const sentToday = parseInt(sentTodayR.headers.get('content-range')?.split('/')[1] || '0');
      const remaining = Math.max(0, cap - sentToday);
      if (remaining === 0) continue;

      // Pull next N due items
      const dueR = await fetch(supaUrl + '/rest/v1/email_send_queue?campaign_id=eq.' + camp.id + '&status=eq.queued&scheduled_for=lte.' + new Date().toISOString() + '&order=priority.asc,scheduled_for.asc&limit=' + remaining + '&select=id,lead_id,sequence_step', { headers });
      const due = await dueR.json();

      for (const q of (due || [])) {
        // Ensure an enrollment row exists at the right step (idempotent)
        const enrCheck = await fetch(supaUrl + '/rest/v1/sequence_enrollments?campaign_id=eq.' + camp.id + '&lead_id=eq.' + q.lead_id + '&select=id,current_step,unsubscribed,completed', { headers });
        const enrs = await enrCheck.json();
        if (!enrs.length) {
          await fetch(supaUrl + '/rest/v1/sequence_enrollments', {
            method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ campaign_id: camp.id, lead_id: q.lead_id, current_step: q.sequence_step, enrolled_at: new Date().toISOString() })
          });
        } else if (enrs[0].unsubscribed || enrs[0].completed) {
          await fetch(supaUrl + '/rest/v1/email_send_queue?id=eq.' + q.id, {
            method: 'PATCH', headers,
            body: JSON.stringify({ status: 'skipped', skipped_reason: 'lead_unsubscribed_or_completed' })
          });
          continue;
        }

        // Mark the queue row as sent — actual send happens in the sequence processor block
        // because the sequence processor handles bandit picking, personalization, and tracking.
        // This separation keeps queue logic and send logic decoupled.
        await fetch(supaUrl + '/rest/v1/email_send_queue?id=eq.' + q.id, {
          method: 'PATCH', headers,
          body: JSON.stringify({ status: 'sent', sent_at: new Date().toISOString() })
        });
      }
    }
  } catch (e) { console.error('Cold queue drain error:', e); }
```

**Note:** the queue processor only enrolls leads + marks queue items consumed. Actual send happens in the sequence processor (Task 11) on the same cron tick. This decoupling means the bandit + variant logic only lives in one place.

- [ ] **Step 2: Verify**

```sql
-- Seed a test cold campaign with 2 variants on step 0
INSERT INTO campaigns (name, subject_a, body_html, status, is_sequence, cohort, daily_cap, sequence_steps, variant_stats)
VALUES ('Test BCBA', 'p', '<p>p</p>', 'active', true, 'bcba', 5,
  '[{"step":0,"day":0,"variants":[{"id":"a","subject":"Hi {NAME}, quick question","body_html":"<p>Body</p>"}]}]'::jsonb, '{}'::jsonb)
RETURNING id;
-- $CAMP_ID

-- Seed 10 leads
INSERT INTO leads (lead_type, source, email, first_name, cohort, unsubscribe_token)
SELECT 'bcba', 'manual', 'test_bcba_' || n || '@modernvillage-test.app', 'Test ' || n, 'bcba', encode(gen_random_bytes(16),'hex')
FROM generate_series(1, 10) n;

-- Enqueue all 10
INSERT INTO email_send_queue (campaign_id, lead_id, cohort, sequence_step, scheduled_for, status)
SELECT $CAMP_ID, l.id, 'bcba', 0, now(), 'queued'
FROM leads l WHERE l.email LIKE 'test_bcba_%@modernvillage-test.app';
```

Run cron, then:

```sql
SELECT status, count(*) FROM email_send_queue WHERE campaign_id = $CAMP_ID GROUP BY status;
-- Expected: 5 sent (matches daily_cap), 5 queued
```

- [ ] **Step 3: Commit**

```bash
git add worker.js
git commit -m "$(cat <<'EOF'
feat: cold send queue processor with daily warmup cap

Drains email_send_queue per cohort, respecting campaigns.daily_cap. Creates
sequence_enrollments idempotently; actual sends happen in the unified
sequence processor (variant picking + tracking lives in one place).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Auto-Enroll New Leads on Insert

**Files:**
- Create: `supabase/migrations/20260416_auto_enroll_trigger.sql`

When scrapers add a new lead with a `cohort` set, auto-enqueue them for the matching campaign's Day 0 send.

- [ ] **Step 1: Create migration with trigger function**

```sql
-- ═══════════════════════════════════════════════════
-- Auto-enroll new leads into matching cold sequence
-- 2026-04-16
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_enroll_lead_in_cold_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cohort text;
  v_campaign_id uuid;
BEGIN
  -- Determine cohort from explicit field or lead_type
  v_cohort := COALESCE(NEW.cohort, NEW.lead_type);

  -- Only auto-enroll for cold cohorts
  IF v_cohort NOT IN ('bcba', 'district', 'rc') THEN
    RETURN NEW;
  END IF;

  -- Skip if no email or unsubscribed/bounced
  IF NEW.email IS NULL OR NEW.unsubscribed = true OR NEW.bounced = true THEN
    RETURN NEW;
  END IF;

  -- Find the active campaign for this cohort
  SELECT id INTO v_campaign_id FROM public.campaigns
    WHERE cohort = v_cohort AND status = 'active' AND is_sequence = true
    LIMIT 1;
  IF v_campaign_id IS NULL THEN
    RETURN NEW; -- no active campaign yet, skip silently
  END IF;

  -- Enqueue Day 0 send (idempotent via unique constraint)
  INSERT INTO public.email_send_queue (campaign_id, lead_id, cohort, sequence_step, scheduled_for)
  VALUES (v_campaign_id, NEW.id, v_cohort, 0, now())
  ON CONFLICT (campaign_id, lead_id, sequence_step) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_enroll_lead ON public.leads;
CREATE TRIGGER trg_auto_enroll_lead
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_enroll_lead_in_cold_sequence();
```

- [ ] **Step 2: Apply migration + verify**

Apply via Supabase SQL Editor. Then:

```sql
-- Ensure there's an active BCBA campaign (use $CAMP_ID from Task 12)
UPDATE campaigns SET status = 'active' WHERE id = $CAMP_ID;

-- Insert a new lead
INSERT INTO leads (lead_type, source, email, first_name, cohort, unsubscribe_token)
VALUES ('bcba', 'test', 'autoenroll@modernvillage-test.app', 'Auto', 'bcba', encode(gen_random_bytes(16),'hex'));

-- Verify enqueued
SELECT * FROM email_send_queue
  WHERE lead_id = (SELECT id FROM leads WHERE email = 'autoenroll@modernvillage-test.app');
-- Expected: one row, status=queued, sequence_step=0
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260416_auto_enroll_trigger.sql
git commit -m "$(cat <<'EOF'
feat: auto-enroll new leads in matching cold sequence on insert

Postgres trigger watches leads INSERT, enqueues Day 0 send if cohort
matches an active sequence campaign. Skips if unsubscribed/bounced/no-email
or no active campaign exists.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Bounce Auto-Pause (>5% in 24hr)

**Files:**
- Modify: `worker.js` (add block in daily cron after queue processor)

If bounce rate exceeds 5% in any 24-hour window for a cold cohort, auto-pause the campaign and log it.

- [ ] **Step 1: Add bounce-rate guard block**

In `worker.js` daily cron, after the queue processor (Task 12) and before the sequence processor (Task 11), add:

```javascript
  // ── BOUNCE RATE GUARD: auto-pause cold cohorts above 5% bounce in 24hr ──
  try {
    const dayAgo = new Date(); dayAgo.setHours(dayAgo.getHours() - 24);
    const guardR = await fetch(supaUrl + '/rest/v1/campaigns?is_sequence=eq.true&status=eq.active&cohort=in.(bcba,district,rc)&select=id,cohort,name', { headers });
    const guardCampaigns = await guardR.json();

    for (const camp of (guardCampaigns || [])) {
      // Pull last 24hr of sends + count bounces
      const sR = await fetch(supaUrl + '/rest/v1/campaign_sends?campaign_id=eq.' + camp.id + '&created_at=gte.' + dayAgo.toISOString() + '&select=status', { headers });
      const ss = await sR.json();
      if (!ss || ss.length < 20) continue; // not enough volume to judge
      const bounced = ss.filter(s => s.status === 'bounced').length;
      const rate = bounced / ss.length;
      if (rate < 0.05) continue;

      // Auto-pause + log
      await fetch(supaUrl + '/rest/v1/campaigns?id=eq.' + camp.id, {
        method: 'PATCH', headers,
        body: JSON.stringify({ auto_paused_at: new Date().toISOString(), status: 'paused' })
      });
      await fetch(supaUrl + '/rest/v1/email_optimization_logs', {
        method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          campaign_id: camp.id,
          action: 'auto_paused',
          details: { reason: 'bounce_rate', rate: rate, bounced: bounced, total: ss.length, cohort: camp.cohort }
        })
      });

      // Email Jorrel
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Modern Village <hello@modernvillage.app>',
          to: 'jorrelpatterson@gmail.com',
          subject: 'ALERT: Cold campaign auto-paused — high bounce rate',
          html: '<p>Campaign <strong>' + camp.name + '</strong> (cohort: ' + camp.cohort + ') was auto-paused.</p><p>Bounce rate: ' + Math.round(rate * 1000) / 10 + '% (' + bounced + ' / ' + ss.length + ' sends in last 24hr).</p><p>Resume in admin after investigating.</p>'
        })
      });
    }
  } catch (e) { console.error('Bounce guard error:', e); }
```

- [ ] **Step 2: Verify with seeded bounces**

```sql
INSERT INTO campaign_sends (campaign_id, email, status, resend_id, created_at)
SELECT $CAMP_ID, 'bounce' || n || '@x.com', 'bounced', 'bnc-' || n, now() - interval '6 hours'
FROM generate_series(1, 5) n;

INSERT INTO campaign_sends (campaign_id, email, status, resend_id, created_at)
SELECT $CAMP_ID, 'sent' || n || '@x.com', 'sent', 'snt-' || n, now() - interval '6 hours'
FROM generate_series(1, 50) n;
-- Total: 55 sends, 5 bounces = 9.1% bounce rate
```

Run cron, then:

```sql
SELECT status, auto_paused_at FROM campaigns WHERE id = $CAMP_ID;
-- Expected: status='paused', auto_paused_at populated
```

- [ ] **Step 3: Commit**

```bash
git add worker.js
git commit -m "$(cat <<'EOF'
feat: bounce-rate guard auto-pauses cold cohorts above 5%

Daily cron checks last 24hr bounce rate per active cold campaign. Above
5% (with min 20 sends as gate), pauses campaign, logs to optimization_logs,
and emails Jorrel an alert.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Seed Cold Campaigns (BCBA, District, RC)

**Files:**
- Create: `supabase/migrations/20260416_seed_cold_campaigns.sql`

Insert three campaign rows as drafts with 9-step skeletons. Subjects/bodies are placeholders marked `[DRAFT — edit in admin]` so it's obvious nothing should ship until edited.

- [ ] **Step 1: Create the seed migration**

```sql
-- ═══════════════════════════════════════════════════
-- Seed cold B2B campaigns (BCBA, District, RC) as drafts
-- 2026-04-16
-- All subjects/bodies are placeholders — edit in admin before activation
-- ═══════════════════════════════════════════════════

DO $$
DECLARE
  v_bcba_steps jsonb;
  v_district_steps jsonb;
  v_rc_steps jsonb;
BEGIN
  -- BCBA: documentation pain → marketplace upside → break-up
  v_bcba_steps := jsonb_build_array(
    jsonb_build_object('step', 0, 'day', 0, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT BCBA #1A] Quick question about your documentation workflow', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>'),
      jsonb_build_object('id', 'b', 'subject', '[DRAFT BCBA #1B] How much time do you spend on session notes?', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 1, 'day', 3, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT BCBA #2A] What if 60% of your notes wrote themselves?', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 2, 'day', 7, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT BCBA #3A] AI-generated clinical narrative — 90 sec demo', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 3, 'day', 10, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT BCBA #4A] Superbills + insurance billing in one click', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 4, 'day', 14, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT BCBA #5A] Why Ariana built this (BCBA testimonial)', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 5, 'day', 21, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT BCBA #6A] Earn from the marketplace — set your own rates', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 6, 'day', 28, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT BCBA #7A] Free 30-day Pro trial — no card', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 7, 'day', 35, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT BCBA #8A] Final value drop — 5 strategies you can use today', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 8, 'day', 45, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT BCBA #9A] Closing the loop — should I stop reaching out?', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    ))
  );

  v_district_steps := jsonb_build_array(
    jsonb_build_object('step', 0, 'day', 0, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT District #1A] How parent engagement reduces IEP disputes', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 1, 'day', 3, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT District #2A] Parent toolkit for your SpEd families', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 2, 'day', 7, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT District #3A] Pricing breakdown — $3-8 per student per year', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 3, 'day', 10, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT District #4A] Pomona USD case study (in progress)', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 4, 'day', 14, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT District #5A] SELPA fit — does this work for your structure?', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 5, 'day', 21, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT District #6A] 5-min coordinator dashboard demo', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 6, 'day', 28, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT District #7A] Pilot proposal — 3 schools, no upfront cost', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 7, 'day', 35, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT District #8A] Final pitch — what would it take?', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 8, 'day', 45, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT District #9A] Should I stop reaching out?', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    ))
  );

  v_rc_steps := jsonb_build_array(
    jsonb_build_object('step', 0, 'day', 0, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT RC #1A] Family Support Services — digital companion', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 1, 'day', 3, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT RC #2A] Caregiver mental health pillar — for your families', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 2, 'day', 7, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT RC #3A] Waitlist relief framing', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 3, 'day', 10, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT RC #4A] Why a BCBA built Modern Village', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 4, 'day', 14, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT RC #5A] 1-on-1 demo offer for your team', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 5, 'day', 21, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT RC #6A] Small pilot proposal — 50 families', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 6, 'day', 28, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT RC #7A] Outcome data sharing approach', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 7, 'day', 35, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT RC #8A] Final pitch — what would help your decision?', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 8, 'day', 45, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT RC #9A] Closing the loop', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    ))
  );

  INSERT INTO public.campaigns (name, subject_a, body_html, status, is_sequence, cohort, subdomain, daily_cap, sequence_steps)
  VALUES
    ('BCBA Cold Sequence', 'placeholder', '<p>placeholder</p>', 'draft', true, 'bcba', 'bcba.outreach.modernvillage.app', 50, v_bcba_steps),
    ('District Cold Sequence', 'placeholder', '<p>placeholder</p>', 'draft', true, 'district', 'district.outreach.modernvillage.app', 50, v_district_steps),
    ('Regional Center Cold Sequence', 'placeholder', '<p>placeholder</p>', 'draft', true, 'rc', 'rc.outreach.modernvillage.app', 50, v_rc_steps);
END $$;
```

- [ ] **Step 2: Apply + verify**

```sql
SELECT name, cohort, status, jsonb_array_length(sequence_steps) FROM campaigns
  WHERE cohort IN ('bcba', 'district', 'rc');
-- Expected: 3 rows, each with 9 steps, status='draft'
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260416_seed_cold_campaigns.sql
git commit -m "$(cat <<'EOF'
feat: seed BCBA/District/RC cold sequences as drafts

Three 9-step campaigns with placeholder subjects/bodies marked [DRAFT —
edit in admin]. Loaded as status='draft' so nothing sends until edited
and flipped to active. Per-cohort subdomain set on each campaign.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6: Admin UX

### Task 16: Sequence Builder — Variants Per Step

**Files:**
- Modify: `admin.html` (find the existing campaign sequence editor)

The existing admin has a campaign builder. Extend the sequence step editor so each step can have multiple variants (each with subject + body).

- [ ] **Step 1: Find the existing sequence editor**

```bash
grep -n "sequence_steps" admin.html | head -20
```

(If admin.html doesn't exist or sequence editor is not yet implemented in the admin, this task instead ADDS a basic editor. Inspect the current state and adapt accordingly.)

- [ ] **Step 2: Modify the step editor to support variants**

The data shape change is: each step previously held `{step, day, subject, html}`; now it holds `{step, day, variants: [{id, subject, body_html}]}`.

UI changes:
- Each step in the editor renders an "Add Variant" button alongside its subject/body fields
- Each variant is a `{subject, body_html}` block with a delete button (disabled if only one variant)
- Variant IDs auto-assign as `a`, `b`, `c`, ... on add
- Save handler builds the new format

Implementation skeleton (adapt to existing admin.html patterns):

```html
<!-- inside the sequence step editor template -->
<div class="step-editor" data-step-idx="0">
  <h4>Step <span class="step-num">1</span> — Day <input type="number" class="step-day" value="0"></h4>
  <div class="variants-container"></div>
  <button onclick="addVariant(this)">+ Add Variant (A/B test)</button>
</div>

<script>
function addVariant(btn) {
  const container = btn.previousElementSibling;
  const existing = container.querySelectorAll('.variant');
  const newId = String.fromCharCode(97 + existing.length); // a, b, c, ...
  const div = document.createElement('div');
  div.className = 'variant';
  div.dataset.variantId = newId;
  div.innerHTML = `
    <strong>Variant ${newId.toUpperCase()}</strong>
    <button onclick="this.parentElement.remove()" ${existing.length === 0 ? 'disabled' : ''}>Delete</button>
    <input type="text" class="variant-subject" placeholder="Subject line" required>
    <textarea class="variant-body" placeholder="HTML body" rows="6" required></textarea>
  `;
  container.appendChild(div);
}

function buildSequenceSteps() {
  const stepEls = document.querySelectorAll('.step-editor');
  return Array.from(stepEls).map((el, i) => ({
    step: i,
    day: parseInt(el.querySelector('.step-day').value) || 0,
    variants: Array.from(el.querySelectorAll('.variant')).map(v => ({
      id: v.dataset.variantId,
      subject: v.querySelector('.variant-subject').value,
      body_html: v.querySelector('.variant-body').value
    }))
  }));
}

// On save:
async function saveCampaign(campaignId) {
  const steps = buildSequenceSteps();
  await fetch(SUPA_URL + '/rest/v1/campaigns?id=eq.' + campaignId, {
    method: 'PATCH',
    headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sequence_steps: steps })
  });
}

// On load: populate from existing variants
function loadStep(stepData, container) {
  const variants = stepData.variants || [{ id: 'a', subject: stepData.subject || '', body_html: stepData.html || stepData.body_html || '' }];
  for (const v of variants) {
    // ... render variant block with v.subject, v.body_html
  }
}
</script>
```

(Adapt to existing admin.html JS conventions — likely uses `loadCampaigns()` / `renderCampaign()` functions that need to be edited.)

- [ ] **Step 3: Verify**

Open admin.html in browser → navigate to Campaigns → open the BCBA Cold Sequence (seeded in Task 15) → confirm step editor shows 9 steps, each with 1-2 variants → edit one variant subject → save → re-open and confirm change persisted.

```sql
SELECT sequence_steps->0 FROM campaigns WHERE name = 'BCBA Cold Sequence';
-- Expected: shows the edited variant
```

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "$(cat <<'EOF'
feat: admin sequence editor supports multiple variants per step

Each step now allows adding A/B/C/... variants. Variant IDs auto-assigned.
Backward-compat: legacy single-subject steps load as variant 'a'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Cohort Dashboard

**Files:**
- Modify: `admin.html` (add new "Cohort Dashboard" view)

Per-cohort visualization: queue depth, today's sends vs cap, bounce rate, top winning subjects, bandit posteriors.

- [ ] **Step 1: Add a Cohort Dashboard tab/section**

```html
<div id="cohort-dashboard" style="display:none">
  <h2>Cohort Dashboard</h2>
  <select id="cohort-select" onchange="loadCohortDash(this.value)">
    <option value="bcba">BCBA</option>
    <option value="district">District</option>
    <option value="rc">Regional Center</option>
    <option value="screener">Screener Follow-up</option>
    <option value="re_engage">Re-engagement</option>
  </select>
  <div id="cohort-stats"></div>
</div>

<script>
async function loadCohortDash(cohort) {
  const supaH = { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + accessToken };

  // 1. Find active campaign(s) for cohort
  const campR = await fetch(SUPA_URL + '/rest/v1/campaigns?cohort=eq.' + cohort + '&select=id,name,status,daily_cap,variant_stats,auto_paused_at', { headers: supaH });
  const camps = await campR.json();

  // 2. Queue depth
  const qR = await fetch(SUPA_URL + '/rest/v1/email_send_queue?cohort=eq.' + cohort + '&status=eq.queued&select=id', { headers: { ...supaH, 'Prefer': 'count=exact' } });
  await qR.json(); const qDepth = parseInt(qR.headers.get('content-range')?.split('/')[1] || '0');

  // 3. Today's sends
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  const todayR = await fetch(SUPA_URL + '/rest/v1/email_send_queue?cohort=eq.' + cohort + '&status=eq.sent&sent_at=gte.' + todayStart.toISOString() + '&select=id', { headers: { ...supaH, 'Prefer': 'count=exact' } });
  await todayR.json(); const sentToday = parseInt(todayR.headers.get('content-range')?.split('/')[1] || '0');

  // 4. 24hr bounce rate
  const dayAgo = new Date(); dayAgo.setHours(dayAgo.getHours() - 24);
  let totalSends = 0, bounced = 0, opened = 0, clicked = 0, replied = 0, converted = 0;
  for (const c of camps) {
    const sR = await fetch(SUPA_URL + '/rest/v1/campaign_sends?campaign_id=eq.' + c.id + '&created_at=gte.' + dayAgo.toISOString() + '&select=status,replied_at,converted_at', { headers: supaH });
    const ss = await sR.json();
    for (const s of ss) {
      totalSends++;
      if (s.status === 'bounced') bounced++;
      if (s.status === 'opened' || s.status === 'clicked' || s.status === 'replied') opened++;
      if (s.status === 'clicked') clicked++;
      if (s.replied_at) replied++;
      if (s.converted_at) converted++;
    }
  }

  // 5. Render
  const dash = document.getElementById('cohort-stats');
  dash.innerHTML = `
    <h3>${camps.map(c => c.name).join(', ') || 'No active campaigns'}</h3>
    ${camps.find(c => c.auto_paused_at) ? '<div style="background:#fee;padding:12px;border-left:4px solid red">⚠ Auto-paused at ' + camps.find(c => c.auto_paused_at).auto_paused_at + '</div>' : ''}
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0">
      <div><strong>Queue depth</strong><br>${qDepth}</div>
      <div><strong>Today / Cap</strong><br>${sentToday} / ${camps[0]?.daily_cap || 0}</div>
      <div><strong>24hr bounce</strong><br>${totalSends ? Math.round(bounced/totalSends*1000)/10 : 0}%</div>
      <div><strong>24hr open</strong><br>${totalSends ? Math.round(opened/totalSends*1000)/10 : 0}%</div>
      <div><strong>24hr clicks</strong><br>${clicked}</div>
      <div><strong>24hr replies</strong><br>${replied}</div>
      <div><strong>24hr conversions</strong><br>${converted}</div>
      <div><strong>Total 24hr sends</strong><br>${totalSends}</div>
    </div>
    <h4>Bandit posteriors per step (variant alpha/beta)</h4>
    <pre>${camps.map(c => JSON.stringify(c.variant_stats, null, 2)).join('\n---\n')}</pre>
  `;
}
</script>
```

- [ ] **Step 2: Verify**

Open admin → navigate to Cohort Dashboard → switch between cohorts → confirm metrics render.

- [ ] **Step 3: Commit**

```bash
git add admin.html
git commit -m "$(cat <<'EOF'
feat: cohort dashboard — queue depth, daily cap, bounce rate, bandit state

Per-cohort view: BCBA / District / RC / Screener / Re-engage. Shows queue,
24hr open/click/reply/conversion + bounce rate, auto-paused warning, raw
bandit posteriors per step.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: Optimization Log Viewer + Lead Queue Manager

**Files:**
- Modify: `admin.html`

Two small admin views for visibility into the optimizer + manual control of the queue.

- [ ] **Step 1: Optimization log viewer**

```html
<div id="opt-log-viewer">
  <h2>Optimization Log</h2>
  <div id="opt-log-list"></div>
</div>

<script>
async function loadOptLog() {
  const supaH = { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + accessToken };
  const r = await fetch(SUPA_URL + '/rest/v1/email_optimization_logs?order=created_at.desc&limit=50&select=*', { headers: supaH });
  const logs = await r.json();
  document.getElementById('opt-log-list').innerHTML = logs.map(l =>
    '<div style="border-bottom:1px solid #eee;padding:8px"><strong>' + l.action + '</strong> — ' + new Date(l.created_at).toLocaleString() + '<br><pre>' + JSON.stringify(l.details, null, 2) + '</pre></div>'
  ).join('');
}
</script>
```

- [ ] **Step 2: Lead queue manager**

```html
<div id="queue-manager">
  <h2>Lead Send Queue</h2>
  <select id="queue-cohort" onchange="loadQueue(this.value)">
    <option value="bcba">BCBA</option>
    <option value="district">District</option>
    <option value="rc">Regional Center</option>
  </select>
  <button onclick="pauseCohort()">Pause cohort</button>
  <button onclick="resumeCohort()">Resume cohort</button>
  <table id="queue-table"></table>
</div>

<script>
let currentCohort = 'bcba';
async function loadQueue(cohort) {
  currentCohort = cohort;
  const supaH = { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + accessToken };
  const r = await fetch(SUPA_URL + '/rest/v1/email_send_queue?cohort=eq.' + cohort + '&status=eq.queued&order=priority.asc,scheduled_for.asc&limit=100&select=id,lead_id,scheduled_for,priority', { headers: supaH });
  const q = await r.json();
  document.getElementById('queue-table').innerHTML = '<tr><th>Lead</th><th>Scheduled</th><th>Priority</th><th></th></tr>' + q.map(item =>
    '<tr><td>' + item.lead_id + '</td><td>' + item.scheduled_for + '</td><td>' + item.priority + '</td><td><button onclick="bumpPriority(\'' + item.id + '\')">Bump to top</button></td></tr>'
  ).join('');
}

async function bumpPriority(qId) {
  const supaH = { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' };
  await fetch(SUPA_URL + '/rest/v1/email_send_queue?id=eq.' + qId, {
    method: 'PATCH', headers: supaH,
    body: JSON.stringify({ priority: 1 })
  });
  loadQueue(currentCohort);
}

async function pauseCohort() {
  const supaH = { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' };
  await fetch(SUPA_URL + '/rest/v1/campaigns?cohort=eq.' + currentCohort + '&is_sequence=eq.true', {
    method: 'PATCH', headers: supaH,
    body: JSON.stringify({ status: 'paused' })
  });
  alert('Cohort ' + currentCohort + ' paused.');
}

async function resumeCohort() {
  const supaH = { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' };
  await fetch(SUPA_URL + '/rest/v1/campaigns?cohort=eq.' + currentCohort + '&is_sequence=eq.true', {
    method: 'PATCH', headers: supaH,
    body: JSON.stringify({ status: 'active', auto_paused_at: null })
  });
  alert('Cohort ' + currentCohort + ' resumed.');
}
</script>
```

- [ ] **Step 3: Verify**

Open admin → optimization log shows recent winner_picked / new_variant_generated events from earlier tasks → queue manager shows queued sends, bump priority works, pause/resume works.

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "$(cat <<'EOF'
feat: optimization log viewer + lead queue manager in admin

Optimization log shows recent winner_picked / new_variant_generated /
auto_paused events. Queue manager lists queued sends per cohort with
bump-to-top + cohort pause/resume controls.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7: Verification + Documentation

### Task 19: End-to-End Smoke with Test Cohort

**Files:**
- (No file changes — manual verification)

- [ ] **Step 1: Provision DNS for outreach subdomains**

Follow `docs/legal/RESEND-SUBDOMAIN-SETUP.md`. Confirm all 3 subdomains show "Verified" in Resend dashboard.

- [ ] **Step 2: Set worker secrets**

```bash
wrangler secret put SENDER_BCBA
wrangler secret put SENDER_DISTRICT
wrangler secret put SENDER_RC
wrangler secret put SENDER_TRANSACTIONAL
```

- [ ] **Step 3: Edit BCBA cold campaign with real Day 0 copy**

In admin → Campaigns → BCBA Cold Sequence → edit step 0 variant 'a' to a real subject + body that Ariana approves. Save.

- [ ] **Step 4: Activate BCBA campaign**

Set BCBA Cold Sequence `status='active'` (button in admin).

- [ ] **Step 5: Seed 10 test leads**

```sql
INSERT INTO leads (lead_type, source, email, first_name, cohort, unsubscribe_token)
VALUES
  ('bcba', 'manual_test', 'jorrelpatterson+bcba1@gmail.com', 'Jorrel', 'bcba', encode(gen_random_bytes(16),'hex')),
  ('bcba', 'manual_test', 'jorrelpatterson+bcba2@gmail.com', 'Test2', 'bcba', encode(gen_random_bytes(16),'hex'));
-- ... add up to 10 if you want
```

The auto-enroll trigger from Task 13 should immediately enqueue them.

- [ ] **Step 6: Trigger cron**

```bash
# Locally:
wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

OR deploy and wait for the next scheduled fire.

- [ ] **Step 7: Verify**

- Check inboxes — Day 0 BCBA email should arrive at jorrelpatterson+bcba1@gmail.com etc.
- Check Resend dashboard: 10 sends from `bcba.outreach.modernvillage.app` (not from `hello@modernvillage.app`)
- `SELECT * FROM campaign_sends WHERE email LIKE 'jorrelpatterson+bcba%' ORDER BY created_at DESC;` → 10 rows, sequence_step=0, variant=a, sent_hour set
- Open one email in inbox → wait 1 minute → `SELECT status, opened_at FROM campaign_sends WHERE email = '...';` → status='opened'
- Reply to one email → wait 1 minute → status='replied'

- [ ] **Step 8: Document anything that broke + commit fixes**

If anything breaks during this smoke test, fix in place and commit. (No commit if everything works on first try.)

---

### Task 20: Update Documentation

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/SUPPLEMENTARY.md`
- Modify: `docs/TESTING-GUIDE.md`

- [ ] **Step 1: Update ROADMAP.md**

Find line ~257 (`- [ ] Implement email drip sequences in code (re-engagement, weekly digest) — sequences already written in docs`) and replace with:

```markdown
- [x] Email drip sequences fully wired (2026-04-16) — screener follow-up, multi-touch re-engagement, BCBA/District/RC cold sequences with optimization layer (Thompson sampling, reply tracking, conversion attribution, auto-promote winners). See `docs/superpowers/plans/2026-04-16-email-drips-and-optimization.md`.
```

- [ ] **Step 2: Update SUPPLEMENTARY.md §5**

Find `## 5. EMAIL DRIP SEQUENCES` (around line 161) and replace the body with:

```markdown
## 5. EMAIL DRIP SEQUENCES

All four sequences are fully wired with continual optimization (as of 2026-04-16). HIPAA-compliant (no PHI in emails).

### Sequence 1: Screener Lead → Subscriber (4 emails: Day 0, 3, 7, 10) — wired in worker.js
### Sequence 2: New Subscriber Welcome (3 emails: Day 1, 3, 7) — wired
### Sequence 3: Re-Engagement for Inactive Users (3 emails: Days 7, 14, 21 inactive) — wired
### Sequence 4: Weekly Digest (Fridays) — wired

### Cold B2B Sequences (added 2026-04-16)
- **BCBA** — 9 emails over 45 days, sent from `bcba.outreach.modernvillage.app`
- **District** — 9 emails over 45 days, sent from `district.outreach.modernvillage.app`
- **Regional Center** — 9 emails over 45 days, sent from `rc.outreach.modernvillage.app`

All B2B sequences loaded as drafts; Ariana edits BCBA copy in admin before activation.

### Continual Optimization Layer
- **Reply tracking** — Resend inbound webhook → marks `replied`. Weighted 10x opens.
- **Conversion attribution** — daily backfill cron matches new signups/bookings/subscribes to recent campaign_sends. Weighted 100x opens.
- **Thompson sampling bandit** — picks variants per step with cold-start uniform exploration for first 5 sends.
- **Auto-promote winners** — significance gate (min 50 sends/variant + 90% Bayesian win probability) → AI-generated challenger replaces loser.
- **Per-step + per-cohort scope** — BCBA step 3 optimizes against BCBA step 3 only.
- **Send-time learning** — per-recipient `best_open_hour` rolled up daily from opens.
- **Bounce-rate guard** — auto-pauses cohort if 24hr bounce rate > 5%, alerts Jorrel.

### Send Queue (cold cohorts only)
Scrapers add new leads → trigger auto-enqueues Day 0 send → cron drains queue per-cohort respecting `daily_cap` (warmup: 50/day → 100 → 250 → 500). Admin can pause cohort or bump priority.

Full email copy in `_reference/modern-village-email-sequences.docx` (parent-facing) + admin sequence editor (B2B drafts).
```

- [ ] **Step 3: Update TESTING-GUIDE.md**

Append a new section:

```markdown
## Email Sequences Testing

### Manual smoke for new sequences
1. Apply migrations from `supabase/migrations/20260416_*.sql`
2. Set wrangler secrets per `docs/legal/RESEND-SUBDOMAIN-SETUP.md`
3. Edit BCBA cold campaign with real Day 0 copy in admin
4. Set status=active
5. Seed test leads with `email LIKE '%@modernvillage-test.app'` or `jorrelpatterson+bcba1@gmail.com`
6. Trigger cron: `curl "$WORKER_URL/__scheduled?cron=*+*+*+*+*"`
7. Verify in inbox + `SELECT * FROM campaign_sends WHERE email LIKE 'test%'`

### Bandit health check
- After 50+ sends per variant on a step, check `SELECT details FROM email_optimization_logs WHERE action = 'winner_picked' ORDER BY created_at DESC LIMIT 5;`
- Confirm winner has > 90% win probability + an AI-generated challenger appears in `sequence_steps`

### Reply tracking
- Send a test email via cold cohort
- Reply to it from your inbox
- Within 1 minute, `SELECT replied_at FROM campaign_sends WHERE email = 'your-test-email'` should be non-null
```

- [ ] **Step 4: Commit**

```bash
git add docs/ROADMAP.md docs/SUPPLEMENTARY.md docs/TESTING-GUIDE.md
git commit -m "$(cat <<'EOF'
docs: update roadmap, supplementary, testing for email drips + optimization

Marks email drip sequences done. Documents optimization layer, cold queue,
bandit, and reply tracking. Adds testing checklist for new sequences.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (already applied; documented for traceability)

**Spec coverage:**
- ✅ Sequence A (screener follow-up) → Task 3
- ✅ Sequence B (re-engagement) → Task 4
- ✅ Sequence C (B2B cold) → Tasks 11-15
- ✅ Reply tracking → Task 5
- ✅ Conversion attribution → Task 6
- ✅ Thompson sampling bandit → Task 7
- ✅ Reward function → Task 8
- ✅ Send-time learning → Task 9
- ✅ Auto-promote winners → Task 10
- ✅ Per-step + per-cohort scope → Task 10 (logic) + Task 11 (sender)
- ✅ Email send queue + warmup → Task 12
- ✅ Auto-enroll trigger → Task 13
- ✅ Bounce auto-pause → Task 14
- ✅ Seed cold campaigns → Task 15
- ✅ Admin sequence builder with variants → Task 16
- ✅ Cohort dashboard → Task 17
- ✅ Optimization log viewer + queue manager → Task 18
- ✅ Deliverability subdomain setup → Task 2 (DNS docs) + Task 5 (inbound webhook)
- ✅ End-to-end verification → Task 19
- ✅ Documentation updates → Task 20

**Type/name consistency:**
- `pickVariant()` (Task 7) used in Task 11 — ✓
- `pickSender()` (Task 11) used in Task 11 only — ✓
- `attributeConversion()` (Task 6) used in Task 6 only — ✓
- `posteriorFromSends()` (Task 8) used in Task 10 — ✓
- `sampleBeta()` (Task 7) used in Task 10 — ✓
- `rewardFromSend()` (Task 8) used in `posteriorFromSends()` Task 8 — ✓
- `email_send_queue` columns (Task 1) accessed in Tasks 12, 13, 17, 18 — ✓ all present
- `campaigns.variant_stats` (Task 1) accessed in Tasks 10, 11, 17 — ✓
- `campaign_sends.sequence_step` (Task 1) accessed in Tasks 10, 11 — ✓

**Open questions resolved during planning:**
- Resend inbound subdomain support → assumed yes (verify in Task 19); if not, Task 5 still works on main domain — replies on cold subdomain auto-bounce, less data but no system breakage.
- Send-time selector when warmup cap is binding → defer to next-day (current Task 12 just enforces cap, doesn't reschedule by best_open_hour — that's a Phase 2 of optimization).
- Bandit cold-start → handled in Task 7 with `COLD_START_SENDS = 5` uniform-random gate.
- Ariana's review workflow → in admin (Task 16 enables editing draft variants in place).
