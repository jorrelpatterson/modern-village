# Contingency Plan

**Basis:** 45 CFR §164.308(a)(7) — data backup, disaster recovery, emergency-mode operation,
testing, and criticality analysis. **Status: DRAFT 2026-07-15.** Verify each vendor capability
below is actually enabled on your plan; an undocumented vendor feature is not a plan.

## Applications & data criticality
| System | Criticality | Impact if down |
|---|---|---|
| Supabase (Postgres + Storage) | Critical | ePHI unavailable; clinical data entry blocked (offline queue buffers briefly) |
| Cloudflare Worker `village-api` | High | AI, email, billing, admin actions fail |
| Vercel (static hosting) | High | App/site unreachable (static assets) |
| iOS app / offline queue | Medium | Buffers trial/behavior data locally, syncs on reconnect |

## 1. Data Backup Plan (§164.308(a)(7)(ii)(A))
- **Supabase:** enable automated daily backups + Point-in-Time Recovery (**confirm the plan tier includes PITR** — this typically requires the same paid tier as the HIPAA add-on). Record retention period.
- **Storage bucket** `practice-client-documents`: confirm it is included in backup scope.
- Periodically export a verified logical backup (`pg_dump`) to encrypted, access-controlled storage as an independent copy.

## 2. Disaster Recovery Plan (§164.308(a)(7)(ii)(B))
- **RPO / RTO:** define targets (e.g., RPO ≤ 24h via daily backup or minutes via PITR; RTO ≤ 1 business day).
- Recovery: restore Supabase from PITR/backup; redeploy Worker (`wrangler deploy`) and site (Vercel git deploy) from source in this repo; rotate any exposed secrets.
- Keep the recovery runbook and secret inventory in a secure, access-controlled location (not in git — secrets are `.gitignore`d by design).

## 3. Emergency Mode Operation (§164.308(a)(7)(ii)(C))
- During an outage, the mobile app's offline queue continues to capture clinical data locally and syncs on restore, preserving continuity of care.
- If ePHI is unreachable, providers fall back to their own secured records per practice policy; MV does not become the sole system of record for active care.

## 4. Testing & Revision (§164.308(a)(7)(ii)(D))
- Test a restore from backup at least annually; verify data integrity of the restored copy. Record results below.

## 5. Applications & Data Criticality Analysis (§164.308(a)(7)(ii)(E))
- See the criticality table above; revisit as the product changes.

## Test log
| Date | Test performed | Result | Notes |
|---|---|---|---|
| _none recorded_ | | | |
