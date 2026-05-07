# Modern Village — Launch Strategy

**Last updated:** 2026-05-06
**Purpose:** Working doc for Jorrel + Ariana to align on launch. Pulls from `docs/MARKETING-PLAYBOOK.md` (full reference) but reorganized around **who does what** and **what to decide together**.

---

## 0. Premise

We have everything we need to launch **except a coordinated push and Ariana's clinical voice in the channels where it matters**. Infra is built (screener, blog, drip infra, CRM with 16K leads, referral, admin tools, iOS on TestFlight build 7). What's missing is the human go-to-market: who shows up where, what we say, what we measure.

---

## 1. Pre-launch — what we agree on tomorrow

Decisions, not tasks. Ariana's input required.

1. **Launch date.** Pick a single calendar day. Recommendation: 2-3 weeks out, after Jorrel forms Modern Village Services LLC + business bank account. Earlier than that = can't process real Stripe cleanly.
2. **Who is "the face"?** B2C parent content: Ariana (BCBA + mom credibility). B2B BCBA: Ariana (peer, not vendor). B2B district/RC: joint sign-off, Jorrel ops. → Confirm she's comfortable with face/voice public.
3. **Pricing posture.** Stay at $19.99/mo Family + free 3 messages, OR run a launch promo (first 100 parents get 3 months free)? Recommend the promo, capped at 100.
4. **Content boundaries.** What can Ariana say publicly without it being clinical advice? "Education, not therapy" disclaimer pattern. Lock the template.
5. **Crisis protocol** if a real crisis comes through any channel (DM/comment/screener). 988 + her personal email, or a non-clinical triage inbox?

---

## 2. Roles — who does what

| Bucket | Jorrel | Ariana | Joint |
|---|---|---|---|
| **Product** | All code, infra, deploys, bugs | Clinical review, BCBA UX feedback, narrative AI tone | Roadmap priorities |
| **B2C parent marketing** | SEO/blog ops, paid spend, automation | Instagram face/voice, FB group posts, podcast guesting | Messaging framework, video scripts |
| **B2B BCBA outreach** | Cold email infra, LinkedIn ops, CRM | Personal warm intros (5 colleagues), peer FB group posts, CalABA networking | Cold email copy review |
| **B2B districts** | Cold email, scrapers, demo tooling, one-pager | Show up to demo calls (clinical credibility) | Pomona USD first-pitch |
| **B2B Regional Centers** | Cold email, research, ops | RC contacts from her network, Dear Mom Co intro | Pitch deck |
| **Grants** | Submission ops, deadlines, paperwork | Clinical claims sign-off, signs as BCBA | Application narratives |
| **Legal/biz** | LLC, EIN, Stripe, contracts | Already filed Modern Village LLC | Sign 7 partnership contracts |

---

## 3. Phase A — Soft launch (Week 1-2)

**Goal:** prove the funnel works at small scale. Not a public push.

- [ ] **Jorrel:** Modern Village Services LLC + EIN + bank + Stripe live.
- [ ] **Jorrel:** Apply 5 highest-priority bug fixes from Ariana's testing session.
- [ ] **Ariana:** Personal warm intros — DM 5 BCBA colleagues with a 2-sentence "I built this with a friend, would you try it?" Track replies in admin CRM.
- [ ] **Ariana:** Post in 2 autism parent FB groups she's a member of. Empathy first, screener as resource, no sell.
- [ ] **Joint:** First Instagram post live (graphic + caption in admin → Social Media). Screener link pinned in bio.
- [ ] **Jorrel:** 50-lead test cold-email batch (BCBA cohort). Measure open + reply rate as baseline. (The full bandit/optimization layer is the next code build but not blocking launch.)
- [ ] **Joint:** Daily 10-min standup (Slack/text) to triage feedback and watch metrics in admin.

**Decision gate:** if screener completions ≥ 20 and BCBA cold-email reply rate ≥ 2%, proceed to Phase B. If not, fix funnel before scaling.

---

## 4. Phase B — Public launch (Week 3-4)

**Goal:** spin all channels at once so the flywheel starts turning visibly.

**Parents (B2C)**
- [ ] Reddit: r/AutismParenting, r/Autism, r/beyondthebump, r/ADHDmoms. Empathy-first, screener as resource.
- [ ] 4 Instagram posts/wk for 2 weeks (drafted in admin).
- [ ] Email autism bloggers (10 targets) for screener backlinks.
- [ ] Activate referral program promo (banner + sidebar nudge).
- [ ] Pediatrician QR flyer pilot — 10 SoCal offices in week 4 to test response before scaling to 40.

**BCBAs (B2B)**
- [ ] First wave cold email: 500 BCBAs (warm-up batch). Subject A/B: "documentation pain" vs "time saved."
- [ ] Ariana posts in 3 BCBA FB groups: "ABA Therapists," "BCBA Study Group," "ABA Edge."
- [ ] LinkedIn Sales Navigator trial — Ariana DMs 30 California BCBAs/week.

