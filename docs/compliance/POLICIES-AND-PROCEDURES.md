# HIPAA Policies & Procedures — Modern Village Services LLC

**Basis:** 45 CFR §164.316 (policies & procedures and documentation). **Status: DRAFT
2026-07-15.** Adopt formally (dated signature by the Security Official), review annually,
retain for 6 years from last-effective date. Attorney review recommended before reliance.

These are concise operative policies for a solo-founder LLC with a small workforce (currently:
Jorrel Patterson — owner/Security & Privacy Official; Ariana Patterson — BCBA/clinical; Mika —
sub_admin/operations). Scale the formality as the team grows.

## 1. Security Management Process (§164.308(a)(1))
- Maintain a current **Risk Analysis** ([RISK-ANALYSIS.md](RISK-ANALYSIS.md)); reassess annually and after material change.
- Risk management: remediate identified risks on a prioritized basis; track status in the risk register.
- **Sanction policy:** workforce members who violate these policies are subject to warning, access revocation, or termination proportional to the violation. Record sanctions.
- **Information system activity review:** review `audit_logs` and Supabase/Cloudflare logs periodically for anomalous PHI access.

## 2. Assigned Security Responsibility (§164.308(a)(2))
- **Security Official: Jorrel Patterson.** Responsible for developing and maintaining these safeguards. (Privacy Officer: also Jorrel Patterson.)

## 3. Workforce Security & Access Management (§164.308(a)(3)-(4), §164.514(d) minimum necessary)
- Grant PHI access on a **least-privilege / minimum-necessary** basis by role:
  - **super admin** — full access (owner/clinical oversight only).
  - **billing / marketing / content / sub_admin** — scoped to their function; **no access to clinical PHI** (diagnoses, behavior data, AI conversations, clinical notes). Enforced in the database as of the 2026-07-15 `admin_role` RLS migrations.
- **Authorization & supervision:** the Security Official approves each admin account and its role.
- **Termination procedures:** on workforce exit, immediately (a) set `is_admin=false` via the admin console (worker `/admin/set-role`), (b) revoke/rotate any shared credentials, and (c) **invalidate active sessions** (Supabase → revoke user sessions), since a soft flag change alone leaves an existing JWT valid until expiry.
- Remove committed test credentials from the repo; ensure no production admin uses a weak password.

## 4. Security Awareness & Training (§164.308(a)(5))
- Every workforce member with PHI access completes HIPAA training **before** access and annually thereafter. Record in [TRAINING-LOG.md](TRAINING-LOG.md).
- Reminders: phishing/credential hygiene, no PHI in personal email/chat, device-lock requirements.
- **Password/authentication:** minimum 12 characters for admin accounts; enable MFA where supported (Supabase Auth MFA). No shared logins.

## 5. Incident Procedures (§164.308(a)(6))
- Detect, respond to, and document security incidents and breaches per [INCIDENT-RESPONSE.md](INCIDENT-RESPONSE.md).

## 6. Contingency Plan (§164.308(a)(7))
- Data backup, disaster recovery, and emergency-mode operations per [CONTINGENCY-PLAN.md](CONTINGENCY-PLAN.md).

## 7. Evaluation (§164.308(a)(8))
- Periodic technical and non-technical evaluation (this audit + annual reassessment; obtain an independent third-party assessment before external compliance claims).

## 8. Business Associate Contracts (§164.308(b))
- No vendor may process PHI without a signed BAA. Track in [BAA-TRACKER.md](BAA-TRACKER.md).

## 9. Technical safeguards (§164.312) — how MV implements them
- **Access control:** Supabase Row-Level Security on all PHI tables; role-keyed admin access; per-user data isolation; JWT auth on all API endpoints; automatic session expiry.
- **Audit controls:** `audit_logs` table + row-change triggers on clinical tables; RPC-level logging of parent lookups. (Read-level auditing is being expanded.)
- **Integrity:** signed SOAP notes and cosigned sessions are immutable at the database level.
- **Transmission security:** TLS on all connections; identifiers minimized before any third-party (AI) call; webhooks signature-verified.
- **Encryption at rest:** provided by the managed database platform (contingent on the Supabase HIPAA-tier BAA — see BAA-TRACKER.md).

## 10. Device & Media Controls (§164.310(d))
- App-managed devices (clinic iPads, admin laptops) must have full-disk encryption + a device passcode.
- The mobile app's on-device offline queue holds UUID-keyed clinical payloads; device encryption is the primary safeguard. Biometric credential storage is being migrated to the OS Keychain.
- Media disposal: wipe/de-provision devices before reuse or disposal.

## Adoption
| Policy version | Adopted by | Date | Next review |
|---|---|---|---|
| Draft v1 | _pending signature_ | 2026-07-15 | 2027-07-15 |
