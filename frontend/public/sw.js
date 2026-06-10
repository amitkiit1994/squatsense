/**
 * FreeForm Fitness Service Worker
 *
 * v2 — fixes stale-shell ChunkLoadErrors after redeploys.
 *
 * Strategy:
 *   - Navigations (HTML): NETWORK-FIRST. The shell is always fetched fresh so
 *     it references the current /_next chunks. The cache is used only as an
 *     offline fallback.
 *   - Hashed build assets (/_next/static) and icons: CACHE-FIRST. These URLs
 *     are content-hashed/immutable, so a cached copy can never go stale.
 *   - API calls: NETWORK-FIRST, never served from cache while online.
 *   - All other same-origin GETs: NETWORK-FIRST with cache fallback.
 *
 * Recovery for users stuck on the old v1 shell: the browser fetches sw.js
 * itself over the network (bypassing CacheStorage), so they receive this
 * worker on their next visit. skipWaiting() + clients.claim() activate it
 * immediately, and the activate handler deletes the poisoned "freeform-v1"
 * cache so the very next navigation hits the network.
 */

const CACHE_NAME = "freeform-v2";

// Only truly static assets are pre-cached. Route HTML is intentionally NOT
// pre-cached: it goes stale after every deploy and would reference purged
// /_next chunks.
const STATIC_ASSETS = [
  "/manifest.json",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
];

// Install: pre-cache static assets, then activate immediately so this worker
// replaces a stale one without waiting for open tabs to close.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete every cache that is not the current one (including the
// stale "freeform-v1" cache), then take control of all open clients.
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

// URLs whose content never changes for a given URL — safe to serve
// cache-first forever.
function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  );
}

// Cache a successful same-origin response (best-effort, non-blocking).
function cacheResponse(request, response) {
  const clone = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and WebSocket upgrades
  if (event.request.method !== "GET") return;
  if (url.protocol === "ws:" || url.protocol === "wss:") return;

  // API calls: network-first (don't cache auth or dynamic data)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches
          .match(event.request)
          .then((r) => r || new Response("Offline", { status: 503 }))
      )
    );
    return;
  }

  // Navigations: NETWORK-FIRST so a redeploy can never strand users on a
  // stale shell. The fresh copy is cached purely as an offline fallback.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            cacheResponse(event.request, response);
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then(
            (cached) =>
              cached ||
              caches.match("/").then(
                (root) =>
                  root ||
                  new Response(
                    "You are offline and this page has not been cached yet.",
                    {
                      status: 503,
                      headers: { "Content-Type": "text/plain" },
                    }
                  )
              )
          )
        )
    );
    return;
  }

  // Immutable build assets and icons: cache-first with network fallback
  if (url.origin === self.location.origin && isImmutableAsset(url)) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              cacheResponse(event.request, response);
            }
            return response;
          })
      )
    );
    return;
  }

  // Everything else (images, fonts, misc GETs): network-first with cache
  // fallback so updated assets are picked up after each deploy.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          cacheResponse(event.request, response);
        }
        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then((r) => r || new Response("Offline", { status: 503 }))
      )
  );
});
