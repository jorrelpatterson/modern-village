# Apple In-App Purchase (Path A — RevenueCat) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On iOS (Capacitor), the $19.99/mo Coach Pro subscription is purchased through Apple In-App Purchase via RevenueCat; the entitlement is written server-side into `profiles.subscription_status`; Stripe/web behavior is untouched. This is the last item before App Store submission (Guideline 3.1.1).

**Architecture:** The native RevenueCat SDK (`@revenuecat/purchases-capacitor`, exposed as `window.Capacitor.Plugins.Purchases` — same bridge-proxy pattern as every other plugin in `app.html`) handles the StoreKit purchase. The client never writes `subscription_status` (locked by the profiles security trigger); instead two new worker routes sync truth from RevenueCat's REST API into Supabase with the service key: `POST /iap/sync` (authenticated, called by the app right after purchase/restore/app-open) and `POST /iap/webhook` (RevenueCat server notifications for renewals/cancellations/expirations). A new nullable `profiles.subscription_source` column (`'apple_iap'` / `'promo'`) scopes downgrades so an IAP sync can never clobber a promo-code Pro.

**Tech Stack:** Capacitor 8.3.1 (SPM, remote `server.url`), `@revenuecat/purchases-capacitor@13.2.2` (peer dep `@capacitor/core >= 8.0.0` — verified on npm 2026-07-11), Cloudflare Worker (`worker.js`), Supabase REST w/ service key, `node:test` for the one pure function.

## Global Constraints

