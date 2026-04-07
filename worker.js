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

    // ═══ ADMIN: RESET USER PASSWORD (requires admin session) ═══
    if (url.pathname === '/admin/reset-password') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });
      // Verify caller is admin
      const adminCheck = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=is_admin', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const adminData = await adminCheck.json();
      if (!adminData.length || !adminData[0].is_admin) return new Response('{"error":"Admin only"}', { status: 403, headers: h });

      const targetEmail = body.email;
      const newPassword = body.password;
      if (!targetEmail || !newPassword) return new Response('{"error":"Missing email or password"}', { status: 400, headers: h });
      // Find target user
      const findRes = await fetch(env.SUPABASE_URL + '/auth/v1/admin/users?page=1&per_page=1000', {
        headers: { 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'apikey': env.SUPABASE_SERVICE_KEY }
      });
      const usersData = await findRes.json();
      const users = usersData.users || usersData || [];
      const targetUser = users.find(u => u.email === targetEmail);
      if (!targetUser) return new Response('{"error":"User not found"}', { status: 404, headers: h });
      // Reset password
      const updateRes = await fetch(env.SUPABASE_URL + '/auth/v1/admin/users/' + targetUser.id, {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'apikey': env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      });
      if (!updateRes.ok) { const err = await updateRes.json(); return new Response(JSON.stringify({error: err}), { status: 500, headers: h }); }
      return new Response('{"success":true}', { headers: h });
    }

    // ═══ SELF-SERVICE PASSWORD RESET (sends reset email) ═══
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

    // ═══ INVITE ═══
    if (url.pathname === '/invite') {
      if (!checkRate(ip, 'email')) return new Response('{"error":"Rate limited"}', { status: 429, headers: h });
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });

      const email = (body.email || '').toLowerCase().trim();
      const role = body.role;
      const childId = body.child_id;
      if (!email || !email.includes('@')) return new Response('{"error":"Invalid email"}', { status: 400, headers: h });
      if (!['caregiver','teacher','provider'].includes(role)) return new Response('{"error":"Invalid role"}', { status: 400, headers: h });
      if (!childId) return new Response('{"error":"Missing child_id"}', { status: 400, headers: h });

      // Verify child belongs to user
      const childCheck = await fetch(env.SUPABASE_URL + '/rest/v1/children?id=eq.' + childId + '&user_id=eq.' + user.id + '&select=id,name', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const children = await childCheck.json();
      if (!children.length) return new Response('{"error":"Child not found"}', { status: 403, headers: h });
      const childName = children[0].name;

      // Get inviter name
      const profCheck = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=name', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const profs = await profCheck.json();
      const inviterName = (profs[0] && profs[0].name) || 'A parent';

      // Create invite token
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

      // Insert invite
      const invRes = await fetch(env.SUPABASE_URL + '/rest/v1/invites', {
        method: 'POST',
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ invited_by: user.id, email, role, child_id: childId, token, status: 'pending' })
      });
      if (!invRes.ok) return new Response('{"error":"Failed to create invite"}', { status: 500, headers: h });

      // Send email
      const roleLabel = role === 'caregiver' ? 'caregiver' : 'teacher';
      const inviteUrl = 'https://modernvillage.app/app.html?invite=' + token;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Modern Village <hello@modernvillage.app>',
          to: email,
          subject: inviterName + ' invited you to ' + childName + '\'s care team',
          html: '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px"><h2 style="color:#2D2D2D">You\'re invited!</h2><p>' + inviterName + ' has invited you to join <strong>' + childName + '\'s</strong> care team on Modern Village as a <strong>' + roleLabel + '</strong>.</p><p>Modern Village is an ABA-powered platform for families with neurodivergent children.</p><a href="' + inviteUrl + '" style="display:inline-block;padding:14px 28px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;margin:16px 0">Accept Invite</a><p style="font-size:13px;color:#9E9790">This invite expires in 7 days.</p></div>'
        })
      });

      return new Response('{"success":true}', { headers: h });
    }

    // ═══ ACCEPT INVITE ═══
    if (url.pathname === '/accept-invite') {
      const user = await verifyToken(authToken, env);
      if (!user) return new Response('{"error":"Auth required"}', { status: 401, headers: h });

      const token = body.token;
      if (!token) return new Response('{"error":"Missing token"}', { status: 400, headers: h });

      // Fetch invite
      const invRes = await fetch(env.SUPABASE_URL + '/rest/v1/invites?token=eq.' + encodeURIComponent(token) + '&status=eq.pending&select=*', {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      const invites = await invRes.json();
      if (!invites.length) return new Response('{"error":"Invite not found or already used"}', { status: 404, headers: h });
      const invite = invites[0];

      // Check expiry
      if (new Date(invite.expires_at) < new Date()) return new Response('{"error":"Invite expired"}', { status: 410, headers: h });

      // Check email matches
      if (invite.email !== user.email.toLowerCase().trim()) return new Response('{"error":"This invite was sent to ' + invite.email + '"}', { status: 403, headers: h });

      // Set user role
      const accessLevel = invite.role === 'caregiver' ? 'daily' : invite.role === 'provider' ? 'clinical' : 'school';
      await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id, {
        method: 'PATCH',
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ role: invite.role })
      });

      // Create child_access
      await fetch(env.SUPABASE_URL + '/rest/v1/child_access', {
        method: 'POST',
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ child_id: invite.child_id, user_id: user.id, role: invite.role, access_level: accessLevel, granted_by: invite.invited_by })
      });

      // Update invite
      await fetch(env.SUPABASE_URL + '/rest/v1/invites?id=eq.' + invite.id, {
        method: 'PATCH',
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ status: 'accepted', accepted_at: new Date().toISOString(), accepted_by: user.id })
      });

      return new Response(JSON.stringify({ success: true, child_id: invite.child_id, role: invite.role }), { headers: h });
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
  },  },

  // ═══ CRON: Runs daily for booking reminders + email drips ═══
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailyTasks(env));
  }
};

