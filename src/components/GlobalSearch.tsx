import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, Wallet, ListChecks, CalendarClock, UtensilsCrossed } from 'lucide-react'
import { Sheet } from './ui'
import { useStore } from '../lib/store'
import { useT } from '../lib/hooks'
import { money } from '../lib/utils'

type Hit =
  | { kind: 'tx'; id: string; title: string; sub: string; date: string }
  | { kind: 'task'; id: string; title: string; sub: string; date: string }
  | { kind: 'event'; id: string; title: string; sub: string; date: string }
  | { kind: 'meal'; id: string; title: string; sub: string; date: string }

/**
 * Global search across transactions, tasks, events and meals.
 * Opened from the Home header or with Ctrl/Cmd+K. Fast, in-memory, mobile-friendly.
 */
export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t2 = useT()
  const locale = useStore((s) => s.settings.locale)
  const currency = useStore((s) => s.settings.currency)
  const transactions = useStore((s) => s.transactions)
  const tasks = useStore((s) => s.tasks)
  const events = useStore((s) => s.events)
  const meals = useStore((s) => s.meals)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'tx' | 'task' | 'event' | 'meal'>('all')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setFilter('all')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const hits: Hit[] = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (needle.length < 2) return []
    const out: Hit[] = []
    if (filter === 'all' || filter === 'tx') {
      for (const t of transactions) {
        const hay = `${t.note || ''} ${t.category} ${t.kind}`.toLowerCase()
        if (hay.includes(needle)) {
          const cat = t.category
          out.push({
            kind: 'tx', id: t.id, date: t.date,
            title: `${t.kind === 'income' ? '+' : '−'}${money(t.amount, t.currency, locale)}`,
            sub: `${t.note ? t.note + ' · ' : ''}${cat}`
          })
        }
      }
    }
    if (filter === 'all' || filter === 'task') {
      for (const t of tasks) {
        if (`${t.title} ${t.note || ''}`.toLowerCase().includes(needle)) {
          out.push({ kind: 'task', id: t.id, date: t.due || '', title: t.title, sub: t.done ? t2('c.done') : t2('nav.tasks') })
        }
      }
    }
    if (filter === 'all' || filter === 'event') {
      for (const e of events) {
        if (`${e.title} ${e.location || ''}`.toLowerCase().includes(needle)) {
          out.push({ kind: 'event', id: e.id, date: e.date, title: e.title, sub: `${t2('nav.calendar')}${e.time ? ' · ' + e.time : ''}` })
        }
      }
    }
    if (filter === 'all' || filter === 'meal') {
      for (const m of meals) {
        const names = m.items.map((i) => i.name).join(' ')
        if (`${m.title} ${names}`.toLowerCase().includes(needle)) {
          const kcal = m.items.reduce((a, i) => a + i.kcal, 0)
          out.push({ kind: 'meal', id: m.id, date: m.date, title: m.title, sub: `${Math.round(kcal)} kcal · ${t2('nav.nutrition')}` })
        }
      }
    }
    return out.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 40)
  }, [q, filter, transactions, tasks, events, meals, locale, currency, t2])

  const ICONS = {
    tx: <Wallet size={15} className="text-acc" />,
    task: <ListChecks size={15} className="text-acc" />,
    event: <CalendarClock size={15} className="text-acc" />,
    meal: <UtensilsCrossed size={15} className="text-acc" />
  }

  return (
    <Sheet open={open} onClose={onClose} title={t2('c.search')}>
      <div className="relative mb-3">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-t3" />
        <input
          ref={inputRef}
          className="inp h-11 w-full pl-10 pr-10"
          placeholder={t2('search.placeholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q && (
          <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-t3">
            <X size={16} />
          </button>
        )}
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['all', 'tx', 'task', 'event', 'meal'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`press rounded-full px-3 py-1 text-[12px] font-semibold ${filter === f ? 'bg-acc/15 text-acc' : 'bg-soft text-t2'}`}
          >
            {t2(`search.f_${f}`)}
          </button>
        ))}
      </div>
      {hits.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-t3">
          {q.trim().length < 2 ? t2('search.typeMore') : t2('search.empty')}
        </p>
      ) : (
        <div className="max-h-[46vh] overflow-y-auto">
          {hits.map((h) => (
            <div key={h.kind + h.id} className="flex items-center gap-3 border-b bd-soft px-1 py-2.5 last:border-0">
              {ICONS[h.kind]}
              <div className="min-w-0 flex-1">
                <div className="clamp1 text-[14px] font-semibold">{h.title}</div>
                <div className="clamp1 text-[12px] text-t3">{h.sub}</div>
              </div>
              {h.date && <span className="shrink-0 text-[11px] tabular text-t3">{h.date}</span>}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}
