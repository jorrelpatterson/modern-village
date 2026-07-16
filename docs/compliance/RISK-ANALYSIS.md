# HIPAA Security Risk Analysis — Modern Village Services LLC

**Regulatory basis:** 45 CFR §164.308(a)(1)(ii)(A) (Risk Analysis — Required).
**Status:** DRAFT v1, 2026-07-15. Author: Jorrel Patterson (Security Official).
**Method:** Derived from a full technical security audit of the codebase (app.html, admin.html,
worker.js, 50+ Supabase migrations, vendor chain) performed 2026-07-15, plus live verification
probes against the production database. This is the required *accurate and thorough assessment
of potential risks and vulnerabilities to the confidentiality, integrity, and availability of
ePHI*. It must be reviewed at least annually and after any material system change.

> This is an engineering-led draft. OCR expects a risk analysis to be ongoing and
> organization-wide; a healthcare attorney / qualified assessor should review it.

## 1. Scope & ePHI inventory

Modern Village creates, receives, maintains, and transmits ePHI on behalf of healthcare
providers (BCBA practices) and collects health-related consumer data directly from parents.

| ePHI / sensitive data | Where it lives | System |
|---|---|---|
| Child name, DOB, diagnosis, gender, grade | `children`, `practice_clients` | Supabase |
| Behavior logs (ABC, intensity, notes) | `behavior_logs`, `behavior_recordings` | Supabase |
| ABA session data, trials, SOAP notes | `sessions`, `trials`, `session_notes` | Supabase |
| Insurance member ID, prior-auth #, payer, claims | `practice_clients`, `claims` | Supabase |
| Parent↔AI coaching conversations | `conversations` | Supabase + **Anthropic API** |
| Autism screener (M-CHAT-R) scores | `screener_leads` | Supabase |
| Client documents (BIPs, assessments, consents) | Storage bucket `practice-client-documents` | Supabase Storage |
| Booking/appointment + provider identity | `bookings`, emails | Supabase + **Resend** |
| Offline queue (trial/behavior payloads) | IndexedDB `mv-offline-v1` | End-user device |

**Systems in scope:** Supabase (Postgres + Storage + Auth), Cloudflare Worker `village-api`,
Vercel (static hosting), Anthropic API (AI), Resend (email), Apple APNs (push), RevenueCat +
Apple IAP (billing), Stripe (practice billing), iOS Capacitor app, admin web console.

## 2. Risk register

Likelihood (L) and Impact (I): High / Med / Low. "Status" reflects remediation as of 2026-07-15.
Many technical items were remediated this session (staged, pending deploy); administrative items
remain open.

| # | Threat / Vulnerability | Safeguard | L | I | Status |
|---|---|---|---|---|---|
| R1 | **No BAAs with PHI vendors** (Supabase/Anthropic/Resend/Cloudflare) — PHI processed by third parties with no HIPAA contract | §164.308(b) | High | High | **OPEN — top priority.** See BAA-TRACKER.md |
| R2 | Base PHI tables potentially world-readable via anon key | §164.312(a)(1) | — | High | **CLOSED** — live probe confirmed RLS enabled + enforcing |
| R3 | Any admin (marketing/content/sub_admin VA) could read all clinical PHI | §164.514(d) | High | High | **REMEDIATED (staged)** — clinical tables now super-only |
| R4 | Admin could self-escalate `admin_role` to super | §164.308(a)(4) | Med | High | **REMEDIATED (staged)** — admin_role frozen; role changes via worker |
| R5 | No audit trail of PHI access/modification | §164.312(b) | High | High | **PARTIALLY REMEDIATED (staged)** — modification triggers + RPC logging added; SELECT-read auditing still limited |
| R6 | Direct identifiers (name, insurance ID, prior-auth #) sent to Anthropic in SOAP/coach prompts | §164.502(b) | High | High | **REMEDIATED (staged)** — identifiers stripped; depends on R1 for full closure |
| R7 | Signed clinical records (SOAP notes, cosigned sessions) deletable/reopenable | §164.312(c)(1) | Med | High | **REMEDIATED (staged)** — delete/reopen locked |
| R8 | Cross-practice parent/child enumeration via lookup RPC | §164.514(d) | Med | High | **REMEDIATED (staged)** — BCBA-only + audited |
| R9 | Feedback (may contain PHI) emailed to personal Gmail | §164.502(e) | Med | Med | **REMEDIATED (staged)** — PHI-free notification only |
| R10 | Unauthenticated Resend webhook could mutate DB | §164.312(c)(1) | Med | Med | **REMEDIATED (staged)** — Svix signature verification |
| R11 | Offline queue: one user's clinical data POSTed under another user's token | §164.312(a) | Med | Med | **REMEDIATED (staged)** — per-user flush guard |
| R12 | Biometric login password stored base64 in localStorage (not Keychain) | §164.312(a)(2)(iv) | Med | Med | **OPEN** — needs Capacitor secure-storage / Keychain migration |
| R13 | No inactivity auto-logoff when app backgrounded; long-lived Supabase refresh token on shared device | §164.312(a)(2)(iii) | Med | Med | **PARTIAL** — 30-min idle timeout exists (foreground only); harden on resume |
| R14 | False public "HIPAA compliant / AES-256 / audit all access / zero-retention" claims | FTC §5 / §164.316 | High | High | **REMEDIATED (staged)** — claims corrected in privacy/terms/pitch |
| R15 | Child PIN login selects full child record client-side; PIN stored plaintext | §164.312(a)(1)/(d) | Low* | High | **OPEN** — RLS currently blocks the anon read (probe: 0 rows), but the design is unsafe; move to hashed-PIN RPC |
| R16 | Test accounts with passwords committed to repo; Mika's 4-char admin password; no MFA | §164.308(a)(5) | Med | High | **OPEN (operational)** — rotate/remove creds; add MFA |
| R17 | `community_comments` readable by anon | §164.514(d) | Low | Med | **REMEDIATED (staged)** — authenticated-only |
| R18 | No risk analysis, policies, training, incident/contingency plan | §164.308/316/400s | High | High | **IN PROGRESS** — these draft docs; not yet adopted |
| R19 | `village_profiles` exposes child diagnosis + home lat/lng to any authenticated user | §164.514(d) | Low | Med | **OPEN (batch 2b)** |
| R20 | Practice-wide (not per-client) document/trial read scope | §164.514(d) | Low | Med | **OPEN (batch 2b)** — minimum-necessary within a practice |

\* R15 likelihood is Low *only because* RLS currently returns zero rows to the anon key; the code remains unsafe by design.

## 3. Prioritized remediation plan

1. **R1 (BAAs)** — execute BAAs / upgrade vendor tiers. Nothing else makes the company compliant. Owner: Jorrel. Track in BAA-TRACKER.md.
2. **R18** — adopt these policies, complete training (R16), obtain attorney review.
3. **Deploy the staged technical remediations** (R3–R11, R14, R17) after staging validation.
4. **R12, R13, R15, R16** — device credential hardening, session hardening, child-PIN redesign, credential rotation + MFA.
5. **R19, R20** — batch 2b minimum-necessary refinements.
6. Obtain an independent third-party HIPAA assessment before making any external compliance claim.

## 4. Review cadence

Reassess at least annually and upon: new vendor touching PHI, major feature handling PHI, a
security incident, or a regulatory change. Record each review below.

| Date | Reviewer | Summary |
|---|---|---|
| 2026-07-15 | J. Patterson | Initial analysis from technical audit. |
