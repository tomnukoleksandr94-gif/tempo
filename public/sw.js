/**
 * Tempo service worker.
 *
 * Purpose:
 *  1. Satisfy the PWA installability criteria (manifest + service worker with
 *     a fetch handler) so the browser shows its native «Install app» prompt.
 *  2. Serve the app shell from cache when offline — user data already lives
 *     client-side (localStorage / Telegram CloudStorage), so the app keeps
 *     working offline; only AI/server sync needs the network.
 *
 * Strategy:
 *  - /port/* (API)  → always network, never cached.
 *  - navigations    → network-first, cached shell when offline.
 *  - /assets/*      → cache-first (immutable, content-hashed filenames).
 *  - other GETs     → stale-while-revalidate (images, manifest, fonts).
 */
const SHELL = 'tempo-shell-v1'

const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/img/icon-192.png',
  '/img/icon-512.png',
  '/img/apple-touch-icon.png',
  '/img/favicon-96.png'
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(PRECACHE).catch(() => undefined)) // best-effort precache
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith('/port/')) return // API — always network

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copy = r.clone()
          caches.open(SHELL).then((c) => c.put('/', copy))
          return r
        })
        .catch(() =>
          caches.match('/', { ignoreVary: true }).then((m) => m || caches.match(e.request, { ignoreVary: true }))
            .then((m) => m || Response.error())
        )
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    // immutable hashed bundles — cache-first
    e.respondWith(
      caches.match(e.request, { ignoreVary: true }).then((m) =>
        m || fetch(e.request).then((r) => {
          const copy = r.clone()
          caches.open(SHELL).then((c) => c.put(e.request, copy))
          return r
        })
      )
    )
    return
  }

  // everything else (img, manifest): stale-while-revalidate
  e.respondWith(
    caches.open(SHELL).then(async (c) => {
      const cached = await c.match(e.request, { ignoreVary: true })
      const refreshing = fetch(e.request)
        .then((r) => { c.put(e.request, r.clone()); return r })
        .catch(() => cached)
      return cached || refreshing
    })
  )
})
