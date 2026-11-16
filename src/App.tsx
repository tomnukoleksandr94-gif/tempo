import { LOCALE_TAGS } from './lib/utils'
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Home as HomeIcon, Sparkles, Wallet, CalendarRange, CreditCard, UserRound
} from 'lucide-react'
import { ToastProvider, useToast } from './components/ui'
import { useStore, eventOccursOn } from './lib/store'
import { useDictVersion } from './lib/hooks'
import { t } from './lib/i18n'
import { haptic, tg, isTelegram } from './lib/telegram'
import HomePage from './pages/Home'
const Assistant = lazy(() => import('./pages/Assistant'))
const Finance = lazy(() => import('./pages/Finance'))
const PlanningPage = lazy(() => import('./pages/Planning'))
const Profile = lazy(() => import('./pages/Profile'))
const BillingPage = lazy(() => import('./pages/Billing'))
const SupportPage = lazy(() => import('./pages/Support'))
import { SuccessOverlay } from './components/SuccessOverlay'
import { Onboarding } from './components/Onboarding'
import { GlobalSearch } from './components/GlobalSearch'

export type TabId = 'home' | 'ai' | 'finance' | 'planning' | 'billing' | 'support' | 'profile'

const TABS: { id: TabId; icon: ReactNode; key: string }[] = [
  { id: 'home', icon: <HomeIcon size={21} />, key: 'nav.home' },
  { id: 'ai', icon: <Sparkles size={21} />, key: 'nav.ai' },
  { id: 'finance', icon: <Wallet size={21} />, key: 'nav.finance' },
  { id: 'planning', icon: <CalendarRange size={21} />, key: 'nav.planning' },
  { id: 'billing', icon: <CreditCard size={21} />, key: 'nav.billing' },
  { id: 'profile', icon: <UserRound size={21} />, key: 'nav.profile' }
]

// ---------- brand mark (tempo "t" with dial) ----------
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-label="Tempo">
      <path d="M24 40 V14 M14 22 H34" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
      <path d="M24 22 L34 12" stroke="#8E7BEF" strokeWidth="4.5" strokeLinecap="round" />
      {[195, 220, 250, 285].map((deg) => {
        const r1 = 16.5
        const r2 = 20.5
        const rad = (deg * Math.PI) / 180
        const cx = 24
        const cy = 22
        return (
          <path
            key={deg}
            d={`M${cx + r1 * Math.cos(rad)} ${cy + r1 * Math.sin(rad)} L${cx + r2 * Math.cos(rad)} ${cy + r2 * Math.sin(rad)}`}
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.85"
          />
        )
      })}
    </svg>
  )
}

