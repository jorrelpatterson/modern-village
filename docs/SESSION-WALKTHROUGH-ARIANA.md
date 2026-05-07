# Modern Village — Testing Session with Ariana

**Last updated:** 2026-05-06
**Purpose:** Condensed 60-90 min in-person walkthrough. For the exhaustive click-by-click list see `docs/TESTING-GUIDE.md`.

---

## URLs

- App: https://modernvillage.app/app.html
- Admin: https://modernvillage.app/admin.html
- Screener: https://modernvillage.app/screener.html
- District: https://modernvillage.app/district-admin.html

## Test accounts

| Role | Email | Password |
|---|---|---|
| Parent | `testparent@modernvillage.app` | `TestParent123!` |
| Provider (BCBA) | `testprovider@modernvillage.app` | `TestProvider123!` |
| Caregiver | `testcaregiver@modernvillage.app` | `TestCaregiver123!` |
| Teacher | `testteacher@modernvillage.app` | `TestTeacher123!` |
| Admin | `admin@modernvillage.app` | `IttakesaVill@ge!` |

**As you go:** every page has a green chat-bubble bottom-right — log bugs/UX notes in real time. They land in Admin → Feedback with role + page captured.

---

## 1. The parent funnel (≈10 min)

Have Ariana go through this as if she were a parent finding the app.

1. **Screener** — open `screener.html`, age in months, run the 20 M-CHAT-R questions, hit results, leave email at the gate. Watch the marketing-consent checkbox.
2. **Landing page** — `index.html`, hero/features/pricing/testimonials. CTA → app.
3. **Sign up flow** — actually sign up a fresh account if Ariana wants the brand-new-user feel. Otherwise jump to step 2 below.

---

## 2. Parent experience — `testparent@modernvillage.app`

Most of the product. Two kids on this account: **Maya** and **Elijah**.

- **Coach tab** — child switcher (Maya↔Elijah), send "Maya had a meltdown at the grocery store", check the response is structured (Empathy/Assessment/Strategy/Reinforce/Followup) and references Maya by name. Tap a follow-up suggestion.
- **Voice mode** — mic button on the chat bar. Speak, get spoken response.
- **Daily check-in** — modal should pop ~2.5s after entering. Mood + win/concern/strategy.
- **Track tab** — `+ Log Behavior`. Make sure the **ABA function chips** (Tangible / Escape / Attention / Sensory) work — this was Ariana's earlier feedback so worth confirming.
- **Crisis mode** — sidebar → Crisis Support. Walk the 6 de-escalation steps with her, complete the debrief, hit "Talk to Coach" handoff. **Important Ariana review** — is the language clinically sound?
- **Routine Builder** — sidebar. Create a routine, hit "AI Suggest", verify ABA tips show.
- **IEP Toolkit** — sidebar. Upload any IEP PDF (Ariana likely has one), check goals/services/accommodations/gaps extraction.
- **Community → Feed** — post with a photo, like, comment.
- **Community → Nearby (My Village)** — opt-in form, pick visibility, enter zip 91767 (Pomona), join. See empty/sample state.
- **Community → Events** — create a Playdate event with RSVP-approval on.
- **Pros tab** — Ariana's profile should be live here. Tap → book a 30 min, pick a date/time, confirm flow.
- **Sidebar → Invite Friends** — try inviting yourself to a child as a co-parent/caregiver to verify email + accept link.

---

## 3. Provider experience — `testprovider@modernvillage.app` (Ariana's main view)

This is the part Ariana will scrutinize hardest. Log out, log back in as provider.

- **Client list** — 5 test kids with trend stats + billing $.
- **Open a client → Behavior Logs** — read-only parent data.
- **Sessions tab** — `+ New Session Note`, fill it in, hit **"Generate AI Narrative"** — Ariana should review the clinical narrative quality. Save → "Superbill" button → PDF preview, check provider info / CPT / narrative / signature line.
- **Billing tab** — claims summary + aging report. From a session note, "Generate Claim" → status pending → submitted → paid. Try "denied" with reason. Try a partial paid amount.
- **Care Notes tab** — post a note (provider role badge), confirm it's visible across roles.
- **Insights tab** — patterns, top behaviors, triggers, strategy effectiveness.
- **Sidebar → Billing Dashboard** — total revenue, outstanding, aging across all clients, "Export CSV".
- **Sidebar → My Payers** — add a payer (Blue Shield CA, payer ID anything), set status active, remove it.

**Ariana-specific asks for this section:**
- Does the AI narrative read like something she'd sign?
- Is the superbill format usable for real claims?
- Anything missing that she'd need before billing PC (CPT 97156) — units, prior auth fields, etc.? (Phase 2 plan in the roadmap.)

---

## 4. Caregiver + Teacher (≈5 min — quick check)

- **Caregiver** (`testcaregiver@modernvillage.app`) — sees Maya only, can log behavior with attribution, routines/strategies are read-only, no AI Coach / Community / IEP.
- **Teacher** (`testteacher@modernvillage.app`) — sees Elijah only, has Behavior Summary (weekly + 30-day), can log, has IEP Toolkit, no AI Coach / Community.

Mostly verify the **role gates** hold — caregiver shouldn't see AI Coach button, teacher shouldn't see Community.

---

## 5. Admin panel — `admin@modernvillage.app`

Short tour so Ariana sees the business side.

- **Dashboard** — total users, pro users, conversations, bookings.
- **Users** — full table, "Reset PW" button works.
- **VA Team** — show how Ariana could add a billing VA later.
- **Verify Providers** — pending vs verified, approve/reject.
- **Billing Overview** — claims by status, revenue by provider, recent 30 claims.
- **Leads CRM** — 16K+ leads, filter (BCBAs, Districts, Regional Centers), search.
- **Email Campaigns** — create blast, AI generate A/B subjects, send test (don't send a real blast in this session). Heads up: the multi-touch sequences + bandit optimization layer is the next build (spec + plan committed, code not written).
- **Feedback** — all the bugs you logged today should be sitting here, tagged with role + page.

---

## 6. Cross-role / kid login (≈5 min if time)

- **Co-parent invite** — as parent, invite a co-parent email. Accept on a separate browser. Confirm same children show + Pro inherited.
- **Child login** — as parent → Profile → Create Kid Login for Maya (username + PIN). Log out → "I'm a kid" link → username/PIN → simplified mood/coping/routine view.

---

## 7. Mobile

If you have an iPhone with TestFlight build 7 installed: do the parent flow on the iOS app — Face ID App Lock, push notifications, share sheet, offline banner (toggle airplane mode), camera in community post.

---

## Things to specifically ask Ariana

- AI Coach: clinically sound? Tone right for a parent in crisis?
- AI Clinical Narrative: would she actually sign + submit one as-is?
- Crisis Mode language: anything missing or risky?
- Behavior tracker fields: anything an ABA-trained eye needs that's not there?
- PC billing readiness — what's the gap to her actually billing 97156 through the platform? (Confirms Phase 2a/2b/2c queue in the roadmap.)
- Provider onboarding — would a real BCBA finish the signup flow, or quit halfway?
- Community moderation expectations — what does she want flagged automatically?
