// ─────────────────────────────────────────────────────────────────────────────
// POSmaster Service Worker
// Estrategia: Network-first con fallback a cache para assets estáticos.
// El POS siempre intenta conectarse — el SW solo cachea para acelerar carga
// y mostrar una página offline útil si no hay conexión.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_NAME = 'posmaster-v2';
const OFFLINE_URL = '/offline.html';

// Assets que se cachean al instalar
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch(() => {
        // Si algún asset falla, continuar de todas formas
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch — Network first, cache fallback ────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // No interceptar: llamadas a Supabase, APIs externas, fuentes, extensiones
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('factus.com.co') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdn.tailwindcss.com') ||
    url.hostname.includes('paypal.com') ||
    url.hostname.includes('paypalobjects.com') ||
    url.hostname.includes('bold.co') ||
    url.protocol === 'chrome-extension:' ||
    request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cachear respuestas exitosas de assets estáticos
        if (response.ok && (
          request.destination === 'script' ||
          request.destination === 'style' ||
          request.destination === 'image' ||
          request.destination === 'font' ||
          url.pathname.endsWith('.js') ||
          url.pathname.endsWith('.css') ||
          url.pathname.endsWith('.png') ||
          url.pathname.endsWith('.svg')
        )) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(async () => {
        // Sin red — intentar desde cache
        const cached = await caches.match(request);
        if (cached) return cached;

        // Para navegación (HTML), mostrar página offline
        if (request.destination === 'document' || request.mode === 'navigate') {
          const offlinePage = await caches.match('/offline.html');
          if (offlinePage) return offlinePage;
        }

        return new Response('Sin conexión', { status: 503 });
      })
  );
});

// ── Push notifications (preparado para futuro) ────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'POSmaster', {
    body: data.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    data: { url: data.url || '/' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});