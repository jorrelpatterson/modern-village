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
}
