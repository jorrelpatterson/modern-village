# Modern Village — HIPAA Compliance Documentation

**Status: DRAFT / IN PROGRESS — not a certification.** These documents are working
drafts created 2026-07-15 to close the administrative-safeguards gap the security audit
found (no risk analysis, policies, BAAs, training, or incident plan existed). **A document
existing here does not make the company compliant.** Each must be (1) reviewed and adopted
by ownership, (2) reviewed by a healthcare attorney, and (3) operationally *followed*.
Several depend on external actions (signing BAAs, buying vendor tiers) that no document can
substitute for.

## Designated officials (§164.308(a)(2))

| Role | Person | Notes |
|---|---|---|
| HIPAA Security Official | Jorrel Patterson | Required by the Security Rule; previously undesignated. |
| HIPAA Privacy Officer | Jorrel Patterson | Already named in privacy.html / baa.html. |

For a solo-founder LLC these may be the same person, but the designation must be recorded — it now is, here.

## Document index

| Doc | Regulatory basis | State |
|---|---|---|
| [RISK-ANALYSIS.md](RISK-ANALYSIS.md) | §164.308(a)(1)(ii)(A) | Draft, populated from the 2026-07-15 technical audit |
| [BAA-TRACKER.md](BAA-TRACKER.md) | §164.308(b), §164.502(e) | Draft — **all vendor BAAs currently UNSIGNED** |
| [POLICIES-AND-PROCEDURES.md](POLICIES-AND-PROCEDURES.md) | §164.316 | Draft |
| [INCIDENT-RESPONSE.md](INCIDENT-RESPONSE.md) | §164.400–414 | Draft |
| [CONTINGENCY-PLAN.md](CONTINGENCY-PLAN.md) | §164.308(a)(7) | Draft |
| [TRAINING-LOG.md](TRAINING-LOG.md) | §164.308(a)(5) | Template — no training completed yet |

## What is actually true today (2026-07-15)

**Technical safeguards — materially improved this session** (staged in the working tree,
pending review/deploy; see git status and the migrations in `supabase/migrations/20260715_*`):
- RLS verified enabled on all base PHI tables (anonymous access closed — confirmed by live probe).
- Clinical PHI restricted to super-admins only; admin_role escalation locked.
- Signed clinical records made immutable; parent-lookup enumeration narrowed + audited.
- Audit-logging table + row-change triggers added (§164.312(b) — previously absent).
- PHI identifiers stripped from AI prompts; feedback removed from personal email; webhook auth added.
- False "HIPAA compliant / AES-256 / audit all access / zero-retention" public claims corrected.

**Administrative & legal safeguards — largely NOT yet in place:**
- ❌ No signed BAA with any PHI vendor (Supabase, Anthropic, Resend, Cloudflare). **This alone means the company cannot truthfully claim HIPAA compliance.**
- ⚠️ These policy/risk/incident documents are drafts, not yet adopted or attorney-reviewed.
- ❌ No workforce HIPAA training completed (Jorrel, Ariana, Mika).
- ❌ No third-party HIPAA assessment.

## The honest bottom line

Modern Village is **not HIPAA compliant today** and should not represent that it is. The
technical posture is now reasonable-to-good; the blocking items are the BAAs and the adoption
of these administrative documents, plus attorney review. Track them in [BAA-TRACKER.md](BAA-TRACKER.md)
and the risk register in [RISK-ANALYSIS.md](RISK-ANALYSIS.md).