async function runDailyTasks(env) {
  const supaUrl = env.SUPABASE_URL;
  const supaKey = env.SUPABASE_SERVICE_KEY;
  const resendKey = env.RESEND_API_KEY;
  const headers = { 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Content-Type': 'application/json' };

  // ── BOOKING REMINDERS (24hr before) ──
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = tomorrow.toISOString().split('T')[0];

  try {
    const bookRes = await fetch(supaUrl + '/rest/v1/bookings?session_date=eq.' + tomorrowIso + '&status=neq.cancelled&select=id,user_id,provider_name,session_type,session_date,session_time', { headers });
    const bookings = await bookRes.json();

    for (const b of (bookings || [])) {
      // Get user email
      const userRes = await fetch(supaUrl + '/rest/v1/profiles?id=eq.' + b.user_id + '&select=email,name', { headers });
      const users = await userRes.json();
      if (!users.length || !users[0].email) continue;

      const user = users[0];
      const sessionDate = new Date(b.session_date + 'T12:00:00');
      const dateStr = sessionDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Modern Village <hello@modernvillage.app>',
          to: user.email,
          subject: 'Reminder: Session with ' + b.provider_name + ' tomorrow',
          html: '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">' +
            '<h2 style="color:#2D2D2D">Session Reminder</h2>' +
            '<p>Hi ' + (user.name || 'there') + ',</p>' +
            '<p>Just a reminder that you have a <strong>' + (b.session_type || 'session') + '</strong> with <strong>' + b.provider_name + '</strong> tomorrow.</p>' +
            '<div style="background:#F5F5F0;border-radius:12px;padding:16px;margin:16px 0">' +
            '<div style="font-weight:700">' + dateStr + '</div>' +
            '<div style="color:#6B6560;margin-top:4px">' + (b.session_time || '') + '</div>' +
            '</div>' +
            '<p style="font-size:13px;color:#9E9790">Open Modern Village to view your booking details.</p>' +
            '</div>'
        })
      });
    }
  } catch (e) { console.error('Booking reminders error:', e); }

  // ── EMAIL DRIP: Welcome sequence for new users ──
  try {
    // Day 1: Welcome (users created yesterday)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStart = yesterday.toISOString().split('T')[0] + 'T00:00:00';
    const yesterdayEnd = yesterday.toISOString().split('T')[0] + 'T23:59:59';

    const newUsersRes = await fetch(supaUrl + '/rest/v1/profiles?created_at=gte.' + yesterdayStart + '&created_at=lte.' + yesterdayEnd + '&role=eq.parent&select=email,name', { headers });
    const newUsers = await newUsersRes.json();

    for (const u of (newUsers || [])) {
      if (!u.email) continue;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Modern Village <hello@modernvillage.app>',
          to: u.email,
          subject: 'Welcome to Modern Village \u2014 your first strategy card awaits',
          html: '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">' +
            '<h2 style="color:#2D2D2D">Welcome to the Village &#127807;</h2>' +
            '<p>Hi ' + (u.name || 'there') + ',</p>' +
            '<p>You just joined thousands of families navigating neurodiversity together.</p>' +
            '<p>Here are 3 things to try today:</p>' +
            '<ol style="line-height:2">' +
            '<li><strong>Ask the AI Coach</strong> \u2014 describe what happened and get a step-by-step strategy card</li>' +
            '<li><strong>Log a behavior</strong> \u2014 the more you log, the smarter your coach gets</li>' +
            '<li><strong>Check the community</strong> \u2014 real parents sharing what works</li>' +
            '</ol>' +
            '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 28px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;margin:16px 0">Open Modern Village</a>' +
            '<p style="font-size:13px;color:#9E9790">You received this because you signed up for Modern Village. <a href="https://modernvillage.app/app.html" style="color:#9E9790">Manage preferences</a></p>' +
            '</div>'
        })
      });
    }

    // Day 3: Tip (users created 3 days ago)
    const day3 = new Date();
    day3.setDate(day3.getDate() - 3);
    const day3Start = day3.toISOString().split('T')[0] + 'T00:00:00';
    const day3End = day3.toISOString().split('T')[0] + 'T23:59:59';

    const day3UsersRes = await fetch(supaUrl + '/rest/v1/profiles?created_at=gte.' + day3Start + '&created_at=lte.' + day3End + '&role=eq.parent&select=email,name', { headers });
    const day3Users = await day3UsersRes.json();

    for (const u of (day3Users || [])) {
      if (!u.email) continue;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Modern Village <hello@modernvillage.app>',
          to: u.email,
          subject: 'Pro tip: Log 3 behaviors to unlock pattern detection',
          html: '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">' +
            '<h2 style="color:#2D2D2D">Your coach is learning &#129504;</h2>' +
            '<p>Hi ' + (u.name || 'there') + ',</p>' +
            '<p>Did you know? After you log just <strong>3 behaviors</strong>, the AI Coach starts detecting patterns \u2014 peak times, common triggers, which strategies work best.</p>' +
            '<p>The more you log, the more personalized your strategies become.</p>' +
            '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 28px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;margin:16px 0">Log a Behavior</a>' +
            '<p style="font-size:13px;color:#9E9790">You received this because you signed up for Modern Village.</p>' +
            '</div>'
        })
      });
    }

    // Day 7: Check-in (users created 7 days ago)
    const day7 = new Date();
    day7.setDate(day7.getDate() - 7);
    const day7Start = day7.toISOString().split('T')[0] + 'T00:00:00';
    const day7End = day7.toISOString().split('T')[0] + 'T23:59:59';

    const day7UsersRes = await fetch(supaUrl + '/rest/v1/profiles?created_at=gte.' + day7Start + '&created_at=lte.' + day7End + '&role=eq.parent&select=email,name,subscription_status', { headers });
    const day7Users = await day7UsersRes.json();

    for (const u of (day7Users || [])) {
      if (!u.email) continue;
      const isPro = u.subscription_status === 'pro';
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Modern Village <hello@modernvillage.app>',
          to: u.email,
          subject: "One week in \u2014 how's it going?",
          html: '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">' +
            '<h2 style="color:#2D2D2D">One week together &#128154;</h2>' +
            '<p>Hi ' + (u.name || 'there') + ',</p>' +
            "<p>It's been a week since you joined Modern Village. How are things going?</p>" +
            "<p>Here's what you might not have tried yet:</p>" +
            '<ul style="line-height:2">' +
            '<li>&#128203; <strong>Build a routine</strong> \u2014 morning, bedtime, or after-school</li>' +
            '<li>&#128196; <strong>Upload your IEP</strong> \u2014 get a plain-English breakdown</li>' +
            '<li>&#129309; <strong>Invite your care team</strong> \u2014 grandparents, aides, teachers</li>' +
            '</ul>' +
            (!isPro ? '<p>Ready for unlimited coaching? <a href="https://modernvillage.app/app.html" style="color:#7A9E7E;font-weight:700">Upgrade to Pro \u2014 $19.99/mo</a></p>' : '') +
            '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 28px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;margin:16px 0">Open Modern Village</a>' +
            '<p style="font-size:13px;color:#9E9790">You received this because you signed up for Modern Village.</p>' +
            '</div>'
        })
      });
    }

  } catch (e) { console.error('Email drip error:', e); }

  // ── RE-ENGAGEMENT: Users inactive 7+ days ──
  try {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoIso = weekAgo.toISOString();

    // Find users who haven't had any activity (no behavior logs or conversations) in 7 days
    // Simple approach: check profiles created more than 14 days ago with no recent behavior logs
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const inactiveRes = await fetch(supaUrl + '/rest/v1/profiles?created_at=lte.' + twoWeeksAgo.toISOString() + '&role=eq.parent&select=id,email,name,created_at', { headers });
    const potentialInactive = await inactiveRes.json();

    for (const u of (potentialInactive || [])) {
      if (!u.email) continue;
      // Check if they have any recent behavior logs
      const logRes = await fetch(supaUrl + '/rest/v1/behavior_logs?user_id=eq.' + u.id + '&logged_at=gte.' + weekAgoIso + '&select=id&limit=1', { headers });
      const logs = await logRes.json();
      if (logs && logs.length > 0) continue; // Active user, skip

      // Only send once per 14 days \u2014 stagger by days since creation
      const daysSinceCreation = Math.floor((Date.now() - new Date(u.created_at || 0).getTime()) / 86400000);
      if (daysSinceCreation % 14 !== 0) continue;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Modern Village <hello@modernvillage.app>',
          to: u.email,
          subject: 'We miss you \u2014 your coach is ready when you are',
          html: '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">' +
            '<h2 style="color:#2D2D2D">Your village is here &#127807;</h2>' +
            '<p>Hi ' + (u.name || 'there') + ',</p>' +
            "<p>It's been a little while. No pressure \u2014 we know parenting is overwhelming.</p>" +
            "<p>But whenever you're ready, your AI Coach remembers everything about your child and is ready to help with whatever you're facing.</p>" +
            '<p><strong>Quick wins you can do in 60 seconds:</strong></p>' +
            '<ul style="line-height:2">' +
            "<li>Log today's biggest challenge</li>" +
            '<li>Ask the coach for one new strategy</li>' +
            '<li>Do a daily check-in (how was today?)</li>' +
            '</ul>' +
            '<a href="https://modernvillage.app/app.html" style="display:inline-block;padding:14px 28px;background:#7A9E7E;color:white;text-decoration:none;border-radius:12px;font-weight:700;margin:16px 0">Come Back to the Village</a>' +
            '<p style="font-size:13px;color:#9E9790">You received this because you signed up for Modern Village. <a href="https://modernvillage.app/app.html" style="color:#9E9790">Manage preferences</a></p>' +
            '</div>'
        })
      });
    }
  } catch (e) { console.error('Re-engagement error:', e); }
}
