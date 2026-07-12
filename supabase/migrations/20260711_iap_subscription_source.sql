-- 20260711_iap_subscription_source.sql
-- Apple IAP (Path A): record where a consumer Pro subscription came from so the
-- RevenueCat sync can never downgrade a promo-code Pro (and vice versa).
--   'apple_iap' — written by worker /iap/sync + /iap/webhook (RevenueCat)
--   'promo'     — written by worker /validate-code
--   null        — legacy/none
alter table public.profiles add column if not exists subscription_source text;

-- Backfill: existing Pros with a promo code came from /validate-code.
update public.profiles
   set subscription_source = 'promo'
 where promo_code is not null
   and subscription_status = 'pro'
   and subscription_source is null;
