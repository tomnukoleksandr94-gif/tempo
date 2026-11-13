import { useEffect, useState, type ReactNode } from 'react'
import {
  Home as HomeIcon, Sparkles, Wallet, CalendarRange, UserRound
} from 'lucide-react'
import { ToastProvider, useToast } from './components/ui'
import { useStore, eventOccursOn } from './lib/store'
import { t } from './lib/i18n'
import { haptic, tg, isTelegram } from './lib/telegram'
import HomePage from './pages/Home'
import Assistant from './pages/Assistant'
import Finance from './pages/Finance'
import PlanningPage from './pages/Planning'
import Profile from './pages/Profile'

export type TabId = 'home' | 'ai' | 'finance' | 'planning' | 'profile'

const TABS: { id: TabId; icon: ReactNode; key: string }[] = [
  { id: 'home', icon: <HomeIcon size={21} />, key: 'nav.home' },
  { id: 'ai', icon: <Sparkles size={21} />, key: 'nav.ai' },
  { id: 'finance', icon: <Wallet size={21} />, key: 'nav.finance' },
  { id: 'planning', icon: <CalendarRange size={21} />, key: 'nav.planning' },
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
  const time = now.toLocaleTimeString(locale === 'ru' ? 'ru-RU' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  const date = now.toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),6px)] z-40 flex justify-center">
      <div className="glass-sm flex h-9 items-center gap-2.5 rounded-full px-4 !py-0 shadow-lg">
        <LogoMark size={17} />
        <span className="tabular text-[13px] font-bold">{time}</span>
        <span className="h-3.5 w-px bg-soft3" />
        <span className="text-[12px] font-medium text-t2 capitalize">{date}</span>
      </div>
    </div>
  )
}

// ---------- tab bar (mobile) ----------
function TabBar({ tab, go }: { tab: TabId; go: (t: TabId) => void }) {
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
            <span className="w-full truncate text-center text-[10px] font-semibold leading-none">{t(tb.key)}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

// ---------- sidebar (desktop) ----------
function Sidebar({ tab, go }: { tab: TabId; go: (t: TabId) => void }) {
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
            {t(tb.key)}
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

export default function App() {
  const [tab, setTab] = useState<TabId>('home')
  const themePref = useStore((s) => s.settings.theme)

  // apply theme: manual preference, or auto (Telegram scheme / dark)
  useEffect(() => {
    let resolved: 'dark' | 'light' = themePref === 'light' ? 'light' : themePref === 'dark' ? 'dark' : 'dark'
    if (themePref === 'auto') {
      try {
        resolved = tg?.colorScheme === 'light' ? 'light' : 'dark'
      } catch { /* default dark */ }
    }
    document.documentElement.dataset.theme = resolved
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
  return (
    <ToastProvider>
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1080px] md:flex-row">
        <Sidebar tab={tab} go={go} />
        <main className="pt-island min-w-0 flex-1 px-4 pb-nav md:px-8 md:pb-10">
          {tab === 'home' && <HomePage go={go} />}
          {tab === 'ai' && <Assistant />}
          {tab === 'finance' && <Finance />}
          {tab === 'planning' && <PlanningPage />}
          {tab === 'profile' && <Profile />}
        </main>
        <TabBar tab={tab} go={go} />
      </div>
      <IslandBar />
      <Reminders />
    </ToastProvider>
  )
}
