# Marketing Experiments — Instructions to the AutoResearch Agent

**Last human review:** 2026-04-17 by Jorrel
**Spec:** [docs/superpowers/specs/2026-04-17-marketing-autoresearch-framework-design.md](docs/superpowers/specs/2026-04-17-marketing-autoresearch-framework-design.md)

---

## Brand constraints (apply to all challenger prompts)

- **Voice:** warm, direct, peer-to-peer. Avoid clinical jargon: no "disorder", "deficit", "abnormal", "low-functioning", "high-functioning".
- **Tone:** empathetic, never fear-mongering or shaming.
- **Pricing:** never discount below $14.99. Current Pro is $19.99/mo.
- **Audience:** primary is exhausted moms 28-44 searching for answers at 11pm; secondary is BCBAs, teachers, caregivers.
- **No false urgency**, no fake scarcity, no "limited spots" without proof.
- **Claude challenger prompts must be constructed to respect these constraints.**

## Active slots

| Slot | Priority | Deploy mode | Min sends/variant | Confidence | Kill threshold |
|------|----------|-------------|-------------------|-----------|----------------|
| landing_headline | P0 | auto | 50 | 90% | screener-complete rate drops 30%, revert |

(More slots added as they're wired — this table is the source of truth for what's live.)

## Experiment backlog (slots to add next, in priority order)

1. `landing_cta_button` — text on the "Take the free screener" button
2. `landing_subheadline` — sub-headline below H1
3. `meta_ad_hook_v1` — first Meta ad headline
4. `meta_ad_body_v1` — Meta ad body copy
5. `paywall_heading` — text on the upgrade-to-Pro modal (APPROVAL required)
6. `paywall_cta_button` — upgrade button text (APPROVAL required)
7. `onboarding_welcome` — first screen after signup (APPROVAL required)
8. `blog_cta_autism_meltdowns` — CTA at bottom of autism-meltdowns blog post
9. (repeat for each blog post: ~10 slots)

## Kill switches

Automatically pause optimization when any of these fire:
- Bounce rate > 5% on any email-related slot in 24 hours (already implemented in email cron)
- Pro conversion rate drops below `baseline × 0.7` for 48 hours (post-launch, add to optimizer cron)
- Legal/HIPAA concern raised manually — admin can flip slot.status='paused' in admin UI

## Quarterly review checklist

Every 90 days:
- [ ] Review each slot's winning variant — does it still match the current brand?
- [ ] Retire slots that haven't produced a new winner in 30 days AND aren't receiving traffic
- [ ] Add the next slot from the backlog
- [ ] Update brand constraints if positioning has shifted
- [ ] Check that Claude-generated challengers are staying in-bounds (sample 10, red-flag any that violate brand constraints — retrain the prompt if needed)

## How this file is used by the system

The nightly optimizer cron does NOT parse this file. Humans edit it. When a slot's challenger_prompt is updated in the DB (via admin UI), the editor should include the relevant brand constraints from this doc as a preamble to Claude's prompt. This keeps the source of truth in the DB while giving humans a single readable place to steer the research organization.
