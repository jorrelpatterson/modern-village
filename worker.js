const ALLOWED_ORIGINS = [
  'https://modernvillage.app',
  'https://www.modernvillage.app',
  'http://localhost:3000'
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

function getCors(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Type': 'application/json'
  };
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

// Attribute a conversion (signup, booking, subscribe) back to the most recent
// campaign_sends row for this email within the last 60 days.
async function attributeConversion(env, email, conversionType, userId) {
  if (!email) return;
  const supaH = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' };
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);

  const sendsRes = await fetch(env.SUPABASE_URL + '/rest/v1/campaign_sends?email=eq.' + encodeURIComponent(email.toLowerCase()) + '&converted_at=is.null&created_at=gte.' + cutoff.toISOString() + '&order=created_at.desc&limit=1&select=id,lead_id', { headers: supaH });
  const sends = await sendsRes.json();
  if (!sends || !sends.length) return;

  const now = new Date().toISOString();
  await fetch(env.SUPABASE_URL + '/rest/v1/campaign_sends?id=eq.' + sends[0].id, {
    method: 'PATCH', headers: supaH,
    body: JSON.stringify({ converted_at: now, conversion_type: conversionType })
  });

  if (sends[0].lead_id) {
    await fetch(env.SUPABASE_URL + '/rest/v1/leads?id=eq.' + sends[0].lead_id, {
      method: 'PATCH', headers: supaH,
      body: JSON.stringify({ converted_at: now, converted_user_id: userId || null })
    });
  }
}

// ═══ BANDIT HELPERS (Thompson sampling for variant selection) ═══

