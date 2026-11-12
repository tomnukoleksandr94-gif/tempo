import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { initCloudSync, useStore } from './lib/store'
import { tgReady, tgUser } from './lib/telegram'

tgReady()
initCloudSync()

// first run: default name from Telegram profile
const st = useStore.getState()
if (!st.settings.name) {
  const u = tgUser()
  if (u?.first_name) st.setSettings({ name: u.first_name })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
