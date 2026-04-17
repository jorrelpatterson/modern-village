# Parent Acquisition — 4-Week Execution Playbook

**Created:** 2026-04-17 | **Owner:** Jorrel (you execute) | **Companion to:** [PARENT-ACQUISITION-FUNNEL.md](PARENT-ACQUISITION-FUNNEL.md)

Everything in here is copy-paste ready. No new writing required on your end — just execute.

---

## Prerequisites (do before Week 1)

**~3 hours of work, blocks everything else:**

- [ ] Add Meta Pixel to site (Business Manager → create pixel → paste ID into `index.html`, `screener.html`, `app.html` base template)
- [ ] Add UTM capture to screener.html + new `source_data jsonb` column on `screener_leads` (one migration + ~30 lines of JS)
- [ ] Open Meta Ads Manager account, verify domain, set billing
- [ ] Set up Google Ads account (doesn't need funding yet — just verify)

If you want the dev work batched: ask me to scope "Attribution + Pixel" as a small build. ~2 hours, one commit.

---

## Week 1 — Organic foundation + paid validation test

**Goal:** 50 screener completions from a mix of channels. Start learning which channel works.

### Monday — Launch organic

**Reddit posts** (create a throwaway-ish account if needed, but post authentic):

**Post 1 — r/AutismParenting** (1M+ members):
```
Title: Built a free ABA strategy app for families who can't afford $200/hr BCBA sessions

Body:
My wife (BCBA, 10+ years) and I built this because we kept meeting parents who were doing everything right but burning out. No diagnosis required to use it.

The core thing: an AI coach that learns your child's specific patterns — triggers, what calms them, what works. We built in behavior tracking, routine builder, IEP document analysis, and a free M-CHAT-R screener.

Free forever: 3 AI coach conversations, screener, blog, strategies. Pro is $19.99/mo if you want unlimited coaching.

Also free: the 12-question M-CHAT-R autism screener at modernvillage.app/screener.html?utm_source=reddit&utm_medium=organic_post&utm_campaign=r_autismparenting_2026-04-18

Happy to answer questions. If it's not for you — no problem. Just wanted to share something that might help someone else reading at 2am.
```

**Post 2 — r/beyondthebump** (1M+ members):
```
Title: Free developmental screener for toddlers 16-30 months (M-CHAT-R)

Body:
If you've ever googled "is my toddler hitting milestones" at 2am — this is the tool pediatricians actually use. 12 yes/no questions, takes 2 minutes, gives you a plain-English result.

It's at modernvillage.app/screener.html?utm_source=reddit&utm_medium=organic_post&utm_campaign=r_beyondthebump_2026-04-18 — free, no email required to take it.

Not medical advice, obviously, but if something feels off it can help you know whether to bring it up at the next well-visit. Or reassure you that you're probably fine.

Built by a BCBA (board certified behavior analyst) + software team. Happy to answer questions in comments.
```

**Post 3 — r/ADHDparenting** (200K+ members):
```
Title: Built a behavior tracker + AI coach specifically for neurodivergent kids

Body:
Parent-BCBA team here. Frustrated that every parenting app is "generic" while our kids are anything but. Built something that:
- Logs behaviors and learns patterns (peak times, common triggers)
- Has an AI coach that remembers your specific child across sessions
- Includes a routine builder with visual schedules
- Does IEP document analysis (upload, get plain-English breakdown)

Free to try 3 coach messages. $19.99/mo for unlimited. No diagnosis required.

modernvillage.app/screener.html?utm_source=reddit&utm_medium=organic_post&utm_campaign=r_adhdparenting_2026-04-18
```

**Rules:**
- Post ALL 3 on Monday (different subs, spaced 4-6 hours)
- Check comments ~3 hours after posting, reply warmly to every comment
- NEVER defend against criticism — thank and move on
- If someone says "this is a plug," edit the post to add "Yes I built this, figured that was obvious — asking for feedback not sales"

### Tuesday — Facebook parent groups

**Pre-work:** Join these 10 groups (they all require request approval, which takes 1-2 days — start requests NOW):
1. Autism Moms (closed, 30K+ members)
2. Autism Parents Support Group (closed, 50K+)
3. ADHD Moms (closed, 40K+)
4. IEP Help Advocacy Parents Helping Parents (closed, 20K+)
5. Neurodivergent Parents Collective (open, 10K+)
6. Autism Moms with Lots of Kids (closed, 15K+)
7. Raising Autistic Kids (closed, 25K+)
8. Special Needs Moms Support (closed, 20K+)
9. Autistic and Unashamed — Parents of Autistic Kids (closed, 15K+)
10. ABA Parents Support Group (closed, 10K+)

**Approved? Post this (adjust to each group's vibe):**

```
Hi — I'm [your name]. My [wife/colleague] is a BCBA and we just launched something we've wanted for years: a free AI coach that learns YOUR kid's specific patterns instead of giving generic advice.

Free to start (3 AI conversations + a free M-CHAT-R screener + strategy library). $19.99/mo for unlimited coaching if you find it useful.

Not selling — just sharing. If mods don't allow this, please delete. If anyone wants to try: modernvillage.app/screener.html?utm_source=facebook&utm_medium=organic_post&utm_campaign=fb_[groupname]_2026-04-18

Happy to answer questions.
```

### Wednesday — Launch $500 Meta Ads test

See [PARENT-ACQUISITION-FUNNEL.md](PARENT-ACQUISITION-FUNNEL.md) → "Phase A — Validation test" for full campaign spec. Start $50/day × 10 days with 2 creative variants.

### Thursday — Instagram first posts

Post 4 graphics (already built per roadmap). Use captions from `_reference/ig-captions.md` if present. If not, here are 4 hooks:

**Post 1** — "3 strategies that work whether or not your child has a diagnosis"  
Caption: "Save this for later. Link to free screener in bio. #neurodivergent #autism #adhd #parenting"

**Post 2** — "You're not failing. The system wasn't built for your child."  
Caption: "If you've ever cried in the car after a meltdown, you're not alone. Link in bio for free strategies. #autismparent #adhdmom"

**Post 3** — "What ABA actually looks like at home (it's not what you think)"  
Caption: "No clinical drills. No bribery. Just small, consistent moves that add up. Link in bio. #aba #appliedbehavioranalysis #parenting"

**Post 4** — "Free 12-question autism screener — pediatrician-approved M-CHAT-R"  
Caption: "Not a diagnosis. Just clarity. Free, no signup required to take. Link in bio. #autismscreening #mchat #neurodivergent"

### Friday — Pediatrician flyers

**Design** (5 minutes in Canva):
- 5×7 postcard, cream background, sage green accents (match brand)
- Top: "Free autism + developmental screener"
- Middle: Large QR code → `https://modernvillage.app/screener.html?utm_source=pediatrician&utm_medium=flyer&utm_campaign=pedi_batch1_2026-04`
- Bottom: "Takes 2 minutes. No email required. M-CHAT-R standard. Results in seconds."
- Small print: "modernvillage.app • Built by a BCBA"

**Print:** 200 postcards at Vistaprint or local print shop (~$40).

**Distribute:** Drop 5-10 postcards at 20-40 pediatrician offices over the weekend. Explain at the front desk: "Free developmental screener for your families. No sign-up. We built this with a BCBA to help parents figure out if they should bring concerns up at their next well-visit." Most offices will take them. Some will pin them to the bulletin board.

### Saturday — Review Week 1 data

In admin.html, check Sources dashboard (if built) or screener_leads table filtered by `created_at > 7 days ago`:

```sql
SELECT
  source_data->>'source' as source,
  count(*) as screener_completions
FROM public.screener_leads
WHERE created_at >= now() - interval '7 days'
GROUP BY source_data->>'source'
ORDER BY screener_completions DESC;
```

**Expected distribution:**
- Reddit: 15-30 completions (depends on whether your post got upvoted or buried)
- Facebook: 5-15
- Meta Ads: 20-50 (paid test)
- Pediatrician: 0-5 (takes longer to see results, parents don't visit the day they grab the flyer)
- Instagram: 1-3 (brand awareness, not conversion yet)

If Reddit got < 10: your posts got buried. Different title, repost next week.
If Meta Ads got < 20: creative or targeting problem. A/B test new hook.

---

## Week 2 — Expand organic, scale what works

### Monday — Podcast outreach (Ariana as guest)

**Scraper already found 50-100 autism/ADHD parenting podcasts.** Pick top 10 by audience size.

**Template email** (send from Ariana's real email, not yours):

```
Subject: BCBA + parent — free educational tool for your listeners

Hi [host first name],

Loved your episode on [specific episode — actually listen to one, reference it by name]. I'm Ariana, BCBA with 10+ years in ABA working with autistic and ADHD kids in SoCal.

I built a free AI coaching tool (with my co-founder [Jorrel]) for parents who can't afford weekly sessions. Thought your audience might benefit.

Would you have me on for 30 minutes? Happy to talk about:
- ABA basics without the jargon (what does "pairing" really mean?)
- The 3 strategies that work for 80% of kids regardless of diagnosis
- What to do in the first 72 hours after a concerning pediatrician visit
- Why 80% of IEPs fail without parent follow-through

No pitching. Just education. I'd mention the tool once at the end if it fits.

Free to talk next [week/2 weeks]? Recording time is flexible.

- Ariana
[credentials, link to Modern Village]
```

**Send to 10 podcasts this week.** Track responses in a simple sheet.

### Tuesday — Scale winning Reddit posts

If any Week 1 Reddit post got > 50 upvotes, post a variation to another sub:
- Winner in r/AutismParenting → try r/SpecialNeedsParenting
- Winner in r/beyondthebump → try r/NewParents
- Winner in r/ADHDparenting → try r/Parenting with ADHD angle

If nothing worked: try a DIFFERENT hook (less sales-y, more story). Example:

```
Title: My daughter had a meltdown today and I realized I've been responding wrong for 4 years

Body:
She's 6, autistic, non-speaking. Today at Target she melted down over the wrong flavor of yogurt. Pattern I noticed in our app: every single meltdown this month has been between 3:45pm and 5:15pm. Just... the transition from school to home.

Built a "transition timer" into her after-school routine. 5 min visual countdown before we do anything demanding. Meltdowns are 60% down in 2 weeks.

Modern Village (modernvillage.app/screener.html?utm_source=reddit&utm_medium=organic_post&utm_campaign=r_[sub]_transition_story) gave me the pattern data to see it. Sharing in case it helps someone.
```

This kind of story post converts 3-5x better than pitch posts.

### Wednesday — Meta Ads optimization

Check your $500 Meta Ads test (5 days in).

**If CPA per screener_complete < $10:** scale to $100/day, add a third creative variant.

**If CPA > $20:** pause the underperforming ad set, test new creative (try the story hook from Tuesday).

**If Pro subscriptions attributed to Meta Ads = 0:** that's expected. Funnel drip takes 10-14 days to show Pro conversions. Don't kill yet.

### Thursday — Instagram: grow to daily posting

Schedule 30 posts for the next 30 days. Content pillars:
- **Monday** — "Monday morning routine hack" (visual)
- **Tuesday** — "What's working this week" (parent tip)
- **Wednesday** — Strategy card screenshot
- **Thursday** — Myth bust ("autism isn't X, it's Y")
- **Friday** — "Small win Friday" (celebrate parent wins)
- **Saturday** — Community quote
- **Sunday** — Week ahead prep tips

Use a scheduler like Buffer or Later. 30 posts × 3 min to schedule = 90 min once, then autopilot.

### Friday — Pediatrician follow-up + grants

**Pediatrician follow-up:** call the 3 offices you dropped the most flyers at. "Just checking in — any families mentioned the screener?" Builds the relationship for future batches.

**Grants:** Submit OAR application (researchautism.org). $50K on the table. Ariana to review clinical claims before submission. Use `_reference/grant-oar-letter-of-intent.docx` as starting point.

### Saturday — Week 2 review

```sql
SELECT
  source_data->>'source' as source,
  count(*) as completions,
  count(CASE WHEN exists (SELECT 1 FROM profiles WHERE email = screener_leads.email) THEN 1 END) as signups
FROM public.screener_leads
WHERE created_at >= now() - interval '14 days'
GROUP BY source_data->>'source';
```

Also check admin Optimization Log — any bandit winner_picked events yet? (Need 50+ sends per variant before the optimizer fires.)

---

## Week 3 — Add influencers + double down

### Monday — Influencer affiliate outreach

**Find 15 creators** on Instagram + TikTok in the autism/ADHD mom space with 5K-50K followers (sweet spot — bigger = too expensive, smaller = too small reach).

Search hashtags: `#autismmom`, `#adhdmom`, `#neurodivergentfamily`, `#autismparenting`, `#momoftwins` (autism twins is a niche).

**DM template:**

```
Hi [first name] — love your [specific post — reference a recent one].

I'm Jorrel, co-founder of Modern Village. We built a free AI coach + behavior tracker specifically for neurodivergent families. BCBA-founded.

Would you be open to an affiliate partnership? $5/subscriber, no minimums, no contracts. You share a link, I pay you via Stripe when someone subscribes. I think your audience would genuinely benefit — it's not a scammy mom-course, it's a real tool.

I can send you a free Pro account + a demo call if you want to check it first.

- Jorrel
modernvillage.app
```

Send to 15. Expect 2-3 yes responses. Each is good for 5-20 new subs over 3 months if they actually post.

### Tuesday — Meta Ads scale (if working)

If screener completes per ad < $10 AND at least 2 Pro subs attributed: scale from $50/day to $150/day. Add 2 new creatives.

If NOT working: pause, re-scope creative. Ask me to help diagnose.

### Wednesday — Google Search Ads launch

See [PARENT-ACQUISITION-FUNNEL.md](PARENT-ACQUISITION-FUNNEL.md) → "Phase C — Google Search." $500/month starting budget. Targeting long-tail queries that indicate high intent.

### Thursday — Blog SEO refresh

Your 10 blog posts already exist. Check each one for:
- Has it got internal links to screener.html?
- Does it end with a CTA button?
- Is the meta description compelling?

Spend 2 hours updating weakest 3 posts. Small SEO lifts compound monthly.

### Friday — Submit second grant

NEXT for AUTISM ($10-50K). Use `_reference/grant-next-for-autism.docx`.

### Saturday — Week 3 review

By now you should have enough data to see which channel has the BEST CAC. Expected ranking (roughly):

1. **Pediatrician flyers** — highest intent, lowest cost
2. **Podcast mentions** — if even 1 podcast host agreed and did a 30-min episode with you
3. **Reddit organic** — free, but ceiling is low (each post decays quickly)
4. **Referral program** — builds slowly
5. **Meta Ads** — scales, but expensive per Pro sub
6. **Instagram** — brand, not conversion
7. **Google Ads** — mid-cost, high intent

---

## Week 4 — Optimize, decide what to scale into Month 2

### Monday — Full funnel audit

Dashboard review. For each stage, identify the biggest drop-off:

- **Traffic → screener start:** landing page issue? Try a different headline on screener.html.
- **Screener → email:** maybe people don't want to give email. Test: make email optional, give partial results.
- **Email → app click:** subject lines. Bandit optimizer should help if you have 50+ sends/step. Manually A/B test if not.
- **Free signup → Pro:** onboarding issue. Do you actually hit the paywall? Is the paywall compelling?

### Tuesday — Double down on winners

Whatever channel had the best CAC in Weeks 1-3 → 2x the effort on it in Month 2.

### Wednesday — Kill what's not working

If Instagram has produced 0 signups in 4 weeks, reduce to 3 posts/week instead of daily. If Meta Ads CAC is > $80, cut budget to $25/day and try new creative.

### Thursday — Add reactivation layer (if Capacitor ships this month)

Push notifications would radically change retention: daily check-in 8pm, streak at risk, milestone, weekly digest. This is the biggest month-2 lever.

### Friday — Month 1 retrospective document

Write down in one page:
- Total spend
- Total screener completions
- Total free signups
- Total Pro subscribers
- CAC per channel
- LTV projection (extrapolate from Week 1-4 churn signal, if any)
- Decision: what's the Month 2 plan?

### Saturday — Rest

Seriously, take a day off. You'll burn out otherwise.

---

## Tracking sheet — what to maintain

Weekly, update a Google Sheet or Notion with:

| Week | Spend | Screener completions | Free signups | Pro subs | CAC (Pro) |
|------|-------|---------------------|--------------|----------|-----------|
| 1 | $500 | 50 | 5 | 0-1 | — |
| 2 | $500 | 100 | 12 | 1-2 | $500 |
| 3 | $1000 | 180 | 22 | 3-5 | $300 |
| 4 | $1500 | 280 | 35 | 5-8 | $200 |

Month 1 target: 200-300 screener completions, 30-50 free signups, 5-10 Pro subscribers. ~$3.5K ad spend. $100-500 Pro CAC while you find channel-market fit.

This is HIGH CAC for B2C subscription. It drops as drips improve, bandit optimization kicks in, channel mix optimizes. By Month 3 target is CAC < $60 (payback ≤ 6 months).

---

## Month 2+ preview

- Add TikTok paid (different creative than Meta)
- Launch podcast guest strategy (Ariana 2x/month)
- Scale the winning pediatrician flyer distribution to 100+ offices
- Test YouTube pre-roll on autism-related content
- Build Annual Village Report PDF feature (converts to Pro for IEP meetings)
- Consider hiring a fractional growth marketer if CAC < $40 consistently

---

## When to ask for dev help

Come back to me when you need:
- Attribution build (UTM capture + Sources dashboard) — ~2 hours
- Landing page A/B test framework — new lever
- Paywall placement test — tweak `app.html`
- Referral program revamp if organic numbers stagnate
- New blog post on a specific keyword if SEO is underperforming
