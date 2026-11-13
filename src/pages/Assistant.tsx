import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  Sparkles, Wallet, ListChecks, CalendarClock, UtensilsCrossed, Copy, RotateCcw,
  StopCircle, Trash2, Sliders, Zap, Scale, Brain, Lock
} from 'lucide-react'
import { CaptureInput } from '../components/CaptureInput'
import { CaptureFlow, type CaptureRequest } from '../components/CaptureFlow'
import { useStore } from '../lib/store'
import { aiLimitFor, effectivePlan } from '../lib/billing'
import { chat, AI_TIERS, type AiTier } from '../lib/ai'
import type { AiPrefs } from '../lib/types'
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

const TIER_ICON: Record<AiTier, ReactElement> = {
  fast: <Zap size={13} />,
  balanced: <Scale size={13} />,
  advanced: <Brain size={13} />
}

const TIER_ORDER: AiTier[] = ['fast', 'balanced', 'advanced']

function timeOf(ts: number): string {
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

export default function Assistant() {
  const t2 = useT()
  const locale = useStore((s) => s.settings.locale)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const chatLog = useStore((s) => s.chat)
  const pushChat = useStore((s) => s.pushChat)
  const usage = useStore((s) => s.aiUsage)
  const subscription = useStore((s) => s.subscription)
  const limit = aiLimitFor(subscription)
  const plan = effectivePlan(subscription)
  const tier = settings.aiTier || 'fast'
  const prefs: AiPrefs = settings.aiPrefs || { depth: 'balanced', length: 'normal', style: 'friendly', behavior: 'simple' }

  const [mode, setMode] = useState<'chat' | 'action'>('chat')
  const [req, setReq] = useState<CaptureRequest | null>(null)
  const [busy, setBusy] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [activeModel, setActiveModel] = useState('')
  const [fallbackNote, setFallbackNote] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [showPrefs, setShowPrefs] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const lastUserRef = useRef<string>('')

  const allowed = (tr: AiTier) =>
    plan === 'pro' ? true : plan === 'plus' ? tr !== 'advanced' : tr === 'fast'

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatLog.length, streamText, busy, showPrefs])

  useEffect(() => {
    if (!confirmClear) return
    const h = setTimeout(() => setConfirmClear(false), 4000)
    return () => clearTimeout(h)
  }, [confirmClear])

  // ---------- chat mode: streaming conversation ----------
  const sendChat = (text: string) => {
    if (busy) return
    lastUserRef.current = text
    pushChat({ id: uid(), role: 'user', text, ts: Date.now() })
    setBusy(true)
    setStreamText('')
    setFallbackNote('')
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const history = chatLog.slice(-8).map((m) => ({ role: m.role, text: m.text }))
    const data = {
      transactions: useStore.getState().transactions,
      tasks: useStore.getState().tasks,
      events: useStore.getState().events,
      meals: useStore.getState().meals,
      settings
    }
    chat({
      text,
      history,
      tier,
      prefs,
      context: data,
      signal: ctrl.signal,
      onMeta: (meta) => {
        setActiveModel(meta.model)
        if (meta.downgraded) setFallbackNote(t('ai.downgraded', locale))
      },
      onDelta: (chunk) => setStreamText((prev) => prev + chunk)
    })
      .then((r) => {
        setActiveModel(r.meta.model)
        pushChat({ id: uid(), role: 'ai', text: r.text, ts: Date.now(), model: r.meta.model })
        if (r.meta.fellBack) setFallbackNote(t('ai.fellBack', locale))
      })
      .catch((e: any) => {
        if (e?.name === 'AbortError') {
          pushChat({ id: uid(), role: 'ai', text: streamText + ' …', ts: Date.now(), model: activeModel })
        } else {
          const msg =
            e?.code === 'limit' ? t('ai.limitReached', locale) :
            e?.code === 'plan' ? t('ai.planRequired', locale) :
            e?.code === 'auth' ? t('pr.apiKeyHint', locale) :
            e?.code === 'quota' ? t('ai.quota', locale) :
            e?.code === 'timeout' ? t('ai.timeout', locale) :
            t('err.ai', locale)
          pushChat({ id: uid(), role: 'ai', text: msg, ts: Date.now(), error: true })
        }
      })
      .finally(() => {
        setBusy(false)
        setStreamText('')
        abortRef.current = null
      })
  }

  const stop = () => {
    abortRef.current?.abort()
  }

  const retry = () => {
    const last = lastUserRef.current
    if (!last || busy) return
    // drop the failed/last AI reply, then resend
    const log = useStore.getState().chat
    const lastAi = [...log].reverse().find((m) => m.role === 'ai')
    if (lastAi) {
      useStore.setState({ chat: log.filter((m) => m.id !== lastAi.id) })
    }
    sendChat(last)
  }

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied(null), 1500)
    } catch { /* clipboard unavailable */ }
  }

  const send = (text: string, image?: { b64: string; mime: string }) => {
    if (busy) return
    if (mode === 'chat' && !image) {
      sendChat(text)
      return
    }
    // action mode (or photo in any mode) → capture pipeline with confirmation
    pushChat({ id: uid(), role: 'user', text: text || '📷', ts: Date.now() })
    setBusy(true)
    setReq({ id: Date.now(), ...(image ? { image } : { text }) })
  }

  return (
    <div className="flex h-[calc(100dvh-148px)] flex-col overflow-hidden md:h-[calc(100dvh-100px)]">
      {/* header: title, usage, clear */}
      <div className="mb-2 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-extrabold">
          <Sparkles size={18} className="text-acc" />
          {t2('ai.title')}
        </h1>
        <div className="flex items-center gap-2">
          <span className="tabular glass-sm px-2.5 py-1 text-[11px] font-semibold text-t2">
            {usage.date === new Date().toISOString().slice(0, 10) ? usage.count : 0}/{limit}
          </span>
          {chatLog.length > 0 && (
            <button
              aria-label={t2('ai.clear')}
              onClick={() => (confirmClear ? (useStore.setState({ chat: [] }), setConfirmClear(false)) : setConfirmClear(true))}
              className={`press flex h-7 w-7 items-center justify-center rounded-full ${confirmClear ? 'bg-red/20 text-red' : 'bg-soft2 text-t2'}`}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      {confirmClear && (
        <div className="glass-sm mb-2 flex items-center justify-between px-3 py-2 text-[12px] text-t2">
          <span>{t2('ai.clearConfirm')}</span>
          <button
            className="press rounded-full bg-red/20 px-3 py-1 font-bold text-red"
            onClick={() => { useStore.setState({ chat: [] }); setConfirmClear(false) }}
          >
            {t2('c.delete')}
          </button>
        </div>
      )}

      {/* messages */}
      <div className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pb-2">
        {chatLog.length === 0 && !streamText && (
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
        {chatLog.map((m) => (
          <div key={m.id} className={`group flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`pop max-w-[85%] rounded-[20px] px-3.5 py-2.5 text-[14px] leading-snug ${
                m.role === 'user' ? 'bg-acc text-black' : m.error ? 'border border-red/30 bg-red/10 text-t1' : 'glass-sm'
              }`}
            >
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
              {m.role === 'ai' && !m.error && (
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <span className="text-[10px] text-t3">
                    {(m as any).model ? `${(m as any).model} · ` : ''}{timeOf(m.ts)}
                  </span>
                  <button
                    aria-label="copy"
                    onClick={() => copy(m.id, m.text)}
                    className="press flex items-center gap-1 text-[10px] text-t3 hover:text-t2"
                  >
                    <Copy size={11} />
                    {copied === m.id ? t('ai.copied', locale) : ''}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {/* streaming bubble */}
        {(busy && mode === 'chat') && (
          <div className="flex flex-col items-start">
            <div className="glass-sm max-w-[85%] whitespace-pre-wrap rounded-[20px] px-3.5 py-2.5 text-[14px] leading-snug">
              {streamText || (
                <span className="flex items-center gap-1.5">
                  <span className="dot h-1.5 w-1.5 rounded-full bg-t2" />
                  <span className="dot h-1.5 w-1.5 rounded-full bg-t2" />
                  <span className="dot h-1.5 w-1.5 rounded-full bg-t2" />
                </span>
              )}
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10px] text-t3">{activeModel}</span>
                <button
                  onClick={stop}
                  className="press flex items-center gap-1 rounded-full bg-soft2 px-2.5 py-1 text-[11px] font-semibold text-t2"
                >
                  <StopCircle size={12} />
                  {t('ai.stop', locale)}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* action-mode busy indicator */}
        {(busy && mode === 'action') && (
          <div className="flex justify-start">
            <div className="glass-sm flex items-center gap-1.5 rounded-[20px] px-4 py-3">
              <span className="dot h-1.5 w-1.5 rounded-full bg-t2" />
              <span className="dot h-1.5 w-1.5 rounded-full bg-t2" />
              <span className="dot h-1.5 w-1.5 rounded-full bg-t2" />
            </div>
          </div>
        )}
        {fallbackNote && <p className="px-1 text-[11px] text-t3">{fallbackNote}</p>}
        {/* retry last message */}
        {!busy && chatLog.length > 0 && lastUserRef.current && (
          <button
            onClick={retry}
            className="press glass-sm mx-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-t2"
          >
            <RotateCcw size={12} />
            {t('ai.retryLast', locale)}
          </button>
        )}
        <div ref={endRef} />
      </div>

      {/* controls: mode, model, prefs */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <div className="glass-sm flex rounded-full p-0.5">
          {(['chat', 'action'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`press rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                mode === m ? 'bg-soft3 text-t1' : 'text-t2'
              }`}
            >
              {t2(m === 'chat' ? 'ai.modeChat' : 'ai.modeAction')}
            </button>
          ))}
        </div>
        {AI_TIERS.map((tr) => {
          const ok = allowed(tr.id)
          return (
            <button
              key={tr.id}
              onClick={() => ok && setSettings({ aiTier: tr.id })}
              title={ok ? tr.label : t2('ai.tierLocked')}
              className={`press flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                tier === tr.id ? 'bd-soft2 bg-soft3 text-t1' : 'bd-soft bg-soft text-t2'
              } ${!ok ? 'opacity-50' : ''}`}
            >
              {TIER_ICON[tr.id]}
              {t2(`ai.tier_${tr.id}`)}
              {!ok && <Lock size={11} />}
            </button>
          )
        })}
        <button
          onClick={() => setShowPrefs(!showPrefs)}
          className={`press flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
            showPrefs ? 'bd-soft2 bg-soft3 text-t1' : 'bd-soft bg-soft text-t2'
          }`}
        >
          <Sliders size={12} />
          {t2('ai.prefsBtn')}
        </button>
      </div>

      {/* preferences panel */}
      {showPrefs && (
        <div className="glass mb-2 grid grid-cols-2 gap-2.5 p-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-t2">
            {t2('ai.prefDepth')}
            <select className="inp h-9 !rounded-lg text-[12px]" value={prefs.depth} onChange={(e) => setSettings({ aiPrefs: { ...prefs, depth: e.target.value as AiPrefs['depth'] } })}>
              <option value="fast">{t2('ai.depthFast')}</option>
              <option value="balanced">{t2('ai.depthBalanced')}</option>
              <option value="deep">{t2('ai.depthDeep')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-t2">
            {t2('ai.prefLength')}
            <select className="inp h-9 !rounded-lg text-[12px]" value={prefs.length} onChange={(e) => setSettings({ aiPrefs: { ...prefs, length: e.target.value as AiPrefs['length'] } })}>
              <option value="short">{t2('ai.lenShort')}</option>
              <option value="normal">{t2('ai.lenNormal')}</option>
              <option value="detailed">{t2('ai.lenDetailed')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-t2">
            {t2('ai.prefStyle')}
            <select className="inp h-9 !rounded-lg text-[12px]" value={prefs.style} onChange={(e) => setSettings({ aiPrefs: { ...prefs, style: e.target.value as AiPrefs['style'] } })}>
              <option value="friendly">{t2('ai.styFriendly')}</option>
              <option value="professional">{t2('ai.styProfessional')}</option>
              <option value="neutral">{t2('ai.styNeutral')}</option>
              <option value="direct">{t2('ai.styDirect')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-t2">
            {t2('ai.prefBehavior')}
            <select className="inp h-9 !rounded-lg text-[12px]" value={prefs.behavior} onChange={(e) => setSettings({ aiPrefs: { ...prefs, behavior: e.target.value as AiPrefs['behavior'] } })}>
              <option value="simple">{t2('ai.bhvSimple')}</option>
              <option value="detailed">{t2('ai.bhvDetailed')}</option>
              <option value="analytical">{t2('ai.bhvAnalytical')}</option>
              <option value="step">{t2('ai.bhvStep')}</option>
            </select>
          </label>
          {plan === 'pro' && (
            <label className="col-span-2 flex flex-col gap-1 text-[11px] font-semibold text-t2 md:col-span-4">
              {t2('ai.prefTemp')} · {Math.round((prefs.temperature ?? 0.4) * 100)}%
              <input
                type="range" min={0} max={100} step={5}
                value={Math.round((prefs.temperature ?? 0.4) * 100)}
                onChange={(e) => setSettings({ aiPrefs: { ...prefs, temperature: Number(e.target.value) / 100 } })}
                className="accent-(--color-acc)"
              />
            </label>
          )}
        </div>
      )}

      {/* input */}
      <div className="pt-2">
        <CaptureInput big busy={busy} onSubmitText={(text) => send(text)} onSubmitImage={(b64, mime) => send('', { b64, mime })} />
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
            pushChat({ id: uid(), role: 'ai', text: t('err.ai', locale), ts: Date.now(), error: true })
          }
        }}
      />
    </div>
  )
}
