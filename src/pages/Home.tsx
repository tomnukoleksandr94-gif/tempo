import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import {
  Sparkles, ChevronRight, Flame, ListChecks, CalendarClock, Wallet,
  RefreshCw, UtensilsCrossed, Clock, History, Check
} from 'lucide-react'
import type { TabId } from '../App'
import { CaptureInput } from '../components/CaptureInput'
import { CaptureFlow, type CaptureRequest } from '../components/CaptureFlow'
import { SectionHeader, StatTile, EmptyState, useToast } from '../components/ui'
import { Ring, Sparkline, MacroBar } from '../components/charts'
import { useStore, useDayExpense, weekDailyTotals, mealsKcal, mealsMacros, nextEventDate } from '../lib/store'
import { useT } from '../lib/hooks'
import { generateInsight } from '../lib/ai'
import { t } from '../lib/i18n'
import { greeting, money, relativeDay, todayISO, fmtDate } from '../lib/utils'
import { CAT_META } from '../lib/categories'
import { haptic } from '../lib/telegram'
import type { Currency } from '../lib/types'

export default function HomePage({ go }: { go: (t: TabId) => void }) {
  const t2 = useT()
  const toast = useToast()
  const settings = useStore((s) => s.settings)
  const transactions = useStore((s) => s.transactions)
  const tasks = useStore((s) => s.tasks)
  const events = useStore((s) => s.events)
  const meals = useStore((s) => s.meals)
  const captures = useStore((s) => s.captures)
  const toggleTask = useStore((s) => s.toggleTask)
  const pushCapture = useStore((s) => s.pushCapture)
  const updateCapture = useStore((s) => s.updateCapture)
  const setInsight = useStore((s) => s.setInsight)
  const insight = useStore((s) => s.insight)
  const bumpAiUsage = useStore((s) => s.bumpAiUsage)

  const [req, setReq] = useState<CaptureRequest | null>(null)
  const [busy, setBusy] = useState(false)
  const today = todayISO()
  const locale = settings.locale

  // ----- quick capture -----
  const submit = (text: string, image?: { b64: string; mime: string }) => {
    const capId = Math.floor(Math.random() * 1e9)
    pushCapture({ id: String(capId), input: text || '📷', ts: Date.now(), status: 'processing', applied: [] })
    setBusy(true)
    setReq({ id: Date.now(), ...(image ? { image } : { text }) })
  }

  // ----- daily insight (one AI call per day, only if there is data) -----
  useEffect(() => {
    if (insight?.date === today) return
    if (!transactions.length && !tasks.length && !meals.length) return
    const usage = bumpAiUsage()
    if (!usage.ok) return
    generateInsight({
      transactions, tasks, events, meals, settings
    })
      .then((text) => text && setInsight(text))
      .catch(() => {
        /* silent — insight is optional */
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today])

  // ----- derived data -----
  const spendToday = useDayExpense(today)
  const kcalToday = useMemo(() => mealsKcal(meals.filter((m) => m.date === today)), [meals, today])
  const macrosToday = useMemo(() => mealsMacros(meals.filter((m) => m.date === today)), [meals, today])
  const openTasks = useMemo(() => {
    const list = tasks
      .filter((x) => !x.done)
      .sort((a, b) => (b.priority - a.priority) || ((a.due ?? '9999') < (b.due ?? '9999') ? -1 : 1))
    const todays = list.filter((x) => !x.due || x.due <= today)
    return { todays: todays.slice(0, 4), left: list.length }
  }, [tasks, today])
  const nextEvents = useMemo(() => {
    return events
      .map((e) => ({ e, d: nextEventDate(e, today) }))
      .filter((x) => x.d)
      .sort((a, b) => (a.d! + (a.e.time || '')).localeCompare(b.d! + (b.e.time || '')))
      .slice(0, 3)
  }, [events, today])
  const weekData = useMemo(() => weekDailyTotals(transactions, today), [transactions, today])
  const weekTotal = weekData.reduce((a, d) => a + d.value, 0)

  const WIDGETS: Record<string, ReactElement | null> = {
    overview: (
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <StatTile
          label={t2('home.spendToday')}
          icon={<Wallet size={13} />}
          value={money(spendToday, settings.currency, locale)}
          onClick={() => go('finance')}
        />
        <StatTile
          label={t2('home.kcalToday')}
          icon={<Flame size={13} />}
          value={`${kcalToday}`}
          sub={`${t2('nut.target')} ${settings.kcalTarget}`}
          onClick={() => go('nutrition')}
        />
        <StatTile
          label={t2('home.tasksLeft')}
          icon={<ListChecks size={13} />}
          value={String(openTasks.left)}
          onClick={() => go('tasks')}
        />
        <StatTile
          label={t2('home.nextEvent')}
          icon={<CalendarClock size={13} />}
          value={nextEvents[0] ? nextEvents[0].e.title : t2('c.none')}
          sub={nextEvents[0] ? `${relativeDay(nextEvents[0].d!, locale, today)}${nextEvents[0].e.time ? ' · ' + nextEvents[0].e.time : ''}` : undefined}
          onClick={() => go('calendar')}
        />
      </div>
    ),
    insight: (
      <button
        onClick={() => {
          if (insight?.date === today) return
          const usage = bumpAiUsage()
          if (!usage.ok) {
            toast(t('ai.limitReached', locale), 'err')
            return
          }
          generateInsight({ transactions, tasks, events, meals, settings })
            .then((text) => text && setInsight(text))
            .catch(() => toast(t('err.ai', locale), 'err'))
        }}
        className="glass lift block w-full p-4 text-left"
      >
        <div className="mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-2 text-[13px] font-bold text-acc2">
            <Sparkles size={14} className="text-acc" />
            {t2('home.insight')}
          </span>
          <RefreshCw size={14} className={insight?.date === today ? 'text-t3' : 'text-acc animate-none'} />
        </div>
        <p className="text-[14px] leading-snug text-t2">
          {insight?.date === today ? insight.text : t2('home.insightEmpty')}
        </p>
      </button>
    ),
    upcoming: (
      <div className="glass overflow-hidden">
        {nextEvents.length === 0 && (
          <EmptyState icon={<CalendarClock size={30} />} title={t2('home.noEvents')} />
        )}
        {nextEvents.map(({ e, d }, i) => (
          <button
            key={e.id}
            onClick={() => go('calendar')}
            className={`flex w-full items-center gap-3 px-4 py-3 text-left ${i > 0 ? 'border-t border-white/6' : ''}`}
          >
            <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-white/6">
              <span className="text-[9px] font-bold uppercase leading-none text-t3">{fmtDate(d!, locale).split(' ')[1]}</span>
              <span className="text-[15px] font-bold leading-tight">{fmtDate(d!, locale).split(' ')[0]}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="clamp1 text-sm font-semibold">{e.title}</div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-t2">
                {e.time && (
                  <span className="flex items-center gap-1">
                    <Clock size={11} /> {e.time}
                  </span>
                )}
                {e.recurrence && <span className="text-acc">{t2(`rec.${e.recurrence}`)}</span>}
              </div>
            </div>
            <ChevronRight size={16} className="shrink-0 text-t3" />
          </button>
        ))}
      </div>
    ),
    tasks: (
      <div className="glass overflow-hidden">
        {openTasks.todays.length === 0 && (
          <EmptyState icon={<ListChecks size={30} />} title={t2('home.noTasks')} />
        )}
        {openTasks.todays.map((task, i) => (
          <div key={task.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-white/6' : ''}`}>
            <button
              aria-label="toggle task"
              onClick={() => {
                haptic('success')
                toggleTask(task.id)
              }}
              className="press flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 border-white/25 hover:border-acc"
            >
              <Check size={13} className="opacity-0" />
            </button>
            <button onClick={() => go('tasks')} className="min-w-0 flex-1 text-left">
              <div className="clamp1 text-sm font-medium">{task.title}</div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-t3">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: task.priority === 3 ? '#FF453A' : task.priority === 2 ? '#FF9F0A' : '#8E8E93' }}
                />
                {t2(`tasks.${task.priority === 3 ? 'high' : task.priority === 2 ? 'normal' : 'low'}`)}
                {task.due && task.due <= today && ` · ${t2('c.today')}`}
              </div>
            </button>
          </div>
        ))}
      </div>
    ),
    weekSpending: (
      <div className="glass p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-[13px] font-bold text-t2">{t2('home.weekSpending')}</span>
          <span className="tabular text-[15px] font-bold">{money(weekTotal, settings.currency, locale)}</span>
        </div>
        <Sparkline values={weekData.map((d) => d.value)} />
      </div>
    ),
    nutrition: (
      <div className="glass flex items-center gap-5 p-4">
        <Ring value={kcalToday / settings.kcalTarget} size={86} stroke={9}>
          <span className="tabular text-[17px] font-bold leading-none">{kcalToday}</span>
          <span className="text-[10px] font-medium text-t3">{t2('nut.target')} {settings.kcalTarget}</span>
        </Ring>
        <div className="min-w-0 flex-1 space-y-2.5">
          <MacroBar label={t2('nut.protein')} value={macrosToday.p} target={Math.round((settings.kcalTarget * 0.3) / 4)} color="#30D158" />
          <MacroBar label={t2('nut.carbs')} value={macrosToday.c} target={Math.round((settings.kcalTarget * 0.4) / 4)} color="#FF9F0A" />
          <MacroBar label={t2('nut.fat')} value={macrosToday.f} target={Math.round((settings.kcalTarget * 0.3) / 9)} color="#64D2FF" />
        </div>
      </div>
    ),
    history:
      captures.length > 0 ? (
        <div className="glass overflow-hidden">
          {captures.slice(0, 3).map((c, i) => (
            <div key={c.id} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-white/6' : ''}`}>
              <History size={14} className="shrink-0 text-t3" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-t2">{c.input}</span>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{
                  background: c.status === 'done' ? 'rgba(48,209,88,0.15)' : c.status === 'error' ? 'rgba(255,69,58,0.15)' : 'rgba(255,255,255,0.07)',
                  color: c.status === 'done' ? '#30D158' : c.status === 'error' ? '#FF453A' : 'var(--color-t3)'
                }}
              >
                {t2(c.status === 'processing' ? 'home.processing' : c.status === 'done' ? 'cap.applied' : c.status === 'error' ? 'err.ai' : 'c.cancel')}
              </span>
            </div>
          ))}
        </div>
      ) : null
  }

  const hour = new Date().getHours()
  return (
    <div className="mx-auto max-w-[640px] md:max-w-none">
      {/* greeting */}
      <div className="mb-5">
        <h1 className="text-xl font-extrabold tracking-tight">
          {greeting(hour, locale)}
          {settings.name ? `, ${settings.name}` : ''}
        </h1>
        <p className="mt-0.5 text-[13px] text-t2 capitalize">{fmtDate(today, locale, 'day')}</p>
      </div>

      {/* quick capture */}
      <CaptureInput big busy={busy} onSubmitText={(text) => submit(text)} onSubmitImage={(b64, mime) => submit('', { b64, mime })} />
      <p className="mt-2 px-1 text-center text-[12px] text-t3">{t2('home.captureHint')}</p>

      {/* widgets */}
      {settings.widgets.map((w, i) =>
        WIDGETS[w] ? (
          <div key={w} className="rise" style={{ animationDelay: `${i * 60}ms` }}>
            {w !== 'overview' && w !== 'insight' && (
              <SectionHeader
                title={
                  w === 'upcoming' ? t2('home.upcoming') :
                  w === 'tasks' ? t2('home.pendingTasks') :
                  w === 'weekSpending' ? t2('home.weekSpending') :
                  w === 'nutrition' ? t2('home.todayNutrition') :
                  t2('home.history')
                }
                action={
                  (w === 'upcoming' || w === 'tasks') && (
                    <button onClick={() => go(w === 'upcoming' ? 'calendar' : 'tasks')} className="text-[13px] font-semibold text-acc">
                      {t2('home.viewAll')}
                    </button>
                  )
                }
              />
            )}
            {WIDGETS[w]}
          </div>
        ) : null
      )}

      <CaptureFlow
        request={req}
        onFinish={(r) => {
          setBusy(false)
          setReq(null)
          const cap = useStore.getState().captures[0]
          if (cap && cap.status === 'processing') {
            updateCapture(cap.id, {
              status: r.ok ? (r.applied.length ? 'done' : 'done') : r.error === 'cancelled' ? 'cancelled' : 'error',
              applied: r.applied
            })
          }
          if (r.ok && r.reply && !r.applied.length) {
            toast(r.reply, 'info')
          }
        }}
      />
    </div>
  )
}
