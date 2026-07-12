import test from 'node:test';
import assert from 'node:assert/strict';
import { computeIapProfilePatch } from '../worker.js';

const NOW = Date.parse('2026-07-11T12:00:00Z');
const future = '2026-08-11T12:00:00.000Z';
const past = '2026-07-01T12:00:00.000Z';

test('active pro entitlement → pro patch with expiry + apple_iap source', () => {
  const sub = { entitlements: { pro: { expires_date: future } } };
  assert.deepEqual(
    computeIapProfilePatch(sub, { subscription_status: 'free', subscription_source: null }, NOW),
    { subscription_status: 'pro', subscription_expires_at: future, subscription_source: 'apple_iap' }
  );
});

test('lifetime (null expires_date) entitlement → pro with null expiry', () => {
  const sub = { entitlements: { pro: { expires_date: null } } };
  assert.deepEqual(
    computeIapProfilePatch(sub, { subscription_status: 'free', subscription_source: null }, NOW),
    { subscription_status: 'pro', subscription_expires_at: null, subscription_source: 'apple_iap' }
  );
});

test('expired entitlement + profile was IAP pro → downgrade to free', () => {
  const sub = { entitlements: { pro: { expires_date: past } } };
  assert.deepEqual(
    computeIapProfilePatch(sub, { subscription_status: 'pro', subscription_source: 'apple_iap' }, NOW),
    { subscription_status: 'free' }
  );
});

test('no entitlement + promo-sourced pro → null (never clobber promo)', () => {
  assert.equal(
    computeIapProfilePatch({ entitlements: {} }, { subscription_status: 'pro', subscription_source: 'promo' }, NOW),
    null
  );
});

test('no entitlement + legacy pro with null source → null (do not touch)', () => {
  assert.equal(
    computeIapProfilePatch({}, { subscription_status: 'pro', subscription_source: null }, NOW),
    null
  );
});

test('no entitlement + free profile → null (nothing to do)', () => {
  assert.equal(
    computeIapProfilePatch({ entitlements: {} }, { subscription_status: 'free', subscription_source: null }, NOW),
    null
  );
});

test('missing/garbage subscriber → null for free profile', () => {
  assert.equal(computeIapProfilePatch(null, { subscription_status: 'free', subscription_source: null }, NOW), null);
});
