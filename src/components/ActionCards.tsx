import { X } from 'lucide-react'
import type { AiAction, Currency, Recurrence } from '../lib/types'
import type { Validated } from '../lib/validate'
import { hashStr } from '../lib/utils'
import { useT } from '../lib/hooks'
import { EXPENSE_CATS, INCOME_CATS, CAT_META } from '../lib/categories'
import { Field, Segmented } from './ui'

interface Props {
  items: Validated[]
  onUpdate: (index: number, v: Validated) => void
  onRemove: (index: number) => void
}

const CURRENCIES: Currency[] = ['EUR', 'USD', 'GBP', 'UAH', 'PLN', 'RUB']
const RECURRENCES: Recurrence[] = ['daily', 'weekdays', 'weekly', 'monthly']

export function ActionCards({ items, onUpdate, onRemove }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((v, i) => (
        <ActionCard key={i} item={v} onUpdate={(a) => onUpdate(i, { action: a, hash: hashStr(JSON.stringify(a)), issues: [] })} onRemove={() => onRemove(i)} />
      ))}
    </div>
  )
}

function ActionCard({ item, onUpdate, onRemove }: { item: Validated; onUpdate: (a: AiAction) => void; onRemove: () => void }) {
  const t = useT()
  const a = item.action
  const labelKey =
    a.type === 'expense' ? 'cap.newExpense' : a.type === 'income' ? 'cap.newIncome' : a.type === 'task' ? 'cap.newTask' : a.type === 'event' ? 'cap.newEvent' : 'cap.newMeal'

  return (
    <div className="glass-sm rise p-3.5">
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-full bg-[rgba(142,123,239,0.15)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-acc2">
          {t(labelKey)}
        </span>
        <button onClick={onRemove} aria-label="remove" className="press text-t3 hover:text-red">
          <X size={16} />
        </button>
      </div>

      {a.type === 'expense' || a.type === 'income' ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('fin.amount')}>
            <input
              className="inp tabular"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={a.amount}
              onChange={(e) => onUpdate({ ...a, amount: Math.max(0, Number(e.target.value)) })}
            />
          </Field>
          <Field label={t('f.currency')}>
            <select className="inp" value={a.currency} onChange={(e) => onUpdate({ ...a, currency: e.target.value as Currency })}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label={t('fin.category')}>
            <select className="inp" value={a.category} onChange={(e) => onUpdate({ ...a, category: e.target.value })}>
              {(a.type === 'expense' ? EXPENSE_CATS : INCOME_CATS).map((c) => (
                <option key={c} value={c}>{t(`cat.${c}`)}</option>
              ))}
            </select>
          </Field>
          <Field label={t('fin.date')}>
            <input className="inp" type="date" value={a.date} onChange={(e) => onUpdate({ ...a, date: e.target.value })} />
          </Field>
          <div className="col-span-2">
            <Field label={t('fin.note')}>
              <input className="inp" value={a.note ?? ''} onChange={(e) => onUpdate({ ...a, note: e.target.value })} />
            </Field>
          </div>
        </div>
      ) : a.type === 'task' ? (
        <div className="flex flex-col gap-3">
          <Field label={t('f.name')}>
            <input className="inp" value={a.title} onChange={(e) => onUpdate({ ...a, title: e.target.value })} />
          </Field>
          <Field label={t('tasks.priority')}>
            <Segmented
              value={String(a.priority)}
              onChange={(v) => onUpdate({ ...a, priority: Number(v) as 1 | 2 | 3 })}
              options={[
                { id: '1', label: t('tasks.low') },
                { id: '2', label: t('tasks.normal') },
                { id: '3', label: t('tasks.high') }
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('fin.date')}>
              <input className="inp" type="date" value={a.due ?? ''} onChange={(e) => onUpdate({ ...a, due: e.target.value || null })} />
            </Field>
            <Field label={t('cal.time')}>
              <input className="inp" type="time" value={a.time ?? ''} onChange={(e) => onUpdate({ ...a, time: e.target.value || null })} />
            </Field>
          </div>
          <Field label={t('cal.recurrence')}>
            <select
              className="inp"
              value={a.recurrence ?? ''}
              onChange={(e) => onUpdate({ ...a, recurrence: (e.target.value || null) as Recurrence | null })}
            >
              <option value="">{t('c.none')}</option>
              {RECURRENCES.map((r) => (
                <option key={r} value={r}>{t(`rec.${r}`)}</option>
              ))}
            </select>
          </Field>
        </div>
      ) : a.type === 'event' ? (
        <div className="flex flex-col gap-3">
          <Field label={t('cal.eventTitle')}>
            <input className="inp" value={a.title} onChange={(e) => onUpdate({ ...a, title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('fin.date')}>
              <input className="inp" type="date" value={a.date} onChange={(e) => onUpdate({ ...a, date: e.target.value })} />
            </Field>
            <Field label={t('cal.time')}>
              <input className="inp" type="time" value={a.time ?? ''} onChange={(e) => onUpdate({ ...a, time: e.target.value || null })} />
            </Field>
            <Field label={t('cal.duration')}>
              <input
                className="inp tabular"
                type="number" min="0"
                value={a.durationMin ?? ''}
                onChange={(e) => onUpdate({ ...a, durationMin: e.target.value ? Number(e.target.value) : null })}
              />
            </Field>
            <Field label={t('cal.remind')}>
              <select
                className="inp"
                value={a.remindMin ?? ''}
                onChange={(e) => onUpdate({ ...a, remindMin: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">{t('c.none')}</option>
                {[15, 30, 60, 180, 1440].map((m) => (
                  <option key={m} value={m}>{t('cal.remindBefore', { min: m >= 60 ? `${m / 60} ч` : `${m} мин` })}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={t('cal.recurrence')}>
            <select
              className="inp"
              value={a.recurrence ?? ''}
              onChange={(e) => onUpdate({ ...a, recurrence: (e.target.value || null) as Recurrence | null })}
            >
              <option value="">{t('c.none')}</option>
              {RECURRENCES.map((r) => (
                <option key={r} value={r}>{t(`rec.${r}`)}</option>
              ))}
            </select>
          </Field>
          <Field label={t('cal.location')}>
            <input className="inp" value={a.location ?? ''} onChange={(e) => onUpdate({ ...a, location: e.target.value || null })} />
          </Field>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label={t('f.name')}>
            <input className="inp" value={a.title} onChange={(e) => onUpdate({ ...a, title: e.target.value })} />
          </Field>
          <Field label={t('nut.meals')}>
            <select
              className="inp"
              value={a.mealType}
              onChange={(e) => onUpdate({ ...a, mealType: e.target.value as 'breakfast' | 'lunch' | 'dinner' | 'snack' })}
            >
              {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((m) => (
                <option key={m} value={m}>{t(`meal.${m}`)}</option>
              ))}
            </select>
          </Field>
          <div className="flex flex-col gap-1.5">
            {a.items.map((it, j) => (
              <div key={j} className="flex items-center justify-between rounded-xl bg-white/4 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[13px]">{it.name}</span>
                <span className="tabular shrink-0 text-[13px] font-semibold text-t2">
                  ≈{Math.round(it.kcal)} kcal
                </span>
              </div>
            ))}
            <div className="flex justify-between px-3 pt-1 text-[13px] font-bold">
              <span className="text-t2">{t('c.estimated')} · P {Math.round(a.items.reduce((x, i) => x + i.p, 0))} / C {Math.round(a.items.reduce((x, i) => x + i.c, 0))} / F {Math.round(a.items.reduce((x, i) => x + i.f, 0))}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
