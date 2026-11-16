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
