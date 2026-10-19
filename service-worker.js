/* ==========================================================================
   Service Worker – Cache-First für die statischen Dateien

   WICHTIG: Bei JEDER Änderung an Dateien der App (data.js, app.js, styles.css,
   index.html, Icons ...) die Versionsnummer hier um eins erhöhen (v1 -> v2 ...).
   Nur dann holen sich die Handys die neuen Dateien.
   ========================================================================== */
const CACHE_VERSION = 'v2';
const CACHE_NAME = 'einwand-karussell-' + CACHE_VERSION;

/* Alle Pfade relativ, weil die App unter https://<user>.github.io/<repo>/ läuft.
   Eigene Schriften (fonts/*.woff2) hier ergänzen. */
const PRECACHE = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'data.js',
  'manifest.webmanifest',
  'assets/logo.svg',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // cache: 'reload' umgeht den HTTP-Cache des Servers, damit sicher die neuen Dateien landen
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith('einwand-karussell-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(req).catch(() => {
        // Offline und nicht im Cache: bei Seitenaufrufen die Startseite liefern
        if (req.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      });
    })
  );
});