- `app.html` style: `var` (never `let`/`const`), inline `onclick`, `\x27` ONLY inside double-quoted onclick attribute values built in JS strings — plain `'` is correct in static HTML attributes. **Never `\\x27`.**
- `worker.js` style: `const`/`let` is the existing convention there (it's not app.html) — match surrounding code.
- **No commits without Jorrel's approval** (MASTER-BRIEFING.md commit rule): each task ends with verification, NOT `git commit`. All diffs are presented at the end of the session for approval; `main` auto-deploys to Vercel on push, so nothing is pushed until approved.
- Entitlement identifier is exactly `pro` (hardcoded in app.html + worker.js + RevenueCat dashboard).
- RevenueCat public iOS SDK key lives in `app.html` as `RC_IOS_API_KEY` (empty string = IAP disabled, app falls back to a "coming soon" toast on native — never Stripe on native).
- Worker env secrets (set by Jorrel via `wrangler secret put` before the flow works): `REVENUECAT_API_KEY` (v1 secret key `sk_…`), `REVENUECAT_WEBHOOK_AUTH` (random string, mirrored in the RevenueCat webhook "Authorization header value" field).
- New worker routes must return gracefully when secrets are unset (deployable before RevenueCat setup).
- Suggested App Store Connect product id: `mv_pro_monthly` (referenced only in ASC + RevenueCat dashboards, never in code — code reads the `default` offering / current offering).
- iOS must NEVER surface a Stripe checkout/portal (consumer paywall AND the BCBA practice billing card) — App Store Guideline 3.1.1.

## Verified API facts (researched 2026-07-11, do not re-derive)

- Plugin latest: `13.2.2`, peerDependencies `@capacitor/core: ">=8.0.0"`. Repo has `@capacitor/core 8.3.1`. ✅
- JS API: `Purchases.configure({apiKey, appUserID})`, `Purchases.logIn({appUserID})`, `Purchases.getOfferings()` → `{current, all}`, offering `.availablePackages[]` (each `{identifier, packageType, product}` with `product.priceString`), `Purchases.purchasePackage({aPackage: <package>})` → `{customerInfo}`, `Purchases.restorePurchases()` → `{customerInfo}`. Active entitlements: `customerInfo.entitlements.active['pro']`.
- RevenueCat webhook body: `{"api_version":"1.0","event":{type, app_user_id, environment, expiration_at_ms, entitlement_ids, product_id, store, transferred_to, transferred_from, …}}`. Event types include INITIAL_PURCHASE, RENEWAL, CANCELLATION, UNCANCELLATION, EXPIRATION, BILLING_ISSUE, PRODUCT_CHANGE, TRANSFER. RevenueCat sends the configured Authorization header value verbatim.
- RevenueCat REST: `GET https://api.revenuecat.com/v1/subscribers/{app_user_id}` with `Authorization: Bearer <secret key>` → `{subscriber: {entitlements: {pro: {expires_date, product_identifier, …}}}}`. `expires_date` is ISO-8601 or null (lifetime). GET auto-creates an empty subscriber — harmless.
- We do NOT patch per-event-type. Every webhook event and every `/iap/sync` call re-fetches the subscriber from the REST API and syncs — idempotent, no event matrix to get wrong.

## Key existing code landmarks (exact, verified)

- `app.html:1682` — `var API_URL = "https://village-api.jorrelpatterson.workers.dev/";`
- `app.html:1171` — the paywall static HTML (one long line: `.pw-btn` subscribe button, promo input row, `.pw-skip`)
- `app.html:1748` — `mvNative` object starts (`isNative()` helper); plugins accessed as `window.Capacitor.Plugins.X`
- `app.html:5906-5955` — `loadProfile()`; line 5913 `subscription_status==='pro'`, 5914-5919 expiry check firing `subscription/downgrade-expired`
- `app.html:6234-6262` — `enterApp()` (runs on every auth entry; 7 call sites)
- `app.html:6459-6471` — `updateSubSt()`; `app.html:6477` `updateFreeCtr()`; `app.html:6504-6506` `canSend()/showPw()/dismissPw()`
- `app.html:6507-6525` — `subscribe()` (web Stripe path; NOTE: its `/create-checkout` worker route doesn't exist — pre-existing dead end, out of scope, do not "fix")
- `app.html:6527-6538` — `manageSubscription()` (same — `/create-portal` route doesn't exist)
- `app.html:2478-2516` — `renderBillingCard()` (practice Stripe buttons)
- `app.html:8329` — `function closeOverlay(id){document.getElementById(id).classList.remove('open')}`; overlays are `<div id="X" class="overlay-page">` + `.classList.add('open')` (CSS at line 547)
- `app.html:9830-9836` — profile page subscription section (`profSubStatus`)
- `worker.js:213-222` — `verifyToken(token, env)`; `worker.js:443` — `authToken` extracted (routes ABOVE 443 can't use it)
- `worker.js:264-342` — Stripe webhook (raw-body, placed before generic body parse at 344-347)
- `worker.js:350-381` — `/webhook/resend` (no-auth POST webhook — `/iap/webhook` goes right after this block)
- `worker.js:563-574` — `/subscription/downgrade-expired` (`/iap/sync` goes right after; also gets an apple_iap guard)
- `worker.js:621-653` — `/validate-code` (promo → sets `subscription_status:'pro'`; gains `subscription_source:'promo'`)
- Column lock: `is_admin` + (since c7d50be) subscription columns are trigger-protected — only `service_role` may change them. All writes below go through the worker with `SUPABASE_SERVICE_KEY`.

---

### Task 1: `subscription_source` column + promo tagging

**Files:**
- Create: `supabase/migrations/20260711_iap_subscription_source.sql`
- Modify: `worker.js:642` (`/validate-code` profileUpdate)
- Modify: `package.json` (add `"type": "module"` so Task 2's `node --test` can import worker.js's ESM exports)

**Interfaces:**
- Produces: `profiles.subscription_source` (text, nullable): `'apple_iap'` | `'promo'` | null. Tasks 2-5 read/write it.

- [ ] **Step 1: Write the migration** (idempotent, matches repo convention):

```sql
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
```

- [ ] **Step 2: Tag promo redemptions.** In `worker.js` `/validate-code`, change line 642:

```js
          const profileUpdate = { subscription_status: 'pro', promo_code: code, subscription_source: 'promo' };
```

- [ ] **Step 3: Make worker.js importable by node:test.** In `package.json`, after `"private": true,` add:

```json
  "type": "module",
```

(worker.js uses `export default` — without this, Node treats `.js` as CommonJS and Task 2's test import fails. The only npm script is `"cap": "cap"`, a CLI binary — unaffected.)

- [ ] **Step 4: Verify**

Run: `node --check worker.js && npx cap --version`
Expected: no syntax error; cap prints a version (CLI still works with type:module).

---

### Task 2 (TDD): pure entitlement→profile mapping in worker.js

**Files:**
- Create: `tests/iap.test.mjs`
- Modify: `worker.js` (add exported function near the top, after `checkRate`, ~line 26)

**Interfaces:**
- Produces: `export function computeIapProfilePatch(subscriber, profileRow, nowMs)` → patch object for `profiles` PATCH, or `null` for "don't touch". Task 3's `syncRCSubscriber` consumes it.

- [ ] **Step 1: Write the failing test** — `tests/iap.test.mjs`:

```js
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tests/`
Expected: FAIL — `computeIapProfilePatch` is not exported.

- [ ] **Step 3: Implement** — in `worker.js`, insert after the `checkRate` function (after its closing `}` around line 25):

```js
// ═══ APPLE IAP (RevenueCat) — pure mapping from a RevenueCat subscriber to a profiles PATCH ═══
// Returns the PATCH body, or null when the profile must not be touched.
// Guard: only downgrade profiles whose Pro came from Apple IAP — never promo/legacy rows.
export function computeIapProfilePatch(subscriber, profileRow, nowMs) {
  const ent = subscriber && subscriber.entitlements && subscriber.entitlements['pro'];
  const active = !!(ent && (!ent.expires_date || Date.parse(ent.expires_date) > nowMs));
  if (active) {
    return {
      subscription_status: 'pro',
      subscription_expires_at: ent.expires_date || null,
      subscription_source: 'apple_iap'
    };
  }
  if (profileRow && profileRow.subscription_status === 'pro' && profileRow.subscription_source === 'apple_iap') {
    return { subscription_status: 'free' };
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/`
Expected: 7 passing.

---

### Task 3: worker routes — `/iap/sync`, `/iap/webhook`, downgrade guard

**Files:**
- Modify: `worker.js` (helper after `verifyToken` ~line 222; webhook route after `/webhook/resend` block ends ~line 381; sync route after `/subscription/downgrade-expired` block ends ~line 574; guard inside that same block)

**Interfaces:**
- Consumes: `computeIapProfilePatch` (Task 2), `verifyToken`, `authToken`, parsed `body`, `h` CORS headers — all existing.
- Produces: `POST /iap/sync` (auth: user Bearer token) → `{"synced":true,"pro":true|false}` or `{"synced":false,"error":"…"}`; `POST /iap/webhook` (auth: exact-match Authorization header vs `env.REVENUECAT_WEBHOOK_AUTH`) → `{"received":true}`. Tasks 4-5 call `/iap/sync` via `authFetch`.

- [ ] **Step 1: Add `syncRCSubscriber` helper** — insert directly after the `verifyToken` function (after its closing `}` at line 222):

```js
// Re-fetch one subscriber from RevenueCat and sync their profile row (service key).
// Source of truth for /iap/sync and every /iap/webhook event — idempotent.
async function syncRCSubscriber(userId, env) {
  if (!env.REVENUECAT_API_KEY) return { synced: false, error: 'RevenueCat not configured' };
  const rcR = await fetch('https://api.revenuecat.com/v1/subscribers/' + encodeURIComponent(userId), {
    headers: { 'Authorization': 'Bearer ' + env.REVENUECAT_API_KEY, 'Content-Type': 'application/json' }
  });
  if (!rcR.ok) return { synced: false, error: 'revenuecat ' + rcR.status };
  const rcData = await rcR.json();
  const sh = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY };
  const pr = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + encodeURIComponent(userId) + '&select=subscription_status,subscription_source', { headers: sh });
  const rows = await pr.json();
  if (!rows.length) return { synced: false, error: 'no profile' };
  const patch = computeIapProfilePatch(rcData.subscriber, rows[0], Date.now());
  if (patch) {
    await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + encodeURIComponent(userId), {
      method: 'PATCH',
      headers: { ...sh, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(patch)
    });
  }
  const isPro = patch ? patch.subscription_status === 'pro' : rows[0].subscription_status === 'pro';
  return { synced: true, pro: isPro };
}
```

- [ ] **Step 2: Add the webhook route** — insert immediately after the `/webhook/resend` block's closing `}` (~line 381), before `/feedback-notify`:

```js
    // ═══ REVENUECAT WEBHOOK (Apple IAP lifecycle: purchases, renewals, expirations) ═══
    // Auth: RevenueCat sends the configured "Authorization header value" verbatim.
    if (url.pathname === '/iap/webhook') {
      if (!env.REVENUECAT_WEBHOOK_AUTH || request.headers.get('Authorization') !== env.REVENUECAT_WEBHOOK_AUTH) {
        return new Response('{"error":"Unauthorized"}', { status: 401, headers: h });
      }
      const ev = body && body.event;
      if (ev) {
        const ids = [];
        if (ev.app_user_id) ids.push(ev.app_user_id);
        (ev.transferred_to || []).forEach(function(id){ ids.push(id); });
        (ev.transferred_from || []).forEach(function(id){ ids.push(id); });
        for (const id of ids) {
          if (id && !String(id).startsWith('$RCAnonymousID')) {
            try { await syncRCSubscriber(id, env); } catch (e) {}
          }
        }
      }
      return new Response('{"received":true}', { headers: h });
    }
```

- [ ] **Step 3: Add the sync route** — insert immediately after the `/subscription/downgrade-expired` block's closing `}` (~line 574):

```js
    // === IAP: sync the caller's OWN RevenueCat entitlement into their profile ===
    // Called by the app right after purchase/restore and on app-open for apple_iap subs.
    if (url.pathname === '/iap/sync') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });
      try {
        const result = await syncRCSubscriber(user.id, env);
        return new Response(JSON.stringify(result), { headers: h });
      } catch (e) {
        return new Response('{"synced":false,"error":"sync failed"}', { status: 500, headers: h });
      }
    }
```

- [ ] **Step 4: Guard `/subscription/downgrade-expired` against blind-downgrading IAP subs** (an Apple renewal the webhook missed must be re-checked against RevenueCat, not zapped). Replace the block's body (worker.js:564-574) with:

```js
    if (url.pathname === '/subscription/downgrade-expired') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });
      const sh = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY };
      const pr = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=subscription_status,subscription_expires_at,subscription_source', { headers: sh });
      const rows = await pr.json();
      if (rows.length && rows[0].subscription_status === 'pro' && rows[0].subscription_expires_at && new Date(rows[0].subscription_expires_at) < new Date()) {
        if (rows[0].subscription_source === 'apple_iap') {
          // Apple owns this sub — re-sync from RevenueCat (renewal may have happened).
          try { await syncRCSubscriber(user.id, env); } catch (e) {}
        } else {
          await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id, { method: 'PATCH', headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ subscription_status: 'free' }) });
        }
      }
      return new Response('{"success":true}', { headers: h });
    }
```

- [ ] **Step 5: Verify**

Run: `node --check worker.js && node --test tests/`
Expected: clean check; 7 tests passing. Also `grep -c "iap/" worker.js` → 2 route matches.

---

### Task 4: app.html — mvIAP module + paywall surface (static HTML, legal overlay)

**Files:**
- Modify: `app.html:1682` area (RC key const), after `mvNative`'s closing (~line 1925, before `registerPushNotifications`) for `mvIAP`, line 1171 (paywall statics), near line 1069 (`progressPage`) for the legal overlay div.

**Interfaces:**
- Consumes: `mvNative.isNative()`, `S.user`, `authFetch`, `API_URL`, `loadProfile`, `dismissPw`, `updateFreeCtr`, `updateSubSt`, `renderSb`, `showToast`, `closeOverlay` — all existing.
- Produces: `mvIAP.available()`, `mvIAP.init()`, `mvIAP.purchase()`, `mvIAP.restore()`, `mvIAP.refreshPaywallPrice()`, global `restorePurchases()`, `openLegalDoc(which)`; DOM ids `pwPrice`, `pwPromoRow`, `pwRestore`, `legalPage`, `legalTitle`, `legalFrame`. Task 5 wires them into `subscribe()`/`showPw()`/etc.

- [ ] **Step 1: RC key constant.** After `var API_URL = …` (line 1682) add:

```js
var RC_IOS_API_KEY = ""; // RevenueCat PUBLIC iOS SDK key (appl_…). Empty = IAP disabled on native. Set after RevenueCat project setup — served remotely, no new binary needed.
```

- [ ] **Step 2: mvIAP module.** Insert after the `mvNative` object literal fully closes (~line 1925, just before the `registerPushNotifications` function):

```js
// ═══ APPLE IN-APP PURCHASE (RevenueCat) — iOS only; web keeps Stripe ═══
// Plugin reached via the same native bridge proxy as every other plugin.
// The client NEVER writes subscription_status (column is trigger-locked);
// the worker /iap/sync + /iap/webhook write it from RevenueCat truth.
var mvIAP={
  _ready:false,
  _appUserID:null,
  plugin:function(){return (window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.Purchases)||null},
  available:function(){
    if(!RC_IOS_API_KEY)return false;
    if(typeof mvNative==='undefined'||!mvNative.isNative())return false;
    if(!(window.Capacitor.getPlatform&&window.Capacitor.getPlatform()==='ios'))return false;
    return !!mvIAP.plugin();
  },
  init:async function(){
    if(!mvIAP.available()||!S.user)return;
    if(mvIAP._appUserID===S.user.id)return;
    var P=mvIAP.plugin();
    try{
      if(mvIAP._ready){await P.logIn({appUserID:S.user.id});}
      else{await P.configure({apiKey:RC_IOS_API_KEY,appUserID:S.user.id});mvIAP._ready=true;}
      mvIAP._appUserID=S.user.id;
    }catch(e){console.error('[IAP] init:',e)}
  },
  getMonthlyPackage:async function(){
    var offs=await mvIAP.plugin().getOfferings();
    var off=(offs&&offs.current)||((offs&&offs.all)?offs.all['default']:null);
    if(!off||!off.availablePackages||!off.availablePackages.length)return null;
    for(var i=0;i<off.availablePackages.length;i++){
      if(off.availablePackages[i].packageType==='MONTHLY')return off.availablePackages[i];
    }
    return off.availablePackages[0];
  },
  refreshPaywallPrice:async function(){
    if(!mvIAP.available())return;
    try{
      await mvIAP.init();
      var pkg=await mvIAP.getMonthlyPackage();
      if(pkg&&pkg.product&&pkg.product.priceString){
        var priceEl=document.getElementById('pwPrice');
        if(priceEl)priceEl.textContent=pkg.product.priceString;
        var btn=document.querySelector('.pw-btn');
        if(btn&&!btn.disabled)btn.textContent='Start Modern Village Coach — '+pkg.product.priceString+'/mo';
      }
    }catch(e){}
  },
  purchase:async function(){
    if(!S.user){showAuth(true);return}
    var btn=document.querySelector('.pw-btn');
    try{
      if(btn){btn.disabled=true;btn.textContent='Opening App Store...'}
      await mvIAP.init();
      var pkg=await mvIAP.getMonthlyPackage();
      if(!pkg){showToast('Subscription is not available right now. Please try again later.');return}
      var res=await mvIAP.plugin().purchasePackage({aPackage:pkg});
      var info=res&&res.customerInfo;
      var active=!!(info&&info.entitlements&&info.entitlements.active&&info.entitlements.active['pro']);
      if(active){
        try{await authFetch(API_URL+'iap/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})}catch(e){}
        await loadProfile();
        if(!S.subscribed)S.subscribed=true; // worker sync may lag a beat — Apple already charged
        dismissPw();updateFreeCtr();updateSubSt();renderSb();
        showToast('Welcome to Coach Pro! Unlimited coaching unlocked.');
      }else{
        showToast('Purchase not completed.');
      }
    }catch(e){
      var msg=String((e&&e.message)||'');
      if(!/cancel/i.test(msg)){console.error('[IAP] purchase:',e);showToast('Purchase failed. Please try again.')}
    }finally{
      if(btn){btn.disabled=false;btn.textContent='Start Modern Village Coach — $19.99/mo'}
      mvIAP.refreshPaywallPrice();
    }
  },
  restore:async function(){
    if(!mvIAP.available())return;
    try{
      showToast('Restoring purchases...');
      await mvIAP.init();
      var res=await mvIAP.plugin().restorePurchases();
      try{await authFetch(API_URL+'iap/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})}catch(e){}
      await loadProfile();
      updateFreeCtr();updateSubSt();renderSb();
      if(S.subscribed){dismissPw();showToast('Coach Pro restored!')}
      else{showToast('No previous purchases found.')}
    }catch(e){console.error('[IAP] restore:',e);showToast('Could not restore purchases.')}
  }
};
function restorePurchases(){mvIAP.restore()}
function openLegalDoc(which){
  var t=document.getElementById('legalTitle');
  var f=document.getElementById('legalFrame');
  if(which==='terms'){t.textContent='Terms of Use';f.src='/terms.html'}
  else{t.textContent='Privacy Policy';f.src='/privacy.html'}
  document.getElementById('legalPage').classList.add('open');
}
```

(Note the `—` em-dashes in JS strings — matches how `subscribe()` writes the button label today; `\x27` isn't needed here since no single quotes are embedded in onclick-attribute JS strings.)

- [ ] **Step 3: Legal overlay div.** Immediately BEFORE `<div id="progressPage" class="overlay-page">` (line 1069) insert:

```html
<div id="legalPage" class="overlay-page"><div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--sand);background:white"><div id="legalTitle" style="font-weight:700;font-size:16px">Terms of Use</div><button class="btn btn-s" onclick="closeOverlay('legalPage')">Close</button></div><iframe id="legalFrame" src="about:blank" title="Legal document" style="flex:1;width:100%;border:none;background:white"></iframe></div>
```

(Same-origin iframe: the webview origin is `https://modernvillage.app` on BOTH web and native — `server.url` — so `/terms.html` + `/privacy.html` load under CSP `default-src 'self'`. No navigation away from the app, no Browser plugin needed.)

- [ ] **Step 4: Paywall static edits** (all inside line 1171):
  - a. `<div class="pw-price">` → `<div class="pw-price" id="pwPrice">`
  - b. Promo row `<div style="display:flex;gap:8px;margin-top:12px;align-items:center">` → `<div id="pwPromoRow" style="display:flex;gap:8px;margin-top:12px;align-items:center">`
  - c. Directly after `<button class="pw-skip" onclick="dismissPw()">Maybe later</button>` insert:

```html
<button id="pwRestore" class="pw-skip" style="display:none" onclick="restorePurchases()">Restore Purchases</button><div style="margin-top:12px;font-size:11px;color:var(--warm-gray-light);line-height:1.6">Renews monthly until cancelled.<br><a href="javascript:void(0)" onclick="openLegalDoc('terms')" style="color:var(--warm-gray)">Terms of Use</a> &middot; <a href="javascript:void(0)" onclick="openLegalDoc('privacy')" style="color:var(--warm-gray)">Privacy Policy</a></div>
```

(Static HTML attributes → plain single quotes are correct here, NOT `\x27` — that rule is for onclick attributes composed inside JS strings. Guideline 3.1.2 requires Terms + Privacy links visible at the point of subscription.)

- [ ] **Step 5: Verify**

```bash
node --check <(sed -n '/<script>/,/<\/script>/p' app.html | sed '1d;$d') 2>&1 | head -3
grep -c "mvIAP\|pwRestore\|legalPage\|pwPromoRow\|pwPrice" app.html
```

Expected: if the app's main script extracts cleanly, no syntax error (if the sed extraction is imperfect because of multiple script tags, fall back to loading `app.html` in a local browser and checking the console); grep count ≥ 20. Also `open app.html` in a browser: paywall renders, promo row visible (web), no console errors, Terms link opens the overlay.

---

### Task 5: app.html — platform routing (subscribe, showPw, manage, boot, practice billing, expiry re-check)

**Files:**
- Modify: `app.html:6507` (`subscribe()`), `app.html:6505` (`showPw()`), `app.html:6527` (`manageSubscription()`), `app.html:6236` area (`enterApp()`), `app.html:2478` (`renderBillingCard()`), `app.html:5914-5919` (`loadProfile()` expiry branch)

**Interfaces:**
- Consumes: everything Task 4 produced; `S.profile.subscription_source` (Task 1's column, arrives via `loadProfile`'s `select('*')`).

- [ ] **Step 1: Route `subscribe()` by platform.** Replace the function's opening (lines 6507-6509 up to the existing `try{`) so it reads:

```js
async function subscribe(){
  if(!S.user){showAuth(true);return}
  // iOS/native: Apple IAP only — a Stripe checkout here is an App Store 3.1.1 rejection.
  if(typeof mvNative!=='undefined'&&mvNative.isNative()){
    if(mvIAP.available()){await mvIAP.purchase();}
    else{showToast('Subscriptions are coming to the app soon.')}
    return;
  }
  try{
```

(The rest of the web/Stripe body stays byte-identical.)

- [ ] **Step 2: Native-aware `showPw()`.** Replace line 6505 with:

```js
function showPw(){document.getElementById('paywall').classList.remove('hidden');document.getElementById('coachEmpty').classList.add('hidden');document.getElementById('chatBar').style.display='none';var pwNative=typeof mvNative!=='undefined'&&mvNative.isNative();var pwPromo=document.getElementById('pwPromoRow');if(pwPromo)pwPromo.style.display=pwNative?'none':'flex';var pwRest=document.getElementById('pwRestore');if(pwRest)pwRest.style.display=(pwNative&&mvIAP.available())?'block':'none';if(pwNative)mvIAP.refreshPaywallPrice();}
```

(Promo-code self-serve unlock bypasses IAP → hidden on native, 3.1.1. Restore Purchases is an App Review expectation for auto-renewables.)

- [ ] **Step 3: Platform-aware `manageSubscription()`.** Replace the function (6527-6538) with:

```js
async function manageSubscription(){
  var src=S.profile&&S.profile.subscription_source;
  if(typeof mvNative!=='undefined'&&mvNative.isNative()){
    if(src==='apple_iap'){window.open('https://apps.apple.com/account/subscriptions','_blank');}
    else{showToast('Nothing to manage on this account.')}
    return;
  }
  if(src==='apple_iap'){showToast('Manage your subscription in the App Store on your iPhone.');return}
  try{
    showToast('Opening billing portal...');
    var r=await authFetch(API_URL+'create-portal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});
    var data=await r.json();
    if(data.url){
      window.location.href=data.url;
    } else {
      showToast(data.error||'Could not open billing portal.');
    }
  }catch(e){showToast('Error opening billing portal.')}
}
```

(`apps.apple.com` is NOT in `allowNavigation` → Capacitor opens it externally in the system App Store/Safari — exactly what we want.)

- [ ] **Step 4: Configure RevenueCat at every app entry.** In `enterApp()` inside the existing `if(S.user){` block (right before the `push/clear-badge` call at line 6240), add:

```js
    if(typeof mvIAP!=='undefined')mvIAP.init();
```

(Fire-and-forget; `init` never throws. Runs on session-restore, login, signup — all 7 `enterApp` call sites.)

- [ ] **Step 5: Hide the practice Stripe billing card on native.** At the very top of `renderBillingCard(p, isOwner, trialDaysLeft)` (line 2479, before `var status = …`), add:

```js
  if(typeof mvNative!=='undefined'&&mvNative.isNative())return ''; // BCBA billing is web-only — no Stripe UI on iOS (3.1.1)
```

- [ ] **Step 6: IAP-aware expiry re-check in `loadProfile()`.** Replace lines 5914-5919 (the expiry branch) with:

```js
    if(isSubActive&&r.data.subscription_expires_at){
      if(new Date(r.data.subscription_expires_at)<new Date()){
        isSubActive=false;
        if(r.data.subscription_source==='apple_iap'){
          // Apple may have renewed while our webhook slept — ask the worker to re-sync from RevenueCat.
          try{
            var iapR=await authFetch(API_URL+'iap/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
            var iapD=await iapR.json();
            if(iapD&&iapD.pro)isSubActive=true;
          }catch(e){}
        } else {
          try{authFetch(API_URL+'subscription/downgrade-expired',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})}).catch(function(){})}catch(e){}
        }
      }
    }
```

- [ ] **Step 7: Verify**

```bash
grep -n "mvIAP.available()" app.html | wc -l   # ≥ 3 (subscribe, showPw, mvIAP internals)
grep -n "renderBillingCard" app.html            # top of function has the native return ''
grep -c "\\\\x27" app.html                      # unchanged vs before this work (no new \\x27!)
```

Then load `app.html` in a browser (web mode): paywall still shows promo row + NO restore button; subscribe button still goes down the Stripe path; console clean.

---

### Task 6: install the plugin + Capacitor sync

**Files:**
- Modify: `package.json`, `package-lock.json` (via npm), `ios/App/CapApp-SPM/Package.swift` (via `npx cap sync ios` — DO NOT hand-edit, it's CLI-managed)

- [ ] **Step 1:**

```bash
npm install @revenuecat/purchases-capacitor@^13.2.2
```

Expected: package.json gains the dep; no peer-dep errors (needs `@capacitor/core >=8.0.0`, repo has 8.3.1).

- [ ] **Step 2:**

```bash
npx cap sync ios
```

Expected: completes without error; `ios/App/CapApp-SPM/Package.swift` now lists `RevenuecatPurchasesCapacitor` in both `dependencies` and target `dependencies` (same pattern as the other 9 plugins).

- [ ] **Step 3: Verify**

```bash
grep -i "revenuecat" ios/App/CapApp-SPM/Package.swift
node --check worker.js && node --test tests/
```

Expected: two RevenueCat lines in Package.swift; worker checks still green.

---

### Task 7: docs + handoff + approval gate (NO commit without Jorrel)

**Files:**
- Modify: `SESSION_HANDOFF.md` (new "Most recent session" section, same style as existing entries)
- Modify: `jorrel-os.json` — MERGE-ONLY keys (`current.next_action`, `current.blockers`, `current.completed_today`, `current.last_session`)

- [ ] **Step 1:** Add a `## Most recent session — 2026-07-11 (Apple IAP wired — Path A / RevenueCat)` section to SESSION_HANDOFF.md summarizing: what shipped in code, the two worker routes + secrets they need, the migration to apply, and Jorrel's checklist (below).
- [ ] **Step 2:** Update `jorrel-os.json` current.* keys only.
- [ ] **Step 3:** Run the full verification sweep and show Jorrel `git diff` + `git status` for approval. **Do not commit, push, or `wrangler deploy` until he approves** (push = live web deploy).

**Jorrel's checklist (his half of Path A — goes in the handoff + final message):**

1. **App Store Connect:** Agreements → Paid Apps active. Create auto-renewable subscription: product id `mv_pro_monthly`, group "Modern Village Pro", $19.99/mo, display name "Modern Village Coach Pro". Add a sandbox tester (Users & Access → Sandbox).
2. **RevenueCat:** create account + project → add iOS app (bundle `app.modernvillage.ios`) → upload an App Store Connect In-App Purchase API key → Entitlements: create `pro` → attach product `mv_pro_monthly` → Offerings: `default` offering with a Monthly package pointing at the product.
3. **Keys into the stack:** RevenueCat public Apple SDK key (`appl_…`) → paste into `RC_IOS_API_KEY` in app.html (deploys with the site — no binary rebuild). RevenueCat secret key (`sk_…`) → `wrangler secret put REVENUECAT_API_KEY`. Generate a random string → RevenueCat dashboard webhook "Authorization header value" AND `wrangler secret put REVENUECAT_WEBHOOK_AUTH`. Webhook URL: `https://village-api.jorrelpatterson.workers.dev/iap/webhook`.
4. **Apply the migration** `supabase/migrations/20260711_iap_subscription_source.sql` in the Supabase SQL editor.
5. **Deploy:** approve diffs → commit/push (Vercel picks up app.html) + `wrangler deploy`.
6. **Xcode:** open `ios/App`, let SPM resolve, add the **In-App Purchase capability** to the App target, build to a real device. On-device: Settings → App Store → Sandbox Account → sign in with the sandbox tester. In the app: hit the paywall → purchase → expect Apple sheet → confirm Pro unlocks; test "Restore Purchases" after reinstall/sign-out-in; note sandbox subs auto-renew every few minutes and expire fast (so a later downgrade in sandbox is EXPECTED, not a bug). Hard-refresh caveat applies after the web deploy (iOS caches HTML aggressively).

## Self-review notes (done at plan time)

- Spec coverage: purchase ✅ (T4/T5), entitlement gating ✅ (existing `S.subscribed` machinery fed by worker-written `subscription_status` — T2/T3), keep Stripe web ✅ (untouched paths), restore ✅, manage-subscription ✅, renewals/cancel/expiry ✅ (webhook + sync + guarded downgrade), promo-vs-IAP interference ✅ (`subscription_source`), 3.1.1 surfaces ✅ (native: no Stripe consumer button, no promo input, no practice billing card), 3.1.2 ✅ (Terms/Privacy/renewal text on paywall).
- Known accepted gaps (explicitly out of scope): web consumer Stripe checkout was already a dead end (`/create-checkout` route never existed) — unchanged; Android IAP (no Android release); `updateSubSt` hardcodes "$19.99/mo" copy (US launch only); shared-Pro co-parent "Manage" shows the no-billing toast.
- Type consistency: `computeIapProfilePatch(subscriber, profileRow, nowMs)` used identically in tests (T2) and `syncRCSubscriber` (T3); `mvIAP.*` names match between T4 definitions and T5 call sites; DOM ids `pwPrice/pwPromoRow/pwRestore/legalPage/legalTitle/legalFrame` match between T4 HTML and T4/T5 JS.

## Deviation from plan (found during execution, 2026-07-11)

Task 4's legal-links work (footer disclosure, `openLegalDoc()`, `legalPage` iframe overlay) was **dropped**: the paywall already carried "$19.99/month, auto-renews until cancelled. Terms · Privacy" wired to a pre-existing `openLegal()` overlay (app.html:10615, also used by the auth screen) — added by the same-day audit session and hidden from the plan-time grep by display truncation of the 1,171-column line. 3.1.2 was already satisfied; adding a second disclosure row + a parallel overlay mechanism would have been duplication. Only the `pwRestore` button remains from that step. Everything else shipped as planned.

One pre-existing wrinkle noticed (NOT fixed, out of scope): `openLegal()` fetches `https://www.modernvillage.app/<page>.html`; in the native app the document origin is `https://modernvillage.app` (no www), so CSP `default-src 'self'` may block that fetch on-device and show the graceful fallback text. Verify on the device build; if it fails, either add `https://www.modernvillage.app` to the CSP or drop the `www.` from the fetch URL.
