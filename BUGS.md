# BUGS.md — Modern Village

## Active Bugs

---

### [BUG-001] All notifications batch-fire at 8pm daily
**Reported:** 2026-04-19
**Reporter:** Jorrel
**Severity:** High
**Status:** Open — root cause identified 2026-05-06, fix is a 2-min Cloudflare dashboard change
**Re-investigated:** 2026-05-06

**Description:**
All push notification types fire simultaneously at 8pm PT instead of splitting across morning/evening/weekly windows.

**Root cause (confirmed — code is correct, Cloudflare cron config is incomplete):**

The push system uses **three** cron-handler functions in [worker.js](worker.js):
- `runMorningPushes()` — morning routine + booking reminders ([worker.js:1551](worker.js#L1551))
- `runEveningPushes()` — daily check-in + streak-at-risk ([worker.js:1580](worker.js#L1580))
- `runWeeklyPushes()` — weekly digest ([worker.js:1610](worker.js#L1610))

The `scheduled()` handler at [worker.js:873-896](worker.js#L873-L896) routes by exact-match cron expression:

| Cron expression | UTC time | Pacific time | Fires |
|---|---|---|---|
| `0 14 * * *` | 14:00 daily | **7am PT** | morning pushes |
| `0 4 * * *` | 04:00 daily | **8pm PT (prev day)** | evening pushes |
| `0 16 * * 0` | 16:00 Sunday | **Sunday 9am PT** | weekly digest |

If the cron expression doesn't match any of the three exact strings, the **fallback** at [worker.js:888-895](worker.js#L888-L895) fires `runMorningPushes + runEveningPushes + runWeeklyPushes` (Sundays only for weekly) **all in one shot**.

The original 2026-04-19 investigation speculated about per-notification `scheduledAt` timestamps — that's not how this system works. Pushes are not queued; they're fired live by cron handlers.

**Likely current state:** Cloudflare has only ONE cron trigger configured, and either (a) it's not one of the three exact strings the router expects, or (b) only one of the three is configured and the rest aren't wired up. Either way → fallback path fires everything at the single configured time, which is ~8pm PT.

**Fix (Cloudflare Triggers + small worker.js change):**

1. Open Cloudflare dashboard → Workers & Pages → `village-api` → **Settings** tab → Cron Triggers
2. Replace the existing single cron (`0 3 * * *` was the wrong one originally — close to but not equal to `0 4 * * *`, which is why the router fell through to the fire-everything fallback) with the **three** below:
   ```
   0 14 * * *      (7am PT — morning routine + booking reminders)
   0 4 * * *       (8pm PT — daily check-in + streak at risk)
   0 16 * * 7      (Sunday 9am PT — weekly digest)
   ```
   **Note:** Cloudflare's cron parser rejects `0 16 * * 0` (Sunday=0 form) — use `0 16 * * 7` instead. Same day, different syntax. worker.js was updated 2026-05-06 to accept either form defensively.
3. Save in Cloudflare.
4. Paste-deploy the updated `worker.js` (the routing now matches `0 16 * * 7`). Without this paste-deploy, Sunday weekly digest will still hit the fallback path.

**After fix:**
- 7am PT — morning routine + booking reminders
- 8pm PT — daily check-in + streak alerts
- Sunday 9am PT — weekly digest

**Verification (after the next 7am PT cron):**
- Check `push_send_log` table in Supabase — should see `notification_type = 'morning_routine'` rows with timestamps clustered around 14:00 UTC, not 04:00 UTC.

---
