const ALLOWED_ORIGINS = [
  'https://modernvillage.app',
  'https://www.modernvillage.app'
];

const ALLOWED_EMAIL_RECIPIENTS = [
  'arianaRpatterson@gmail.com'
];

const rateLimits = new Map();
const RATE_WINDOW = 60000;
const RATE_MAX_AI = 10;
const RATE_MAX_EMAIL = 5;

function checkRate(ip, type) {
  const key = ip + ':' + type;
  const now = Date.now();
  const max = type === 'ai' ? RATE_MAX_AI : RATE_MAX_EMAIL;
  if (!rateLimits.has(key)) { rateLimits.set(key, { c: 1, s: now }); return true; }
  const e = rateLimits.get(key);
  if (now - e.s > RATE_WINDOW) { e.c = 1; e.s = now; return true; }
  e.c++;
  return e.c <= max;
}

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

function getCors(request) {
  const origin = request.headers.get('Origin') || '';
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Type': 'application/json'
  };
  // Echo Origin only for allow-listed sites; otherwise omit ACAO so browsers block the
  // cross-origin read. Server-to-server callers (webhooks) send no Origin and are unaffected.
  if (ALLOWED_ORIGINS.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

// Verify a Svix-signed webhook (Resend). Fails closed when the signing secret is unset.
async function verifySvix(secret, headers, rawBody) {
  if (!secret) return false;
  const id = headers.get('svix-id') || headers.get('webhook-id') || '';
  const ts = headers.get('svix-timestamp') || headers.get('webhook-timestamp') || '';
  const sigHeader = headers.get('svix-signature') || headers.get('webhook-signature') || '';
  if (!id || !ts || !sigHeader) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) > 300) return false; // 5-min replay window
  let secretBytes;
  try { secretBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), function(c){ return c.charCodeAt(0); }); }
  catch { return false; }
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(id + '.' + ts + '.' + rawBody));
  const expected = btoa(String.fromCharCode.apply(null, new Uint8Array(signed)));
  // svix-signature is a space-separated list of "v1,<base64sig>" entries; any match verifies.
  let ok = false;
  sigHeader.split(' ').forEach(function(part){
    const comma = part.indexOf(',');
    const val = comma >= 0 ? part.substring(comma + 1) : part;
    let diff = expected.length ^ val.length;
    for (let i = 0; i < expected.length && i < val.length; i++) diff |= expected.charCodeAt(i) ^ val.charCodeAt(i);
    if (diff === 0) ok = true;
  });
  return ok;
}


// ═══ APNs PUSH HELPERS ═══
let _apnsJwtCache = null;

function _b64url(buf) {
  if (buf instanceof ArrayBuffer) buf = new Uint8Array(buf);
  if (buf instanceof Uint8Array) {
    let s = '';
    for (const b of buf) s += String.fromCharCode(b);
    return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  }
  return btoa(typeof buf === 'string' ? buf : JSON.stringify(buf))
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getApnsJwt(env) {
  const now = Math.floor(Date.now() / 1000);
  if (_apnsJwtCache && _apnsJwtCache.exp > now + 60) return _apnsJwtCache.jwt;

  const pem = (env.APNS_AUTH_KEY || '').replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  if (!pem) throw new Error('APNS_AUTH_KEY missing');
  const binaryKey = Uint8Array.from(atob(pem), ch => ch.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const header = { alg: 'ES256', kid: env.APNS_KEY_ID, typ: 'JWT' };
  const payload = { iss: env.APNS_TEAM_ID, iat: now };
  const data = _b64url(header) + '.' + _b64url(payload);

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(data)
  );

  const jwt = data + '.' + _b64url(sig);
  _apnsJwtCache = { jwt, exp: now + 3000 };
  return jwt;
}

async function sendApns(env, deviceToken, payload, opts) {
  opts = opts || {};
  const jwt = await getApnsJwt(env);
  const bundleId = env.APNS_BUNDLE_ID || 'app.modernvillage.ios';

  const response = await fetch('https://api.push.apple.com/3/device/' + deviceToken, {
    method: 'POST',
    headers: {
      'authorization': 'bearer ' + jwt,
      'apns-topic': bundleId,
      'apns-push-type': opts.pushType || 'alert',
      'apns-priority': String(opts.priority || 10),
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  return { status: response.status, body: text, ok: response.status === 200 };
}

function buildApnsPayload(title, body, data) {
  return {
    aps: {
      alert: { title: title || '', body: body || '' },
      sound: 'default',
      'mutable-content': 1,
      ...(data && data._badge !== undefined ? { badge: data._badge } : {})
    },
    ...(data || {})
  };
}

// ═══ PUSH: high-level send helper ═══
// Looks up target user's push tokens, checks opt-out prefs, dedups, sends APNs, logs.
// Returns { sent: N, skipped: reason } summary.
async function sendPushToUser(env, userId, title, body, pushType, opts) {
  opts = opts || {};
  const dedupKey = opts.dedupKey || null; // if set, skip if same (user,type,key) already sent
  const incrementBadge = opts.incrementBadge !== false; // default true
  const supaH = {
    'apikey': env.SUPABASE_SERVICE_KEY,
    'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY,
    'Content-Type': 'application/json'
  };

  // 1) Check user prefs (master opt-out + per-type pref)
  const prefCol = 'push_pref_' + pushType.replace(/-/g, '_');
  const profR = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + userId + '&select=push_opted_out,push_badge_count,' + prefCol, { headers: supaH });
  const profs = await profR.json();
  if (!profs || !profs.length) return { sent: 0, skipped: 'no-profile' };
  const p = profs[0];
  if (p.push_opted_out) return { sent: 0, skipped: 'opted-out' };
  if (p[prefCol] === false) return { sent: 0, skipped: 'pref-off' };

  // 2) Dedup check
  if (dedupKey) {
    const dedupR = await fetch(env.SUPABASE_URL + '/rest/v1/push_dedup?user_id=eq.' + userId + '&push_type=eq.' + pushType + '&dedup_key=eq.' + encodeURIComponent(dedupKey) + '&select=user_id', { headers: supaH });
    const existing = await dedupR.json();
    if (existing && existing.length > 0) return { sent: 0, skipped: 'dedup' };
  }

  // 3) Look up active push tokens
  const tokR = await fetch(env.SUPABASE_URL + '/rest/v1/push_tokens?user_id=eq.' + userId + '&disabled_at=is.null&select=id,token,platform', { headers: supaH });
  const tokens = await tokR.json();
  if (!tokens || !tokens.length) return { sent: 0, skipped: 'no-tokens' };

  // 4) Increment badge counter + send (iOS badge = this user's total unread pushes)
  let newBadge = p.push_badge_count || 0;
  if (incrementBadge) {
    newBadge = newBadge + 1;
    await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + userId, {
      method: 'PATCH',
      headers: { ...supaH, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ push_badge_count: newBadge })
    });
  }

  let sent = 0;
  for (const t of tokens) {
    if (t.platform !== 'ios') continue; // iOS only for now; add FCM later
    try {
      const payload = buildApnsPayload(title, body, { push_type: pushType, _badge: newBadge, ...(opts.data || {}) });
      const r = await sendApns(env, t.token, payload);
      if (r.ok) sent++;
      // Log
      await fetch(env.SUPABASE_URL + '/rest/v1/push_send_log', {
        method: 'POST',
        headers: { ...supaH, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          user_id: userId,
          push_type: pushType,
          platform: t.platform,
          token_id: t.id,
          title: title,
          body: body,
          payload: opts.data || null,
          status: r.ok ? 'sent' : 'failed',
          error_code: r.ok ? null : String(r.status),
          error_message: r.ok ? null : (r.body || '').substring(0, 200),
          sent_at: new Date().toISOString()
        })
      });
      // Auto-disable tokens that APNs rejects permanently (410 Gone, etc.)
      if (r.status === 410 || (r.status === 400 && r.body && r.body.indexOf('BadDeviceToken') >= 0)) {
        await fetch(env.SUPABASE_URL + '/rest/v1/push_tokens?id=eq.' + t.id, {
          method: 'PATCH',
          headers: { ...supaH, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ disabled_at: new Date().toISOString() })
        });
      }
    } catch (e) { /* log-only */ }
  }

  // 5) Record dedup
  if (dedupKey && sent > 0) {
    await fetch(env.SUPABASE_URL + '/rest/v1/push_dedup', {
      method: 'POST',
      headers: { ...supaH, 'Prefer': 'return=minimal,resolution=ignore-duplicates' },
      body: JSON.stringify({ user_id: userId, push_type: pushType, dedup_key: dedupKey })
    });
  }

  return { sent, skipped: null };
}


