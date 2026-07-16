# NSF SBIR Phase I — Project Pitch (Working Draft)

**Status:** DRAFT — needs Ariana's clinical sign-off before submission.
**Submission target:** Within the first week the portal reopens (Jun 2, 2026).
**Topic:** Digital Health → Physical, Mental and Behavioral Health
**Applicant:** Modern Village Services LLC
**Submission portal:** https://seedfund.nsf.gov/project-pitch/

---

## Format reminder (verified 2026-05-27)

Four sections, total ~10,500 characters (~1,500 words / 1–3 pages):
- §1 Technology Innovation — **3,500 char max**
- §2 Technical Objectives and Challenges — **3,500 char max**
- §3 Market Opportunity — **1,750 char max**
- §4 Company and Team — **1,750 char max**

NSF returns invite/decline in ~3 weeks. Only invited pitches submit a full Phase I proposal (~$275K, due ~3 months after invite).

---

## §1. Technology Innovation

Modern Village is an AI-powered behavioral health platform that closes the loop between parents of neurodivergent children and the clinical providers who treat them. The core innovation is an Adaptive AI Engine that learns each child's behavioral patterns across 12 dimensions — sleep, sensory triggers, transitions, antecedent contexts, behavioral function, communication mode, regulatory state, and others — from short daily parent check-ins, then delivers personalized, evidence-based, ABA-aligned coping strategies in real time. At 11pm during a meltdown, not in a 50-minute clinical session two weeks later.

Three sub-innovations make this possible:

**(a) Bidirectional behavioral-data infrastructure.** Parent-generated home observations — incidents, antecedents, consequences, free-text notes, photo/video clips — are structured into ABC events, validated against BCBA-defined operational definitions of target behaviors, and surfaced in the treating clinician's session dashboard as live trend graphs with phase-change lines. Conversely, BCBA-authored skill targets and replacement behaviors flow back to the parent as in-context coaching prompts. No existing tool spans this loop: current systems are either parent-only (consumer apps with no clinical integration) or clinician-only (CentralReach, Catalyst, Rethink Behavioral Health) with no home-data ingestion path.

**(b) Personalization that improves with use.** The coaching model adjusts based on what worked for THIS child in THIS context, rather than serving generic advice. Parents typically hear "just be consistent" from clinicians and websites; our system instead recommends the specific antecedent modification, replacement behavior, or sensory regulator that has historically reduced the target behavior for that child.

**(c) Offline-first clinical workflow.** BCBAs collect trial-by-trial data, take ABC notes, and run probe sessions in environments without reliable connectivity (homes, schools, community settings) via IndexedDB-backed local storage that syncs deterministically. Auto-generated SOAP notes and CPT-coded superbills reduce per-session documentation time from 30+ minutes to under 5.

The R&D risk: personalization at this resolution requires research into multi-stakeholder privacy-preserving learning (parents, caregivers, teachers, multiple clinicians on one care team) under HIPAA constraints, and into the longitudinal validity of AI-generated behavior-change recommendations against BCBA gold-standard clinical judgment.

---

## §2. Technical Objectives and Challenges

The Phase I effort centers on three technical objectives, each addressing an open research question and an associated risk.

**Objective 1 — Validate the Adaptive AI Engine's behavior-change recommendations against BCBA clinical judgment.** The engine generates personalized coaching prompts from each child's structured behavioral history. Phase I will run a blinded comparison: for 200 parent-submitted real-world incident scenarios, generate AI recommendations and have 5 board-certified BCBAs independently evaluate each on (i) clinical appropriateness, (ii) evidence-base alignment, and (iii) likely behavioral efficacy. Target: ≥85% inter-rater agreement that AI recommendations are clinically appropriate. **Challenge:** establishing a gold-standard rubric when ABA practice itself has high BCBA-to-BCBA variation. **Mitigation:** rubric derived from published BACB practice guidelines and pre-registered with the review panel before scoring begins.

**Objective 2 — Build and validate an automated ABC pattern-detection model.** Free-text parent observations are mined for antecedents, behaviors, and consequences and structured into the standardized A-B-C event format used in clinical ABA. Phase I will train a transformer-based extractor on a corpus of 10,000 BCBA-validated ABC entries, test against held-out parent observations, and measure F1 against a BCBA-coded reference set. Target: F1 ≥ 0.80 for each of the three components. **Challenge:** parent vocabulary differs sharply from BCBA technical language ("had a tantrum after I asked him to put away his iPad" vs. "elopement maintained by escape from non-preferred task demand"). **Mitigation:** training corpus is paired (parent-language + BCBA-coded), and the extractor is evaluated separately on novel parent vocabulary.

**Objective 3 — Demonstrate longitudinal personalization improves outcomes vs. generic coaching.** Run a 12-week within-subjects A/B trial with 100 families: each child receives 6 weeks of generic evidence-based strategies and 6 weeks of personalized recommendations (counter-balanced order), with blinded BCBA scoring of target-behavior frequency from parent-uploaded data each week. Target: ≥20% greater reduction in target-behavior frequency during personalized weeks. **Challenge:** behavioral data is inherently noisy and confounded by life events. **Mitigation:** within-subjects design controls for between-child variation; pre-registered statistical analysis plan.