// ---------- dynamic-island style clock pill ----------
function IslandBar() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(id)
  }, [])
  const locale = useStore((s) => s.settings.locale)
  const time = now.toLocaleTimeString(LOCALE_TAGS[locale], { hour: '2-digit', minute: '2-digit' })
  const date = now.toLocaleDateString(LOCALE_TAGS[locale], { weekday: 'short', day: 'numeric', month: 'short' })
  const premium = useStore((s) => s.subscription.status === 'active')
  return (
    <button
      onClick={() => { haptic('select'); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
      aria-label="Tempo"
      className="pointer-events-auto fixed inset-x-0 top-[max(env(safe-area-inset-top),6px)] z-40 mx-auto flex w-fit justify-center">
      <div className="glass-sm flex h-9 items-center gap-2.5 rounded-full px-4 !py-0 shadow-lg">
        {premium && <span className="h-1.5 w-1.5 rounded-full bg-acc" title="Premium" />}
        <LogoMark size={17} />
        <span className="tabular text-[13px] font-bold">{time}</span>
        <span className="h-3.5 w-px bg-soft3" />
        <span className="text-[12px] font-medium text-t2 capitalize">{date}</span>
      </div>
    </button>
  )
}

// ---------- tab bar (mobile) ----------
function TabBar({ tab, go }: { tab: TabId; go: (t: TabId) => void }) {
  const locale = useStore((s) => s.settings.locale)
  useDictVersion() // re-render when the locale dictionary arrives
  return (
    <nav className="glass-nav fixed inset-x-0 bottom-0 z-40 md:hidden" aria-label="main">
      <div className="mx-auto flex max-w-[520px] items-stretch justify-between px-1 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => {
              haptic('select')
              go(tb.id)
            }}
            className="press flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1"
            style={{ color: tab === tb.id ? 'var(--accent)' : 'var(--color-t3)' }}
          >
            {tb.icon}
            <span className="w-full truncate text-center text-[10px] font-semibold leading-none">{t(tb.key, locale)}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

// ---------- sidebar (desktop) ----------
function Sidebar({ tab, go }: { tab: TabId; go: (t: TabId) => void }) {
  const locale = useStore((s) => s.settings.locale)
  useDictVersion() // re-render when the locale dictionary arrives
  return (
    <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r bd-soft px-4 py-6 md:flex" aria-label="main">
      <div className="mb-8 flex items-center gap-2.5 px-2">
        <LogoMark size={30} />
        <span className="text-[22px] font-extrabold tracking-tight">tempo</span>
      </div>
      <nav className="flex flex-col gap-1">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => {
              haptic('select')
              go(tb.id)
            }}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
              tab === tb.id ? 'bg-soft2 text-t1' : 'text-t2 hover:bg-soft'
            }`}
          >
            <span style={{ color: tab === tb.id ? 'var(--accent)' : undefined }}>{tb.icon}</span>
            {t(tb.key, locale)}
          </button>
        ))}
      </nav>
      <div className="mt-auto px-3 text-[11px] text-t3">Tempo AI Life OS · v1.0</div>
    </aside>
  )
}

// ---------- in-app reminders ----------
function Reminders() {
  const events = useStore((s) => s.events)
  const updateEvent = useStore((s) => s.updateEvent)
  const toast = useToast()
  useEffect(() => {
    const check = () => {
      const now = Date.now()
      for (const e of useStore.getState().events) {
        if (e.remindMin == null || !e.time) continue
        if (e.remindedAt && now - e.remindedAt < 3600_000) continue
        const today = new Date()
        const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        if (!eventOccursOn(e, iso)) continue
        const [h, m] = e.time.split(':').map(Number)
        const at = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m).getTime() - e.remindMin * 60000
        if (now >= at && now - at < 5 * 60000) {
          updateEvent(e.id, { remindedAt: now })
          haptic('success')
          toast(`${e.title} — ${e.time}`, 'ok')
          try {
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Tempo', { body: `${e.title} — ${e.time}` })
            }
          } catch {
            /* ignore */
          }
        }
      }
    }
    check()
    const id = setInterval(check, 30000)
    return () => clearInterval(id)
  }, [events, updateEvent, toast])
  return null
}

function warmUpBillingServer() {
  try {
    const initData = (window as any)?.Telegram?.WebViewApp?.initData || ''
    let token: string | null = null
    try { token = localStorage.getItem('tempo-account-token') } catch { /* ignore */ }
    const payload: any = initData ? { initData } : token ? { token } : {}
    fetch('/port/3000/api/billing/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((res: any) => {
        if (res?.referralCode) {
          try { localStorage.setItem('tempo-referral-code', res.referralCode) } catch { /* ignore */ }
        }
      })
      .catch(() => {})
  } catch { /* ignore */ }
}

export default function App() {
  const [tab, setTab] = useState<TabId>('home')
  const themePref = useStore((s) => s.settings.theme)
  const events = useStore((s) => s.events)
  const eventReminders = useStore((s) => s.settings.eventReminders !== false)
  useEffect(() => { warmUpBillingServer() }, [])
  // keep the free-tier server awake while the app is open (cheap ping every 4 min)
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') warmUpBillingServer()
    }, 4 * 60 * 1000)
    const onVis = () => { if (document.visibilityState === 'visible') warmUpBillingServer() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [])
  // push upcoming events to the server for Telegram reminders (debounced)
  useEffect(() => {
    const id = setTimeout(() => {
      const initData = (window as any)?.Telegram?.WebViewApp?.initData || ''
      let token = null
      try { token = localStorage.getItem('tempo-account-token') } catch { /* ignore */ }
      if (!initData && !token) return
      const today = new Date().toISOString().slice(0, 10)
      const soon = events
        .filter((e: any) => e.date >= today)
        .slice(0, 30)
        .map((e: any) => ({
          id: e.id, title: e.title, date: e.date, time: e.time || null,
          remindMin: e.remindMin ?? null
        }))
      // user timezone offset in minutes from UTC (matches server reminder scheduler)
      const tzMinutes = -new Date().getTimezoneOffset()
      import('./lib/billing').then(({ remindersSync }) => {
        remindersSync(initData, eventReminders ? soon : [], tzMinutes).catch(() => {})
      })
    }, 3000)
    return () => clearTimeout(id)
  }, [events, eventReminders])
  const subscription = useStore((s) => s.subscription)
  const [celebrate, setCelebrate] = useState(false)
  useEffect(() => {
    if (subscription.status === 'active' && !prevActiveRef.current) {
      setCelebrate(true)
      setTimeout(() => setCelebrate(false), 3800)
    }
    prevActiveRef.current = subscription.status === 'active'
  }, [subscription.status])
  const prevActiveRef = useRef(false)
  const effects = useStore((s) => s.settings.effects)

  // apply theme: manual preference, or auto (Telegram scheme / dark)
  useEffect(() => {
    let resolved: 'dark' | 'light' = themePref === 'light' ? 'light' : themePref === 'dark' ? 'dark' : 'dark'
    if (themePref === 'auto') {
      try {
        resolved = tg?.colorScheme === 'light' ? 'light' : 'dark'
      } catch { /* default dark */ }
    }
    document.documentElement.dataset.theme = resolved
    const locale = useStore.getState().settings.locale
    document.documentElement.lang = locale
    try {
      const bg = resolved === 'light' ? '#f5f5f6' : '#000000'
      tg?.setHeaderColor?.(bg)
      tg?.setBackgroundColor?.(bg)
    } catch { /* not in Telegram */ }
  }, [themePref])

  const go = (t: TabId) => {
    setTab(t)
    window.scrollTo({ top: 0 })
  }

  // global search: Ctrl/Cmd+K or Home header button
  const [searchOpen, setSearchOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    const onOpen = () => setSearchOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('tempo-open-search', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('tempo-open-search', onOpen)
    }
  }, [])

  return (
    <ToastProvider>
      <Onboarding />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <div aria-hidden className={`glass-orbs${effects ? '' : ' no-effects'}`} />
      <div className={`relative z-10 mx-auto flex min-h-dvh w-full max-w-[1080px] md:flex-row${effects ? '' : ' no-effects'}`}>
        <Sidebar tab={tab} go={go} />
        <main className="pt-island min-w-0 flex-1 px-4 pb-nav md:px-8 md:pb-10">
          <div key={tab} className="page-enter">
            <Suspense fallback={<div className="flex h-[50vh] items-center justify-center"><LogoMark size={30} /></div>}>
              {tab === 'home' && <HomePage go={go} />}
              {tab === 'ai' && <Assistant />}
              {tab === 'finance' && <Finance />}
              {tab === 'planning' && <PlanningPage />}
              {tab === 'billing' && <BillingPage go={go} />}
              {tab === 'support' && <SupportPage go={go} />}
              {tab === 'profile' && <Profile go={go} />}
            </Suspense>
          </div>
        </main>
        <TabBar tab={tab} go={go} />
      </div>
      <IslandBar />
      <Reminders />
      {celebrate && <SuccessOverlay />}
    </ToastProvider>
  )
}
