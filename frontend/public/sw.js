/**
 * SquatSense Service Worker
 *
 * Provides basic caching for offline support and faster load times.
 * Uses a network-first strategy for API calls and a cache-first
 * strategy for static assets.
 */

const CACHE_NAME = "squatsense-v1";
const STATIC_ASSETS = ["/", "/dashboard", "/workout", "/analytics", "/coach"];

// Install: pre-cache core shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: network-first for API, cache-first for static assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and WebSocket upgrades
  if (event.request.method !== "GET") return;
  if (url.protocol === "ws:" || url.protocol === "wss:") return;

  // API calls: network-first (don't cache auth or dynamic data)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request).then((r) => r || new Response("Offline", { status: 503 }))
      )
    );
    return;
  }

  // Static assets: cache-first with network fallback
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          // Only cache successful responses from our origin
          if (response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
    )
  );
});
