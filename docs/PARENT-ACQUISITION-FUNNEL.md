# Parent Acquisition Funnel & Ad Strategy

**Created:** 2026-04-17 | **Owner:** Jorrel | **Status:** Ready to execute

Companion to [MARKETING-PLAYBOOK.md](MARKETING-PLAYBOOK.md) (channels + personas) and [PARENT-EXECUTION-4WEEKS.md](PARENT-EXECUTION-4WEEKS.md) (week-by-week actions).

---

## The Full Funnel

```
┌─────────────────────────────────────────────────────┐
│ 1. TRAFFIC                                          │
│   Reddit / FB / Instagram / Paid / SEO / Flyers /  │
│   Podcast / Referral → screener.html or app.html   │
└────────────────────┬────────────────────────────────┘
                     │ Target CTR: 5-15% from Reddit,
                     │ 1-3% from paid ads, 30%+ from flyers
                     ▼
┌─────────────────────────────────────────────────────┐
│ 2. LANDING / SCREENER                               │
│   M-CHAT-R autism screener or app landing page     │
└────────────────────┬────────────────────────────────┘
                     │ Target: 40-60% complete the screener
                     │        (12 quick yes/no questions)
                     ▼
┌─────────────────────────────────────────────────────┐
│ 3. EMAIL CAPTURE                                    │
│   Results page asks for email to send score        │
└────────────────────┬────────────────────────────────┘
                     │ Target: 70-85% provide email
                     │        (they want results)
                     ▼
┌─────────────────────────────────────────────────────┐
│ 4. EMAIL DRIP (LIVE as of 2026-04-17)               │
│   Day 0: Screening results + platform intro        │
│   Day 3: "What ABA actually looks like at home"    │
│   Day 7: "3 strategies that work"                  │
│   Day 10: Final value drop + final CTA             │
└────────────────────┬────────────────────────────────┘
                     │ Target: 15-25% click through to
                     │        modernvillage.app/app.html
                     ▼
┌─────────────────────────────────────────────────────┐
│ 5. FREE SIGNUP                                      │
│   Google OAuth or email → parent account created   │
│   3 free AI coach messages                         │
└────────────────────┬────────────────────────────────┘
                     │ Target: 35-50% of email-drip clickers
                     ▼
┌─────────────────────────────────────────────────────┐
│ 6. ACTIVATION (daily habit formation)               │
│   Daily check-in streak + behavior logging +       │
│   routine builder + strategy cards                 │
└────────────────────┬────────────────────────────────┘
                     │ Target: 40%+ return Day 2
                     │        25%+ logging daily by week 1
                     ▼
┌─────────────────────────────────────────────────────┐
│ 7. PAYWALL (message 4)                              │
│   "Upgrade to Pro for unlimited coaching"          │
└────────────────────┬────────────────────────────────┘
                     │ Target: 5-10% of free signups
                     │        → Pro ($19.99/mo)
                     ▼
┌─────────────────────────────────────────────────────┐
│ 8. PAID ($19.99/mo recurring)                       │
│   Target retention: 80%+ month 2 (LTV ≈ $120-240)  │
└─────────────────────────────────────────────────────┘
```

---

## Expected Conversion Rates (for CAC math)

| Funnel Stage | Expected % | Compounded |
|--------------|-----------|------------|
| Traffic → screener start | 5-15% (organic) / 1-3% (paid) | — |
| Screener start → complete | 50% | — |
| Screener complete → email captured | 75% | — |
| Email captured → app click | 20% | — |
| App click → free signup | 40% | — |
| Free signup → Pro subscriber | 7% | — |
| **Net:** screener complete → Pro | **≈ 0.4% (organic) / 0.04% (paid cold)** | |

**Reality check:** 1000 screener completions → ~4 Pro subscribers organic, ~0.4 paid. These numbers will feel low on first pass — that's normal. Optimization (subject lines via bandit, landing page A/B, paywall placement) lifts each stage independently.

**LTV math:** At $19.99/mo × 80% retention over 12 months ≈ **$180 LTV**. With 70% gross margin (Stripe + Supabase + Anthropic cost), **$125 contribution per subscriber.**

**Max allowable CAC** (payback in 6 months): ≈ **$60 per Pro subscriber.**
**Target CAC** (payback in 3 months): ≈ **$30 per Pro subscriber.**