async function verifyToken(token, env) {
  if (!token) return null;
  try {
    const r = await fetch(env.SUPABASE_URL + '/auth/v1/user', {
      headers: { 'Authorization': 'Bearer ' + token, 'apikey': env.SUPABASE_ANON_KEY }
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

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

function emailWrapper(bodyContent, unsubscribeUrl) {
  var unsub = unsubscribeUrl || 'https://modernvillage.app/app.html';
  var unsubText = unsubscribeUrl ? 'Unsubscribe' : 'Manage email preferences';
  return (
    '<div style="background:#FDF8F0;padding:20px 0;font-family:sans-serif">' +
    '<div style="max-width:520px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;border:1px solid #E8DDD0">' +
    '<div style="background:#7A9E7E;padding:28px 32px;text-align:center">' +
    '<div style="display:inline-block;width:44px;height:44px;background:rgba(255,255,255,0.2);border-radius:12px;margin-bottom:10px;line-height:44px;font-size:24px">&#127807;</div>' +
    '<div style="font-size:24px;font-weight:800;color:white;letter-spacing:0.5px">Modern Village</div>' +
    '<div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:6px;letter-spacing:0.3px">It takes a village. Let us be yours.</div>' +
    '</div>' +
    '<div style="padding:32px">' +
    bodyContent +
    '</div>' +
    '<div style="padding:20px 32px;border-top:1px solid #E8DDD0;text-align:center">' +
    '<div style="font-size:11px;color:#9E9790;line-height:1.6">' +
    'Modern Village &mdash; ABA-powered support for neurodivergent families<br>' +
    '<a href="https://modernvillage.app" style="color:#7A9E7E;text-decoration:none">modernvillage.app</a><br>' +
    '<a href="' + unsub + '" style="color:#9E9790;text-decoration:none;font-size:10px">' + unsubText + '</a>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '</div>'
  );
}

export default {
  async fetch(request, env) {
    const h = getCors(request);
    const ip = request.headers.get('CF-Connecting-IP') || '0';

    if (request.method === 'OPTIONS') return new Response(null, { headers: h });

    const url = new URL(request.url);

    if (request.method !== 'POST' && !(request.method === 'GET' && url.pathname === '/unsubscribe')) {
      return new Response('{"error":"Method not allowed"}', { status: 405, headers: h });
    }

    // ═══ STRIPE WEBHOOK — handle BEFORE body JSON-parse since we need raw body for signature ═══
    if (url.pathname === '/stripe/webhook') {
      if (!env.STRIPE_WEBHOOK_SECRET) {
        return new Response('{"error":"Stripe webhook secret not configured"}', { status: 500, headers: h });
      }
      const rawBody = await request.text();
      const sigHeader = request.headers.get('stripe-signature') || '';
      // Parse signature: t=timestamp,v1=hash
      let ts = '', sig = '';
      sigHeader.split(',').forEach(function(part){
        const eq = part.indexOf('=');
        if (eq < 0) return;
        const k = part.substring(0, eq), v = part.substring(eq + 1);
        if (k === 't') ts = v;
        else if (k === 'v1') sig = v;
      });
      if (!ts || !sig) return new Response('{"error":"Missing signature"}', { status: 400, headers: h });
      // Reject stale/replayed events (Stripe recommends a 5-minute tolerance).
      if (Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) > 300) return new Response('{"error":"Timestamp out of tolerance"}', { status: 400, headers: h });
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', encoder.encode(env.STRIPE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(ts + '.' + rawBody));
      const expected = Array.from(new Uint8Array(signed)).map(function(b){ return b.toString(16).padStart(2, '0'); }).join('');
      // Constant-time comparison of the two hex signatures.
      let sigDiff = expected.length ^ sig.length;
      for (let i = 0; i < expected.length && i < sig.length; i++) sigDiff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
      if (sigDiff !== 0) return new Response('{"error":"Bad signature"}', { status: 400, headers: h });
      // Verified. Parse event.
      let event;
      try { event = JSON.parse(rawBody); } catch { return new Response('{"error":"Invalid JSON"}', { status: 400, headers: h }); }
      const supaH = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
      const obj = event.data && event.data.object || {};
      // Handlers
      if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
        const practiceId = (obj.metadata && obj.metadata.practice_id) || null;
        if (practiceId) {
          const status = obj.status; // 'active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete'
          // Normalize to our internal status set
          let internalStatus = 'past_due';
          if (status === 'active' || status === 'trialing') internalStatus = 'active';
          else if (status === 'canceled' || status === 'incomplete_expired') internalStatus = 'cancelled';
          const periodEnd = obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null;
          const quantity = (obj.items && obj.items.data && obj.items.data[0] && obj.items.data[0].quantity) || 0;
          const patch = {
            stripe_subscription_id: obj.id,
            subscription_status: internalStatus,
            subscription_period_end: periodEnd,
            subscription_current_quantity: quantity
          };
          if (internalStatus !== 'past_due') patch.past_due_since = null;
          await fetch(env.SUPABASE_URL + '/rest/v1/practices?id=eq.' + practiceId, {
            method: 'PATCH', headers: supaH, body: JSON.stringify(patch)
          });
        }
      } else if (event.type === 'customer.subscription.deleted') {
        const practiceId = (obj.metadata && obj.metadata.practice_id) || null;
        if (practiceId) {
          await fetch(env.SUPABASE_URL + '/rest/v1/practices?id=eq.' + practiceId, {
            method: 'PATCH', headers: supaH, body: JSON.stringify({ subscription_status: 'cancelled' })
          });
        }
      } else if (event.type === 'invoice.payment_failed') {
        // Mark past_due_since on first failure if not already set
        const subId = obj.subscription;
        if (subId) {
          const prR = await fetch(env.SUPABASE_URL + '/rest/v1/practices?stripe_subscription_id=eq.' + encodeURIComponent(subId) + '&select=id,past_due_since', {
            headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
          });
          const rows = await prR.json();
          if (rows.length && !rows[0].past_due_since) {
            await fetch(env.SUPABASE_URL + '/rest/v1/practices?id=eq.' + rows[0].id, {
              method: 'PATCH', headers: supaH, body: JSON.stringify({ subscription_status: 'past_due', past_due_since: new Date().toISOString() })
            });
          }
        }
      } else if (event.type === 'invoice.payment_succeeded') {
        const subId = obj.subscription;
        if (subId) {
          await fetch(env.SUPABASE_URL + '/rest/v1/practices?stripe_subscription_id=eq.' + encodeURIComponent(subId), {
            method: 'PATCH', headers: supaH, body: JSON.stringify({ subscription_status: 'active', past_due_since: null })
          });
        }
      }
      return new Response('{"received":true}', { headers: h });
    }

    let body, rawBody;
    if (request.method === 'POST') {
      try { rawBody = await request.text(); body = JSON.parse(rawBody); } catch { return new Response('{"error":"Invalid JSON"}', { status: 400, headers: h }); }
    }

    // ═══ RESEND WEBHOOK (email tracking — Svix-signed; requires RESEND_WEBHOOK_SECRET) ═══
    if (url.pathname === '/webhook/resend') {
      if (!(await verifySvix(env.RESEND_WEBHOOK_SECRET, request.headers, rawBody))) {
        return new Response('{"error":"Unauthorized"}', { status: 401, headers: h });
      }
      const event = body;
      if (!event || !event.type) return new Response('{"ok":true}', { headers: h });
      const emailId = event.data && event.data.email_id;
      if (!emailId) return new Response('{"ok":true}', { headers: h });
      const supaH = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
      const now = new Date().toISOString();
      if (event.type === 'email.opened') {
        await fetch(env.SUPABASE_URL + '/rest/v1/campaign_sends?resend_id=eq.' + emailId, { method: 'PATCH', headers: supaH, body: JSON.stringify({ status: 'opened', opened_at: now }) });
      } else if (event.type === 'email.clicked') {
        await fetch(env.SUPABASE_URL + '/rest/v1/campaign_sends?resend_id=eq.' + emailId, { method: 'PATCH', headers: supaH, body: JSON.stringify({ status: 'clicked', clicked_at: now }) });
      } else if (event.type === 'email.bounced') {
        await fetch(env.SUPABASE_URL + '/rest/v1/campaign_sends?resend_id=eq.' + emailId, { method: 'PATCH', headers: supaH, body: JSON.stringify({ status: 'bounced', bounced_at: now }) });
      }
      // Update campaign aggregate counts
      if (emailId) {
        const sendR = await fetch(env.SUPABASE_URL + '/rest/v1/campaign_sends?resend_id=eq.' + emailId + '&select=campaign_id', { headers: supaH });
        const sends = await sendR.json();
        if (sends && sends.length) {
          const cid = sends[0].campaign_id;
          const statsR = await fetch(env.SUPABASE_URL + '/rest/v1/campaign_sends?campaign_id=eq.' + cid + '&select=status', { headers: supaH });
          const allSends = await statsR.json();
          const opened = allSends.filter(s => s.status === 'opened' || s.status === 'clicked').length;
          const clicked = allSends.filter(s => s.status === 'clicked').length;
          const bounced = allSends.filter(s => s.status === 'bounced').length;
          await fetch(env.SUPABASE_URL + '/rest/v1/campaigns?id=eq.' + cid, { method: 'PATCH', headers: supaH, body: JSON.stringify({ total_opened: opened, total_clicked: clicked, total_bounced: bounced }) });
        }
      }
      return new Response('{"ok":true}', { headers: h });
    }

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

    // === FEEDBACK NOTIFICATION (PHI-free: the submission lives in the DB; this email is a bare nudge) ===
    if (url.pathname === '/feedback-notify') {
      if (!checkRate(ip, 'email')) return new Response('{"error":"Rate limited"}', { status: 429, headers: h });
      try {
        const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const kind = esc((body && body.type) || 'feedback');
        const feedbackBody = (
          '<h1 style="font-size:20px;font-weight:800;color:#2D2D2D;margin:0 0 12px">New in-app feedback</h1>' +
          '<p style="margin:0 0 12px;font-size:15px;color:#2D2D2D;line-height:1.6">A new <strong>' + kind + '</strong> submission was received. Its content is intentionally omitted from this email &mdash; review it in the admin panel.</p>' +
          '<div style="font-size:14px"><a href="https://modernvillage.app/admin.html" style="color:#5C7F60;font-weight:600">Open the admin panel &rarr;</a></div>'
        );
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Modern Village <hello@modernvillage.app>',
            to: 'hello@modernvillage.app',
            subject: 'New in-app feedback received',
            html: emailWrapper(feedbackBody)
          })
        });
      } catch (e) { console.error('Feedback notify:', e); }
      return new Response('{"ok":true}', { headers: h });
    }

    // === UNSUBSCRIBE (public, GET or POST) ===
    if (url.pathname === '/unsubscribe') {
      const token = url.searchParams.get('token');
      const source = url.searchParams.get('source') || 'lead';
      if (!token) return new Response('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Invalid link</h2></body></html>', { status: 400, headers: { ...h, 'Content-Type': 'text/html' } });

      let updated = false;
      if (source === 'screener') {
        const r = await fetch(env.SUPABASE_URL + '/rest/v1/screener_leads?unsubscribe_token=eq.' + encodeURIComponent(token), {
          method: 'PATCH',
          headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
          body: JSON.stringify({ unsubscribed: true })
        });
        const d = await r.json();
        updated = d && d.length > 0;
      } else if (source === 'user') {
        const r = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?unsubscribe_token=eq.' + encodeURIComponent(token), {
          method: 'PATCH',
          headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
          body: JSON.stringify({ email_marketing_opted_in: false })
        });
        const d = await r.json();
        updated = d && d.length > 0;
      } else {
        const r = await fetch(env.SUPABASE_URL + '/rest/v1/leads?unsubscribe_token=eq.' + encodeURIComponent(token), {
          method: 'PATCH',
          headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
          body: JSON.stringify({ unsubscribed: true })
        });
        const d = await r.json();
        updated = d && d.length > 0;
      }

      const msg = updated ? 'You have been unsubscribed. You will no longer receive marketing emails from Modern Village.' : 'Unsubscribe link not recognized. You may have already unsubscribed.';
      return new Response('<html><head><style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#FDF8F0}div{text-align:center;max-width:400px;padding:40px}.icon{font-size:48px;margin-bottom:16px}h2{color:#2D2D2D;margin-bottom:8px}p{color:#6B6560;line-height:1.6}</style></head><body><div><div class="icon">' + (updated ? '&#9989;' : '&#10060;') + '</div><h2>' + (updated ? 'Unsubscribed' : 'Not Found') + '</h2><p>' + msg + '</p></div></body></html>', { headers: { ...h, 'Content-Type': 'text/html' } });
    }

    const authToken = request.headers.get('Authorization')?.replace('Bearer ', '');

    // === ADMIN: CREATE VA ACCOUNT (requires super admin) ===
    if (url.pathname === '/admin/create-va') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });

      // Verify caller is super admin
      const adminCheck = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=is_admin,admin_role', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const adminData = await adminCheck.json();
      if (!adminData.length || !adminData[0].is_admin || adminData[0].admin_role !== 'super') {
        return new Response('{"error":"Super admin access required"}', { status: 403, headers: h });
      }

      const email = (body.email || '').toLowerCase().trim();
      const password = body.password;
      const name = body.name || '';
      const adminRole = body.admin_role || 'marketing';

      if (!email || !password || password.length < 8) {
        return new Response('{"error":"Email and password (8+ chars) required"}', { status: 400, headers: h });
      }

      // Create user via Supabase Admin API
      const createRes = await fetch(env.SUPABASE_URL + '/auth/v1/admin/users', {
        method: 'POST',
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, email_confirm: true })
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        return new Response(JSON.stringify({ error: err.msg || err.message || 'Failed to create user' }), { status: 400, headers: h });
      }

      const newUser = await createRes.json();

      // Set profile fields
      await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + newUser.id, {
        method: 'PATCH',
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ name: name, email: email, is_admin: true, admin_role: adminRole, role: 'parent' })
      });

      return new Response(JSON.stringify({ success: true, user_id: newUser.id }), { headers: h });
    }

    // === ADMIN: SET / REMOVE ADMIN ROLE (requires super admin) ===
    // Client sessions can no longer write profiles.admin_role or is_admin (frozen by
    // trg_protect_admin_flag); role changes must flow through here on the service key.
    if (url.pathname === '/admin/set-role') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });
      const roleCheck = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=is_admin,admin_role', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const roleData = await roleCheck.json();
      if (!roleData.length || !roleData[0].is_admin || roleData[0].admin_role !== 'super') {
        return new Response('{"error":"Super admin access required"}', { status: 403, headers: h });
      }
      const targetId = body.target_id;
      if (!targetId) return new Response('{"error":"target_id required"}', { status: 400, headers: h });
      if (targetId === user.id) return new Response('{"error":"Cannot change your own admin role"}', { status: 400, headers: h });
      let patch;
      if (body.remove) {
        patch = { is_admin: false, admin_role: null };
      } else {
        const ALLOWED_ROLES = ['super', 'marketing', 'billing', 'content', 'sub_admin'];
        if (ALLOWED_ROLES.indexOf(body.admin_role) < 0) {
          return new Response('{"error":"Invalid admin_role"}', { status: 400, headers: h });
        }
        patch = { admin_role: body.admin_role };
      }
      const patchRes = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + targetId, {
        method: 'PATCH',
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(patch)
      });
      if (!patchRes.ok) return new Response('{"error":"Update failed"}', { status: 400, headers: h });
      return new Response('{"success":true}', { headers: h });
    }

    // === ADMIN: RESET USER PASSWORD (requires admin session) ===
    if (url.pathname === '/admin/reset-password') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });
      const adminCheck = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=is_admin,admin_role', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const adminData = await adminCheck.json();
      // Password reset can take over any account, so restrict it to super admins only.
      if (!adminData.length || !adminData[0].is_admin || adminData[0].admin_role !== 'super') return new Response('{"error":"Super admin only"}', { status: 403, headers: h });

      const targetEmail = body.email;
      const newPassword = body.password;
      if (!targetEmail || !newPassword) return new Response('{"error":"Missing email or password"}', { status: 400, headers: h });
      const findRes = await fetch(env.SUPABASE_URL + '/auth/v1/admin/users?page=1&per_page=1000', {
        headers: { 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'apikey': env.SUPABASE_SERVICE_KEY }
      });
      const usersData = await findRes.json();
      const users = usersData.users || usersData || [];
      const targetUser = users.find(u => u.email === targetEmail);
      if (!targetUser) return new Response('{"error":"User not found"}', { status: 404, headers: h });
      // Block using this endpoint to take over another admin's account.
      if (targetUser.id !== user.id) {
        const tgtProf = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + targetUser.id + '&select=is_admin', {
          headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
        });
        const tgtRows = await tgtProf.json();
        if (tgtRows.length && tgtRows[0].is_admin) return new Response('{"error":"Cannot reset another admin account"}', { status: 403, headers: h });
      }
      const updateRes = await fetch(env.SUPABASE_URL + '/auth/v1/admin/users/' + targetUser.id, {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'apikey': env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      });
      if (!updateRes.ok) { const err = await updateRes.json(); return new Response(JSON.stringify({error: err}), { status: 500, headers: h }); }
      return new Response('{"success":true}', { headers: h });
    }

    // === DELETE ACCOUNT (user erases their own account + data) — App Store 5.1.1(v) ===
    if (url.pathname === '/delete-account') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });
      const uid = user.id;
      const supaH = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
      // Best-effort erase of the user's own rows (ignore tables/columns that don't apply).
      const userTables = ['behavior_logs','daily_checkins','conversations','saved_strategies','routines','child_checkins','care_notes','bookings','village_profiles','push_tokens','user_push_preferences','user_feedback','content_reports'];
      for (const t of userTables) {
        try { await fetch(env.SUPABASE_URL + '/rest/v1/' + t + '?user_id=eq.' + encodeURIComponent(uid), { method: 'DELETE', headers: supaH }); } catch (e) {}
      }
      try { await fetch(env.SUPABASE_URL + '/rest/v1/children?parent_id=eq.' + encodeURIComponent(uid), { method: 'DELETE', headers: supaH }); } catch (e) {}
      try { await fetch(env.SUPABASE_URL + '/rest/v1/child_access?user_id=eq.' + encodeURIComponent(uid), { method: 'DELETE', headers: supaH }); } catch (e) {}
      try { await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + encodeURIComponent(uid), { method: 'DELETE', headers: supaH }); } catch (e) {}
      // Finally remove the auth account itself (this is the App Store requirement).
      const delRes = await fetch(env.SUPABASE_URL + '/auth/v1/admin/users/' + uid, { method: 'DELETE', headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY } });
      if (!delRes.ok) { const err = await delRes.text(); return new Response(JSON.stringify({ error: 'Could not delete account', detail: err }), { status: 500, headers: h }); }
      return new Response('{"success":true}', { headers: h });
    }

    // === ADMIN: verify a provider (server-side so provider_verified can stay locked) ===
    if (url.pathname === '/admin/verify-provider') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });
      const ac = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=is_admin', { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY } });
      const ad = await ac.json();
      if (!ad.length || !ad[0].is_admin) return new Response('{"error":"Admin only"}', { status: 403, headers: h });
      if (!body.id) return new Response('{"error":"Missing id"}', { status: 400, headers: h });
      const upd = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + encodeURIComponent(body.id), { method: 'PATCH', headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ provider_verified: true }) });
      if (!upd.ok) { const err = await upd.text(); return new Response(JSON.stringify({ error: 'Verify failed', detail: err }), { status: 500, headers: h }); }
      return new Response('{"success":true}', { headers: h });
    }

    // === SUBSCRIPTION: downgrade the caller's OWN expired subscription (server-side) ===
    if (url.pathname === '/subscription/downgrade-expired') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });
      const sh = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY };
      const pr = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=subscription_status,subscription_expires_at,subscription_source', { headers: sh });
      const rows = await pr.json();
      if (rows.length && rows[0].subscription_status === 'pro' && rows[0].subscription_expires_at && new Date(rows[0].subscription_expires_at) < new Date()) {
        if (rows[0].subscription_source === 'apple_iap') {
          // Apple owns this sub — re-sync from RevenueCat (a renewal may have happened).
          try { await syncRCSubscriber(user.id, env); } catch (e) {}
        } else {
          await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id, { method: 'PATCH', headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ subscription_status: 'free' }) });
        }
      }
      return new Response('{"success":true}', { headers: h });
    }

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

    // === SELF-SERVICE PASSWORD RESET (sends reset email) ===
    if (url.pathname === '/reset-password') {
      if (!checkRate(ip, 'email')) return new Response('{"error":"Rate limited"}', { status: 429, headers: h });
      const email = (body.email || '').toLowerCase().trim();
      if (!email) return new Response('{"error":"Email required"}', { status: 400, headers: h });
      const resetRes = await fetch(env.SUPABASE_URL + '/auth/v1/recover', {
        method: 'POST',
        headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email })
      });
      return new Response('{"success":true}', { headers: h });
    }

    // === EMAIL ===
    if (url.pathname === '/email') {
      if (!checkRate(ip, 'email')) return new Response('{"error":"Rate limited"}', { status: 429, headers: h });
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });

      const to = (body.to || '').toLowerCase().trim();
      const isOwn = to === (user.email || '').toLowerCase().trim();
      const isProvider = ALLOWED_EMAIL_RECIPIENTS.some(e => e.toLowerCase() === to);
      // Check if sender is admin
      let isAdmin = false;
      if (!isOwn && !isProvider) {
        const admChk = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=is_admin', {
          headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
        });
        const admD = await admChk.json();
        isAdmin = admD.length && admD[0].is_admin;
      }
      if (!isOwn && !isProvider && !isAdmin) return new Response('{"error":"Unauthorized recipient"}', { status: 403, headers: h });
      if (!body.subject || !body.html) return new Response('{"error":"Missing fields"}', { status: 400, headers: h });

      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'Modern Village <hello@modernvillage.app>', to: body.to, subject: body.subject.substring(0, 200), html: body.html })
        });
        return new Response(JSON.stringify(await r.json()), { headers: h });
      } catch { return new Response('{"error":"Email failed"}', { status: 500, headers: h }); }
    }

    // === PROMO CODE VALIDATION ===
    if (url.pathname === '/validate-code') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });
      const code = (body.code || '').toUpperCase().trim();
      if (!code) return new Response('{"valid":false}', { headers: h });
      try {
        const r = await fetch(env.SUPABASE_URL + '/rest/v1/promo_codes?code=eq.' + encodeURIComponent(code) + '&active=eq.true&select=code,plan,label,max_uses,times_used,expires_at', {
          headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
        });
        const codes = await r.json();
        if (codes.length && codes[0].times_used < codes[0].max_uses) {
          // Check if the code itself is expired
          if (codes[0].expires_at && new Date(codes[0].expires_at) < new Date()) {
            return new Response('{"valid":false,"error":"Code expired"}', { headers: h });
          }
          await fetch(env.SUPABASE_URL + '/rest/v1/promo_codes?code=eq.' + encodeURIComponent(code), {
            method: 'PATCH',
            headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({ times_used: codes[0].times_used + 1 })
          });
          // Set user's subscription expiration to match the code's expires_at
          const profileUpdate = { subscription_status: 'pro', promo_code: code, subscription_source: 'promo' };
          if (codes[0].expires_at) profileUpdate.subscription_expires_at = codes[0].expires_at;
          await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id, {
            method: 'PATCH',
            headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify(profileUpdate)
          });
          return new Response(JSON.stringify({ valid: true, plan: codes[0].plan, label: codes[0].label }), { headers: h });
        }
        return new Response('{"valid":false}', { headers: h });
      } catch { return new Response('{"valid":false}', { status: 500, headers: h }); }
    }

    // === INVITE ===
    if (url.pathname === '/invite') {
      if (!checkRate(ip, 'email')) return new Response('{"error":"Rate limited"}', { status: 429, headers: h });
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });

      const email = (body.email || '').toLowerCase().trim();
      const role = body.role;
      const childId = body.child_id;
      if (!email || !email.includes('@')) return new Response('{"error":"Invalid email"}', { status: 400, headers: h });
      if (!['co-parent','caregiver','teacher','provider'].includes(role)) return new Response('{"error":"Invalid role"}', { status: 400, headers: h });
      if (!childId) return new Response('{"error":"Missing child_id"}', { status: 400, headers: h });

      const childCheck = await fetch(env.SUPABASE_URL + '/rest/v1/children?id=eq.' + childId + '&user_id=eq.' + user.id + '&select=id,name', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const children = await childCheck.json();
      if (!children.length) return new Response('{"error":"Child not found"}', { status: 403, headers: h });
      const childName = children[0].name;

      const profCheck = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=name', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const profs = await profCheck.json();
      const inviterName = (profs[0] && profs[0].name) || 'A parent';

      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

      const invRes = await fetch(env.SUPABASE_URL + '/rest/v1/invites', {
        method: 'POST',
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ invited_by: user.id, email, role, child_id: childId, token, status: 'pending' })
      });
      if (!invRes.ok) return new Response('{"error":"Failed to create invite"}', { status: 500, headers: h });

      const roleLabel = role === 'co-parent' ? 'co-parent' : role === 'caregiver' ? 'caregiver' : role === 'provider' ? 'provider' : 'teacher';
      const inviteUrl = 'https://modernvillage.app/app.html?invite=' + token;
      const inviteBody = (
        '<h1 style="font-size:24px;font-weight:800;color:#2D2D2D;margin:0 0 8px">You\'re invited! &#127807;</h1>' +
        '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:0 0 20px">' +
        inviterName + ' has invited you to join <strong style="color:#2D2D2D">' + childName + '\'s</strong> care team on Modern Village as a <strong style="color:#2D2D2D">' + roleLabel + '</strong>.</p>' +
        '<div style="background:#FDF8F0;border-radius:12px;padding:16px;margin:16px 0;border-left:4px solid #7A9E7E">' +
        '<p style="margin:0;color:#2D2D2D;font-size:14px;line-height:1.6">Modern Village is an ABA-powered platform helping families with neurodivergent children navigate daily life with confidence. Your role as a <strong>' + roleLabel + '</strong> means you\'ll be part of a coordinated, compassionate care team.</p>' +
        '</div>' +
        '<div style="text-align:center;margin:24px 0">' +
        '<a href="' + inviteUrl + '" style="display:inline-block;padding:14px 32px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;margin:16px 0">Accept Invite</a>' +
        '</div>' +
        '<p style="font-size:13px;color:#9E9790;text-align:center;margin:0">This invite expires in 7 days.</p>'
      );
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Modern Village <hello@modernvillage.app>',
          to: email,
          subject: inviterName + ' invited you to ' + childName + '\'s care team',
          html: emailWrapper(inviteBody)
        })
      });

      return new Response('{"success":true}', { headers: h });
    }

    // === ACCEPT INVITE ===
    if (url.pathname === '/accept-invite') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });

      const token = body.token;
      if (!token) return new Response('{"error":"Missing token"}', { status: 400, headers: h });

      const invRes = await fetch(env.SUPABASE_URL + '/rest/v1/invites?token=eq.' + encodeURIComponent(token) + '&status=eq.pending&select=*', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const invites = await invRes.json();
      if (!invites.length) return new Response('{"error":"Invite not found or already used"}', { status: 404, headers: h });
      const invite = invites[0];

      if (new Date(invite.expires_at) < new Date()) return new Response('{"error":"Invite expired"}', { status: 410, headers: h });

      if (invite.email !== user.email.toLowerCase().trim()) return new Response('{"error":"This invite was sent to ' + invite.email + '"}', { status: 403, headers: h });

      const accessLevel = invite.role === 'co-parent' ? 'full' : invite.role === 'caregiver' ? 'daily' : invite.role === 'provider' ? 'clinical' : 'school';
      const profileRole = invite.role === 'co-parent' ? 'parent' : invite.role;
      await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id, {
        method: 'PATCH',
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ role: profileRole })
      });

      await fetch(env.SUPABASE_URL + '/rest/v1/child_access', {
        method: 'POST',
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ child_id: invite.child_id, user_id: user.id, role: invite.role, access_level: accessLevel, granted_by: invite.invited_by })
      });

      await fetch(env.SUPABASE_URL + '/rest/v1/invites?id=eq.' + invite.id, {
        method: 'PATCH',
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ status: 'accepted', accepted_at: new Date().toISOString(), accepted_by: user.id })
      });

      return new Response(JSON.stringify({ success: true, child_id: invite.child_id, role: invite.role }), { headers: h });
    }

    if (url.pathname === '/practice/invite-member') {
      if (!checkRate(ip, 'email')) return new Response('{"error":"Rate limited"}', { status: 429, headers: h });
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });

      const email = (body.email || '').toLowerCase().trim();
      const role = body.role;
      const supervisorId = body.supervisor_id || null;
      const practiceId = body.practice_id;
      if (!email || !email.includes('@')) return new Response('{"error":"Invalid email"}', { status: 400, headers: h });
      if (!['rbt','supervising_bcba','admin'].includes(role)) return new Response('{"error":"Invalid role"}', { status: 400, headers: h });
      if (!practiceId) return new Response('{"error":"Missing practice_id"}', { status: 400, headers: h });
      if (role === 'rbt' && !supervisorId) return new Response('{"error":"RBT requires supervisor"}', { status: 400, headers: h });

      // Verify caller is an active owner_bcba or supervising_bcba of the practice
      const memberCheck = await fetch(env.SUPABASE_URL + '/rest/v1/practice_members?practice_id=eq.' + practiceId + '&user_id=eq.' + user.id + '&active=eq.true&select=role', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const membership = await memberCheck.json();
      if (!membership.length || !['owner_bcba','supervising_bcba'].includes(membership[0].role)) {
        return new Response('{"error":"Not authorized to invite"}', { status: 403, headers: h });
      }

      // Look up invitee by email (may not exist yet — that's fine, we create a pending invite)
      const profR = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?email=eq.' + encodeURIComponent(email) + '&select=id', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const profs = await profR.json();
      const inviteeId = profs.length ? profs[0].id : null;

      // Generate invite token
      const inviteToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

      // Insert practice_members row.
      // - If invitee has a Modern Village account: link user_id; they accept via token.
      // - If invitee is brand new: leave user_id null + store pending_email. When they sign up,
      //   the app auto-claims this row by matching pending_email to their auth email.
      const memberPayload = {
        practice_id: practiceId,
        role: role,
        supervisor_id: supervisorId,
        active: false,
        invite_token: inviteToken
      };
      if (inviteeId) {
        memberPayload.user_id = inviteeId;
      } else {
        memberPayload.pending_email = email;
      }
      const insertR = await fetch(env.SUPABASE_URL + '/rest/v1/practice_members', {
        method: 'POST',
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(memberPayload)
      });
      if (!insertR.ok) {
        const errText = await insertR.text();
        return new Response(JSON.stringify({ error: 'Could not create invite: ' + errText }), { status: 500, headers: h });
      }

      // Fetch practice name for the email
      const prR = await fetch(env.SUPABASE_URL + '/rest/v1/practices?id=eq.' + practiceId + '&select=name', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const prData = await prR.json();
      const practiceName = (prData[0] && prData[0].name) || 'a Modern Village practice';

      // Send invite email
      const acceptUrl = 'https://modernvillage.app/app.html?practice_invite=' + inviteToken;
      const roleLabel = role === 'rbt' ? 'Registered Behavior Technician' : role === 'supervising_bcba' ? 'Supervising BCBA' : 'Practice Admin';
      const inviteBody = (
        '<h1 style="font-size:24px;font-weight:800;color:#2D2D2D;margin:0 0 8px">You\'re invited to ' + practiceName + ' &#127807;</h1>' +
        '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:0 0 20px">' +
        'You have been invited to join <strong style="color:#2D2D2D">' + practiceName + '</strong> on Modern Village as a <strong style="color:#2D2D2D">' + roleLabel + '</strong>.</p>' +
        '<div style="background:#FDF8F0;border-radius:12px;padding:16px;margin:16px 0;border-left:4px solid #7A9E7E">' +
        '<p style="margin:0;color:#2D2D2D;font-size:14px;line-height:1.6">Modern Village is the BCBA data collection platform that competes with Ensora on a per-patient (not per-seat) model. Accept the invite to start collecting clinical data with your team.</p>' +
        '</div>' +
        '<div style="text-align:center;margin:24px 0">' +
        '<a href="' + acceptUrl + '" style="display:inline-block;padding:14px 32px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;margin:16px 0">Accept invite</a>' +
        '</div>' +
        '<p style="font-size:13px;color:#9E9790;text-align:center;margin:0">Or open this link: <a href="' + acceptUrl + '" style="color:#7A9E7E;text-decoration:none">' + acceptUrl + '</a></p>'
      );
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Modern Village <hello@modernvillage.app>',
            to: email,
            subject: 'You\'re invited to ' + practiceName + ' on Modern Village',
            html: emailWrapper(inviteBody)
          })
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Email send failed' }), { status: 500, headers: h });
      }

      return new Response('{"success":true}', { headers: h });
    }

    // ═══ STRIPE: CREATE CHECKOUT SESSION ═══
    // Authenticated. Caller must be owner_bcba of the practice.
    // Creates (or reuses) a Stripe customer for the practice, creates a Checkout session
    // for a $29/patient subscription with quantity = current active patient_count.
    if (url.pathname === '/stripe/create-checkout') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });
      if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) {
        return new Response('{"error":"Stripe not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID worker secrets."}', { status: 500, headers: h });
      }
      const practiceId = body.practice_id;
      if (!practiceId) return new Response('{"error":"Missing practice_id"}', { status: 400, headers: h });
      // Verify caller is owner_bcba of this practice
      const memberCheck = await fetch(env.SUPABASE_URL + '/rest/v1/practice_members?practice_id=eq.' + practiceId + '&user_id=eq.' + user.id + '&active=eq.true&select=role', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const membership = await memberCheck.json();
      if (!membership.length || membership[0].role !== 'owner_bcba') {
        return new Response('{"error":"Only the practice owner can manage billing"}', { status: 403, headers: h });
      }
      // Fetch practice
      const prR = await fetch(env.SUPABASE_URL + '/rest/v1/practices?id=eq.' + practiceId + '&select=name,owner_id,stripe_customer_id,patient_count', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const prRows = await prR.json();
      if (!prRows.length) return new Response('{"error":"Practice not found"}', { status: 404, headers: h });
      const practice = prRows[0];
      // Look up owner email
      const ownerR = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + practice.owner_id + '&select=email,name', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const owner = (await ownerR.json())[0] || {};
      let customerId = practice.stripe_customer_id;
      // Create Stripe customer if not yet
      if (!customerId) {
        const custForm = new URLSearchParams();
        custForm.append('email', owner.email || user.email || '');
        if (owner.name) custForm.append('name', owner.name);
        custForm.append('metadata[practice_id]', practiceId);
        custForm.append('metadata[modern_village_owner_id]', practice.owner_id);
        const custR = await fetch('https://api.stripe.com/v1/customers', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + env.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: custForm.toString()
        });
        if (!custR.ok) {
          const errText = await custR.text();
          return new Response(JSON.stringify({ error: 'Stripe customer create failed: ' + errText }), { status: 500, headers: h });
        }
        const custData = await custR.json();
        customerId = custData.id;
        await fetch(env.SUPABASE_URL + '/rest/v1/practices?id=eq.' + practiceId, {
          method: 'PATCH',
          headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ stripe_customer_id: customerId })
        });
      }
      // Quantity = active patient count (min 1 so Stripe accepts the line)
      const quantity = Math.max(1, practice.patient_count || 1);
      // Create Checkout session
      const ckForm = new URLSearchParams();
      ckForm.append('mode', 'subscription');
      ckForm.append('customer', customerId);
      ckForm.append('line_items[0][price]', env.STRIPE_PRICE_ID);
      ckForm.append('line_items[0][quantity]', String(quantity));
      ckForm.append('success_url', (body.return_url || 'https://modernvillage.app/app.html') + '?stripe_status=success');
      ckForm.append('cancel_url', (body.return_url || 'https://modernvillage.app/app.html') + '?stripe_status=cancelled');
      ckForm.append('subscription_data[metadata][practice_id]', practiceId);
      ckForm.append('allow_promotion_codes', 'true');
      const ckR = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + env.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: ckForm.toString()
      });
      if (!ckR.ok) {
        const errText = await ckR.text();
        return new Response(JSON.stringify({ error: 'Stripe checkout create failed: ' + errText }), { status: 500, headers: h });
      }
      const ckData = await ckR.json();
      return new Response(JSON.stringify({ url: ckData.url }), { headers: h });
    }

    // ═══ STRIPE: CUSTOMER PORTAL ═══
    // Authenticated. Generates a one-time customer portal link so the owner can
    // update payment method, cancel, view invoices, etc.
    if (url.pathname === '/stripe/portal') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });
      if (!env.STRIPE_SECRET_KEY) {
        return new Response('{"error":"Stripe not configured"}', { status: 500, headers: h });
      }
      const practiceId = body.practice_id;
      if (!practiceId) return new Response('{"error":"Missing practice_id"}', { status: 400, headers: h });
      const memberCheck = await fetch(env.SUPABASE_URL + '/rest/v1/practice_members?practice_id=eq.' + practiceId + '&user_id=eq.' + user.id + '&active=eq.true&select=role', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const membership = await memberCheck.json();
      if (!membership.length || membership[0].role !== 'owner_bcba') {
        return new Response('{"error":"Only the practice owner can manage billing"}', { status: 403, headers: h });
      }
      const prR = await fetch(env.SUPABASE_URL + '/rest/v1/practices?id=eq.' + practiceId + '&select=stripe_customer_id', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const prRows = await prR.json();
      if (!prRows.length || !prRows[0].stripe_customer_id) {
        return new Response('{"error":"No Stripe customer yet. Upgrade first."}', { status: 400, headers: h });
      }
      const portalForm = new URLSearchParams();
      portalForm.append('customer', prRows[0].stripe_customer_id);
      portalForm.append('return_url', body.return_url || 'https://modernvillage.app/app.html');
      const portalR = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + env.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: portalForm.toString()
      });
      if (!portalR.ok) {
        const errText = await portalR.text();
        return new Response(JSON.stringify({ error: 'Stripe portal failed: ' + errText }), { status: 500, headers: h });
      }
      const portalData = await portalR.json();
      return new Response(JSON.stringify({ url: portalData.url }), { headers: h });
    }

    // ═══ SEND CAMPAIGN (admin only) ═══
    if (url.pathname === '/send-campaign') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });
      const adminCheck = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=is_admin', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const adminData = await adminCheck.json();
      if (!adminData.length || !adminData[0].is_admin) return new Response('{"error":"Admin only"}', { status: 403, headers: h });

      const { campaign_id, emails } = body;
      if (!campaign_id || !emails || !emails.length) return new Response('{"error":"Missing data"}', { status: 400, headers: h });

      // Get campaign
      const campR = await fetch(env.SUPABASE_URL + '/rest/v1/campaigns?id=eq.' + campaign_id + '&select=*', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const camps = await campR.json();
      if (!camps.length) return new Response('{"error":"Campaign not found"}', { status: 404, headers: h });
      const camp = camps[0];

      let sent = 0;
      const supaH = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' };

      for (const e of emails) {
        const variant = Math.random() < 0.5 ? 'a' : 'b';
        const subject = variant === 'b' && camp.subject_b ? camp.subject_b : camp.subject_a;
        const html = variant === 'b' && camp.body_html_b ? camp.body_html_b : camp.body_html;

        try {
          const sendR = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: 'Modern Village <hello@modernvillage.app>', to: e.email, subject: subject, html: html, tags: [{ name: 'campaign', value: campaign_id }] })
          });
          const result = await sendR.json();
          if (result.id) {
            await fetch(env.SUPABASE_URL + '/rest/v1/campaign_sends', {
              method: 'POST', headers: { ...supaH, 'Prefer': 'return=minimal' },
              body: JSON.stringify({ campaign_id: campaign_id, lead_id: e.lead_id || null, resend_id: result.id, email: e.email, variant: variant })
            });
            sent++;
          }
        } catch (err) { console.error('Send error:', err); }
        // Rate limit: 2 per second
        await new Promise(r => setTimeout(r, 500));
      }

      // Update campaign
      await fetch(env.SUPABASE_URL + '/rest/v1/campaigns?id=eq.' + campaign_id, {
        method: 'PATCH', headers: supaH,
        body: JSON.stringify({ status: 'sent', total_sent: sent, sent_at: new Date().toISOString() })
      });

      return new Response(JSON.stringify({ success: true, sent: sent }), { headers: h });
    }


    // ═══ PUSH: REGISTER DEVICE TOKEN ═══
    if (url.pathname === '/push/register') {
      const authedUser = await verifyToken(authToken, env);
      if (!authedUser) return new Response('{"error":"Auth required"}', { status: 401, headers: h });
      const { token, platform, device_id, app_version, os_version } = body;
      if (!token || !platform) return new Response('{"error":"Missing token or platform"}', { status: 400, headers: h });
      if (!['ios', 'android'].includes(platform)) return new Response('{"error":"Invalid platform"}', { status: 400, headers: h });

      const supaH = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal' };
      const upsertR = await fetch(env.SUPABASE_URL + '/rest/v1/push_tokens?on_conflict=user_id,token', {
        method: 'POST',
        headers: supaH,
        body: JSON.stringify({
          user_id: authedUser.id,
          platform: platform,
          token: token,
          device_id: device_id || null,
          app_version: app_version || null,
          os_version: os_version || null,
          last_seen_at: new Date().toISOString(),
          disabled_at: null
        })
      });
      if (!upsertR.ok) return new Response(JSON.stringify({ error: 'Failed to register', status: upsertR.status }), { status: 500, headers: h });
      // A physical device belongs to whoever is logged in RIGHT NOW. If this same
      // token is still active under a DIFFERENT account (e.g. a prior login on this
      // device), disable those rows so the device stops receiving that account's
      // pushes — otherwise one phone gets a duplicate of every scheduled push per
      // stale account. (Bug: empty account left an active token → double dailies.)
      await fetch(env.SUPABASE_URL + '/rest/v1/push_tokens?token=eq.' + encodeURIComponent(token) + '&user_id=neq.' + authedUser.id + '&disabled_at=is.null', {
        method: 'PATCH',
        headers: { ...supaH },
        body: JSON.stringify({ disabled_at: new Date().toISOString() })
      });
      return new Response('{"ok":true}', { headers: h });
    }

    // ═══ PUSH: NOTIFY MILESTONE (called from app when user earns milestone) ═══
    if (url.pathname === '/push/notify-milestone') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });
      const { milestone_title } = body;
      const title = 'You earned a milestone 🏆';
      const bodyText = milestone_title ? milestone_title : 'Open the app to see what you unlocked.';
      // Dedup on milestone title so repeat calls for the same milestone don't re-push
      const dedupKey = 'm-' + (milestone_title || 'generic').substring(0, 40);
      const result = await sendPushToUser(env, user.id, title, bodyText, 'milestone', { dedupKey });
      return new Response(JSON.stringify({ ok: true, ...result }), { headers: h });
    }

    // ═══ PUSH: NOTIFY COMMUNITY REPLY (called when someone replies to user's post) ═══
    // Body: { author_user_id } — the user who authored the original post (who receives the push)
    if (url.pathname === '/push/notify-reply') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });
      if (!checkRate(ip, 'email')) return new Response('{"error":"Rate limited"}', { status: 429, headers: h });
      const { author_user_id, post_id } = body;
      if (!author_user_id) return new Response('{"error":"Missing author_user_id"}', { status: 400, headers: h });
      if (author_user_id === user.id) return new Response('{"ok":true}', { headers: h });
      // Deterministic dedup (no Date.now, so repeat replies collapse); generic response (no delivery oracle).
      await sendPushToUser(env, author_user_id, 'Someone replied 💬', 'Your post got a new reply.', 'community_reply', { dedupKey: 'r-' + (post_id || author_user_id) + '-' + user.id, data: { post_id: post_id || null } });
      return new Response('{"ok":true}', { headers: h });
    }

    // ═══ PUSH: NOTIFY NEW STRATEGY CARD (admin-only broadcast) ═══
    if (url.pathname === '/push/notify-new-strategy') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });
      // Admin check
      const supaH = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY };
      const profR = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=is_admin', { headers: supaH });
      const profs = await profR.json();
      if (!profs || !profs.length || !profs[0].is_admin) return new Response('{"error":"Admin only"}', { status: 403, headers: h });

      const { strategy_title, strategy_id } = body;
      if (!strategy_title) return new Response('{"error":"Missing strategy_title"}', { status: 400, headers: h });
      // Broadcast to all parents who have the new-strategy pref on
      const usersR = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?role=eq.parent&push_pref_new_strategy=eq.true&push_opted_out=eq.false&select=id', { headers: supaH });
      const users = await usersR.json();
      const dedupKey = 's-' + (strategy_id || strategy_title.substring(0, 40));
      let sent = 0;
      for (const u of (users || [])) {
        const r = await sendPushToUser(env, u.id, 'New strategy card 💡', strategy_title, 'new_strategy', { dedupKey, data: { strategy_id: strategy_id || null } });
        if (r.sent > 0) sent++;
      }
      return new Response(JSON.stringify({ ok: true, recipients_sent: sent, total_eligible: (users || []).length }), { headers: h });
    }

    // ═══ PUSH: CLEAR BADGE (called when user opens the app / reads notifications) ═══
    if (url.pathname === '/push/clear-badge') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });
      await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id, {
        method: 'PATCH',
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ push_badge_count: 0 })
      });
      return new Response('{"ok":true}', { headers: h });
    }

    // ═══ PUSH: SEND TEST TO SELF (for debugging) ═══
    if (url.pathname === '/push/test') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });

      const tokensR = await fetch(env.SUPABASE_URL + '/rest/v1/push_tokens?user_id=eq.' + user.id + '&disabled_at=is.null&select=id,token,platform', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const tokens = await tokensR.json();
      if (!tokens.length) return new Response('{"error":"No registered devices"}', { status: 404, headers: h });

      const results = [];
      for (const t of tokens) {
        if (t.platform !== 'ios') { results.push({ id: t.id, skipped: 'non-ios' }); continue; }
        try {
          const payload = buildApnsPayload('Hey — test from Modern Village', 'Push notifications are working.', { push_type: 'test' });
          const r = await sendApns(env, t.token, payload);
          results.push({ id: t.id, status: r.status, ok: r.ok, error: r.ok ? null : r.body });
        } catch (e) {
          results.push({ id: t.id, error: String(e) });
        }
      }
      return new Response(JSON.stringify({ ok: true, results: results }), { headers: h });
    }

    // ═══ PUSH: ADMIN SEND TO USER BY ID ═══
    if (url.pathname === '/push/send') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });
      const adminCheck = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=is_admin', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const adminData = await adminCheck.json();
      if (!adminData.length || !adminData[0].is_admin) return new Response('{"error":"Admin only"}', { status: 403, headers: h });

      const { target_user_id, title, body: pushBody, push_type, data } = body;
      if (!target_user_id || !title || !pushBody) return new Response('{"error":"Missing fields"}', { status: 400, headers: h });

      const tokensR = await fetch(env.SUPABASE_URL + '/rest/v1/push_tokens?user_id=eq.' + target_user_id + '&disabled_at=is.null&select=id,token,platform', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const tokens = await tokensR.json();
      if (!tokens.length) return new Response('{"error":"No devices for user"}', { status: 404, headers: h });

      const results = [];
      for (const t of tokens) {
        if (t.platform !== 'ios') { results.push({ id: t.id, skipped: 'non-ios' }); continue; }
        try {
          const payload = buildApnsPayload(title, pushBody, { push_type: push_type || 'admin', ...(data || {}) });
          const r = await sendApns(env, t.token, payload);
          results.push({ id: t.id, status: r.status, ok: r.ok, error: r.ok ? null : r.body });

          // Log to push_send_log
          await fetch(env.SUPABASE_URL + '/rest/v1/push_send_log', {
            method: 'POST',
            headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({
              user_id: target_user_id,
              push_type: push_type || 'admin',
              platform: t.platform,
              token_id: t.id,
              title: title,
              body: pushBody,
              payload: data || null,
              status: r.ok ? 'sent' : 'failed',
              error_code: r.ok ? null : String(r.status),
              error_message: r.ok ? null : r.body,
              sent_at: new Date().toISOString()
            })
          });
        } catch (e) {
          results.push({ id: t.id, error: String(e) });
        }
      }
      return new Response(JSON.stringify({ ok: true, results: results }), { headers: h });
    }

    // === AI CHAT ===
    if (!checkRate(ip, 'ai')) return new Response('{"error":"Rate limited"}', { status: 429, headers: h });
    const user = await verifyToken(authToken, env);
    if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });
    // Durable per-user daily quota (fail-open: if the bump_ai_usage RPC isn't applied yet, allow the request).
    try {
      const q = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/bump_ai_usage', {
        method: 'POST',
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_uid: user.id, p_cap: 200 })
      });
      if (q.ok) { const allowed = await q.json(); if (allowed === false) return new Response('{"error":"Daily AI limit reached — please try again tomorrow."}', { status: 429, headers: h }); }
    } catch (e) {}

    body.model = 'claude-sonnet-5';
    if (body.max_tokens > 8000) body.max_tokens = 8000;
    // Sonnet 5 runs adaptive thinking by default; disable it so structured, low-latency
    // coach + clinical responses aren't truncated by thinking tokens under the max_tokens cap.
    body.thinking = { type: 'disabled' };
    // Cap attacker-controllable input so a signed-up user can't burn the API key with 200K-token prompts.
    try {
      var _sysLen = typeof body.system === 'string' ? body.system.length : JSON.stringify(body.system || '').length;
      var _msgLen = JSON.stringify(body.messages || []).length;
      if (_sysLen + _msgLen > 120000) return new Response('{"error":"Request too large"}', { status: 413, headers: h });
    } catch (_e) {}

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body)
      });
      return new Response(JSON.stringify(await r.json()), { headers: h });
    } catch { return new Response('{"error":"AI failed"}', { status: 500, headers: h }); }
  },

  // === CRON: Routes based on cron expression ===
  // Existing daily cron: runs email drips + booking email reminders.
  // Add these cron triggers in Cloudflare dashboard to enable push routines:
  //   '0 14 * * *'             — 7am PT morning pushes (routine + booking push reminder)
  //   '0 4 * * *'              — 8pm PT evening pushes (daily check-in + streak at risk)
  //   '0 16 * * 0' or '0 16 * * 7' — Sunday 9am PT weekly digest
  //   (Cloudflare's cron parser sometimes rejects "Sunday=0"; "7" is the same day
  //   in standard Unix cron and is accepted by Cloudflare. We match either.)
  //
  // If only one daily cron is configured, we fire everything from runDailyTasks.
  async scheduled(event, env, ctx) {
    const cron = event && event.cron;
    // Route by specific cron expressions
    if (cron === '0 14 * * *') {
      ctx.waitUntil(Promise.all([runDailyTasks(env), runMorningPushes(env)]));
      return;
    }
    if (cron === '0 4 * * *') {
      ctx.waitUntil(runEveningPushes(env));
      return;
    }
    if (cron === '0 16 * * 0' || cron === '0 16 * * 7') {
      ctx.waitUntil(runWeeklyPushes(env));
      return;
    }
    // Fallback: single-cron setup — fire everything once a day
    ctx.waitUntil(Promise.all([
      runDailyTasks(env),
      runMorningPushes(env),
      runEveningPushes(env),
      // Weekly digest only on Sundays when using single-cron mode
      (new Date()).getUTCDay() === 0 ? runWeeklyPushes(env) : Promise.resolve()
    ]));
  }
};

