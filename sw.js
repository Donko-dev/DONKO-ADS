/**
 * DONKO ADS — Service Worker
 * Met en cache la coquille de l'application (HTML/CSS/JS/icônes) pour un chargement
 * quasi instantané et un affichage possible hors connexion. Les données des annonces
 * (Google Sheet) nécessitent toujours une connexion pour être actualisées ; en cas
 * d'absence de réseau, index.html retombe sur sa copie locale la plus récente.
 */

const CACHE_NAME = 'donko-ads-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon-32.png',
  './favicon-16.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Les appels vers l'API (Google Apps Script) passent toujours par le réseau :
  // les annonces doivent rester à jour, jamais servies depuis un cache figé.
  if (req.url.includes('script.google.com')) {
    event.respondWith(fetch(req).catch(() => new Response('{"success":false}', {
      headers: { 'Content-Type': 'application/json' }
    })));
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).catch(() => caches.match('./index.html')))
  );
});
