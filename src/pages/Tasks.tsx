import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { Plus, Check, Repeat2, Clock, Trash2, ChevronDown } from 'lucide-react'
import { SectionHeader, Sheet, Btn, Field, Segmented, IconBtn, EmptyState, useToast } from '../components/ui'
import { useStore, nextTaskDue } from '../lib/store'
import { useT } from '../lib/hooks'
import { todayISO, relativeDay, addDays } from '../lib/utils'
import type { Priority, Recurrence, Task } from '../lib/types'
import { haptic } from '../lib/telegram'

const RECURRENCES: Recurrence[] = ['daily', 'weekdays', 'weekly', 'monthly']

export default function TasksPage() {
  const t2 = useT()
  const toast = useToast()
  const tasks = useStore((s) => s.tasks)
  const addTask = useStore((s) => s.addTask)
  const toggleTask = useStore((s) => s.toggleTask)
  const updateTask = useStore((s) => s.updateTask)
  const deleteTask = useStore((s) => s.deleteTask)
  const locale = useStore((s) => s.settings.locale)

  const today = todayISO()
  const [quick, setQuick] = useState('')
  const [sheet, setSheet] = useState<null | {
    edit?: Task
    title: string
    priority: Priority
    due: string
    time: string
    recurrence: string
  }>(null)
  const [showDone, setShowDone] = useState(false)

  const groups = useMemo(() => {
    const open = tasks.filter((x) => !x.done)
    const effDue = (x: Task) => (x.recurrence && x.due ? nextTaskDue(x, today) ?? x.due : x.due)
    const overdue = open.filter((x) => effDue(x) && effDue(x)! < today)
    const todays = open.filter((x) => effDue(x) === today || (!effDue(x) && false))
    const noDue = open.filter((x) => !effDue(x))
    const upcoming = open
      .filter((x) => effDue(x) && effDue(x)! > today)
      .sort((a, b) => effDue(a)!.localeCompare(effDue(b)!))
    const done = tasks.filter((x) => x.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0))
    return { overdue, todays, noDue, upcoming, done }
  }, [tasks, today])

  const quickAdd = () => {
    const title = quick.trim()
    if (!title) return
    addTask({ title, priority: 2, due: undefined, time: undefined, recurrence: null })
    haptic('success')
    setQuick('')
  }

  const openAdd = () => setSheet({ title: '', priority: 2, due: '', time: '', recurrence: '' })
  const openEdit = (x: Task) =>
    setSheet({ edit: x, title: x.title, priority: x.priority, due: x.due || '', time: x.time || '', recurrence: x.recurrence || '' })

  const save = () => {
    if (!sheet || !sheet.title.trim()) return
    const payload = {
      title: sheet.title.trim(),
      priority: sheet.priority,
      due: sheet.due || undefined,
      time: sheet.time || undefined,
      recurrence: (sheet.recurrence || null) as Recurrence | null
    }
    if (sheet.edit) {
      updateTask(sheet.edit.id, payload)
      toast(t2('c.done'), 'ok')
    } else {
      addTask(payload)
      haptic('success')
    }
    setSheet(null)
  }

  const Row = ({ x, dim }: { x: Task; dim?: boolean }) => (
    <div className="flex items-center gap-3 px-4 py-3">
      <button
        aria-label="toggle"
        onClick={() => {
          haptic('success')
          toggleTask(x.id)
        }}
        className={`press flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full border-2 ${
          x.done ? 'check-pop border-acc bg-acc' : 'bd-soft2 hover:border-acc'
        }`}
      >
        {x.done && <Check size={14} className="text-black" strokeWidth={3} />}
      </button>
      <button onClick={() => openEdit(x)} className="min-w-0 flex-1 text-left">
        <div className={`clamp1 text-sm font-medium ${x.done ? 'strike' : ''}`}>{x.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-t3">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: x.priority === 3 ? '#FF453A' : x.priority === 2 ? '#FF9F0A' : '#8E8E93' }}
          />
          {t2(`tasks.${x.priority === 3 ? 'high' : x.priority === 2 ? 'normal' : 'low'}`)}
          {x.due && (
            <span className={dim ? '' : 'text-orange'}>
              {relativeDay(x.due, locale, today)}
              {x.time ? ` ${x.time}` : ''}
            </span>
          )}
          {x.recurrence && (
            <span className="flex items-center gap-1 text-acc">
              <Repeat2 size={11} /> {t2(`rec.${x.recurrence}`)}
            </span>
          )}
        </div>
      </button>
    </div>
  )

  return (
    <div className="mx-auto max-w-[640px] md:max-w-none">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-extrabold">{t2('tasks.title')}</h1>
        <IconBtn label="add task" onClick={openAdd}>
          <Plus size={18} />
        </IconBtn>
      </div>

      {/* quick add */}
      <div className="glass mb-2 flex items-center gap-2 p-1.5">
        <input
          className="h-9 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-t3"
          placeholder={t2('tasks.quickPh')}
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
          maxLength={140}
        />
        <button
          onClick={quickAdd}
          disabled={!quick.trim()}
          className={`press flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${quick.trim() ? 'bg-acc text-black' : 'bg-soft2 text-t3'}`}
        >
          <Plus size={17} strokeWidth={2.5} />
        </button>
      </div>

      {tasks.length === 0 && (
        <div className="glass">
          <EmptyState title={t2('tasks.noTasks')} action={<Btn size="sm" onClick={openAdd}>{t2('tasks.addTask')}</Btn>} />
        </div>
      )}

      {groups.overdue.length > 0 && (
        <>
          <SectionHeader title={<span className="text-red">{t2('tasks.overdue')} · {groups.overdue.length}</span>} />
          <div className="glass overflow-hidden">
            <TaskList list={groups.overdue} row={Row} />
          </div>
        </>
      )}

      {(groups.todays.length > 0 || groups.noDue.length > 0) && (
        <>
          <SectionHeader title={t2('tasks.today')} />
          <div className="glass overflow-hidden">
            <TaskList list={[...groups.todays, ...groups.noDue]} row={Row} />
          </div>
        </>
      )}

      {groups.upcoming.length > 0 && (
        <>
          <SectionHeader title={t2('tasks.upcoming')} />
          <div className="glass overflow-hidden">
            <TaskList list={groups.upcoming} row={Row} />
          </div>
        </>
      )}

      {groups.done.length > 0 && (
        <>
          <button onClick={() => setShowDone(!showDone)} className="mt-6 flex w-full items-center justify-between">
            <span className="text-[15px] font-bold text-t2">
              {t2('tasks.completed')} · {groups.done.length}
            </span>
            <ChevronDown size={16} className={`text-t3 transition-transform ${showDone ? 'rotate-180' : ''}`} />
          </button>
          {showDone && (
            <div className="glass mt-2 overflow-hidden">
              <TaskList list={groups.done.slice(0, 15)} row={Row} />
            </div>
          )}
        </>
      )}

      {/* add / edit sheet */}
      <Sheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        title={sheet?.edit ? t2('c.edit') : t2('tasks.addTask')}
        footer={
          <div className="flex gap-2.5">
            {sheet?.edit && (
              <Btn
                variant="danger"
                onClick={() => {
                  deleteTask(sheet.edit!.id)
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
            <Field label="Title">
              <input className="inp" autoFocus value={sheet.title} onChange={(e) => setSheet({ ...sheet, title: e.target.value })} />
            </Field>
            <Field label={t2('tasks.priority')}>
              <Segmented
                value={String(sheet.priority)}
                onChange={(v) => setSheet({ ...sheet, priority: Number(v) as Priority })}
                options={[
                  { id: '1', label: t2('tasks.low') },
                  { id: '2', label: t2('tasks.normal') },
                  { id: '3', label: t2('tasks.high') }
                ]}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t2('fin.date')}>
                <input className="inp" type="date" value={sheet.due} onChange={(e) => setSheet({ ...sheet, due: e.target.value })} />
              </Field>
              <Field label={t2('cal.time')}>
                <input className="inp" type="time" value={sheet.time} onChange={(e) => setSheet({ ...sheet, time: e.target.value })} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { d: today, label: t2('c.today') },
                { d: addDays(today, 1), label: t2('c.tomorrow') },
                { d: '', label: t2('c.none') }
              ].map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setSheet({ ...sheet, due: opt.d })}
                  className={`press rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                    sheet.due === opt.d ? 'border-acc bg-accent-soft text-acc2' : 'bd-soft bg-soft text-t2'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Field label={t2('cal.recurrence')}>
              <select className="inp" value={sheet.recurrence} onChange={(e) => setSheet({ ...sheet, recurrence: e.target.value })}>
                <option value="">{t2('c.none')}</option>
                {RECURRENCES.map((r) => (
                  <option key={r} value={r}>{t2(`rec.${r}`)}</option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </Sheet>
    </div>
  )
}

function TaskList({ list, row }: { list: Task[]; row: (props: { x: Task; dim?: boolean }) => ReactElement }) {
  return (
    <>
      {list.map((x, i) => (
        <div key={x.id} className={i > 0 ? 'border-t bd-soft' : ''}>
          {row({ x })}
        </div>
      ))}
    </>
  )
}