**Districts**
- [ ] Pomona USD first cold email — Claudia Ruiz (SpEd Director). Local + Ariana can attend in person.
- [ ] First wave: 100 districts whose LCAP mentions PBIS/parent engagement.

**Regional Centers (highest leverage per dollar)**
- [ ] RCOC + RCSD direct outreach — Family Support Services directors. Ariana to identify contacts from her network first.
- [ ] Draft Dear Mom Co partnership email (offer Modern Village as digital companion to their $495/ticket conferences).

**Grants (time-sensitive)**
- [ ] Submit OAR application ($50K, open now). Ariana signs clinical claims.
- [ ] Submit NEXT for Autism application ($10K).

---

## 5. Phase C — Scale + optimize (Month 2-3)

- [ ] Second BCBA email wave — remaining 14,500 leads. Pace via warmup queue (50→100→250→500/day) once new email-drips infra ships. Until then, batches of 500/day from a separate Resend subdomain to protect transactional reputation. **This is the gating tech build before going hard on cold.** See `docs/superpowers/plans/2026-04-16-email-drips-and-optimization.md`.
- [ ] SELPA outreach (95 leads) — they influence district purchasing.
- [ ] Conference plan: CalABA (Riverside Convention Center). Decide: booth ($), speaker (free + better positioning), or attendee-only.
- [ ] First case study from a real user (parent or BCBA who's seen results in 30 days). Ariana writes the clinical framing.
- [ ] Influencer outreach: 5-20 IG/TikTok creators (5K-50K followers) at $5/subscriber affiliate.
- [ ] Podcast tour: pitch Ariana to 10 autism/ADHD parenting podcasts.

---

## 6. Metrics — weekly async report

5-line Friday update from each side. Source: admin → Marketing tab + admin → Leads CRM.

| Metric | Month 1 target | Month 3 target |
|---|---|---|
| Screener completions | 200 | 1,000 |
| New parent signups | 50 | 300 |
| Pro conversions | 5 (10%) | 50 (~17%) |
| BCBA signups | 20 | 100 |
| District demo calls | 3 | 12 |
| RC pilot conversations | 1 | 3 |
| Email open / click | 25% / 5% | 30% / 7% |
| Grants submitted | 2 | 5 |

If <50% of any target by mid-month, that channel gets a retro and a different hypothesis.

---

## 7. Budget asks (rough)

| Item | One-time | Monthly | Decision |
|---|---|---|---|
| Healthcare attorney review | $2-4K | — | Required before real Stripe charges |
| LinkedIn Sales Navigator | — | $80 | Try month 1, cancel if no response |
| Pediatrician QR flyer print | $200 | — | 40 SoCal offices |
| Resend (current plan) | — | already paid | Add `outreach.modernvillage.app` subdomain — free |
| Influencer affiliate | — | variable ($5/sub) | Performance-based, no risk |
| CalABA conference | $500-2K | — | Decide booth vs attendee |
| Paid Instagram boosts | — | $200-500 | Test month 2 only if organic stalls |

**Total month 1 cash:** ~$3-5K conservative.

---

## 8. The Ariana-specific asks

Things only she can do — flag explicitly so they don't fall in the cracks.

1. **5 warm BCBA intros** — names + emails this week.
2. **RC contacts** — who does she know at any of the 21 Regional Centers?
3. **Clinical sign-off** on all parent-facing AI Coach + Crisis Mode language before promotion.
4. **Disclaimer template** for social ("This is education, not clinical advice.")
5. **Ariana's Consultation Service Note template** — unblocks PC billing Phase 2c (the main insurance path = revenue unlock for BCBAs).
6. **Voice on Instagram** — minimum 1 face-on-camera Reel/week. Talking-head BCBA + mom-of-neurodivergent-kid is the most differentiated content we can make.
7. **HIPAA training certificate** — $15-29, takes a few hours. Required before we sell to any covered entity.

---

## 9. Risks we should name

- **Cold email reputation.** Blasting 15K from `modernvillage.app` tanks Stripe receipts + parent transactional emails. The `outreach.modernvillage.app` subdomain isolation is the next code build (spec + plan committed). Cold scaling waits for it.
- **Ariana's bandwidth.** She has clinical clients. Marketing-Ariana time is finite. Cap weekly (e.g., 5 hr/wk); agree what gets cut first if cap hit.
- **HIPAA exposure.** Until BAAs are signed (Supabase Pro, Resend or alternative, Anthropic), keep PHI off email + out of public marketing. Generic outcomes only.
- **Burn the screener.** Posting same screener in 8 places in week 1 gets flagged as spam in some FB groups. Vary entry point.
- **Provider supply vs parent demand mismatch.** Parents flood in but only Ariana on the marketplace → booking fills, conversion stalls. Recruit 2-3 more BCBAs onto the marketplace before pushing parent acquisition hard.

---

## 10. What Ariana should read first

- `docs/MARKETING-PLAYBOOK.md` — full reference, all 7 client types
- `docs/SUPPLEMENTARY.md` §2, §4, §6, §10, §11 — districts, pediatrician flyers, grants, competitive edge, marketplace economics
- `docs/legal/TERM-SHEET.md` — partnership structure
