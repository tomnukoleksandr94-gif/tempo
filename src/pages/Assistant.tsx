import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Sparkles, Wallet, ListChecks, CalendarClock, UtensilsCrossed } from 'lucide-react'
import { CaptureInput } from '../components/CaptureInput'
import { CaptureFlow, type CaptureRequest } from '../components/CaptureFlow'
import { useStore } from '../lib/store'
import { aiLimitFor } from '../lib/billing'
import { useT } from '../lib/hooks'
import { t } from '../lib/i18n'
import { uid } from '../lib/utils'
import { LogoMark } from '../App'

const APPLIED_ICON: Record<string, ReactElement> = {
  expense: <Wallet size={12} />,
  income: <Wallet size={12} />,
  task: <ListChecks size={12} />,
  event: <CalendarClock size={12} />,
  meal: <UtensilsCrossed size={12} />
}

export default function Assistant() {
  const t2 = useT()
  const locale = useStore((s) => s.settings.locale)
  const chat = useStore((s) => s.chat)
  const pushChat = useStore((s) => s.pushChat)
  const usage = useStore((s) => s.aiUsage)
  const limit = useStore((s) => aiLimitFor(s.subscription))

  const [req, setReq] = useState<CaptureRequest | null>(null)
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.length, busy])

  const send = (text: string, image?: { b64: string; mime: string }) => {
    if (busy) return
    pushChat({ id: uid(), role: 'user', text: text || '📷', ts: Date.now() })
    setBusy(true)
    setReq({ id: Date.now(), ...(image ? { image } : { text }) })
  }

  return (
    <div className="flex h-[calc(100dvh-148px)] flex-col md:h-[calc(100dvh-100px)]">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-extrabold">
          <Sparkles size={18} className="text-acc" />
          {t2('ai.title')}
        </h1>
        <span className="tabular glass-sm px-2.5 py-1 text-[11px] font-semibold text-t2">
          {t2('ai.usage')}: {usage.date === new Date().toISOString().slice(0, 10) ? usage.count : 0}/{limit}
        </span>
      </div>

      {/* messages */}
      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto pb-2">
        {chat.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
            <LogoMark size={52} />
            <p className="max-w-[30ch] text-[13px] leading-relaxed text-t2">{t('home.captureHint', locale)}</p>
            <div className="flex max-w-[340px] flex-wrap justify-center gap-2">
              {['ai.ex1', 'ai.ex2', 'ai.ex3', 'ai.ex4'].map((k) => (
                <button
                  key={k}
                  onClick={() => send(t(k, locale))}
                  className="press glass-sm px-3 py-1.5 text-[12px] font-medium text-t2 hover:text-t1"
                >
                  {t(k, locale)}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`pop max-w-[85%] rounded-[20px] px-3.5 py-2.5 text-[14px] leading-snug ${m.role === 'user' ? 'bg-acc text-black' : 'glass-sm'}`}>
              {m.text}
              {m.applied && m.applied.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.applied.map((a, i) => (
                    <span key={i} className="flex items-center gap-1 rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-bold uppercase text-black/70">
                      {APPLIED_ICON[a] ?? null}
                      {t(`cap.new${a[0].toUpperCase()}${a.slice(1)}`, locale)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="glass-sm flex items-center gap-1.5 rounded-[20px] px-4 py-3">
              <span className="dot h-1.5 w-1.5 rounded-full bg-t2" />
              <span className="dot h-1.5 w-1.5 rounded-full bg-t2" />
              <span className="dot h-1.5 w-1.5 rounded-full bg-t2" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* input */}
      <div className="pt-2">
        <CaptureInput busy={busy} onSubmitText={(text) => send(text)} onSubmitImage={(b64, mime) => send('', { b64, mime })} />
      </div>

      <CaptureFlow
        request={req}
        onFinish={(r) => {
          setBusy(false)
          setReq(null)
          if (r.error === 'cancelled') return
          if (r.ok) {
            pushChat({
              id: uid(),
              role: 'ai',
              text: r.reply || t('ai.appliedOk', locale),
              ts: Date.now(),
              applied: r.applied
            })
          } else {
            pushChat({ id: uid(), role: 'ai', text: t('err.ai', locale), ts: Date.now() })
          }
        }}
      />
    </div>
  )
}