Phase I deliverables: a validated AI engine, a published ABC-extraction benchmark, a peer-reviewed pilot outcome study, and a Phase II go/no-go decision based on objective hit rates.

---

## §3. Market Opportunity

**Customer pain.** Approximately 1 in 36 US children is diagnosed with autism (CDC). Their parents face a $200/hr BCBA gap, 6-month insurance authorization waits, and meltdowns at 11pm with no clinical support. Insurance-funded ABA already costs payers billions annually; outcomes are constrained by what happens in clinic, while the majority of the child's waking hours occur outside it.

**Customers and revenue.** Modern Village monetizes across the care continuum: (1) parents via $19.99/mo subscription (15M+ US-household TAM); (2) BCBAs and clinics via 20-25% marketplace session fee plus per-patient billing-tools SaaS; (3) school districts via $3-8/student/year contracts; (4) California Regional Centers via family-support contracts (one RC, Orange County, spent ~$250K on a single one-day parent conference in 2025 — Modern Village provides 365-day support at a fraction of that cost); (5) payers via per-member-per-month licensing once outcome data matures.

**Competition.** Frontera Health ($32M raised) is a BCBA-tool-only platform with no consumer side and no home-data ingestion. CentralReach, Catalyst, and Rethink are billing-and-documentation platforms with no AI personalization and no parent product. Direct-to-consumer apps (Joon, Goally) lack clinical integration and BCBA workflow. No competitor closes the parent ↔ BCBA data loop with personalized AI coaching.

**Why Modern Village wins.** A consumer-first flywheel: parents adopt, behavioral data accumulates, BCBAs need that data for insurance authorization, BCBAs join, refer more families, districts notice and contract, payers eventually reimburse. Every market segment compounds the others.

---

## §4. Company and Team

**Modern Village Services LLC** is a US-registered for-profit small business based in Southern California. The platform is live in production at modernvillage.app with active subscribers and a complete vertically-integrated product (consumer app, BCBA clinical workflow, district admin portal, lead-gen and outreach systems).

**Jorrel Patterson — Founder, Principal Investigator.** Full-stack engineer; sole architect and builder of the current platform: AI coaching engine, behavioral data pipeline, offline-first BCBA workflow, HIPAA-eligible cloud infrastructure (Supabase, Cloudflare Workers, Vercel). Commits primary employment to Phase I R&D.

**Ariana Patterson, BCBA — Co-Founder, Clinical Co-Investigator.** Board Certified Behavior Analyst with active clinical practice. Designed the behavioral-data ontology, operational definitions for ABC structuring, and clinical workflows for session notes, ABC graphs, and skill-target progress monitoring. Will serve as clinical co-PI and lead the BCBA review panel for Objective 1, the ABC corpus validation for Objective 2, and the blinded outcome scoring for Objective 3. Commits 20+ hr/wk during the award period.

**Existing infrastructure de-risks Phase I.** The platform is in production, not a paper concept: a 16,000-lead provider CRM, an M-CHAT-R autism screener as a lead-gen funnel, a live BCBA workflow with 5 complete sub-projects shipped (practice onboarding, live trial entry, behavior reduction analytics, skill-target line graphs with phase change lines, AI SOAP narratives with billing-status workflow), and a content engine reaching 74K monthly autism-parent search queries. The Phase I research questions can be tested on real users immediately, not on toy datasets.

---

## Open items for Ariana to validate / fill in

- [ ] Inter-rater agreement target (currently 85% — is this realistic for ABA-recommendation review?)
- [ ] F1 ≥ 0.80 target for ABC extraction (Ariana, sanity-check the bar — too soft, too hard?)
- [ ] 20% reduction target for personalized vs. generic weeks (within-subjects A/B trial)
- [ ] BACB-aligned rubric: confirm published BACB practice guidelines are the right reference document
- [ ] Confirm "12 dimensions" of the Adaptive AI Engine — list out the actual 12 so the pitch is accurate
- [ ] Ariana's BCBA certification number (for §4 credibility line if NSF asks in the full proposal)
- [ ] Confirm clinical claims about ABA market size, 1-in-36 CDC stat citation year, "majority of waking hours" framing

## Open items for Jorrel

- [ ] Confirm Modern Village Services LLC state of registration (currently written as "US-registered")
- [ ] Decide whether to name CentralReach, Catalyst, Rethink, Frontera, Joon, Goally by name in §3 (NSF doesn't prohibit it, but be sure the contrasts are accurate)
- [ ] Active subscriber count and any outcome data already collected — adding a concrete number to §4 would strengthen the "in production" claim
- [ ] Review character counts on each section in the actual NSF submission portal; the limits above are pre-portal estimates

## Submission workflow

1. Wait for portal to reopen Jun 2, 2026 (https://seedfund.nsf.gov/project-pitch/)
2. Paste each section into the corresponding form field; the portal enforces character counts
3. Submit
4. NSF responds in ~3 weeks with one of: (a) invitation to submit full Phase I proposal, (b) decline with feedback, (c) request for revisions
5. If invited: ~3 months to write full Phase I proposal (~15–20 pages of technical + budget + commercialization plan)