---

## Attribution & Tracking (NEEDS BUILD)

You currently have ZERO funnel visibility. This is the #1 gap.

### UTM parameter scheme

Every link you share in a channel must carry UTM parameters:

```
https://modernvillage.app/screener.html?utm_source=<channel>&utm_medium=<type>&utm_campaign=<name>
```

**Required values:**
- `utm_source`: `reddit` | `facebook` | `instagram` | `meta_ads` | `google_ads` | `tiktok` | `pediatrician` | `podcast` | `referral` | `direct`
- `utm_medium`: `organic_post` | `paid_ad` | `flyer` | `email` | `referral_link`
- `utm_campaign`: unique per campaign (e.g. `r_autismparenting_2026-04-18`, `pedi_pomona_batch1`, `meta_mom_11pm_v1`)

### Build task (~30 min, blocks measurement)

Add to `screener.html`:
```js
// On page load, capture UTMs
const params = new URLSearchParams(window.location.search);
const utm = {
  source: params.get('utm_source'),
  medium: params.get('utm_medium'),
  campaign: params.get('utm_campaign'),
};
sessionStorage.setItem('utm', JSON.stringify(utm));
```

On screener submission, add the UTM object to the payload. Update the `screener_leads` table with a new `source_data jsonb` column (via migration). This gives you per-channel lead tracking.

### Dashboard

Add a "Sources" section to admin.html pulling from `screener_leads.source_data`. Breakdown: screener completions + signups + Pro conversions per `utm_source`.

---

## Paid Ads Strategy

**You said you're OK starting sooner. Here's the phased approach:**

### Phase A — Validation test (Week 1, $500 budget)

**Purpose:** find out if paid cold traffic converts at all on the drip funnel. If yes, scale. If not, diagnose.

**Platform:** Meta Ads (Facebook + Instagram). Best targeting for "autism moms." Google Search second priority. TikTok later.

**Targeting (Meta Ads Manager):**
- Location: California only (keeps CAC low during test)
- Age: 28-44
- Gender: Women (85% of decision-makers per playbook)
- Interests: "Autism Speaks", "Autism awareness", "Autism Society of America", "National Autism Association", "Special needs", "ADHD", "Applied behavior analysis", "IEP"
- Behaviors: Parents (all), Parents (preschoolers), Parents (early school age)
- Exclude: people who've engaged with your page in last 90 days (don't pay to reach already-organic traffic)

**Ad set:**
- Campaign objective: Conversions (not "Traffic" — always Conversions for B2C subscription)
- Conversion event: `screener_complete` (requires Meta Pixel event fires on screener thanks page)
- Budget: $50/day × 10 days = $500
- Bidding: Lowest cost, no cap

**Creative variants (2 to run against each other):**

1. **"The 11pm video"** (highest-tested angle):
   - 15-sec vertical video / static with text overlay
   - Hook: "You're searching 'autism signs toddler' at 11pm"
   - Body: "You're not failing. The system wasn't built for your child. A free 12-question screener + free at-home ABA strategies — no diagnosis required."
   - CTA: "Take the free screener"
   - Image: Phone in the dark, mom's hand visible, soft light
   - Destination: `https://modernvillage.app/screener.html?utm_source=meta_ads&utm_medium=paid_ad&utm_campaign=mom_11pm_v1`

2. **"Strategy card preview"**:
   - Static image / carousel
   - Hook: "3 strategies that work whether or not your child has a diagnosis"
   - Body: "1. First-Then language. 2. Visual schedules. 3. Catch them being good. Free screener + personalized AI coach at modernvillage.app"
   - CTA: "See more"
   - Image: clean strategy card mockup (use the in-app screenshot)
   - Destination: same screener with utm_campaign=`strategy_preview_v1`

**Meta Pixel setup** (30 min): create Meta Pixel in Business Manager → add pixel ID to `index.html`, `screener.html`, `app.html` → configure `PageView` + `InitiateCheckout` (screener start) + `CompleteRegistration` (screener complete) + `Subscribe` (Pro purchase) standard events.

### Phase B — Scale if validation works (Week 3+, $1000-2000/week)

**Triggers to scale:**
- Screener complete CPA < $10
- Pro subscriber CPA < $60 (6-month payback)
- Meta Pixel reports 20+ screener completes per ad set

