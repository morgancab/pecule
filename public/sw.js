// Service worker de Pécule : met en cache uniquement l'interface (HTML, JS, CSS, icônes),
// jamais les données (/api/* passe toujours par le réseau et reste protégé par la session).
const CACHE = 'pecule-shell-v2';

// Rappel mensuel : la notification arrive SANS contenu (rien ne transite par Apple ou Google), le texte est ici.
self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('Pécule', {
      body: 'C’est le moment de remplir ton relevé du mois dans ta feuille.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'pecule-rappel',
      data: { url: '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin);
      return open ? open.focus() : self.clients.openWindow('/');
    }),
  );
});

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    // page : réseau d'abord (dernière version), cache si hors ligne
    event.respondWith(
      fetch(event.request)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return r;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    // fichiers versionnés : cache d'abord
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((r) => {
            const copy = r.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy));
            return r;
          }),
      ),
    );
  }
});