async function runDailyTasks(env) {
  const supaUrl = env.SUPABASE_URL;
  const supaKey = env.SUPABASE_SERVICE_KEY;
  const resendKey = env.RESEND_API_KEY;
  const headers = { 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Content-Type': 'application/json' };

  // -- BOOKING REMINDERS (24hr before) --
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = tomorrow.toISOString().split('T')[0];

  try {
    const bookRes = await fetch(supaUrl + '/rest/v1/bookings?session_date=eq.' + tomorrowIso + '&status=neq.cancelled&select=id,user_id,provider_name,session_type,session_date,session_time', { headers });
    const bookings = await bookRes.json();

    for (const b of (bookings || [])) {
      const userRes = await fetch(supaUrl + '/rest/v1/profiles?id=eq.' + b.user_id + '&select=email,name', { headers });
      const users = await userRes.json();
      if (!users.length || !users[0].email) continue;

      const user = users[0];
      const sessionDate = new Date(b.session_date + 'T12:00:00');
      const dateStr = sessionDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

      const reminderBody = (
        '<h1 style="font-size:24px;font-weight:800;color:#2D2D2D;margin:0 0 8px">Session Reminder &#128197;</h1>' +
        '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:0 0 20px">Hi ' + (user.name || 'there') + ', just a heads-up that your session is tomorrow.</p>' +
        '<div style="background:#FDF8F0;border-radius:12px;padding:20px;margin:16px 0;border-left:4px solid #7A9E7E">' +
        '<div style="font-size:13px;font-weight:600;color:#7A9E7E;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Upcoming Session</div>' +
        '<div style="font-size:18px;font-weight:700;color:#2D2D2D">' + (b.session_type || 'Session') + ' with ' + b.provider_name + '</div>' +
        '<div style="font-size:15px;color:#6B6560;margin-top:6px">&#128337; ' + dateStr + (b.session_time ? ' &nbsp;&bull;&nbsp; ' + b.session_time : '') + '</div>' +
        '</div>' +
        '<div style="text-align:center;margin:24px 0">' +
        '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 32px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;margin:16px 0">View Booking Details</a>' +
        '</div>' +
        '<p style="font-size:13px;color:#9E9790;text-align:center;margin:0">See you tomorrow &#127807;</p>'
      );

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Modern Village <hello@modernvillage.app>',
          to: user.email,
          subject: 'Reminder: Session with ' + b.provider_name + ' tomorrow',
          html: emailWrapper(reminderBody)
        })
      });
    }
  } catch (e) { console.error('Booking reminders error:', e); }

  // -- EMAIL DRIP: Welcome sequence for new users --
  try {
    // Day 1: Welcome (users created yesterday)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStart = yesterday.toISOString().split('T')[0] + 'T00:00:00';
    const yesterdayEnd = yesterday.toISOString().split('T')[0] + 'T23:59:59';

    const newUsersRes = await fetch(supaUrl + '/rest/v1/profiles?created_at=gte.' + yesterdayStart + '&created_at=lte.' + yesterdayEnd + '&role=eq.parent&email_marketing_opted_in=eq.true&select=email,name', { headers });
    const newUsers = await newUsersRes.json();

    for (const u of (newUsers || [])) {
      if (!u.email) continue;
      const welcomeBody = (
        '<h1 style="font-size:24px;font-weight:800;color:#2D2D2D;margin:0 0 8px">Welcome to the Village &#127807;</h1>' +
        '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:0 0 20px">Hi ' + (u.name || 'there') + ', you just joined thousands of families navigating neurodiversity together. We\'re so glad you\'re here.</p>' +
        '<div style="background:#FDF8F0;border-radius:12px;padding:20px;margin:16px 0;border-left:4px solid #7A9E7E">' +
        '<div style="font-size:13px;font-weight:600;color:#7A9E7E;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">3 Things to Try Today</div>' +
        '<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px">' +
        '<div style="font-size:20px;flex-shrink:0">&#129302;</div>' +
        '<div style="font-size:14px;color:#2D2D2D;line-height:1.5"><strong>Ask the AI Coach</strong> &mdash; describe what happened and get a step-by-step strategy card</div>' +
        '</div>' +
        '<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px">' +
        '<div style="font-size:20px;flex-shrink:0">&#128203;</div>' +
        '<div style="font-size:14px;color:#2D2D2D;line-height:1.5"><strong>Log a behavior</strong> &mdash; the more you log, the smarter your coach gets</div>' +
        '</div>' +
        '<div style="display:flex;align-items:flex-start;gap:10px">' +
        '<div style="font-size:20px;flex-shrink:0">&#128101;</div>' +
        '<div style="font-size:14px;color:#2D2D2D;line-height:1.5"><strong>Check the community</strong> &mdash; real parents sharing what works</div>' +
        '</div>' +
        '</div>' +
        '<div style="text-align:center;margin:24px 0">' +
        '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 32px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;margin:16px 0">Open Modern Village</a>' +
        '</div>'
      );
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Modern Village <hello@modernvillage.app>',
          to: u.email,
          subject: 'Welcome to Modern Village \u2014 your first strategy card awaits',
          html: emailWrapper(welcomeBody)
        })
      });
    }

    // Day 3: Tip (users created 3 days ago)
    const day3 = new Date();
    day3.setDate(day3.getDate() - 3);
    const day3Start = day3.toISOString().split('T')[0] + 'T00:00:00';
    const day3End = day3.toISOString().split('T')[0] + 'T23:59:59';

    const day3UsersRes = await fetch(supaUrl + '/rest/v1/profiles?created_at=gte.' + day3Start + '&created_at=lte.' + day3End + '&role=eq.parent&email_marketing_opted_in=eq.true&select=email,name', { headers });
    const day3Users = await day3UsersRes.json();

    for (const u of (day3Users || [])) {
      if (!u.email) continue;
      const tipBody = (
        '<h1 style="font-size:24px;font-weight:800;color:#2D2D2D;margin:0 0 8px">Your coach is learning &#129504;</h1>' +
        '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:0 0 20px">Hi ' + (u.name || 'there') + ', a quick pro tip for you.</p>' +
        '<div style="background:#FDF8F0;border-radius:12px;padding:20px;margin:16px 0;border-left:4px solid #C4745A">' +
        '<div style="font-size:13px;font-weight:600;color:#C4745A;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Did You Know?</div>' +
        '<p style="margin:0;color:#2D2D2D;font-size:15px;line-height:1.6">After you log just <strong>3 behaviors</strong>, the AI Coach starts detecting patterns &mdash; peak times, common triggers, and which strategies work best for your child.</p>' +
        '</div>' +
        '<p style="color:#6B6560;font-size:15px;line-height:1.6">The more you log, the more personalized your strategies become. It only takes a few seconds per entry.</p>' +
        '<div style="text-align:center;margin:24px 0">' +
        '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 32px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;margin:16px 0">Log a Behavior</a>' +
        '</div>'
      );
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Modern Village <hello@modernvillage.app>',
          to: u.email,
          subject: 'Pro tip: Log 3 behaviors to unlock pattern detection',
          html: emailWrapper(tipBody)
        })
      });
    }

    // Day 7: Check-in (users created 7 days ago)
    const day7 = new Date();
    day7.setDate(day7.getDate() - 7);
    const day7Start = day7.toISOString().split('T')[0] + 'T00:00:00';
    const day7End = day7.toISOString().split('T')[0] + 'T23:59:59';

    const day7UsersRes = await fetch(supaUrl + '/rest/v1/profiles?created_at=gte.' + day7Start + '&created_at=lte.' + day7End + '&role=eq.parent&email_marketing_opted_in=eq.true&select=email,name,subscription_status', { headers });
    const day7Users = await day7UsersRes.json();

    for (const u of (day7Users || [])) {
      if (!u.email) continue;
      const isPro = u.subscription_status === 'pro';
      const checkInBody = (
        '<h1 style="font-size:24px;font-weight:800;color:#2D2D2D;margin:0 0 8px">One week together &#128154;</h1>' +
        '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:0 0 20px">Hi ' + (u.name || 'there') + ', it\'s been a week since you joined Modern Village. How are things going?</p>' +
        '<div style="background:#FDF8F0;border-radius:12px;padding:20px;margin:16px 0;border-left:4px solid #7A9E7E">' +
        '<div style="font-size:13px;font-weight:600;color:#7A9E7E;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">Have You Tried These Yet?</div>' +
        '<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px">' +
        '<div style="font-size:20px;flex-shrink:0">&#128203;</div>' +
        '<div style="font-size:14px;color:#2D2D2D;line-height:1.5"><strong>Build a routine</strong> &mdash; morning, bedtime, or after-school</div>' +
        '</div>' +
        '<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px">' +
        '<div style="font-size:20px;flex-shrink:0">&#128196;</div>' +
        '<div style="font-size:14px;color:#2D2D2D;line-height:1.5"><strong>Upload your IEP</strong> &mdash; get a plain-English breakdown</div>' +
        '</div>' +
        '<div style="display:flex;align-items:flex-start;gap:10px">' +
        '<div style="font-size:20px;flex-shrink:0">&#129309;</div>' +
        '<div style="font-size:14px;color:#2D2D2D;line-height:1.5"><strong>Invite your care team</strong> &mdash; grandparents, aides, teachers</div>' +
        '</div>' +
        '</div>' +
        (!isPro ?
          '<div style="background:#FDF8F0;border-radius:12px;padding:16px;margin:16px 0;text-align:center;border:1px solid #E8DDD0">' +
          '<p style="margin:0 0 8px;font-size:14px;color:#6B6560">Ready for unlimited coaching?</p>' +
          '<a href="https://modernvillage.app/app.html" style="color:#C4745A;font-weight:700;font-size:15px;text-decoration:none">Upgrade to Pro &mdash; $19.99/mo &#8594;</a>' +
          '</div>'
          : '') +
        '<div style="text-align:center;margin:24px 0">' +
        '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 32px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;margin:16px 0">Open Modern Village</a>' +
        '</div>'
      );
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Modern Village <hello@modernvillage.app>',
          to: u.email,
          subject: "One week in \u2014 how's it going?",
          html: emailWrapper(checkInBody)
        })
      });
    }

  } catch (e) { console.error('Email drip error:', e); }

  // -- RE-ENGAGEMENT: Users inactive 7+ days --
  try {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoIso = weekAgo.toISOString();

    // Find users who haven't had any activity (no behavior logs or conversations) in 7 days
    // Simple approach: check profiles created more than 14 days ago with no recent behavior logs
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const inactiveRes = await fetch(supaUrl + '/rest/v1/profiles?created_at=lte.' + twoWeeksAgo.toISOString() + '&role=eq.parent&email_marketing_opted_in=eq.true&select=id,email,name,created_at', { headers });
    const potentialInactive = await inactiveRes.json();

    for (const u of (potentialInactive || [])) {
      if (!u.email) continue;
      const logRes = await fetch(supaUrl + '/rest/v1/behavior_logs?user_id=eq.' + u.id + '&logged_at=gte.' + weekAgoIso + '&select=id&limit=1', { headers });
      const logs = await logRes.json();
      if (logs && logs.length > 0) continue; // Active user, skip

      // Only send once per 14 days -- stagger by days since creation
      const daysSinceCreation = Math.floor((Date.now() - new Date(u.created_at || 0).getTime()) / 86400000);
      if (daysSinceCreation % 14 !== 0) continue;

      const reEngageBody = (
        '<h1 style="font-size:24px;font-weight:800;color:#2D2D2D;margin:0 0 8px">Your village is here &#127807;</h1>' +
        '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:0 0 20px">Hi ' + (u.name || 'there') + ', it\'s been a little while. No pressure &mdash; we know parenting is overwhelming.</p>' +
        '<div style="background:#FDF8F0;border-radius:12px;padding:20px;margin:16px 0;border-left:4px solid #7A9E7E">' +
        '<p style="margin:0;font-size:15px;color:#2D2D2D;line-height:1.6">Whenever you\'re ready, your AI Coach remembers everything about your child and is ready to help with whatever you\'re facing.</p>' +
        '</div>' +
        '<p style="color:#6B6560;font-size:15px;font-weight:600;margin:20px 0 12px">Quick wins you can do in 60 seconds:</p>' +
        '<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px">' +
        '<div style="font-size:20px;flex-shrink:0">&#128221;</div>' +
        '<div style="font-size:14px;color:#2D2D2D;line-height:1.5">Log today\'s biggest challenge</div>' +
        '</div>' +
        '<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px">' +
        '<div style="font-size:20px;flex-shrink:0">&#129302;</div>' +
        '<div style="font-size:14px;color:#2D2D2D;line-height:1.5">Ask the coach for one new strategy</div>' +
        '</div>' +
        '<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:20px">' +
        '<div style="font-size:20px;flex-shrink:0">&#9749;</div>' +
        '<div style="font-size:14px;color:#2D2D2D;line-height:1.5">Do a daily check-in &mdash; how was today?</div>' +
        '</div>' +
        '<div style="text-align:center;margin:24px 0">' +
        '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 32px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;margin:16px 0">Come Back to the Village</a>' +
        '</div>'
      );

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Modern Village <hello@modernvillage.app>',
          to: u.email,
          subject: 'We miss you \u2014 your coach is ready when you are',
          html: emailWrapper(reEngageBody)
        })
      });
    }
  } catch (e) { console.error('Re-engagement error:', e); }

  // -- SCREENER LEAD AUTO-ENROLL: Send Day 0 email + create lead for sequence enrollment --
  try {
    const screenerRes = await fetch(supaUrl + '/rest/v1/screener_leads?marketing_consent=eq.true&enrolled_in_sequence=eq.false&unsubscribed=eq.false&select=id,email,parent_name,score,risk_level,unsubscribe_token', { headers });
    const newScreenerLeads = await screenerRes.json();

    for (const sl of (newScreenerLeads || [])) {
      if (!sl.email) continue;

      var unsubUrl = 'https://village-api.jorrelpatterson.workers.dev/unsubscribe?token=' + encodeURIComponent(sl.unsubscribe_token) + '&source=screener';

      // Send Day 0 email: "Your screening results are ready"
      const screenerBody = (
        '<h1 style="font-size:24px;font-weight:800;color:#2D2D2D;margin:0 0 8px">Your screening is complete &#127807;</h1>' +
        '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:0 0 20px">Hi ' + (sl.parent_name || 'there') + ', thank you for taking the M-CHAT-R screening. Your results are saved on our secure platform.</p>' +
        '<div style="background:#FDF8F0;border-radius:12px;padding:20px;margin:16px 0;border-left:4px solid #7A9E7E">' +
        '<p style="margin:0;color:#2D2D2D;font-size:15px;line-height:1.6">For your privacy, we don\'t include screening scores in emails. View your full results and recommended next steps on the platform.</p>' +
        '</div>' +
        '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:20px 0">Modern Village gives you <strong>instant access to ABA-based strategies</strong> you can start using today &mdash; whether or not your child has a diagnosis. Our AI Coach learns your child\'s unique patterns and gives you personalized, step-by-step guidance.</p>' +
        '<div style="text-align:center;margin:24px 0">' +
        '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 32px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;margin:16px 0">Get Started Free</a>' +
        '</div>'
      );

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Modern Village <hello@modernvillage.app>',
          to: sl.email,
          subject: 'Your screening results + free strategies for your child',
          html: emailWrapper(screenerBody, unsubUrl)
        })
      });

      // Mark as enrolled
      await fetch(supaUrl + '/rest/v1/screener_leads?id=eq.' + sl.id, {
        method: 'PATCH', headers,
        body: JSON.stringify({ enrolled_in_sequence: true })
      });

      await new Promise(r => setTimeout(r, 500));
    }
  } catch (e) { console.error('Screener auto-enroll error:', e); }

  // -- WEEKLY DIGEST: Fridays only --
  try {
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 5) { // Friday
      const activeUsersRes = await fetch(supaUrl + '/rest/v1/profiles?role=eq.parent&email_marketing_opted_in=eq.true&select=id,email,name', { headers });
      const activeUsers = await activeUsersRes.json();

      // Get this week's top community post
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const topPostRes = await fetch(supaUrl + '/rest/v1/community_posts?created_at=gte.' + weekAgo.toISOString() + '&status=eq.approved&order=created_at.desc&limit=1&select=content,author_name', { headers });
      const topPosts = await topPostRes.json();
      const topPost = topPosts && topPosts.length ? topPosts[0] : null;

      // Get this week's stats
      const logsRes = await fetch(supaUrl + '/rest/v1/behavior_logs?logged_at=gte.' + weekAgo.toISOString() + '&select=id', { headers: { ...headers, 'Prefer': 'count=exact' } });
      const logCount = parseInt(logsRes.headers.get('content-range')?.split('/')[1] || '0');

      const checkinsRes = await fetch(supaUrl + '/rest/v1/daily_checkins?date=gte.' + weekAgo.toISOString().split('T')[0] + '&select=id', { headers: { ...headers, 'Prefer': 'count=exact' } });
      const checkinCount = parseInt(checkinsRes.headers.get('content-range')?.split('/')[1] || '0');

      for (const u of (activeUsers || [])) {
        if (!u.email) continue;

        const digestBody = (
          '<h1 style="font-size:24px;font-weight:800;color:#2D2D2D;margin:0 0 8px">Your Week in Review &#127807;</h1>' +
          '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:0 0 20px">Hi ' + (u.name || 'there') + ', here\'s what happened in your village this week.</p>' +
          '<div style="display:flex;gap:12px;margin-bottom:20px">' +
          '<div style="flex:1;background:#FDF8F0;border-radius:12px;padding:16px;text-align:center"><div style="font-size:28px;font-weight:800;color:#7A9E7E">' + logCount + '</div><div style="font-size:11px;color:#9E9790;margin-top:4px">Behaviors logged</div></div>' +
          '<div style="flex:1;background:#FDF8F0;border-radius:12px;padding:16px;text-align:center"><div style="font-size:28px;font-weight:800;color:#6BA3C7">' + checkinCount + '</div><div style="font-size:11px;color:#9E9790;margin-top:4px">Check-ins</div></div>' +
          '</div>' +
          (topPost ? '<div style="background:#FDF8F0;border-radius:12px;padding:16px;margin-bottom:20px;border-left:4px solid #D4C8E8"><div style="font-size:11px;font-weight:600;color:#6B5B8D;text-transform:uppercase;margin-bottom:8px">Top Community Post</div><p style="margin:0;font-size:14px;color:#2D2D2D;line-height:1.5">"' + (topPost.content || '').substring(0, 150) + (topPost.content && topPost.content.length > 150 ? '...' : '') + '"</p><div style="font-size:12px;color:#9E9790;margin-top:6px">&mdash; ' + (topPost.author_name || 'A parent') + '</div></div>' : '') +
          '<div style="background:#FDF8F0;border-radius:12px;padding:16px;margin-bottom:20px;border-left:4px solid #C4745A">' +
          '<div style="font-size:11px;font-weight:600;color:#C4745A;text-transform:uppercase;margin-bottom:8px">Quick Tip</div>' +
          '<p style="margin:0;font-size:14px;color:#2D2D2D;line-height:1.5">Consistency is the #1 predictor of behavior improvement. Even logging one behavior per day gives your AI Coach enough data to start detecting patterns.</p>' +
          '</div>' +
          '<div style="text-align:center;margin:24px 0">' +
          '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 32px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px">Open Modern Village</a>' +
          '</div>'
        );

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Modern Village <hello@modernvillage.app>',
            to: u.email,
            subject: 'Your week in review \u2014 ' + logCount + ' behaviors logged this week',
            html: emailWrapper(digestBody)
          })
        });

        await new Promise(r => setTimeout(r, 300));
      }
    }
  } catch (e) { console.error('Weekly digest error:', e); }

  // ── EMAIL SEQUENCES: Process daily sends ──
  try {
    // Get all active sequence campaigns
    const seqR = await fetch(supaUrl + '/rest/v1/campaigns?is_sequence=eq.true&status=eq.active&select=id,sequence_steps', { headers });
    const sequences = await seqR.json();

    for (const seq of (sequences || [])) {
      const steps = seq.sequence_steps || [];
      if (!steps.length) continue;

      // Get active enrollments (not completed, not unsubscribed)
      const enrollR = await fetch(supaUrl + '/rest/v1/sequence_enrollments?campaign_id=eq.' + seq.id + '&completed=eq.false&unsubscribed=eq.false&select=id,lead_id,current_step,enrolled_at,last_sent_at', { headers });
      const enrollments = await enrollR.json();

      for (const enr of (enrollments || [])) {
        const step = steps[enr.current_step];
        if (!step) {
          // Completed all steps
          await fetch(supaUrl + '/rest/v1/sequence_enrollments?id=eq.' + enr.id, { method: 'PATCH', headers, body: JSON.stringify({ completed: true }) });
          continue;
        }

        // Check if it's time to send this step
        const enrollDate = new Date(enr.enrolled_at);
        const daysSinceEnroll = Math.floor((Date.now() - enrollDate.getTime()) / 86400000);
        if (daysSinceEnroll < step.day) continue; // Not time yet

        // Check we haven't already sent today
        if (enr.last_sent_at) {
          const lastSent = new Date(enr.last_sent_at);
          const today = new Date();
          if (lastSent.toISOString().split('T')[0] === today.toISOString().split('T')[0]) continue;
        }

        // Get lead email
        const leadR = await fetch(supaUrl + '/rest/v1/leads?id=eq.' + enr.lead_id + '&select=email,name,first_name', { headers });
        const leads = await leadR.json();
        if (!leads.length || !leads[0].email) continue;
        const lead = leads[0];

        // A/B test subject
        const variant = Math.random() < 0.5 ? 'a' : 'b';
        const subject = variant === 'b' && step.subject_b ? step.subject_b : step.subject_a;
        const body = emailWrapper(step.body.replace(/\{name\}/g, lead.name || lead.first_name || 'there'));

        // Send
        const sendResult = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Modern Village <hello@modernvillage.app>',
            to: lead.email,
            subject: subject.replace(/\{name\}/g, lead.name || lead.first_name || 'there'),
            html: body,
            tags: [{ name: 'campaign', value: seq.id }, { name: 'step', value: String(enr.current_step) }]
          })
        });
        const sendData = await sendResult.json();

        // Record the send
        if (sendData.id) {
          await fetch(supaUrl + '/rest/v1/campaign_sends', {
            method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ campaign_id: seq.id, lead_id: enr.lead_id, resend_id: sendData.id, email: lead.email, variant: variant })
          });

          // Advance to next step
          const nextStep = enr.current_step + 1;
          const isComplete = nextStep >= steps.length;
          await fetch(supaUrl + '/rest/v1/sequence_enrollments?id=eq.' + enr.id, {
            method: 'PATCH', headers,
            body: JSON.stringify({ current_step: nextStep, last_sent_at: new Date().toISOString(), completed: isComplete })
          });
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 500));
      }
    }
  } catch (e) { console.error('Sequence processing error:', e); }

  // ── AUTORESEARCH: Nightly Strategy Rankings ──
  try {
    const startTime = Date.now();

    // Fetch all behavior logs with outcomes and strategies
    const logsRes = await fetch(supaUrl + '/rest/v1/behavior_logs?outcome=not.is.null&strategy_used=not.is.null&strategy_used=neq.&select=user_id,behavior,trigger_type,trigger_desc,strategy_used,outcome,duration_minutes,logged_at', {
      headers: { ...headers, 'Prefer': 'count=exact' }
    });
    const allLogs = await logsRes.json();
    const totalLogs = allLogs ? allLogs.length : 0;

    if (totalLogs >= 5) {
      // Fetch child profiles to get diagnosis and age
      const childUserIds = [...new Set((allLogs || []).map(l => l.user_id))];
      const childMap = {};

      // Batch fetch children data
      for (let i = 0; i < childUserIds.length; i += 50) {
        const batch = childUserIds.slice(i, i + 50);
        const childRes = await fetch(supaUrl + '/rest/v1/children?user_id=in.(' + batch.join(',') + ')&select=user_id,age,diagnosis', { headers });
        const children = await childRes.json();
        (children || []).forEach(c => {
          if (!childMap[c.user_id]) childMap[c.user_id] = c;
        });
      }

      // Compute rankings: group by diagnosis × age_range × trigger × strategy
      const buckets = {};
      (allLogs || []).forEach(log => {
        const child = childMap[log.user_id];
        if (!child) return;

        // Determine diagnosis category
        const dx = child.diagnosis && child.diagnosis.length ? child.diagnosis[0] : 'Other';
        let dxCat = 'Other';
        if (dx && dx.toLowerCase().includes('autism')) dxCat = 'Autism';
        else if (dx && dx.toLowerCase().includes('adhd')) dxCat = 'ADHD';
        else if (dx && (dx.toLowerCase().includes('autism') && dx.toLowerCase().includes('adhd'))) dxCat = 'Both';

        // Determine age range
        const age = child.age || 0;
        let ageRange = 'unknown';
        if (age <= 2) ageRange = '0-2';
        else if (age <= 5) ageRange = '3-5';
        else if (age <= 9) ageRange = '6-9';
        else if (age <= 13) ageRange = '10-13';
        else ageRange = '14-17';

        // Trigger type (ABA function or free text)
        let trigType = log.trigger_type || 'Unknown';
        if (!['Tangible', 'Escape', 'Attention', 'Sensory'].includes(trigType)) trigType = 'Unknown';

        const strategy = (log.strategy_used || '').trim().toLowerCase().substring(0, 100);
        if (!strategy) return;

        const key = dxCat + '|' + ageRange + '|' + trigType + '|' + strategy;
        if (!buckets[key]) buckets[key] = { dx: dxCat, age: ageRange, trig: trigType, strat: strategy, improved: 0, no_change: 0, escalated: 0, total: 0, durations: [] };

        buckets[key].total++;
        if (log.outcome === 'improved') buckets[key].improved++;
        else if (log.outcome === 'no_change') buckets[key].no_change++;
        else if (log.outcome === 'escalated') buckets[key].escalated++;
        if (log.duration_minutes) buckets[key].durations.push(log.duration_minutes);
      });

      // Convert to rankings and upsert
      const rankings = Object.values(buckets).filter(b => b.total >= 2);

      // Group by dx+age+trigger to assign ranks
      const groups = {};
      rankings.forEach(r => {
        r.success_rate = Math.round((r.improved / r.total) * 10000) / 100;
        r.avg_duration = r.durations.length ? Math.round(r.durations.reduce((a, b) => a + b, 0) / r.durations.length * 10) / 10 : null;
        r.confidence = r.total >= 50 ? 'high' : r.total >= 10 ? 'medium' : 'low';
        const gKey = r.dx + '|' + r.age + '|' + r.trig;
        if (!groups[gKey]) groups[gKey] = [];
        groups[gKey].push(r);
      });

      // Sort each group by success rate descending and assign ranks
      let totalRankings = 0;
      let topFinding = '';
      let topRate = 0;

      for (const gKey in groups) {
        groups[gKey].sort((a, b) => b.success_rate - a.success_rate);
        for (let i = 0; i < groups[gKey].length; i++) {
          const r = groups[gKey][i];
          r.rank = i + 1;

          // Track top finding
          if (r.success_rate > topRate && r.total >= 5) {
            topRate = r.success_rate;
            topFinding = r.strat + ' has ' + r.success_rate + '% success for ' + r.dx + ' ages ' + r.age + ' (' + r.trig + ' triggers, n=' + r.total + ')';
          }

          // Upsert ranking
          await fetch(supaUrl + '/rest/v1/strategy_rankings', {
            method: 'POST',
            headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({
              diagnosis_category: r.dx,
              age_range: r.age,
              trigger_type: r.trig,
              strategy: r.strat,
              times_used: r.total,
              times_improved: r.improved,
              times_no_change: r.no_change,
              times_escalated: r.escalated,
              success_rate: r.success_rate,
              avg_duration_minutes: r.avg_duration,
              sample_size: r.total,
              confidence: r.confidence,
              rank: r.rank,
              last_computed_at: new Date().toISOString()
            })
          });
          totalRankings++;
        }
      }

      // Log the run
      const runDuration = Date.now() - startTime;
      await fetch(supaUrl + '/rest/v1/strategy_ranking_runs', {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          total_logs_analyzed: totalLogs,
          total_rankings_computed: totalRankings,
          top_finding: topFinding || 'Not enough data for findings',
          run_duration_ms: runDuration
        })
      });
    }
  } catch (e) { console.error('Strategy rankings error:', e); }

  // ── AUTORESEARCH: Email Campaign Auto-Optimization ──
  try {
    // Find campaigns sent 48+ hours ago that haven't been auto-optimized yet
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 48);

    const campaignRes = await fetch(supaUrl + '/rest/v1/campaigns?is_sequence=eq.false&status=eq.active&created_at=lte.' + cutoff.toISOString() + '&select=id,name,subject_a,subject_b,body,target_type', { headers });
    const campaigns = await campaignRes.json();

    for (const camp of (campaigns || [])) {
      // Check if already optimized
      const optCheck = await fetch(supaUrl + '/rest/v1/email_optimization_logs?campaign_id=eq.' + camp.id + '&action=eq.winner_picked&select=id&limit=1', { headers });
      const optExists = await optCheck.json();
      if (optExists && optExists.length) continue;

      // Get send stats per variant
      const sendsRes = await fetch(supaUrl + '/rest/v1/campaign_sends?campaign_id=eq.' + camp.id + '&select=variant,status', { headers });
      const sends = await sendsRes.json();
      if (!sends || sends.length < 10) continue;

      const statsA = { sent: 0, opened: 0 };
      const statsB = { sent: 0, opened: 0 };
      (sends || []).forEach(s => {
        if (s.variant === 'a') { statsA.sent++; if (s.status === 'opened' || s.status === 'clicked') statsA.opened++; }
        else if (s.variant === 'b') { statsB.sent++; if (s.status === 'opened' || s.status === 'clicked') statsB.opened++; }
      });

      const rateA = statsA.sent ? Math.round(statsA.opened / statsA.sent * 1000) / 10 : 0;
      const rateB = statsB.sent ? Math.round(statsB.opened / statsB.sent * 1000) / 10 : 0;
      const winner = rateA >= rateB ? 'a' : 'b';
      const winningSubject = winner === 'a' ? camp.subject_a : (camp.subject_b || camp.subject_a);

      // Log the winner
      await fetch(supaUrl + '/rest/v1/email_optimization_logs', {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          campaign_id: camp.id,
          action: 'winner_picked',
          details: { winner: winner, subject_a: camp.subject_a, subject_b: camp.subject_b, open_rate_a: rateA, open_rate_b: rateB, winning_subject: winningSubject, total_sends: sends.length }
        })
      });

      // Generate a new variant using Claude (iterate on the winner)
      try {
        const optimizePrompt = 'You are an email marketing optimizer for Modern Village, an ABA-powered parenting platform for neurodivergent families.\n\nA/B test results:\n- Subject A: "' + camp.subject_a + '" → ' + rateA + '% open rate (' + statsA.sent + ' sends)\n- Subject B: "' + (camp.subject_b || 'none') + '" → ' + rateB + '% open rate (' + statsB.sent + ' sends)\n\nWinner: Variant ' + winner.toUpperCase() + ' ("' + winningSubject + '")\n\nGenerate 2 new subject line variants that iterate on what worked. Keep what made the winner succeed (emotional hook, length, emoji usage, specificity) but test a new angle.\n\nRespond with ONLY a JSON object: {"subject_a": "...", "subject_b": "..."}';

        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 200, messages: [{ role: 'user', content: optimizePrompt }] })
        });
        const aiData = await aiRes.json();
        const aiText = aiData.content && aiData.content[0] ? aiData.content[0].text : '';

        // Parse the JSON response
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const newVariants = JSON.parse(jsonMatch[0]);

          // Log the new variant generation
          await fetch(supaUrl + '/rest/v1/email_optimization_logs', {
            method: 'POST',
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({
              campaign_id: camp.id,
              action: 'new_variant_generated',
              details: { previous_winner: winningSubject, new_subject_a: newVariants.subject_a, new_subject_b: newVariants.subject_b }
            })
          });
        }
      } catch (aiErr) { console.error('AI optimization error:', aiErr); }
    }
  } catch (e) { console.error('Email optimization error:', e); }
}


