// service-worker.js optimizado para Android
const CACHE_NAME = 'notas-app-v1';

// Recursos a cachear
const urlsToCache = [
  '/',
  '/static/css/style.css',
  '/static/js/main.js',
  '/manifest.json',
  '/static/img/favicon-32x32.png',
  '/static/img/icon-192x192.png',
  '/static/img/icon-512x512.png'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Instalando...');

  // Forzar que el service worker tome el control inmediatamente
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Recursos en caché');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('[Service Worker] Error en caché:', error);
      })
  );
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activando...');

  // Tomar el control inmediatamente
  event.waitUntil(self.clients.claim());

  // Limpiar cachés antiguos
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Eliminando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Estrategia de caché: Stale-while-revalidate
// Esta estrategia es ideal para aplicaciones web que necesitan ser rápidas pero mantenerse actualizadas
self.addEventListener('fetch', (event) => {
  // Ignorar solicitudes de extensiones de Chrome o no HTTP
  if (
    !event.request.url.startsWith('http') ||
    event.request.url.includes('extension') ||
    event.request.url.includes('chrome-extension')
  ) {
    return;
  }

  // Para las solicitudes de API, siempre ir a la red primero
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // Para todos los demás recursos, usar stale-while-revalidate
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Usar respuesta en caché mientras se revalida
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            // Solo cachear respuestas válidas y no errores
            if (
              networkResponse &&
              networkResponse.status === 200 &&
              networkResponse.type === 'basic'
            ) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
          })
          .catch((error) => {
            console.error('[Service Worker] Error de red:', error);
            // En caso de error, la promesa se resuelve con undefined
          });

        // Devolvemos la respuesta en caché si existe, o esperamos la red
        return cachedResponse || fetchPromise;
      })
  );
});