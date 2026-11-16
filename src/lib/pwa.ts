import { useCallback, useEffect, useState } from 'react'

const INSTALLED_KEY = 'tempo-pwa-installed'

function markInstalled() {
  try { localStorage.setItem(INSTALLED_KEY, '1') } catch { /* ignore */ }
}

/**
 * PWA install state shared by the install banner (App) and the Profile
 * "App" section. Captures the browser's beforeinstallprompt event, tracks
 * whether THIS device already has the app (standalone display mode,
 * appinstalled event, or a previously accepted install — persisted in
 * localStorage), and exposes install() to trigger the native prompt.
 */
export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState<any>(null)
  const [installed, setInstalled] = useState(() => {
    try {
      if (localStorage.getItem(INSTALLED_KEY) === '1') return true
    } catch { /* ignore */ }
    try { return window.matchMedia('(display-mode: standalone)').matches } catch { return false }
  })

  useEffect(() => {
    try {
      if (window.matchMedia('(display-mode: standalone)').matches) {
        markInstalled()
        setInstalled(true)
      }
    } catch { /* ignore */ }
    const onPrompt = (e: any) => { e.preventDefault(); setPromptEvent(e) }
    const onInstalled = () => { markInstalled(); setInstalled(true); setPromptEvent(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  /** Trigger the native install prompt. Returns true if the user accepted. */
  const install = useCallback(async (): Promise<boolean> => {
    if (!promptEvent) return false
    const ev = promptEvent
    setPromptEvent(null)
    try {
      ev.prompt()
      const res = await ev.userChoice?.catch?.(() => null)
      if (res?.outcome === 'accepted') {
        markInstalled()
        setInstalled(true)
        return true
      }
      // dismissed — the same event cannot be reused; Chrome re-fires
      // beforeinstallprompt after further engagement / on later visits.
    } catch { /* ignore */ }
    return false
  }, [promptEvent])

  return { promptEvent, installed, install }
}

/** Platform-aware manual install hint key (Telegram webview / iOS / other). */
export function installHintKey(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (typeof navigator !== 'undefined' &&
      navigator.platform === 'MacIntel' &&
      navigator.maxTouchPoints > 1)
  const inTelegram = /Telegram/i.test(ua)
  return inTelegram ? 'pr.installHintTg' : isIOS ? 'pr.appIosHint' : 'pr.installHintChrome'
}
