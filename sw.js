// Service worker: guarda la "cáscara" de la app para que abra sin internet.
// Los datos NO pasan por aquí: app.js los guarda en localStorage.
// Subir CACHE en cada cambio para que los celulares bajen la versión nueva.
const CACHE = 'pc-tablero-v4';
const SHELL = [
  './',
  'index.html',
  'styles.css?v=4',
  'config.js?v=4',
  'charts.js?v=4',
  'informe.js?v=4',
  'app.js?v=4',
  'manifest.webmanifest',
  'icons/logo-96.png',
  'icons/favicon-32.png',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // La API siempre va directo a la red
  if (url.pathname.includes('/api/')) return;

  // Fuentes de Google: lo guardado primero, se actualiza en segundo plano
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com')) {
    e.respondWith(staleWhileRevalidate(req));
    return;
  }

  if (url.origin !== location.origin) return;

  // Abrir la app: siempre index.html desde la caché si no hay red
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('index.html')));
    return;
  }

  e.respondWith(staleWhileRevalidate(req));
});

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || fresh;
}
