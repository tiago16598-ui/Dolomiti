/* Hit The Road — guarda a app no telemóvel para abrir sem ligação. */
const SHELL = 'hit-the-road-app-v1';
const FILES = 'hit-the-road-files-v1';
const APP = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== FILES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // A app: primeiro a versão mais recente; sem rede (ou rede muito lenta), a cópia guardada.
    if (req.mode === 'navigate') {
      event.respondWith(
        withTimeout(fetch(req), 4000).then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put('./', copy)); }
          return res;
        }).catch(() => caches.match('./').then((hit) => hit || caches.match('index.html')))
      );
      return;
    }
    // Ícones e manifesto: cópia guardada, atualizada em segundo plano.
    event.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
          return res;
        });
        return hit || net;
      })
    );
    return;
  }

  // Fotos de capa e ficheiros das reservas: ficam guardados depois de vistos uma vez.
  if (url.pathname.indexOf('/storage/v1/object/public/') === 0) {
    event.respondWith(
      caches.open(FILES).then((cache) => cache.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') { cache.put(req, res.clone()).then(() => trim(FILES, 60)); }
        return res;
      })))
    );
  }
  // Tudo o resto (dados, mapas, pesquisa) segue normalmente: a app trata da sua própria cópia.
});
