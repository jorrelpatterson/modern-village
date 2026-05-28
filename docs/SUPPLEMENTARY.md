# MODERN VILLAGE — SUPPLEMENTARY INITIATIVES

Everything discussed and built across all sessions that didn't make it into the main Claude Code handoff. This covers sales strategy, lead generation infrastructure, marketing plans, grant strategy, email sequences, competitive intelligence, and business operations.

---

## TABLE OF CONTENTS

1. Lead Generation Infrastructure (30 Scrapers)
2. District Sales Playbook
3. BCBA/Provider Recruitment Strategy
4. Pediatrician Referral Strategy
5. Email Drip Sequences (4 sequences, 13 emails)
6. Grant Strategy & Targets
7. Marketing & Content Plan
8. iOS/Android Capacitor Strategy (Detailed)
9. HIPAA Compliance Roadmap (Detailed)
10. Competitive Analysis (Frontera Health)
11. Provider Marketplace Design
12. Insurance/Payer Long-Term Strategy
13. Neurodivergent Rebrand Details
14. Business Documents Inventory
15. Scraper Toolkit Reference

---

## 1. LEAD GENERATION INFRASTRUCTURE

### 30 Automated Scrapers (4 files)

All scrapers run locally with Node.js. Same dependencies: `puppeteer cheerio csv-writer node-fetch@2 exceljs csv-parser`

#### scraper.js — Core Leads (7 scrapers)
| Command | Source | Expected Output |
|---------|--------|----------------|
| `cde` | CDE districts database (direct file download) | 1,000+ CA districts with admin names + phones |
| `selpa` | CDE + selpa.info SELPA directory | 100-150 SELPA references |
| `selpa-emails` | 21 county SELPA websites deep scrape | Emails + phones for SpEd directors |
| `psychtoday` | Psychology Today BCBA listings (Puppeteer) | 300-500 provider profiles |
| `bhcoe` | BHCOE accredited ABA practices | 50-100 quality-vetted practices |
| `google` | Google Maps — pediatricians in 40 SoCal cities | 200-500 offices with addresses + phones |
| `aba-companies` | Google search for ABA therapy companies | 30-50 company profiles |

