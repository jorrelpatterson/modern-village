# Business Associate Agreement (BAA) Tracker

**Basis:** 45 CFR §164.308(b)(1), §164.502(e). A covered entity's business associate (Modern
Village, when acting for provider practices) must have a signed BAA with every subcontractor
that creates, receives, maintains, or transmits PHI on its behalf. **As of 2026-07-15, none of
the required BAAs below are signed.** Until they are, Modern Village cannot truthfully represent
HIPAA compliance, and `baa.html` (which promises flow-down agreements exist) is inaccurate.

## Required — PHI flows to these vendors

| Vendor | PHI it touches | BAA offered? | How to obtain | Status | Owner |
|---|---|---|---|---|---|
| **Supabase** | All ePHI at rest (DB + Storage + Auth) | Yes | **Team plan + HIPAA add-on** (not "Pro" — the docs' prior assumption was wrong). Enable HIPAA, sign BAA in dashboard. | ❌ Not signed | Jorrel |
| **Anthropic** | Child profile + behavioral conversation content sent to Claude API | Yes | Via Anthropic sales — commercial agreement with Zero-Data-Retention. Confirm actual retention terms when signing. | ❌ Not signed | Jorrel |
| **Resend** | Parent/provider name + appointment details in emails | **Generally no** | Switch to a HIPAA-capable sender (**Paubox** or **AWS SES** with a BAA). | ❌ Not signed — plan to migrate | Jorrel |
| **Cloudflare** | All PHI transits/processes in Worker `village-api` | Yes | **Enterprise** tier BAA. Evaluate cost vs. moving the proxy. | ❌ Not signed | Jorrel |

## Evaluate — PHI-adjacent; confirm data actually sent

| Vendor | Data | BAA needed? | Action |
|---|---|---|---|
| **Vercel** | Static hosting only; PHI flows browser→Supabase/Worker, not through Vercel functions | Gray area (edge request logs) | Confirm no PHI in query strings/paths; Vercel BAA is Enterprise-only. Currently used for static assets only. |
| **Apple APNs** | Push notifications | No BAA available | **Keep PHI out of payloads.** Audit confirmed payloads currently carry provider name + session time — minimize to generic text. |
| **RevenueCat** | Opaque Supabase user UUID + subscription status | No BAA available | Ensure only UUIDs (no name/email/health data) flow. Currently compliant by design — keep it that way. |
| **Stripe** | Practice billing (owner email, seat count, practice_id) | Generally exempt (§1179 payment processing) | Confirm no patient identifiers in Stripe metadata. Audit found only aggregate counts — OK. |

## Not a subcontractor of Modern Village

| Vendor | Note |
|---|---|
| **Doxy.me** | Telehealth links are provider-supplied; Doxy contracts with the *provider*, not MV. `baa.html` incorrectly lists it as an MV subcontractor and `terms.html` overstated "our telehealth partner" — the terms.html claim was corrected 2026-07-15. Remove Doxy from baa.html §3.3. |

## Blocking actions before any HIPAA claim or provider onboarding

1. Sign Supabase (Team + HIPAA), Anthropic (ZDR), Cloudflare (Enterprise) BAAs.
2. Migrate email to Paubox/SES and sign that BAA; stop sending PHI via Resend.
3. Update `baa.html` §3.3 subcontractor list to reflect reality (remove Doxy; list only vendors with signed BAAs); have counsel review the warranties + indemnification.
4. Verify APNs payloads and Stripe/RevenueCat metadata carry no PHI.
5. Record signed-BAA dates + counterparties below.

| Vendor | Signed date | Counterparty contact | Stored where |
|---|---|---|---|
| _pending_ | | | |
