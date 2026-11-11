// Sunset Dashboard Service Worker
const CACHE_NAME = "sunset-pwa-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/favicon.ico",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/maskable-icon-512x512.png",
  "/apple-touch-icon.png",
  "/Sunset-Group-Logo.png"
];

// Install event - precache core static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("PWA: Precache failed for some assets", err);
      });
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - Network-first with cache fallback for HTML/navigation, Cache-first for static icons
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Ignore non-GET requests or chrome-extension schemes
  if (request.method !== "GET" || !request.url.startsWith("http")) {
    return;
  }

  const url = new URL(request.url);

  // If requesting API, always bypass cache to guarantee fresh live data
  if (url.pathname.startsWith("/api") || url.port === "8000") {
    return;
  }

  // Static images & icons: Cache-first
  if (
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".svg")
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Navigation / pages: Network-first
  event.respondWith(
    fetch(request).catch(() => {
      return caches.match(request).then((cached) => {
        if (cached) return cached;
        if (request.mode === "navigate") {
          return caches.match("/");
        }
        return new Response("Network unavailable", {
          status: 503,
          statusText: "Service Unavailable",
          headers: new Headers({ "Content-Type": "text/plain" }),
        });
      });
    })
  );
});

