import { useState } from 'react'
import { Smartphone, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { useT } from '../lib/hooks'
import { usePwaInstall, installHintKey } from '../lib/pwa'
import { Btn } from './ui'
import { LogoMark } from '../App'

/**
 * Slim top-of-page banner suggesting to install the PWA. Shown on every
 * visit until:
 *  - this device already has the app installed (never shown again), or
 *  - the user turned it off in Profile settings, or
 *  - it is dismissed — hidden for the current session, returns next visit.
 * On platforms without the native prompt (iOS Safari, Telegram webview)
 * the install button is replaced by a manual-install hint.
 */
export default function InstallBanner() {
  const t2 = useT()
  const enabled = useStore((s) => s.settings.installBanner !== false)
  const { promptEvent, installed, install } = usePwaInstall()
  const [dismissed, setDismissed] = useState(false)

  if (installed || dismissed || !enabled) return null

  return (
    <div className="glass mb-4 flex items-center gap-3 p-3.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-acc2">
        <LogoMark size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold text-t2">{t2('ib.title')}</div>
        <div className="mt-0.5 text-[12px] leading-snug text-t3">
          {promptEvent ? t2('ib.text') : t2(installHintKey())}
        </div>
      </div>
      {promptEvent && (
        <Btn variant="primary" size="sm" className="shrink-0" onClick={() => install()}>
          <Smartphone size={14} />
          {t2('ib.btn')}
        </Btn>
      )}
      <button
        onClick={() => setDismissed(true)}
        aria-label={t2('ib.close')}
        className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-soft"
      >
        <X size={15} className="text-t3" />
      </button>
    </div>
  )
}