// ═══════════════════════════════════════════════════
// PUSH NOTIFICATION ROUTINES (Phase 3)
// Each routine queries eligible users and fires pushes via sendPushToUser().
// Routed by scheduled() based on cron spec (morning / evening / weekly).
// ═══════════════════════════════════════════════════

// Morning pushes (fire ~7am PT / 14:00 UTC)
// - Morning routine reminder (parents with active routines)
// - Booking reminder push (24hr before — parallels existing email reminder)
async function runMorningPushes(env) {
  const supaH = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' };
  const today = new Date().toISOString().split('T')[0];

  // -- Morning routine: parents who opted in --
  try {
    const r = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?role=eq.parent&push_pref_morning_routine=eq.true&push_opted_out=eq.false&select=id', { headers: supaH });
    const users = await r.json();
    for (const u of (users || [])) {
      await sendPushToUser(env, u.id, 'Good morning ☀️', 'Start the day with a quick routine.', 'morning_routine', { dedupKey: today });
    }
  } catch (e) { console.error('morning_routine push error:', e); }

  // -- Booking reminder: users with a session 24hr out --
  try {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowIso = tomorrow.toISOString().split('T')[0];
    const r = await fetch(env.SUPABASE_URL + '/rest/v1/bookings?session_date=eq.' + tomorrowIso + '&status=neq.cancelled&select=id,user_id,provider_name,session_time', { headers: supaH });
    const bookings = await r.json();
    for (const b of (bookings || [])) {
      const body = 'Session with ' + (b.provider_name || 'your provider') + ' tomorrow' + (b.session_time ? ' at ' + b.session_time : '') + '.';
      await sendPushToUser(env, b.user_id, 'Session reminder 📅', body, 'booking_reminder', { dedupKey: 'b-' + b.id });
    }
  } catch (e) { console.error('booking_reminder push error:', e); }
}