**Scale tactics:**
- Duplicate winning creative, change hook (test 3rd and 4th angle)
- Expand geo: CA + OR + WA + AZ (neighboring markets first)
- Retargeting ad set: people who started screener but didn't complete

### Phase C — Google Search (Week 4+, $500/week)

**Purpose:** intercept high-intent queries. Parents searching "my child might be autistic" are warmer than Meta browsers.

**Campaign structure:**
- 1 campaign: Exact + Phrase match keywords
- Keywords: `autism signs toddler`, `autism screener`, `m-chat-r`, `adhd or autism child`, `iep help`, `autism strategies home`
- Negative keywords: `autism speaks donation`, `autism awareness month`, `adult autism`, `aspergers`
- Landing page: screener.html
- Budget: $20/day = ~$500/month to start

### Phase D — TikTok (later, $500 test)

**Only after Meta is dialed in.** TikTok needs dedicated video creative (not adapted from Meta). Leave for Month 2.

---

## Organic Channels — Prioritized by ROI

1. **Reddit** (free, highest-intent parents searching at 11pm) — see execution playbook
2. **Pediatrician QR flyers** (~$93K/yr projection per SUPPLEMENTARY §4) — highest ROI per effort
3. **Facebook parent groups** (Ariana soft presence, not vendor)
4. **Podcast outreach** (Ariana as guest, 50-100 shows scraped)
5. **SEO/blog** (already live, compounds passively)
6. **Instagram** (brand awareness, not direct conversion)
7. **Influencer affiliates** ($5/sub, 5-20 creators — later)
8. **Referral program** (already live — surface it more in-app)

---

## Weekly Review Cadence

Every Monday, check admin → Sources dashboard:

| Metric | Target Week 1 | Target Month 1 | Action if below |
|--------|--------------|----------------|------------------|
| Screener completions | 50 | 500 | Increase channel volume |
| Email captures | 40 | 400 | Landing copy A/B test |
| App clicks (from drips) | 8 | 80 | Rewrite Day 3 email subject line |
| Free signups | 5 | 40 | Paywall/onboarding UX review |
| Pro subscribers | 1 | 5-10 | Pricing / paywall placement test |
| Paid CAC (screener complete) | — | < $10 | Pause underperforming ad sets |
| Paid CAC (Pro subscriber) | — | < $60 | Investigate funnel drop-off |

---

## Creative Guidelines (recycle across channels)

### Hooks that work (use in both paid ads and organic posts)

1. "You're not failing. The system wasn't built for your child."
2. "You're searching 'autism signs toddler' at 11pm. I made this for you."
3. "What if your child's meltdown had a pattern?"
4. "Free autism screener — no email required to take it."
5. "3 strategies that work whether or not your child has a diagnosis."
6. "Every BCBA bills $200/hour. You don't have $200/hour."
7. "Your IEP is 40 pages. Let us translate it."

### What to avoid

- Anything that sounds clinical or scary ("disorder", "deficit", "abnormal")
- "Get your child diagnosed" — diagnosis isn't the goal; support is
- Stock photos of kids looking sad
- "Revolutionary AI" / "Game-changing" — caregivers are skeptical of hype

### Image/video style

- Warm, cream/sage palette (matches app branding)
- Real parent shots if possible (ask Ariana for tester consent)
- Strategy card mockups (screenshots of the in-app strategy cards work well)
- Avoid stock "sad kid" imagery — use problem-solution framing with neutral visuals

---

## Reactivation / Retention (post-acquisition)

Drips handle days 1-21. Beyond that:
- **Week 4+ inactive:** already handled by re-engagement sequence
- **Push notifications** (post-Capacitor wrap): daily check-in 8pm, streak at risk, milestone celebration — this is the biggest retention multiplier
- **Monthly "Your child this month" summary email** — propose after 1K parents
- **Winback sequence for churned subscribers** — propose after first churn cohort visible

---

## Next-up decisions

1. **Add Meta Pixel + UTM tracking to screener.html** — blocks ad measurement, needs dev work (~2 hours)
2. **Add `source_data jsonb` column to `screener_leads`** — enables per-channel attribution
3. **Build admin Sources dashboard** — view conversions per UTM source
4. **Create the ad account structure in Meta Business Manager** — 15 min setup

Do items 1-3 before spending any paid ad budget. Otherwise you're flying blind.
