// ─── XOX Arena Service Worker ────────────────────────────────────────────────
// PWA offline desteği: offline modda AI ile oyun tamamen çalışır,
// online mod ağ bağlantısı gerektirir (socket.io).
// İnternet gelince sayfa otomatik yenilenir ve senkronizasyon sağlanır.

const CACHE_NAME = 'xox-arena-v1';
const OFFLINE_URL = '/offline.html';

// Önbelleklenmesi gereken statik dosyalar (build sonrası Vite hash'li dosyalar dahil)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/xox_icon.png',
  '/xox_pro.png',
  '/offline.html',
];

// ─── Install ─────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Her URL'yi tek tek dene, hata olanları atla
      const results = await Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch(() => {
            // Dosya henüz yoksa (ör. /xox_pro.png) sessizce geç
            console.warn('[SW] Önbelleklenemedi:', url);
          })
        )
      );
      return results;
    })
  );
  // Yeni SW hemen aktif olsun
  self.skipWaiting();
});

// ─── Activate ────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] Eski önbellek siliniyor:', key);
            return caches.delete(key);
          })
      )
    )
  );
  // Açık sekmeleri hemen ele geçir
  self.clients.claim();
});

// ─── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ── Socket.IO / API isteklerini SW'ye dahil etme ──────────────────────────
  // Bu istekler ağ gerektiriyor; SW'nin araya girmesi sadece sorun yaratır.
  if (
    url.pathname.startsWith('/socket.io') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/')
  ) {
    return; // Tarayıcıya bırak
  }

  // ── Chrome extension ve diğer protokolleri atla ───────────────────────────
  if (!url.protocol.startsWith('http')) return;

  // ── Navigasyon istekleri (sayfa yükleme) ──────────────────────────────────
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Başarılıysa önbelleğe de yaz
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          // Çevrimdışı: önbellekte varsa oradan sun
          const cached = await caches.match(request);
          if (cached) return cached;
          // Yoksa offline sayfasını göster
          const offlinePage = await caches.match(OFFLINE_URL);
          return offlinePage || new Response('Çevrimdışısınız', { status: 503 });
        })
    );
    return;
  }

  // ── Statik varlıklar: Cache-first ─────────────────────────────────────────
  // JS/CSS/PNG/SVG — önce önbellekten sun, arka planda güncelle
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    url.pathname.match(/\.(js|css|png|svg|ico|woff2?)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => null);

        // Önbellekte varsa hemen sun, arka planda güncelle (stale-while-revalidate)
        return cached || fetchPromise;
      })
    );
    return;
  }

  // ── Diğer istekler: Network-first ─────────────────────────────────────────
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ─── Push Bildirimleri (opsiyonel, ileride kullanılabilir) ───────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'XOX Arena', {
      body: data.body || '',
      icon: '/xox_icon.png',
      badge: '/xox_icon.png',
      tag: 'xox-arena-notification',
      requireInteraction: false,
    })
  );
});

// ─── Notification Click Handler ────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Eğer pencere açıksa aktif et, açık değilse yeni aç
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
