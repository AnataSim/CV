/**
 * CrunchyVerse Service Worker
 * Cache-first untuk static assets, network-first untuk API
 */

const CACHE_NAME = "crunchyverse-v1";
const STATIC_CACHE = "crunchyverse-static-v1";
const API_CACHE = "crunchyverse-api-v1";

// Assets yang diprecache saat SW install
const PRECACHE_ASSETS = [
  "/",
  "/theater_stage_bg.png",
  "/challenge_bg.png",
  "/pixel_fox.png",
  "/pixel_butterfly.png",
];

// Install: precache critical assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch(() => {
        // Silently fail for missing assets
      });
    })
  );
  self.skipWaiting();
});

// Activate: bersihkan cache lama
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![CACHE_NAME, STATIC_CACHE, API_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, chrome-extension, dan data URLs
  if (request.method !== "GET") return;
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Next.js static assets: Cache-first (bisa lama)
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/_next/image/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // Public assets (images, fonts): Cache-first dengan background revalidate
  if (
    url.origin === self.location.origin &&
    (url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|woff|woff2)$/))
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const networkFetch = fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // API calls ke backend: Network-first, fallback ke cache (5 menit TTL)
  if (
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.port === "3001"
  ) {
    const canCache = ["/api/stats", "/api/tiktok", "/api/broadcasts"].some((p) =>
      url.pathname.includes(p)
    );

    if (canCache) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response.ok) {
              const cloned = response.clone();
              caches.open(API_CACHE).then((cache) => cache.put(request, cloned));
            }
            return response;
          })
          .catch(() =>
            caches.match(request).then((cached) => {
              if (cached) return cached;
              return new Response(JSON.stringify({ error: "Offline", cached: false }), {
                headers: { "Content-Type": "application/json" },
                status: 503,
              });
            })
          )
      );
    }
    return;
  }

  // Firebase CDN assets: Cache-first
  if (url.hostname.includes("googleapis.com") || url.hostname.includes("gstatic.com")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then((cached) => cached || fetch(request))
      )
    );
    return;
  }

  // Default: Network-only
});
