import { LOCALE_TAGS } from './utils'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useStore } from './store'
import { t as translate, subscribeDicts, getDictVersion } from './i18n'

/** re-renders the component when a lazily loaded locale dictionary arrives */
export function useDictVersion(): number {
  return useSyncExternalStore(subscribeDicts, getDictVersion)
}

/** locale-aware translation hook (re-renders when the locale dictionary arrives) */
export function useT() {
  const locale = useStore((s) => s.settings.locale)
  const dictVersion = useSyncExternalStore(subscribeDicts, getDictVersion)
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(key, locale, vars),
    [locale, dictVersion]
  )
}

/** Web Speech API input (Chrome/Android/TDesktop; iOS webview may not support) */
export function useSpeechInput() {
  const locale = useStore((s) => s.settings.locale)
  const [listening, setListening] = useState(false)
  const recRef = useRef<any>(null)

  const supported = typeof window !== 'undefined' && !!(window as any).webkitSpeechRecognition

  const start = useCallback(
    (onText: (final: string) => void) => {
      const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
      if (!SR) return
      try {
        const rec = new SR()
        recRef.current = rec
        rec.lang = LOCALE_TAGS[locale] ?? 'en-GB'
        rec.interimResults = true
        rec.continuous = false
        let finalText = ''
        rec.onresult = (e: any) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const txt = e.results[i][0].transcript
            if (e.results[i].isFinal) finalText += txt
            onText(finalText || txt)
          }
        }
        rec.onend = () => setListening(false)
        rec.onerror = () => setListening(false)
        setListening(true)
        rec.start()
      } catch {
        setListening(false)
      }
    },
    [locale]
  )

  const stop = useCallback(() => {
    try {
      recRef.current?.stop()
    } catch {
      /* ignore */
    }
    setListening(false)
  }, [])

  useEffect(() => () => stop(), [stop])

  return { supported, listening, start, stop }
}
