// lib/experiment.js — Marketing AutoResearch frontend helper
// Loaded on every page. Manages session_id, variant assignment, event tracking.

(function() {
  'use strict';

  const WORKER_URL = 'https://village-api.jorrelpatterson.workers.dev';

  function getSessionId() {
    let sid = localStorage.getItem('mv_session');
    if (!sid) {
      sid = (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('mv_session', sid);
    }
    return sid;
  }

  function captureUtmOnce() {
    if (localStorage.getItem('mv_utm_initial')) return;
    const p = new URLSearchParams(window.location.search);
    const utm = {
      source: p.get('utm_source'),
      medium: p.get('utm_medium'),
      campaign: p.get('utm_campaign'),
      term: p.get('utm_term'),
      content: p.get('utm_content')
    };
    if (utm.source || utm.medium || utm.campaign) {
      localStorage.setItem('mv_utm_initial', JSON.stringify(utm));
    }
  }
  captureUtmOnce();

  async function getVariant(slot) {
    try {
      const sid = getSessionId();
      const utm = localStorage.getItem('mv_utm_initial');
      const url = WORKER_URL + '/experiment/variant?slot=' + encodeURIComponent(slot)
        + '&session=' + encodeURIComponent(sid)
        + (utm ? '&utm=' + encodeURIComponent(utm) : '');
      const r = await fetch(url);
      if (!r.ok) return { variant_key: null, content: null };
      return await r.json();
    } catch (e) {
      return { variant_key: null, content: null };
    }
  }

  function trackEvent(slot, event_type, event_data) {
    try {
      const body = JSON.stringify({
        session_id: getSessionId(),
        slot_id: slot,
        event_type: event_type,
        event_data: event_data || null
      });
      fetch(WORKER_URL + '/experiment/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true
      }).catch(function() {});

      // Mirror to Meta Pixel if loaded
      if (window.fbq) {
        const pixelMap = {
          'click': 'InitiateCheckout',
          'screener_complete': 'CompleteRegistration',
          'signup': 'Lead',
          'pro_subscribe': 'Subscribe'
        };
        if (pixelMap[event_type]) {
          const opts = {};
          if (event_type === 'pro_subscribe' && event_data && event_data.amount) {
            opts.value = event_data.amount;
            opts.currency = 'USD';
          }
          window.fbq('track', pixelMap[event_type], opts);
        }
      }
    } catch (e) {
      // swallow — never break visitor experience
    }
  }

  function linkSession(user_id) {
    try {
      fetch(WORKER_URL + '/experiment/link-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: getSessionId(), user_id: user_id }),
        keepalive: true
      }).catch(function() {});
    } catch (e) {
      // swallow
    }
  }

  // Expose globally
  window.mvExperiment = {
    getSessionId: getSessionId,
    getVariant: getVariant,
    trackEvent: trackEvent,
    linkSession: linkSession
  };
})();