#### scraper-extra.js — Extended Leads (9 scrapers)
| Command | Source | Expected Output |
|---------|--------|----------------|
| `regional-centers` | All 21 CA Regional Centers + vendor directory links | 21 centers with emails, phones, vendor URLs |
| `reddit` | 12 autism/ADHD subreddits via public JSON API | 500+ trending posts + subscriber counts |
| `cde-sped-counts` | CDE Students with Disabilities data files | 1,000+ districts with SpEd student numbers |
| `podcasts` | Apple Podcasts / iTunes Search API | 50-100 autism/ADHD parenting podcasts |
| `instagram` | 14 hashtag pages (#autismparent, #neurodivergent, etc.) | 100-300 creator usernames |
| `job-postings` | Indeed ABA job postings in California | 100+ jobs + unique company list |
| `resource-dirs` | Autism Speaks Resource Guide (8 zip codes) | 100+ partnership targets |
| `facebook-groups` | Facebook group search (8 queries) | 50-100 parent groups |
| `early-start` | DDS Early Start programs page | Links to 21 Regional Center programs |

#### scraper-districts.js — District Enrichment (7 scrapers)
| Command | Source | Expected Output |
|---------|--------|----------------|
| `npi` | **Federal NPI Registry API** — every healthcare provider in CA | 5,000+ BCBAs, OTs, SLPs with names, addresses, phones |
| `edjoin` | EdJoin.org — CA educator job board | Districts hiring SpEd directors RIGHT NOW |
| `lcap` | Google search for district LCAP documents | Districts mentioning PBIS/parent engagement |
| `sped-data` | CDE Special Ed placement data files | Student counts by disability category by district |
| `caaspp` | CDE assessment data file links | SpEd student test performance by district |
| `csba` | CSBA + individual district board pages | School board member names + emails |
| `greatschools` | GreatSchools.org school ratings | School-level data for 10 SoCal cities |

#### scraper-grants.js — Grant Leads (7 scrapers)
| Command | Source | Expected Output |
|---------|--------|----------------|
| `foundations` | 20 private foundations (OAR, NEXT, ASF, etc.) | Foundation contacts, deadlines, apply URLs |
| `accelerators` | 15 tech accelerators (YC, Techstars, etc.) | Program details, amounts, apply links |
| `grants-gov` | Grants.gov REST API (12 keyword searches) | Federal grant opportunities |
| `samhsa` | SAMHSA grants page + dashboard | Behavioral health grant programs |
| `sbir` | SBIR.gov + NIH/NSF/DOE/ED specific pages | Small business innovation grants ($275K-$314K) |
| `education` | IES, OSEP, NSF DRK-12, EIR, Family Engagement | Education-specific federal grants |
| `california` | CA Grants Portal, DDS, DHCS, MHSA, First 5, CDE | State-level grant opportunities |

#### combine.js — Master Spreadsheet
Merges all CSVs into one Excel file (`modern-village-ALL-leads.xlsx`) with color-coded tabs for each lead category.

---

## 2. DISTRICT SALES PLAYBOOK

### Target Profile
- California school districts with 1,000+ students
- Districts with Special Education programs (IDEA Part B)
- Districts that mention "PBIS," "social emotional learning," or "parent engagement" in their LCAP
- Districts hiring new SpEd directors (EdJoin) — perfect timing for pitch
- SELPAs (each controls 2-20+ districts)

### Pricing Model
- **Per-student annual licensing:** $3-8 per student per year
- Pilot: Free 90-day trial for 1-3 schools, then convert to paid contract
- Enterprise: Custom pricing for districts with 10,000+ students

### The Pitch
"Modern Village reduces your legal exposure, automates IEP compliance tracking, documents coordination of care between home and school, and gives your families the behavioral support tools they need — all in one PBIS-aligned platform. You spend $3/student and save 10x that in reduced due process complaints and staff time."

### Sales Assets Built
1. **District one-pager** (`district-one-pager.html`) — printable, professional
2. **District analytics dashboard** — shows adoption, engagement, and outcomes
3. **Email templates** — cold outreach, follow-up, pilot proposal
4. **Pilot request form** — embedded in the one-pager
5. **Frontera competitive analysis** — positioning against the only funded competitor

### Outreach Sequence
1. Send cold email to SpEd director (email template in sequences doc)
2. Follow up in 5 days if no response
3. If interested: send one-pager + offer 30-min demo
4. Demo — propose 90-day pilot at 1-3 schools
5. Pilot results — present to school board for district-wide contract

### Priority Districts (start here)
1. **Pomona USD** — local to Jorrel, SpEd Director: Claudia Ruiz
2. Any district hiring a new SpEd director (EdJoin scraper)
3. Any district whose LCAP mentions PBIS or parent engagement (LCAP scraper)
4. Districts with the highest SpEd student counts (CDE data)

---

## 3. BCBA/PROVIDER RECRUITMENT STRATEGY

### Why BCBAs Are the Flywheel Engine
Each BCBA who joins the marketplace refers 5-20 families. Those families generate behavioral data. That data makes the AI Coach smarter. Better AI = more subscribers = more data = more BCBAs want the data for insurance authorizations.

### Recruitment Channels
1. **Ariana's network** — ask her to personally refer 5 BCBA colleagues
2. **BCBA Facebook groups** — "ABA Therapists," "BCBA Study Group," "ABA Professionals" (10K-50K members each)
3. **CalABA conference** (March 19-20, 2026, Riverside Convention Center)
4. **LinkedIn Sales Navigator** — search "BCBA California," DM with marketplace pitch
5. **NPI Registry** — scraper pulls every BCBA in CA with address + phone
6. **Psychology Today** — scraper pulls BCBA profiles with contact info

### Corporate ABA Company Partnerships (Highest Leverage)
One partnership with a large ABA company = 20-100 BCBAs on your marketplace overnight.

Major CA ABA companies: Autism Learning Partners, LEARN Behavioral, BlueSprig, Center for Autism/CARD, Brett DiNovi & Associates, Comprehensive Autism Center, Butterfly Effects, Dream Big

### Provider Marketplace Model
- BCBAs list for free, parents book through app, Modern Village takes 20-25% of session fee
- 100 providers x 3 sessions/week x 52 weeks x $75 avg x 20% = $234K/year

---

## 4. PEDIATRICIAN REFERRAL STRATEGY

### The Play
Print QR code flyers with M-CHAT-R screener link. Drop at pediatrician offices. Parents scan QR → take screener → enter email → get results → receive email sequence → subscribe.

### Target: 40 SoCal Cities
Pomona, Claremont, San Dimas, La Verne, Glendora, West Covina, Covina, Diamond Bar, Walnut, Chino Hills, Ontario, Rancho Cucamonga, Upland, Fontana, Rialto, San Bernardino, Riverside, Corona, Moreno Valley, Temecula, Pasadena, Arcadia, Monrovia, Azusa, Baldwin Park, El Monte, Whittier, Downey, Norwalk, Long Beach, Torrance, Inglewood, Compton, Carson, Lakewood, Fullerton, Anaheim, Santa Ana, Irvine, Huntington Beach.

### Conversion Math
300 offices x 50 parents/week x 10% scan QR x 5% subscribe x 52 weeks = 390 subscribers/year
At $19.99/mo = $93K/year just from pediatrician referrals

---

## 5. EMAIL DRIP SEQUENCES

Four sequences, 13 emails total. All HIPAA-compliant (no PHI in emails).

### Sequence 1: Screener Lead → Subscriber (4 emails over 10 days)
### Sequence 2: New Subscriber Welcome (3 emails over 5 days)
### Sequence 3: Re-Engagement for Inactive Users (3 emails over 21 days)
### Sequence 4: Weekly Digest (every Friday)

Full email copy in `modern-village-email-sequences.docx`.

---

## 6. GRANT STRATEGY & TARGETS

**Audited 2026-05-27.** Modern Village Services LLC is a for-profit, which excludes it from most autism / early-childhood foundation grants (501(c)(3) typically required). The prior tier list assumed nonprofit eligibility and is now restructured to match reality. Full audit + partner-model alternative in [MARKETING-PLAYBOOK.md](MARKETING-PLAYBOOK.md) §"Client Type 6".

### Tier 1: Apply now (for-profit-eligible)
| Opportunity | Amount | Next deadline |
|-------------|--------|---------------|
| NSF SBIR Phase I — Digital Health | up to $275K | Project Pitch portal reopens Jun 2, 2026 |
| NIH SBIR Omnibus (HHS) | up to $314K Phase I | Sept 5, 2026 standard receipt |
| State / Regional Center contracts | $50K-$250K/contract | Rolling — see §"Regional Centers" / Client Type 7 |

### Tier 2: For-profit-friendly accelerators (verify current cycle before applying)
Inclusive App Accelerator ($10K, Dec 2026 cycle), Camelback Ventures ($40K), 4.0 Schools ($10K-100K), Google.org ($50K-500K). Each needs current-cycle and eligibility verification before drafting — none confirmed open for for-profit MV as of audit.

### Tier 3: Partner-model only (require 501(c)(3) co-applicant)
OAR Applied Research Grant ($30K-40K), Caplan Foundation ($25K-50K), Doug Flutie Jr. Foundation ($5K-25K), Autism Speaks community/research programs, Autism Science Foundation ($25K-100K), Robert Wood Johnson ($50K-500K), Simons/SFARI ($100K-500K). Modern Village can access these only by partnering with a 501(c)(3) (autism research center, university, advocacy org) that acts as applicant with MV as technology sub-recipient.

### Tier 4: Segment-mismatched (revisit at later product phase)
NEXT for AUTISM ($10K-20K) — funds programs for autistic adults; revisit when MV ships the adult product (Phase 4).

### Note on OAR Community Grant
Cannot be submitted under Modern Village Services LLC (community orgs / nonprofits / individuals only). Ariana could potentially apply individually as a "direct autism service provider" for $1-15K, but the ROI vs. her bandwidth on BCBA billing tooling is poor.

---

## 7. iOS/ANDROID CAPACITOR STRATEGY

### Payment Strategy (Critical)
ALL subscriptions through Stripe on web. No in-app purchases. iOS app has NO subscribe button — "Upgrade at modernvillage.app". Saves $3K-6K/mo vs Apple/Google 30% cut.

### Native Features
Push notifications (P0), Biometric auth (P1), Camera (P2), Microphone (P2), Share sheet (P1), Geolocation for My Village (P2), Offline caching (P1), Badge count (P1)

### Push Notifications (HIPAA-safe, generic text only)
Daily check-in (8pm), Morning routine (7am), Booking reminder (24hr before), Streak at risk, Milestone celebration, Weekly digest, Community reply, New strategy card

---

## 8. HIPAA COMPLIANCE ROADMAP

### Current Score: 63/100 HIPAA | 68/100 Production

### Still Needed
Resend BAA (HIGH), Anthropic API BAA (HIGH), Ariana HIPAA training (HIGH, $15-29), Healthcare attorney review (HIGH, $500-1,500), Push notification PHI audit (MEDIUM)

---

## 9. COMPETITIVE ANALYSIS (FRONTERA HEALTH)

Frontera: $32M funded, B2B clinician tool, $200+/mo per provider, no consumer app, no community, no district play.

Modern Village wins on: consumer-first flywheel, $19.99/mo pricing, community/My Village layer, parent-generated daily data, multi-channel distribution (screener + BCBA referrals + districts).

---

## 10. PROVIDER MARKETPLACE PHASES

- **Phase 1 (current):** Ariana only, 4 session types ($55-$175)
- **Phase 2 (50+ subscribers):** Open marketplace, provider applications, 20-25% platform fee
- **Phase 3 (200+ subscribers):** Multi-provider (OTs, SLPs), shared dashboard, insurance authorization support

---

## 11. INSURANCE/PAYER STRATEGY (PHASE 5)

PMPM licensing to Medi-Cal managed care + commercial insurers. Target: $1-5 PMPM. At $1 PMPM x 100K members = $1.2M/year per contract. Requires: 12+ months outcome data, 1,000+ users, HIPAA fully compliant, SOC 2.

---

## 12. KEY DECISIONS

| Decision | Rationale |
|----------|-----------|
| Single-file HTML (not React) | Fast iteration, Capacitor-compatible |
| Stripe web-only (no in-app purchases) | Saves $3K-6K/mo vs Apple 30% |
| Parents first, B2B second | Consumer traction drives flywheel |
| California first | Largest autism services market, SB 946 |
| Free screener as lead gen | 74K monthly search volume |
| $19.99/mo price point | Between free apps and $200+ clinical tools |
| Neurodivergent (not autism-only) | 7x larger market (1 in 5 vs 1 in 36) |

---

## 13. OTHER JORREL VENTURES (NOT Modern Village)

Adonis (health optimization), Elysian Labs (peptides), advnce labs (peptide e-commerce), Cleanist.com (cleaning), KnockIQ (door-to-door SaaS), Family First Life (insurance), Survive to Thrive Foundation (501c3), Caliber Medical Training. Keep separate from Modern Village work.

---

## 14. BUSINESS DOCUMENTS INVENTORY

| File | Contents |
|------|----------|
| `modern-village-business-plan.docx` | Full business plan |
| `modern-village-client-analysis.docx` | 6 client types + flywheel |
| `modern-village-email-sequences.docx` | 4 sequences, 13 emails |
| `modern-village-ca-district-leads.xlsx` | 190 CA district leads |
| `modern-village-announcement-script.docx` | Video launch script |
| `modern-village-grant-package.docx` | Grant narrative materials |
| `modern-village-marketing-strategy.docx` | Full marketing strategy |
| `modern-village-risk-assessment.docx` | Risk assessment |
| `modern-village-incident-response-plan.docx` | HIPAA incident plan |
| `modern-village-district-funding-guide.docx` | For districts applying for grants |
| `modern-village-roadmap-complete.docx` | Original complete roadmap |