// Sample from a Gamma distribution (Marsaglia & Tsang method for shape >= 1).
// For shape < 1, uses the boost trick: Gamma(a+1, 1) * U^(1/a).
function sampleGamma(shape) {
  if (shape < 1) return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  const d = shape - 1/3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x, v;
    do {
      const u1 = Math.random(), u2 = Math.random();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

// Sample from Beta(alpha, beta) using two Gamma samples.
function sampleBeta(alpha, beta) {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}

// Thompson sample: pick the variant with the highest sampled Beta value.
// variantStats: { "a": {alpha, beta, sends}, "b": {...}, ... }
function pickVariantThompson(variantStats) {
  const ids = Object.keys(variantStats);
  if (!ids.length) return null;
  let bestId = ids[0];
  let bestSample = -1;
  for (const id of ids) {
    const s = variantStats[id] || { alpha: 1, beta: 1 };
    const sample = sampleBeta(s.alpha || 1, s.beta || 1);
    if (sample > bestSample) {
      bestSample = sample;
      bestId = id;
    }
  }
  return bestId;
}

// Cold-start gate: first COLD_START_SENDS per variant picked uniformly random,
// then Thompson. Protects low-sample variants from premature exploitation.
const COLD_START_SENDS = 5;
function pickVariant(variantStats) {
  const ids = Object.keys(variantStats);
  if (!ids.length) return null;
  const underExplored = ids.filter(id => (variantStats[id]?.sends || 0) < COLD_START_SENDS);
  if (underExplored.length) return underExplored[Math.floor(Math.random() * underExplored.length)];
  return pickVariantThompson(variantStats);
}

// ═══ BANDIT REWARD + POSTERIOR UPDATE ═══

// Reward from a single send event.
// Weights: open=1, click=5, reply=10, conversion=100.
function rewardFromSend(send) {
  let r = 0;
  if (send.status === 'opened' || send.opened_at) r += 1;
  if (send.status === 'clicked' || send.clicked_at) r += 5;
  if (send.status === 'replied' || send.replied_at) r += 10;
  if (send.converted_at) r += 100;
  return r;
}

// Compute Beta posterior (alpha, beta, sends) for a variant from its sends.
// Treat each send as a Bernoulli trial with success = reward / MAX_REWARD.
const MAX_REWARD_PER_SEND = 1 + 5 + 10 + 100; // 116
function posteriorFromSends(sends) {
  let totalSuccess = 0;
  let totalFailure = 0;
  let count = 0;
  for (const s of sends) {
    const r = rewardFromSend(s);
    const norm = r / MAX_REWARD_PER_SEND;
    totalSuccess += norm;
    totalFailure += (1 - norm);
    count++;
  }
  return {
    alpha: 1 + totalSuccess,
    beta: 1 + totalFailure,
    sends: count
  };
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

    let body;
    if (request.method === 'POST') {
      try { body = await request.json(); } catch { return new Response('{"error":"Invalid JSON"}', { status: 400, headers: h }); }
    }

    // ═══ RESEND WEBHOOK (email tracking — no auth required) ═══
    if (url.pathname === '/webhook/resend') {
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

    // ═══ RESEND INBOUND WEBHOOK (reply tracking — no auth required) ═══
    if (url.pathname === '/webhook/resend-inbound') {
      const event = body || await request.json().catch(() => ({}));
      // Resend inbound payload includes parsed email headers.
      // Match the reply to its original send via the In-Reply-To header (format: "<resend-id@resend.email>").
      const headers_in = event.headers || {};
      const inReplyTo = headers_in['in-reply-to'] || headers_in['In-Reply-To'] || '';
      const m = inReplyTo.match(/<([a-f0-9-]+)@/i);
      if (!m) return new Response('{"ok":true,"matched":false}', { headers: h });
      const originalResendId = m[1];
      const supaH = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };

      const sendRes = await fetch(env.SUPABASE_URL + '/rest/v1/campaign_sends?resend_id=eq.' + originalResendId + '&select=id,campaign_id,lead_id', { headers: supaH });
      const sends = await sendRes.json();
      if (!sends || !sends.length) return new Response('{"ok":true,"matched":false}', { headers: h });

      const send = sends[0];
      const now = new Date().toISOString();

      await fetch(env.SUPABASE_URL + '/rest/v1/campaign_sends?id=eq.' + send.id, {
        method: 'PATCH', headers: supaH,
        body: JSON.stringify({ status: 'replied', replied_at: now })
      });

      return new Response('{"ok":true,"matched":true,"send_id":"' + send.id + '"}', { headers: h });
    }

    // === FEEDBACK NOTIFICATION ===
    if (url.pathname === '/feedback-notify') {
      try {
        const feedbackBody = (
          '<h1 style="font-size:20px;font-weight:800;color:#2D2D2D;margin:0 0 12px">New Feedback ' + (body.type === 'bug' ? '&#128027;' : body.type === 'improvement' ? '&#128161;' : body.type === 'question' ? '&#10067;' : '&#128172;') + '</h1>' +
          '<div style="background:#FDF8F0;border-radius:12px;padding:16px;margin:12px 0;border-left:4px solid ' + (body.type === 'bug' ? '#C4745A' : '#7A9E7E') + '">' +
          '<div style="font-size:11px;font-weight:600;color:#9E9790;text-transform:uppercase;margin-bottom:8px">' + (body.type || 'feedback').toUpperCase() + ' &mdash; ' + (body.page || 'unknown page') + '</div>' +
          '<p style="margin:0;font-size:15px;color:#2D2D2D;line-height:1.6">' + (body.content || '').substring(0, 500) + '</p>' +
          '</div>' +
          '<div style="font-size:13px;color:#9E9790;margin-top:12px">From: ' + (body.user || 'anonymous') + ' (' + (body.role || 'unknown') + ')</div>'
        );
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Modern Village <hello@modernvillage.app>',
            to: 'jorrelpatterson@gmail.com',
            subject: '[MV Feedback] ' + (body.type || 'feedback') + ': ' + (body.content || '').substring(0, 60),
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

    // === ADMIN: RESET USER PASSWORD (requires admin session) ===
    if (url.pathname === '/admin/reset-password') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });
      const adminCheck = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=is_admin', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const adminData = await adminCheck.json();
      if (!adminData.length || !adminData[0].is_admin) return new Response('{"error":"Admin only"}', { status: 403, headers: h });

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
      const updateRes = await fetch(env.SUPABASE_URL + '/auth/v1/admin/users/' + targetUser.id, {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'apikey': env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      });
      if (!updateRes.ok) { const err = await updateRes.json(); return new Response(JSON.stringify({error: err}), { status: 500, headers: h }); }
      return new Response('{"success":true}', { headers: h });
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
          const profileUpdate = { subscription_status: 'pro', promo_code: code };
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

    // === AI CHAT ===
    if (!checkRate(ip, 'ai')) return new Response('{"error":"Rate limited"}', { status: 429, headers: h });
    const user = await verifyToken(authToken, env);
    if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });

    body.model = 'claude-sonnet-4-20250514';
    if (body.max_tokens > 8000) body.max_tokens = 8000;

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body)
      });
      return new Response(JSON.stringify(await r.json()), { headers: h });
    } catch { return new Response('{"error":"AI failed"}', { status: 500, headers: h }); }
  },

  // === CRON: Runs daily for booking reminders + email drips ===
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailyTasks(env));
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

  // -- RE-ENGAGEMENT: 3-email progressive sequence at days 7, 14, 21 --
  // Triggers on profiles where there is no behavior_log activity within step.day,
  // and last re-engage email was sent more than 7 days ago.
  try {
    const RE_STEPS = [
      // Step 1: gentle (no pressure)
      { step: 1, inactive_days: 7, subject: "We noticed you've been quiet — anything we can help with?", heading: 'No pressure', html_body:
        '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:0 0 20px">Hi {NAME}, we noticed you haven\'t logged in this week. Parenting is a lot &mdash; we\'re not here to add to it.</p>' +
        '<div style="background:#FDF8F0;border-radius:12px;padding:20px;margin:16px 0;border-left:4px solid #7A9E7E">' +
        '<p style="margin:0;font-size:15px;color:#2D2D2D">If something\'s on your mind, your AI Coach is one tap away. If you\'re just busy, that\'s totally fine. Your village will be here whenever you\'re ready.</p>' +
        '</div>' +
        '<div style="text-align:center;margin:24px 0">' +
        '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 32px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px">Open Modern Village</a>' +
        '</div>'
      },
      // Step 2: value drop (one tip)
      { step: 2, inactive_days: 14, subject: 'A pro tip you might have missed', heading: 'One tip from this week', html_body:
        '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:0 0 20px">Hi {NAME}, here\'s one strategy parents in the village have been celebrating this week.</p>' +
        '<div style="background:#FDF8F0;border-radius:12px;padding:20px;margin:16px 0;border-left:4px solid #C4745A">' +
        '<p style="margin:0 0 8px;font-weight:700;color:#C4745A;font-size:13px;text-transform:uppercase;letter-spacing:0.5px">Try This Tonight</p>' +
        '<p style="margin:0;color:#2D2D2D;font-size:15px;line-height:1.6">Set a 5-minute "transition timer" before bedtime. The timer (not you) tells them it\'s time to start getting ready. Removes you from the power struggle.</p>' +
        '</div>' +
        '<p style="color:#6B6560;font-size:15px;line-height:1.6">Log how it goes &mdash; the AI Coach will adapt next week\'s suggestion based on what worked.</p>' +
        '<div style="text-align:center;margin:24px 0">' +
        '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 32px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px">Log a Behavior</a>' +
        '</div>'
      },
      // Step 3: final touch, then stop
      { step: 3, inactive_days: 21, subject: "We're holding your spot — come back when you're ready", heading: 'We\'ll stop reaching out', html_body:
        '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:0 0 20px">Hi {NAME}, this is the last automatic email we\'ll send for now. Your account, your child\'s data, and your AI Coach are all preserved &mdash; come back whenever life slows down.</p>' +
        '<div style="background:#FDF8F0;border-radius:12px;padding:20px;margin:16px 0;border-left:4px solid #7A9E7E">' +
        '<p style="margin:0;font-size:15px;color:#2D2D2D">If you ever want to permanently delete your account, reply to this email and we\'ll handle it. Otherwise, we\'re here when you\'re ready.</p>' +
        '</div>' +
        '<div style="text-align:center;margin:24px 0">' +
        '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 32px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px">Come Back to the Village</a>' +
        '</div>'
      }
    ];

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    for (const rs of RE_STEPS) {
      const inactiveCutoff = new Date();
      inactiveCutoff.setDate(inactiveCutoff.getDate() - rs.inactive_days);
      const inactiveCutoffIso = inactiveCutoff.toISOString();

      // Find candidates: profiles at the previous step, last re-engage send > 7 days ago (or never)
      const candRes = await fetch(supaUrl + '/rest/v1/profiles?role=eq.parent&email_marketing_opted_in=eq.true&last_re_engage_step=eq.' + (rs.step - 1) + '&select=id,email,name,last_re_engage_sent_at', { headers });
      const candidates = await candRes.json();

      for (const u of (candidates || [])) {
        if (!u.email) continue;

        // Throttle: don't send within 7 days of last re-engage email
        if (u.last_re_engage_sent_at && new Date(u.last_re_engage_sent_at) > sevenDaysAgo) continue;

        // Confirm inactive: no behavior_logs in last `inactive_days` days
        const logsRes = await fetch(supaUrl + '/rest/v1/behavior_logs?user_id=eq.' + u.id + '&logged_at=gte.' + inactiveCutoffIso + '&select=id&limit=1', { headers });
        const logs = await logsRes.json();
        if (logs && logs.length > 0) {
          // Active again — reset their re-engage step
          await fetch(supaUrl + '/rest/v1/profiles?id=eq.' + u.id, {
            method: 'PATCH', headers,
            body: JSON.stringify({ last_re_engage_step: 0, last_re_engage_sent_at: null })
          });
          continue;
        }

        const personalized = rs.html_body.replace(/\{NAME\}/g, u.name || 'there');
        const fullBody = (
          '<h1 style="font-size:24px;font-weight:800;color:#2D2D2D;margin:0 0 8px">' + rs.heading + ' &#127807;</h1>' +
          personalized
        );

        try {
          const sendR = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Modern Village <hello@modernvillage.app>',
              to: u.email,
              subject: rs.subject,
              html: emailWrapper(fullBody),
              tags: [{ name: 'sequence', value: 're_engage' }, { name: 'step', value: String(rs.step) }]
            })
          });
          if (sendR.ok) {
            await fetch(supaUrl + '/rest/v1/profiles?id=eq.' + u.id, {
              method: 'PATCH', headers,
              body: JSON.stringify({ last_re_engage_step: rs.step, last_re_engage_sent_at: new Date().toISOString() })
            });
          }
        } catch (e) { console.error('Re-engage step ' + rs.step + ' send error:', e); }

        await new Promise(r => setTimeout(r, 300));
      }
    }

    // Reset path for users who completed step 3 and later reactivated.
    // Without this, last_re_engage_step=3 users are never selected by the main loop and
    // would be stranded forever, contradicting the plan's reset-on-activity semantics.
    try {
      const sevenDaysForReset = new Date();
      sevenDaysForReset.setDate(sevenDaysForReset.getDate() - 7);
      const completedRes = await fetch(supaUrl + '/rest/v1/profiles?role=eq.parent&last_re_engage_step=eq.3&select=id,last_re_engage_sent_at', { headers });
      const completed = await completedRes.json();
      for (const u of (completed || [])) {
        const recentLogsRes = await fetch(supaUrl + '/rest/v1/behavior_logs?user_id=eq.' + u.id + '&logged_at=gte.' + sevenDaysForReset.toISOString() + '&select=id&limit=1', { headers });
        const recentLogs = await recentLogsRes.json();
        if (recentLogs && recentLogs.length > 0) {
          await fetch(supaUrl + '/rest/v1/profiles?id=eq.' + u.id, {
            method: 'PATCH', headers,
            body: JSON.stringify({ last_re_engage_step: 0, last_re_engage_sent_at: null })
          });
        }
      }
    } catch (e) { console.error('Re-engage step-3 reset error:', e); }
  } catch (e) { console.error('Re-engagement error:', e); }

  // -- ATTRIBUTION BACKFILL: link new signups + bookings + subscribes to recent campaign_sends --
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const yestStart = yest.toISOString().split('T')[0] + 'T00:00:00';
  const yestEnd = yest.toISOString().split('T')[0] + 'T23:59:59';

  // Yesterday's new signups
  try {
    const newProfilesRes = await fetch(supaUrl + '/rest/v1/profiles?created_at=gte.' + yestStart + '&created_at=lte.' + yestEnd + '&select=id,email', { headers });
    const newProfiles = await newProfilesRes.json();
    for (const p of (newProfiles || [])) {
      await attributeConversion(env, p.email, 'signup', p.id);
    }
  } catch (e) { console.error('Attribution signups error:', e); }

  // Yesterday's new bookings
  try {
    const newBookRes = await fetch(supaUrl + '/rest/v1/bookings?created_at=gte.' + yestStart + '&created_at=lte.' + yestEnd + '&select=id,user_id', { headers });
    const newBookings = await newBookRes.json();
    for (const b of (newBookings || [])) {
      const profRes = await fetch(supaUrl + '/rest/v1/profiles?id=eq.' + b.user_id + '&select=email', { headers });
      const prof = await profRes.json();
      if (prof && prof.length && prof[0].email) {
        await attributeConversion(env, prof[0].email, 'booking', b.user_id);
      }
    }
  } catch (e) { console.error('Attribution bookings error:', e); }

  // Yesterday's new Pro subscribers — uses updated_at as a proxy (no dedicated subscription_started_at column yet)
  try {
    const newProRes = await fetch(supaUrl + '/rest/v1/profiles?subscription_status=eq.pro&updated_at=gte.' + yestStart + '&updated_at=lte.' + yestEnd + '&select=id,email', { headers });
    const newPro = await newProRes.json();
    for (const p of (newPro || [])) {
      await attributeConversion(env, p.email, 'subscribed', p.id);
    }
  } catch (e) { console.error('Attribution subscribes error:', e); }

  // -- SEND-TIME LEARNING: roll up best_open_hour per lead from last 30 days of opens --
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const openedRes = await fetch(supaUrl + '/rest/v1/campaign_sends?opened_at=gte.' + thirtyDaysAgo.toISOString() + '&lead_id=not.is.null&select=lead_id,opened_at', { headers });
    const opened = await openedRes.json();

    // Group opens by lead_id × hour-of-day
    const byLead = {};
    for (const s of (opened || [])) {
      const h = new Date(s.opened_at).getUTCHours();
      if (!byLead[s.lead_id]) byLead[s.lead_id] = {};
      byLead[s.lead_id][h] = (byLead[s.lead_id][h] || 0) + 1;
    }

    // For each lead with >= 3 opens, set best_open_hour = mode hour
    for (const leadId of Object.keys(byLead)) {
      const hours = byLead[leadId];
      const total = Object.values(hours).reduce((a, b) => a + b, 0);
      if (total < 3) continue;
      let bestHour = 0, bestCount = 0;
      for (const h of Object.keys(hours)) {
        if (hours[h] > bestCount) { bestCount = hours[h]; bestHour = parseInt(h); }
      }
      await fetch(supaUrl + '/rest/v1/leads?id=eq.' + leadId, {
        method: 'PATCH', headers,
        body: JSON.stringify({ best_open_hour: bestHour })
      });
    }
  } catch (e) { console.error('Send-time learning error:', e); }

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
        body: JSON.stringify({ enrolled_in_sequence: true, last_step_sent: 0, last_step_sent_at: new Date().toISOString() })
      });

      await new Promise(r => setTimeout(r, 500));
    }
  } catch (e) { console.error('Screener auto-enroll error:', e); }

  // -- SCREENER FOLLOW-UP: Days 3, 7, 10 --
  // Advance screener_leads through the 4-email sequence (Day 0 = on signup, handled above).
  try {
    const STEPS = [
      // Day 3: reframe screener outcome into actionable next step
      { day: 3, subject: 'What ABA actually looks like at home', heading: 'A glimpse of what works', html_body:
        '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:0 0 20px">Hi {NAME}, when parents take the M-CHAT-R, the next question is usually: now what?</p>' +
        '<div style="background:#FDF8F0;border-radius:12px;padding:20px;margin:16px 0;border-left:4px solid #7A9E7E">' +
        '<p style="margin:0;color:#2D2D2D;font-size:15px;line-height:1.6">ABA at home isn\'t about clinical drills. It\'s small things: pairing a request with a visual, giving a 2-minute warning before transitions, noticing what triggers meltdowns and what calms them.</p>' +
        '</div>' +
        '<p style="color:#6B6560;font-size:15px;line-height:1.6">Modern Village walks you through these one at a time, personalized to your child &mdash; whether or not you have a diagnosis yet.</p>' +
        '<div style="text-align:center;margin:24px 0">' +
        '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 32px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px">Try it free</a>' +
        '</div>'
      },
      // Day 7: 3 strategies, value drop, soft CTA
      { day: 7, subject: '3 strategies that work whether or not your child has a diagnosis', heading: 'Three things you can try this week', html_body:
        '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:0 0 20px">Hi {NAME}, no platform sign-up needed &mdash; just three strategies that come up again and again from the BCBA-led families on Modern Village.</p>' +
        '<div style="background:#FDF8F0;border-radius:12px;padding:20px;margin:16px 0;border-left:4px solid #7A9E7E">' +
        '<p style="margin:0 0 12px;font-size:15px;color:#2D2D2D"><strong>1. First-Then language.</strong> "First shoes, then iPad." Reduces transition resistance by ~40% in most kids.</p>' +
        '<p style="margin:0 0 12px;font-size:15px;color:#2D2D2D"><strong>2. Visual schedules.</strong> Pictures of the morning routine on the fridge. Removes the "what\'s next" anxiety.</p>' +
        '<p style="margin:0;font-size:15px;color:#2D2D2D"><strong>3. Catch-them-being-good.</strong> Specific praise within 5 seconds. Builds the behaviors you want.</p>' +
        '</div>' +
        '<p style="color:#6B6560;font-size:15px;line-height:1.6">If any of these resonate, the AI Coach in Modern Village will tailor the rest to your child.</p>' +
        '<div style="text-align:center;margin:24px 0">' +
        '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 32px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px">Open Modern Village</a>' +
        '</div>'
      },
      // Day 10: final pitch with social proof
      { day: 10, subject: 'Last reminder — your free strategies are waiting', heading: 'Before we stop reaching out', html_body:
        '<p style="color:#6B6560;font-size:15px;line-height:1.6;margin:0 0 20px">Hi {NAME}, this is the last email in this series. We don\'t want to clutter your inbox.</p>' +
        '<div style="background:#FDF8F0;border-radius:12px;padding:20px;margin:16px 0;border-left:4px solid #C4745A">' +
        '<p style="margin:0;color:#2D2D2D;font-size:15px;line-height:1.6">Thousands of families &mdash; with and without diagnoses &mdash; use Modern Village daily for ABA-based strategies, behavior tracking, and a community that gets it.</p>' +
        '</div>' +
        '<p style="color:#6B6560;font-size:15px;line-height:1.6">Your screening result is still on file and free strategies are still waiting whenever you\'re ready.</p>' +
        '<div style="text-align:center;margin:24px 0">' +
        '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 32px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px">Get Started Free</a>' +
        '</div>'
      }
    ];

    for (let i = 0; i < STEPS.length; i++) {
      const step = STEPS[i];
      const stepNum = i + 1;  // step 1 = Day 3, step 2 = Day 7, step 3 = Day 10 (Day 0 was step 0)
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - step.day);
      const cutoffEnd = cutoff.toISOString().split('T')[0] + 'T23:59:59';

      // Filter: created_at <= N days ago. No lower bound — if cron missed a day, a lead at
      // last_step_sent=N-1 whose creation is older than N days still receives the email. The
      // state machine (last_step_sent guard) prevents double-sends regardless of date range.
      const dueRes = await fetch(supaUrl + '/rest/v1/screener_leads?marketing_consent=eq.true&unsubscribed=eq.false&enrolled_in_sequence=eq.true&last_step_sent=eq.' + (stepNum - 1) + '&created_at=lte.' + cutoffEnd + '&select=id,email,parent_name,unsubscribe_token', { headers });
      const dueLeads = await dueRes.json();

      for (const sl of (dueLeads || [])) {
        if (!sl.email) continue;
        if (!sl.unsubscribe_token) continue;  // CAN-SPAM: require working unsubscribe link
        const unsubUrl = 'https://village-api.jorrelpatterson.workers.dev/unsubscribe?token=' + encodeURIComponent(sl.unsubscribe_token) + '&source=screener';
        const personalized = step.html_body.replace(/\{NAME\}/g, sl.parent_name || 'there');

        const fullBody = (
          '<h1 style="font-size:24px;font-weight:800;color:#2D2D2D;margin:0 0 8px">' + step.heading + ' &#127807;</h1>' +
          personalized
        );

        try {
          const sendR = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Modern Village <hello@modernvillage.app>',
              to: sl.email,
              subject: step.subject,
              html: emailWrapper(fullBody, unsubUrl),
              tags: [{ name: 'sequence', value: 'screener' }, { name: 'step', value: String(stepNum) }]
            })
          });
          if (sendR.ok) {
            await fetch(supaUrl + '/rest/v1/screener_leads?id=eq.' + sl.id, {
              method: 'PATCH', headers,
              body: JSON.stringify({ last_step_sent: stepNum, last_step_sent_at: new Date().toISOString() })
            });
          }
        } catch (e) { console.error('Screener step ' + stepNum + ' send error:', e); }

        await new Promise(r => setTimeout(r, 500));
      }
    }
  } catch (e) { console.error('Screener follow-up error:', e); }

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

  // ── AUTORESEARCH: Email Campaign Auto-Optimization (sequence-aware) ──
  try {
    const campRes = await fetch(supaUrl + '/rest/v1/campaigns?status=eq.active&select=id,name,cohort,sequence_steps,variant_stats', { headers });
    const camps = await campRes.json();

    for (const camp of (camps || [])) {
      const steps = (camp.sequence_steps && camp.sequence_steps.length) ? camp.sequence_steps : [{ step: 0, variants: null }];
      const newVariantStats = camp.variant_stats || {};

      for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
        const step = steps[stepIdx];
        const stepKey = 'step_' + stepIdx;
        // Variants: use step.variants[] (new format), fall back to step.subject/html (legacy), or campaign.subject_a (blast)
        const variants = step.variants || (step.subject ? [{ id: 'a', subject: step.subject, body_html: step.html }] : (camp.subject_a ? [{ id: 'a', subject: camp.subject_a, body_html: camp.body_html }] : []));
        if (!variants.length) continue;

        const sendsRes = await fetch(supaUrl + '/rest/v1/campaign_sends?campaign_id=eq.' + camp.id + '&sequence_step=eq.' + stepIdx + '&select=variant,status,opened_at,clicked_at,replied_at,converted_at', { headers });
        const sends = await sendsRes.json();
        if (!sends || !sends.length) continue;

        const sendsByVariant = {};
        for (const s of sends) {
          const v = s.variant || 'a';
          if (!sendsByVariant[v]) sendsByVariant[v] = [];
          sendsByVariant[v].push(s);
        }

        const stepStats = {};
        for (const v of Object.keys(sendsByVariant)) {
          stepStats[v] = posteriorFromSends(sendsByVariant[v]);
        }
        newVariantStats[stepKey] = stepStats;

        const activeVariants = Object.keys(stepStats);
        if (activeVariants.length < 2) continue;
        const allEnough = activeVariants.every(v => stepStats[v].sends >= 50);
        if (!allEnough) continue;

        // Already optimized this step?
        const optCheck = await fetch(supaUrl + '/rest/v1/email_optimization_logs?campaign_id=eq.' + camp.id + '&action=eq.winner_picked&details->>step=eq.' + stepIdx + '&select=id&limit=1', { headers });
        const optExists = await optCheck.json();
        if (optExists && optExists.length) continue;

        // Thompson: 1000-sample win-probability estimate
        const N_SAMPLES = 1000;
        const winCounts = {};
        for (const v of activeVariants) winCounts[v] = 0;
        for (let i = 0; i < N_SAMPLES; i++) {
          let bestV = activeVariants[0], bestSample = -1;
          for (const v of activeVariants) {
            const s = sampleBeta(stepStats[v].alpha, stepStats[v].beta);
            if (s > bestSample) { bestSample = s; bestV = v; }
          }
          winCounts[bestV]++;
        }
        let actualWinner = null;
        for (const v of activeVariants) {
          if (winCounts[v] / N_SAMPLES > 0.90) { actualWinner = v; break; }
        }
        if (!actualWinner) continue;

        const winnerVariant = variants.find(v => v.id === actualWinner) || variants[0];
        const losers = activeVariants.filter(v => v !== actualWinner);

        // Log winner
        await fetch(supaUrl + '/rest/v1/email_optimization_logs', {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            campaign_id: camp.id,
            action: 'winner_picked',
            details: { step: stepIdx, winner: actualWinner, losers: losers, win_probability: winCounts[actualWinner] / N_SAMPLES, winning_subject: winnerVariant.subject }
          })
        });

        // Generate new challenger via Claude
        try {
          const loserSubjects = losers.map(l => '"' + (variants.find(v => v.id === l)?.subject || '?') + '"').join(', ');
          const optimizePrompt = 'You are an email subject-line optimizer for Modern Village (an ABA-powered platform for neurodivergent families). Cohort: ' + (camp.cohort || 'general') + '.\n\nWinning subject: "' + winnerVariant.subject + '"\nIt won by ' + Math.round(winCounts[actualWinner] / N_SAMPLES * 100) + '% probability over ' + loserSubjects + '.\n\nWrite ONE new challenger subject line that keeps what made the winner work (its emotional hook, length, specificity) but tests a different angle. Respond with ONLY the subject text, nothing else.';

          const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 100, messages: [{ role: 'user', content: optimizePrompt }] })
          });
          const aiData = await aiRes.json();
          const newSubject = (aiData.content && aiData.content[0] ? aiData.content[0].text : '').trim().replace(/^["']|["']$/g, '');

          if (newSubject) {
            const usedIds = new Set(variants.map(v => v.id));
            let newId = 'a';
            for (const c of 'abcdefghijklmnop') { if (!usedIds.has(c)) { newId = c; break; } }

            const newVariants = variants.filter(v => !losers.includes(v.id));
            newVariants.push({ id: newId, subject: newSubject, body_html: winnerVariant.body_html });
            steps[stepIdx].variants = newVariants;

            // Reset loser posteriors, keep winner's, init new variant
            newVariantStats[stepKey] = newVariantStats[stepKey] || {};
            for (const l of losers) delete newVariantStats[stepKey][l];
            newVariantStats[stepKey][newId] = { alpha: 1, beta: 1, sends: 0 };

            await fetch(supaUrl + '/rest/v1/email_optimization_logs', {
              method: 'POST',
              headers: { ...headers, 'Prefer': 'return=minimal' },
              body: JSON.stringify({
                campaign_id: camp.id,
                action: 'new_variant_generated',
                details: { step: stepIdx, new_variant_id: newId, new_subject: newSubject, replaced_losers: losers, kept_winner: actualWinner }
              })
            });
          }
        } catch (aiErr) { console.error('AI optimization error:', aiErr); }
      }

      // Persist updated sequence_steps + variant_stats to the campaign
      await fetch(supaUrl + '/rest/v1/campaigns?id=eq.' + camp.id, {
        method: 'PATCH', headers,
        body: JSON.stringify({ sequence_steps: steps, variant_stats: newVariantStats })
      });
    }
  } catch (e) { console.error('Email optimization error:', e); }
}
