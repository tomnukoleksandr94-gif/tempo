import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { initCloudSync, useStore } from './lib/store'
import { tgReady, tgUser } from './lib/telegram'
import { ensureLocale } from './lib/i18n'

tgReady()
initCloudSync()

// first run: default name from Telegram profile
const st = useStore.getState()
if (!st.settings.name) {
  const u = tgUser()
  if (u?.first_name) st.setSettings({ name: u.first_name })
}

// Mount only when the user's language dictionary is ready (instant for ru,
// one small chunk otherwise) — no flash of the wrong language on startup.
ensureLocale(st.settings.locale || 'ru')
  .catch(() => {})
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>
    )
  })

// PWA: register the service worker (install prompt + offline shell).
// localhost is a secure context too; failures (http LAN, sandboxed preview
// iframes) are silently ignored.
if (
  'serviceWorker' in navigator &&
  (location.protocol === 'https:' ||
    ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname))
) {
  navigator.serviceWorker
    .register('/sw.js')
    .then(async (reg) => {
      // Warm the runtime cache with this load's resources — the SW only
      // intercepts requests after activation, so the initial assets would
      // otherwise never be cached and the first offline load would break.
      await navigator.serviceWorker.ready
      // wait for the page to finish loading so performance entries are complete
      if (document.readyState !== 'complete') {
        await new Promise((r) => window.addEventListener('load', r, { once: true }))
      }
      const urls = performance
        .getEntriesByType('resource')
        .map((r) => r.name)
        .filter((u) => u.startsWith(location.origin) && !u.includes('/port/'))
      const cache = await caches.open('tempo-shell-v1')
      await Promise.all(
        urls.map(async (u) => {
          if (await cache.match(u)) return
          await cache.add(u).catch(() => undefined)
        })
      )
    })
    .catch(() => {})
}
