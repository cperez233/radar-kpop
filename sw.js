/* Service worker del Radar K-pop.
   - events.json, alerts.json y sightings.json: primero la red (siempre fresco), la copia guardada si no hay conexión.
   - El resto (página, estilos, chibis, fotos, fuentes): sirve lo guardado al instante y lo actualiza por detrás.
   - Notificaciones push: muestra la alerta y al tocarla abre el radar. */
var CACHE = 'radar-kpop-v3';
var SHELL = [
  './', 'index.html', 'config.js', 'manifest.webmanifest', 'assets/app.css', 'assets/app.js', 'assets/land-110m.json',
  'assets/vendor/d3-array.min.js', 'assets/vendor/d3-geo.min.js', 'assets/vendor/topojson-client.min.js',
  'assets/chibis/bts.svg', 'assets/chibis/skz.svg', 'assets/chibis/twice.svg', 'assets/chibis/blackpink.svg',
  'assets/chibis/lngshot.svg', 'assets/chibis/seventeen.svg', 'assets/chibis/enhypen.svg', 'assets/chibis/newjeans.svg',
  'assets/chibis/default.svg', 'assets/icons/icon-192.png', 'assets/icons/favicon.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var live = /\/(events|alerts|sightings)\.json$/.test(url.pathname);
  if (live) {
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(url.pathname, copy); });
      return res;
    }).catch(function () { return caches.match(url.pathname); }));
    return;
  }
  var sameOrigin = url.origin === self.location.origin;
  var fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !fonts) return;
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(req, { ignoreSearch: sameOrigin && req.mode === 'navigate' }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
        return res;
      }).catch(function () { return hit || (req.mode === 'navigate' ? c.match('index.html') : undefined); });
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