// Evening pushes (fire ~8pm PT / 04:00 UTC next day)
// - Daily check-in reminder for parents who haven't checked in today
// - Streak at risk for users with streak ≥ 3 who skipped today
async function runEveningPushes(env) {
  const supaH = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' };
  const today = new Date().toISOString().split('T')[0];

  try {
    // Find parents who haven't checked in today
    const allR = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?role=eq.parent&push_opted_out=eq.false&select=id,push_pref_daily_checkin,push_pref_streak_at_risk', { headers: supaH });
    const parents = await allR.json();
    for (const p of (parents || [])) {
      // Has this user checked in today?
      const ciR = await fetch(env.SUPABASE_URL + '/rest/v1/daily_checkins?user_id=eq.' + p.id + '&date=eq.' + today + '&select=id,streak_count&limit=1', { headers: supaH });
      const ci = await ciR.json();
      if (ci && ci.length > 0) continue; // already checked in

      // Get current streak (last check-in's streak_count, if streak broken it'll be 0 next time)
      const lastR = await fetch(env.SUPABASE_URL + '/rest/v1/daily_checkins?user_id=eq.' + p.id + '&order=date.desc&limit=1&select=date,streak_count', { headers: supaH });
      const last = await lastR.json();
      const currentStreak = (last && last[0] && last[0].streak_count) || 0;

      // Streak at risk takes precedence (more urgent for retention)
      if (currentStreak >= 3 && p.push_pref_streak_at_risk !== false) {
        await sendPushToUser(env, p.id, 'Don\'t break your streak 🔥', 'You\'re on a ' + currentStreak + '-day streak. A 30-second check-in keeps it alive.', 'streak_at_risk', { dedupKey: today });
      } else if (p.push_pref_daily_checkin !== false) {
        await sendPushToUser(env, p.id, 'Evening check-in 🌱', 'How did today go?', 'daily_checkin', { dedupKey: today });
      }
    }
  } catch (e) { console.error('evening push error:', e); }
}

// Weekly digest (fire Sunday ~9am PT / 16:00 UTC Sunday)
async function runWeeklyPushes(env) {
  const supaH = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' };
  const now = new Date();
  // Week key: year + ISO week number
  const weekKey = now.getFullYear() + '-W' + Math.ceil(((now - new Date(now.getFullYear(), 0, 1)) / 86400000 + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7);
  try {
    const r = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?role=eq.parent&push_pref_weekly_digest=eq.true&push_opted_out=eq.false&select=id', { headers: supaH });
    const users = await r.json();
    for (const u of (users || [])) {
      await sendPushToUser(env, u.id, 'Your week in Modern Village 📝', 'See this week\'s patterns, wins, and next steps.', 'weekly_digest', { dedupKey: weekKey });
    }
  } catch (e) { console.error('weekly_digest push error:', e); }
}
