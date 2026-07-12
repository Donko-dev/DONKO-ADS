/**
 * DONKO ADS — Service Worker
 * Stratégie "réseau d'abord" pour index.html/manifest/JS : l'utilisateur reçoit
 * toujours la dernière version publiée quand il a du réseau, et ne retombe sur
 * la copie locale que s'il est hors connexion. Les icônes (rarement modifiées)
 * restent en cache-d'abord pour un chargement instantané.
 *
 * IMPORTANT : à chaque mise à jour du site, changez CACHE_NAME (ex: v2, v3...)
 * ci-dessous — cela force tous les appareils à récupérer la nouvelle version
 * au lieu de rester bloqués sur une ancienne copie mise en cache.
 */

const CACHE_NAME = 'donko-ads-v2';
const APP_SHELL = [
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

  // Page HTML (navigation) et fichiers JS : réseau d'abord, pour toujours servir
  // la dernière version publiée. Cache uniquement utilisé en secours hors ligne.
  const isHtmlOrScript = req.mode === 'navigate' || req.url.endsWith('.html') || req.url.endsWith('.js') || req.url.endsWith('.json');
  if (isHtmlOrScript) {
    event.respondWith(
      fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return res;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Icônes et autres ressources statiques : cache d'abord (rarement modifiées).
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
