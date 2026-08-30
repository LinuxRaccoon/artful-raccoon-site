// Minimal, deliberately conservative service worker.
//
// Strategy: network-first, cache as a fallback only. This exists mainly to
// satisfy the browser's install criteria (a fetch handler is required for a
// site to be installable as a PWA) and to let the site open if there's a
// brief network blip — not to run the gallery "offline-first". Photos and
// photos.json change whenever the builder is used, so we deliberately don't
// pre-cache anything or prefer the cache over a live network response; that
// avoids ever serving a stale photo list or stale code to a visitor who has
// a working connection.

const CACHE_NAME = 'artful-raccoon-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
        return response
      })
      .catch(() => caches.match(event.request))
  )
})
