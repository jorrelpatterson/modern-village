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

export default {
  async fetch(request, env) {
    const h = getCors(request);
    const ip = request.headers.get('CF-Connecting-IP') || '0';

    if (request.method === 'OPTIONS') return new Response(null, { headers: h });
    if (request.method !== 'POST') return new Response('{"error":"Method not allowed"}', { status: 405, headers: h });

    let body;
    try { body = await request.json(); } catch { return new Response('{"error":"Invalid JSON"}', { status: 400, headers: h }); }

    const url = new URL(request.url);
    const authToken = request.headers.get('Authorization')?.replace('Bearer ', '');

    // ═══ EMAIL ═══
    if (url.pathname === '/email') {
      if (!checkRate(ip, 'email')) return new Response('{"error":"Rate limited"}', { status: 429, headers: h });
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });

      const to = (body.to || '').toLowerCase().trim();
      const isOwn = to === (user.email || '').toLowerCase().trim();
      const isProvider = ALLOWED_EMAIL_RECIPIENTS.some(e => e.toLowerCase() === to);
      if (!isOwn && !isProvider) return new Response('{"error":"Unauthorized recipient"}', { status: 403, headers: h });
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

    // ═══ PROMO CODE VALIDATION ═══
    if (url.pathname === '/validate-code') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });
      const code = (body.code || '').toUpperCase().trim();
      if (!code) return new Response('{"valid":false}', { headers: h });
      try {
        const r = await fetch(env.SUPABASE_URL + '/rest/v1/promo_codes?code=eq.' + encodeURIComponent(code) + '&active=eq.true&select=code,plan,label,max_uses,times_used', {
          headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
        });
        const codes = await r.json();
        if (codes.length && codes[0].times_used < codes[0].max_uses) {
          await fetch(env.SUPABASE_URL + '/rest/v1/promo_codes?code=eq.' + encodeURIComponent(code), {
            method: 'PATCH',
            headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({ times_used: codes[0].times_used + 1 })
          });
          await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id, {
            method: 'PATCH',
            headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({ subscription_status: 'pro', promo_code: code })
          });
          return new Response(JSON.stringify({ valid: true, plan: codes[0].plan, label: codes[0].label }), { headers: h });
        }
        return new Response('{"valid":false}', { headers: h });
      } catch { return new Response('{"valid":false}', { status: 500, headers: h }); }
    }

    // ═══ AI CHAT ═══
    if (!checkRate(ip, 'ai')) return new Response('{"error":"Rate limited"}', { status: 429, headers: h });
    const user = await verifyToken(authToken, env);
    if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });

    body.model = 'claude-sonnet-4-20250514';
    if (body.max_tokens > 2000) body.max_tokens = 2000;

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body)
      });
      return new Response(JSON.stringify(await r.json()), { headers: h });
    } catch { return new Response('{"error":"AI failed"}', { status: 500, headers: h }); }
  }
};
