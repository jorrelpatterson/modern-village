-- ═══════════════════════════════════════════════════
-- BCBA Data Collection — Stripe Billing
-- 2026-05-23
-- Adds fields needed to track Stripe subscription lifecycle.
-- practices already has stripe_customer_id, stripe_subscription_id,
-- subscription_status, trial_ends_at from Foundation. This migration
-- adds the period_end + grace tracking.
-- ═══════════════════════════════════════════════════

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS subscription_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_current_quantity int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS past_due_since timestamptz;

CREATE INDEX IF NOT EXISTS idx_practices_subscription
  ON public.practices(subscription_status, subscription_period_end);

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
