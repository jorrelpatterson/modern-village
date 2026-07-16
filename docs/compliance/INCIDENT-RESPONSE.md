# Incident Response & Breach Notification Plan

**Basis:** 45 CFR §164.308(a)(6) (security incident procedures) and §164.400–414 (Breach
Notification Rule). **Status: DRAFT 2026-07-15.** Attorney review recommended — breach
determination and notification are legally consequential.

Note: as a **Business Associate** to provider practices, Modern Village's primary duty on a
breach of provider PHI is to **notify the affected Covered Entity** (the practice) without
unreasonable delay and no later than the contractual deadline (baa.html currently says 60 days
— consider tightening to 5–10 business days). The Covered Entity then handles individual/HHS
notification. For direct-to-consumer data with no covered-entity relationship, the **FTC Health
Breach Notification Rule (16 CFR Part 318)** may apply instead — confirm with counsel.

## Roles
- **Incident Lead / Security Official:** Jorrel Patterson — coordinates response, makes the breach determination (with counsel), handles notifications.
- **Clinical contact:** Ariana Patterson — assesses clinical-data impact.

## 1. Detect & report
Any suspected incident (unauthorized access, lost/stolen device, misdirected PHI, vendor breach,
anomalous `audit_logs` activity, exposed credentials) is reported **immediately** to the Security
Official. Do not delay to investigate first.

## 2. Contain
- Revoke/rotate affected credentials and API keys (Supabase service key, worker secrets, admin sessions).
- Disable compromised accounts (`/admin/set-role` remove; Supabase revoke sessions).
- Preserve evidence: capture `audit_logs`, Supabase/Cloudflare logs, timestamps — do not wipe.

## 3. Assess whether it is a reportable Breach (§164.402 four-factor test)
Presume a breach of unsecured PHI is reportable **unless** a low-probability-of-compromise is
demonstrated across: (1) nature/extent of PHI involved; (2) who accessed/received it; (3)
whether it was actually acquired/viewed; (4) extent to which risk was mitigated. Document the analysis.
- Encryption safe harbor: PHI encrypted per HHS guidance is not "unsecured" — but note the current at-rest encryption posture depends on the pending Supabase HIPAA-tier BAA.

## 4. Notify (if a reportable breach)
| Recipient | Timeline | When |
|---|---|---|
| Affected Covered Entity (practice) | Without unreasonable delay, per BAA (≤60 days; aim ≤10 business days) | Breach of provider PHI |
| Affected individuals (if MV is the CE / consumer data) | ≤60 days from discovery | Direct-to-consumer breach |
| HHS OCR | ≤60 days (≥500 affected) or annual log (<500) | Per §164.408 |
| Media | ≤60 days | ≥500 residents of a state/jurisdiction |
| FTC (Health Breach Notification Rule) | Per 16 CFR 318 | If applicable to consumer health data |

Notification content (§164.404(c)): what happened, PHI involved, steps individuals should take,
what MV is doing, contact info.

## 5. Remediate & learn
- Fix root cause; update the [Risk Analysis](RISK-ANALYSIS.md) and controls.
- Record the incident below. Retain incident records 6 years.

## Incident log
| Date discovered | Description | PHI involved | Breach? | Notifications | Resolution |
|---|---|---|---|---|---|
| _none recorded_ | | | | | |

## Key contacts (fill in)
- Healthcare attorney: _____
- Supabase / Cloudflare / Anthropic security contacts: _____
- Cyber-insurance carrier + policy #: _____
