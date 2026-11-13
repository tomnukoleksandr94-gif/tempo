import { useMemo, useState } from 'react'
import { Plus, ChevronLeft, ChevronRight, Clock, Bell, Repeat2, MapPin, Trash2 } from 'lucide-react'
import { SectionHeader, Sheet, Btn, Field, IconBtn, EmptyState, useToast } from '../components/ui'
import { useStore, eventOccursOn } from '../lib/store'
import { useT } from '../lib/hooks'
import { todayISO, fmtDate, relativeDay } from '../lib/utils'
import type { EventItem, Recurrence } from '../lib/types'
import { haptic } from '../lib/telegram'

const RECURRENCES: Recurrence[] = ['daily', 'weekdays', 'weekly', 'monthly']
const REMIND = [15, 30, 60, 180, 1440]

export default function CalendarPage() {
  const t2 = useT()
  const toast = useToast()
  const events = useStore((s) => s.events)
  const addEvent = useStore((s) => s.addEvent)
  const updateEvent = useStore((s) => s.updateEvent)
  const deleteEvent = useStore((s) => s.deleteEvent)
  const locale = useStore((s) => s.settings.locale)

  const today = todayISO()
  const [sel, setSel] = useState(today)
  const [view, setView] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [sheet, setSheet] = useState<null | {
    edit?: EventItem
    title: string
    date: string
    time: string
    duration: string
    remind: string
    recurrence: string
    location: string
  }>(null)

  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-GB', { month: 'long', year: 'numeric' })

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1)
    const start = new Date(first)
    const shift = (first.getDay() + 6) % 7
    start.setDate(start.getDate() - shift)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      return {
        iso: todayISO(d),
        day: d.getDate(),
        inMonth: d.getMonth() === view.m,
        isToday: todayISO(d) === today
      }
    })
  }, [view, today])

  const dayEvents = (iso: string) =>
    events
      .filter((e) => eventOccursOn(e, iso))
      .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'))

  const selEvents = dayEvents(sel)
  const upcomingCount = useMemo(() => {
    const from = today
    return events.filter((e) => e.date >= from).length
  }, [events, today])

  const openAdd = () =>
    setSheet({ title: '', date: sel, time: '', duration: '', remind: '30', recurrence: '', location: '' })
  const openEdit = (e: EventItem) =>
    setSheet({
      edit: e,
      title: e.title,
      date: e.date,
      time: e.time || '',
      duration: e.durationMin ? String(e.durationMin) : '',
      remind: e.remindMin != null ? String(e.remindMin) : '',
      recurrence: e.recurrence || '',
      location: e.location || ''
    })

  const save = () => {
    if (!sheet || !sheet.title.trim()) {
      toast(t2('cal.eventTitle'), 'err')
      return
    }
    const payload = {
      title: sheet.title.trim(),
      date: sheet.date,
      time: sheet.time || undefined,
      durationMin: sheet.duration ? Number(sheet.duration) : undefined,
      remindMin: sheet.remind ? Number(sheet.remind) : null,
      recurrence: (sheet.recurrence || null) as Recurrence | null,
      location: sheet.location.trim() || undefined
    }
    if (sheet.edit) {
      updateEvent(sheet.edit.id, payload)
      toast(t2('c.done'), 'ok')
    } else {
      addEvent(payload)
      haptic('success')
      toast(t2('cap.applied'), 'ok')
    }
    setSheet(null)
  }

  const weekdays = useMemo(() => {
    const base = new Date(2024, 0, 1) // monday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base)
      d.setDate(d.getDate() + i)
      return d.toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-GB', { weekday: 'short' }).replace('.', '')
    })
  }, [locale])

  return (
    <div className="mx-auto max-w-[640px] md:max-w-none">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-extrabold">{t2('cal.title')}</h1>
        <div className="flex gap-2">
          {sel !== today && (
            <Btn variant="ghost" size="sm" onClick={() => { setSel(today); const d = new Date(); setView({ y: d.getFullYear(), m: d.getMonth() }) }}>
              {t2('cal.todayBtn')}
            </Btn>
          )}
          <IconBtn label="add event" onClick={openAdd}>
            <Plus size={18} />
          </IconBtn>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <IconBtn label="prev month" onClick={() => setView(view.m === 0 ? { y: view.y - 1, m: 11 } : { y: view.y, m: view.m - 1 })}>
          <ChevronLeft size={17} />
        </IconBtn>
        <span className="text-[15px] font-bold capitalize">{monthLabel}</span>
        <IconBtn label="next month" onClick={() => setView(view.m === 11 ? { y: view.y + 1, m: 0 } : { y: view.y, m: view.m + 1 })}>
          <ChevronRight size={17} />
        </IconBtn>
      </div>

      {/* month grid */}
      <div className="glass p-3">
        <div className="mb-1 grid grid-cols-7 gap-1">
          {weekdays.map((w, i) => (
            <div key={i} className="text-center text-[11px] font-semibold text-t3 capitalize">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c) => {
            const evs = dayEvents(c.iso)
            const isSel = c.iso === sel
            return (
              <button
                key={c.iso}
                onClick={() => {
                  haptic('select')
                  setSel(c.iso)
                }}
                className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl text-[14px] font-semibold transition-colors ${
                  isSel ? 'bg-acc text-black' : c.inMonth ? 'text-t1 hover:bg-soft' : 'text-t3/40'
                } ${c.isToday && !isSel ? 'text-acc' : ''}`}
              >
                {c.day}
                <span className="flex h-1 gap-[2px]">
                  {evs.slice(0, 3).map((e, i) => (
                    <span key={e.id} className="w-1 rounded-full" style={{ background: isSel ? '#000' : '#8E7BEF' }} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* agenda */}
      <SectionHeader
        title={
          <span className="capitalize">
            {relativeDay(sel, locale, today)} · {fmtDate(sel, locale, 'long')}
          </span>
        }
      />
      <div className="glass divide-y divide-white/6 overflow-hidden">
        {selEvents.length === 0 && (
          <EmptyState
            icon={<CalendarIcon />}
            title={t2('cal.noEventsDay')}
            action={<Btn size="sm" onClick={openAdd}>{t2('cal.addEvent')}</Btn>}
          />
        )}
        {selEvents.map((e) => (
          <button key={e.id} onClick={() => openEdit(e)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
            <div className="tabular flex h-11 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-soft">
              {e.time ? (
                <>
                  <span className="text-[13px] font-bold leading-none">{e.time}</span>
                  <span className="mt-0.5 text-[9px] font-medium text-t3">{e.durationMin ? `${e.durationMin}m` : ''}</span>
                </>
              ) : (
                <span className="text-[10px] font-semibold text-t3">{t2('c.all')}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="clamp1 text-sm font-semibold">{e.title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-t3">
                {e.remindMin != null && (
                  <span className="flex items-center gap-1">
                    <Bell size={11} /> {t2('cal.remindBefore', { min: e.remindMin >= 60 ? `${e.remindMin / 60} ч` : `${e.remindMin} мин` })}
                  </span>
                )}
                {e.recurrence && (
                  <span className="flex items-center gap-1 text-acc">
                    <Repeat2 size={11} /> {t2(`rec.${e.recurrence}`)}
                  </span>
                )}
                {e.location && (
                  <span className="flex items-center gap-1">
                    <MapPin size={11} /> {e.location}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* add / edit event */}
      <Sheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        title={sheet?.edit ? t2('c.edit') : t2('cal.addEvent')}
        footer={
          <div className="flex gap-2.5">
            {sheet?.edit && (
              <Btn
                variant="danger"
                onClick={() => {
                  deleteEvent(sheet.edit!.id)
                  toast(t2('c.done'), 'ok')
                  setSheet(null)
                }}
              >
                <Trash2 size={15} />
              </Btn>
            )}
            <Btn className="flex-1" onClick={save}>{t2('c.save')}</Btn>
          </div>
        }
      >
        {sheet && (
          <div className="flex flex-col gap-3.5">
            <Field label={t2('cal.eventTitle')}>
              <input className="inp" autoFocus value={sheet.title} onChange={(e) => setSheet({ ...sheet, title: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t2('fin.date')}>
                <input className="inp" type="date" value={sheet.date} onChange={(e) => setSheet({ ...sheet, date: e.target.value })} />
              </Field>
              <Field label={t2('cal.time')}>
                <input className="inp" type="time" value={sheet.time} onChange={(e) => setSheet({ ...sheet, time: e.target.value })} />
              </Field>
              <Field label={t2('cal.duration')}>
                <input className="inp tabular" inputMode="numeric" placeholder="60" value={sheet.duration} onChange={(e) => setSheet({ ...sheet, duration: e.target.value })} />
              </Field>
              <Field label={t2('cal.remind')}>
                <select className="inp" value={sheet.remind} onChange={(e) => setSheet({ ...sheet, remind: e.target.value })}>
                  <option value="">{t2('c.none')}</option>
                  {REMIND.map((m) => (
                    <option key={m} value={m}>{t2('cal.remindBefore', { min: m >= 60 ? `${m / 60} ч` : `${m} мин` })}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label={t2('cal.recurrence')}>
              <select className="inp" value={sheet.recurrence} onChange={(e) => setSheet({ ...sheet, recurrence: e.target.value })}>
                <option value="">{t2('c.none')}</option>
                {RECURRENCES.map((r) => (
                  <option key={r} value={r}>{t2(`rec.${r}`)}</option>
                ))}
              </select>
            </Field>
            <Field label={t2('cal.location')}>
              <input className="inp" value={sheet.location} onChange={(e) => setSheet({ ...sheet, location: e.target.value })} />
            </Field>
          </div>
        )}
      </Sheet>
    </div>
  )
}

function CalendarIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-t3">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  )
}
