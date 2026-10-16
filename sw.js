/* Radar K-pop service worker.
   - The page, scripts, styles and data (events, alerts, sightings, media): network first, so a new deploy shows up
     on the very next visit. The saved copy is only used offline.
   - Images, chibis, map data and fonts: served from the cache right away and refreshed in the background.
   - Push notifications: shows the alert and opens the radar when tapped.
   build.py writes VERSION on every build, so the browser always notices a new worker. */
var VERSION = 'b94c2e4340';
var CACHE = 'radar-kpop-' + VERSION;
var SHELL = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'assets/app.css', 'assets/app.js', 'assets/land-110m.json',
  'assets/vendor/d3-array.min.js', 'assets/vendor/d3-geo.min.js', 'assets/vendor/topojson-client.min.js',
  'assets/icons/icon-192.png', 'assets/icons/favicon.svg'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () { }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function networkFirst(req, key) {
  return fetch(req, { cache: 'no-cache' }).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(key, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(key, { ignoreSearch: true }).then(function (hit) { return hit || caches.match('index.html'); });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url), same = url.origin === self.location.origin;
  var fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!same && !fonts) return;  // mapas, portadas y demás terceros: directo a la red
  var shell = same && (req.mode === 'navigate' || /\.(js|css|json|webmanifest|html)$/.test(url.pathname) || url.pathname.endsWith('/'));
  if (shell && !/land-110m\.json$/.test(url.pathname)) {
    e.respondWith(networkFirst(req, req.mode === 'navigate' ? 'index.html' : req.url.split('?')[0]));
    return;
  }
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (er) { d = { title: 'Radar K-pop', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Radar K-pop', {
    body: d.body || '', icon: 'assets/icons/icon-192.png', badge: 'assets/icons/icon-192.png',
    tag: 'radar-' + (d.group || 'kpop'), data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var target = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) if ('focus' in list[i]) return list[i].focus();
    return self.clients.openWindow(target);
  }));
});
