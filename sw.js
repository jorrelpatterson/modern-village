// Modern Village — Service Worker
// Network-first for HTML (so updates deploy immediately when online),
// cache-first for static assets (fonts, CDN libs).
// Fallback to cached shell when offline.

const CACHE = 'mv-shell-v1';
const SHELL = [
  '/',
  '/app.html',
  '/index.html',
  '/favicon.svg',
  '/og-image.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      return c.addAll(SHELL).catch(function(err){ console.warn('[SW] precache error:', err); });
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var url = new URL(e.request.url);

  // Never touch Supabase or Worker API — always network
  if (url.hostname.indexOf('supabase.co') >= 0 || url.hostname.indexOf('workers.dev') >= 0 || url.hostname.indexOf('anthropic.com') >= 0 || url.hostname.indexOf('stripe.com') >= 0) {
    return; // let browser handle normally
  }

  // HTML navigations: network-first with cache fallback
  if (e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').indexOf('text/html') >= 0) {
    e.respondWith(
      fetch(e.request)
        .then(function(resp){
          if (resp && resp.ok) {
            var clone = resp.clone();
            caches.open(CACHE).then(function(c){ c.put(e.request, clone).catch(function(){}); });
          }
          return resp;
        })
        .catch(function(){
          return caches.match(e.request).then(function(r){ return r || caches.match('/app.html'); });
        })
    );
    return;
  }

  // Static assets (fonts, images, scripts from CDN): cache-first
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com' || url.origin === 'https://cdn.jsdelivr.net') {
    e.respondWith(
      caches.match(e.request).then(function(cached){
        if (cached) return cached;
        return fetch(e.request).then(function(resp){
          if (resp && resp.ok) {
            var clone = resp.clone();
            caches.open(CACHE).then(function(c){ c.put(e.request, clone).catch(function(){}); });
          }
          return resp;
        }).catch(function(){ return cached; });
      })
    );
    return;
  }

  // Same-origin static (favicon, images): cache-first
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(function(cached){
        if (cached) return cached;
        return fetch(e.request).then(function(resp){
          if (resp && resp.ok && !url.pathname.match(/\.(html|json)$/)) {
            var clone = resp.clone();
            caches.open(CACHE).then(function(c){ c.put(e.request, clone).catch(function(){}); });
          }
          return resp;
        }).catch(function(){});
      })
    );
  }
});
