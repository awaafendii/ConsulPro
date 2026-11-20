/*
 * Service worker ConsulPro — rend l'application installable (PWA) et fournit un
 * repli hors-ligne. Stratégie volontairement prudente :
 *
 *  - Les pages (navigations) ne sont JAMAIS mises en cache : elles dépendent de
 *    l'authentification et du locataire (organisation). Réseau d'abord, repli
 *    sur la page hors-ligne si le réseau est indisponible.
 *  - L'API (/api/*) n'est jamais mise en cache : données dynamiques.
 *  - Seuls les actifs statiques immuables et hashés (/_next/static/, /icons/,
 *    le manifeste) sont mis en cache (cache d'abord).
 *
 * Changer VERSION invalide l'ancien cache à l'activation.
 */
/* global self, caches, fetch, URL */
const VERSION = 'v1';
const STATIC_CACHE = `consulpro-static-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    });
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Jamais de cache sur les mutations ni sur les requêtes vers d'autres origines.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages : réseau d'abord, repli hors-ligne (pas de mise en cache).
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // API : réseau uniquement (laisser passer).
  if (url.pathname.startsWith('/api/')) return;

  // Actifs statiques immuables + icônes + manifeste : cache d'abord.
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Reste (polices, images publiques…) : réseau d'abord, repli cache si présent.
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
