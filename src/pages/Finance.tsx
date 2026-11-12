import { useMemo, useState } from 'react'
import {
  Plus, ChevronLeft, ChevronRight, Search, Trash2, Repeat2
} from 'lucide-react'
import { SectionHeader, StatTile, Segmented, Sheet, Btn, Field, Chip, EmptyState, useToast, IconBtn } from '../components/ui'
import { Donut, Bars } from '../components/charts'
import { useStore, expensesByCategory } from '../lib/store'
import { useT } from '../lib/hooks'
import { CAT_META, EXPENSE_CATS, INCOME_CATS, DONUT_COLORS } from '../lib/categories'
import { money, todayISO, fmtDate, relativeDay, parseAmount } from '../lib/utils'
import type { Currency, Transaction } from '../lib/types'
import { haptic } from '../lib/telegram'

export default function Finance() {
  const t2 = useT()
  const toast = useToast()
  const settings = useStore((s) => s.settings)
  const transactions = useStore((s) => s.transactions)
  const budgets = useStore((s) => s.budgets)
  const addTransaction = useStore((s) => s.addTransaction)
  const updateTransaction = useStore((s) => s.updateTransaction)
  const deleteTransaction = useStore((s) => s.deleteTransaction)
  const setBudget = useStore((s) => s.setBudget)

  const locale = settings.locale
  const today = todayISO()
  const [monthOffset, setMonthOffset] = useState(0)
  const [period, setPeriod] = useState<'week' | 'month'>('month')
  const [query, setQuery] = useState('')
  const [catFilter, setCatFilter] = useState<string | null>(null)

  // month being viewed
  const viewDate = useMemo(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + monthOffset)
    return d
  }, [monthOffset])
  const monthLabel = viewDate.toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-GB', { month: 'long', year: 'numeric' })
  const mk = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`

  const monthTx = useMemo(() => transactions.filter((x) => x.date.startsWith(mk)), [transactions, mk])
  const exp = monthTx.filter((x) => x.kind === 'expense').reduce((a, x) => a + x.amount, 0)
  const inc = monthTx.filter((x) => x.kind === 'income').reduce((a, x) => a + x.amount, 0)

  // charts period
  const from = period === 'week' ? todayISO(new Date(Date.now() - 6 * 86400000)) : `${mk}-01`
  const to = period === 'week' ? today : `${mk}-31`
  const byCat = useMemo(() => expensesByCategory(transactions, from, to), [transactions, from, to])
  const days = useMemo(() => {
    const n = period === 'week' ? 7 : 30
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(Date.now() - (n - 1 - i) * 86400000)
      const iso = todayISO(d)
      return {
        label: d.toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-GB', period === 'week' ? { weekday: 'short' } : { day: 'numeric' }),
        value: Math.round(
          transactions.filter((x) => x.kind === 'expense' && x.date === iso).reduce((a, x) => a + x.amount, 0)
        )
      }
    })
  }, [transactions, period, locale])

  // budgets for viewed month
  const budgetRows = useMemo(() => {
    const spentByCat = new Map<string, number>()
    for (const x of monthTx) if (x.kind === 'expense') spentByCat.set(x.category, (spentByCat.get(x.category) || 0) + x.amount)
    const cats = new Set([...Object.keys(budgets), ...spentByCat.keys()])
    const list = EXPENSE_CATS.filter((c) => cats.has(c))
    if (!list.length) return EXPENSE_CATS.slice(0, 4).map((c) => ({ cat: c, spent: 0, budget: 0 }))
    return list.map((c) => ({ cat: c, spent: spentByCat.get(c) || 0, budget: budgets[c] || 0 }))
  }, [monthTx, budgets])

  // transactions list
  const filtered = useMemo(() => {
    let list = [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    if (catFilter) list = list.filter((x) => x.category === catFilter)
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((x) => (x.note || '').toLowerCase().includes(q) || x.category.includes(q) || String(x.amount).includes(q))
    }
    return list.slice(0, 120)
  }, [transactions, catFilter, query])

  const grouped = useMemo(() => {
    const g = new Map<string, Transaction[]>()
    for (const x of filtered) {
      if (!g.has(x.date)) g.set(x.date, [])
      g.get(x.date)!.push(x)
    }
    return [...g.entries()]
  }, [filtered])

  // add / edit sheet
  const [sheet, setSheet] = useState<null | { edit?: Transaction; kind: 'expense' | 'income'; amount: string; currency: Currency; category: string; note: string; date: string }>(null)
  const openAdd = () =>
    setSheet({ kind: 'expense', amount: '', currency: settings.currency, category: 'food', note: '', date: today })
  const openEdit = (x: Transaction) =>
    setSheet({ edit: x, kind: x.kind, amount: String(x.amount), currency: x.currency, category: x.category, note: x.note || '', date: x.date })

  const saveTx = () => {
    if (!sheet) return
    const amount = parseAmount(sheet.amount)
    if (amount == null || amount <= 0) {
      toast(t2('err.invalidAmount'), 'err')
      return
    }
    const payload = {
      kind: sheet.kind,
      amount,
      currency: sheet.currency,
      category: sheet.category,
      note: sheet.note.trim() || undefined,
      date: sheet.date
    }
    if (sheet.edit) {
      updateTransaction(sheet.edit.id, payload)
      toast(t2('c.done'), 'ok')
    } else {
      addTransaction({ ...payload, source: 'manual' })
      haptic('success')
      toast(t2('cap.applied'), 'ok')
    }
    setSheet(null)
  }

  const [budgetCat, setBudgetCat] = useState<string | null>(null)
  const budgetCatSpent = budgetCat
    ? monthTx.filter((x) => x.kind === 'expense' && x.category === budgetCat).reduce((a, x) => a + x.amount, 0)
    : 0

  return (
    <div className="mx-auto max-w-[640px] md:max-w-none">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-extrabold">{t2('fin.title')}</h1>
        <IconBtn label="add" onClick={openAdd}>
          <Plus size={18} />
        </IconBtn>
      </div>

      {/* month nav */}
      <div className="mb-3 flex items-center justify-between">
        <IconBtn label="prev month" onClick={() => setMonthOffset(monthOffset - 1)}>
          <ChevronLeft size={17} />
        </IconBtn>
        <span className="text-[15px] font-bold capitalize">{monthLabel}</span>
        <IconBtn label="next month" onClick={() => setMonthOffset(Math.min(0, monthOffset + 1))}>
          <ChevronRight size={17} />
        </IconBtn>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <StatTile label={t2('fin.balance')} value={money(inc - exp, settings.currency, locale, true)} />
        <StatTile label={t2('fin.income')} value={money(inc, settings.currency, locale)} />
        <StatTile label={t2('fin.expense')} value={money(exp, settings.currency, locale)} />
      </div>

      <SectionHeader
        title={t2('fin.byCategory')}
        action={
          <div className="w-[150px]">
            <Segmented
              value={period}
              onChange={(v) => setPeriod(v)}
              options={[
                { id: 'week', label: t2('c.week') },
                { id: 'month', label: t2('c.month') }
              ]}
            />
          </div>
        }
      />
      <div className="glass flex items-center gap-5 p-4">
        <Donut
          size={132}
          stroke={17}
          segments={byCat.slice(0, 8).map((c, i) => ({ value: c.value, color: DONUT_COLORS[i % DONUT_COLORS.length] }))}
        >
          <span className="tabular text-[15px] font-bold">
            {money(byCat.reduce((a, c) => a + c.value, 0), settings.currency, locale)}
          </span>
          <span className="text-[10px] text-t3">{t2(period === 'week' ? 'c.week' : 'c.month')}</span>
        </Donut>
        <div className="min-w-0 flex-1 space-y-2">
          {byCat.length === 0 && <EmptyState title={t2('fin.noTransactions')} />}
          {byCat.slice(0, 6).map((c, i) => {
            const meta = CAT_META[c.category] ?? CAT_META.other
            const total = byCat.reduce((a, x) => a + x.value, 0)
            return (
              <div key={c.category} className="flex items-center gap-2.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-t2">{t2(`cat.${c.category}`)}</span>
                <span className="tabular shrink-0 text-[13px] font-semibold">
                  {money(c.value, settings.currency, locale)}
                </span>
                <span className="tabular w-9 shrink-0 text-right text-[11px] text-t3">
                  {Math.round((c.value / total) * 100)}%
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <SectionHeader title={t2('fin.lastDays')} />
      <div className="glass p-4">
        <Bars data={days} height={120} highlightLast={period === 'week'} formatValue={(v) => money(v, settings.currency, locale)} />
      </div>

      <SectionHeader title={t2('fin.budgets')} />
      <div className="glass divide-y divide-white/6 overflow-hidden">
        {budgetRows.map((r) => {
          const meta = CAT_META[r.cat] ?? CAT_META.other
          const pct = r.budget > 0 ? Math.min(100, Math.round((r.spent / r.budget) * 100)) : 0
          const over = r.budget > 0 && r.spent > r.budget
          return (
            <button key={r.cat} onClick={() => setBudgetCat(r.cat)} className="block w-full px-4 py-3 text-left">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                <span className="flex-1 text-[13px] font-semibold">{t2(`cat.${r.cat}`)}</span>
                <span className="tabular text-[13px] text-t2">
                  {money(r.spent, settings.currency, locale)}
                  {r.budget > 0 && <span className="text-t3"> / {money(r.budget, settings.currency, locale)}</span>}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${r.budget > 0 ? pct : Math.min(100, r.spent / 10)}%`, background: over ? '#FF453A' : meta.color }}
                />
              </div>
            </button>
          )
        })}
      </div>

      <SectionHeader
        title={t2('fin.transactions')}
        action={
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-t3" />
            <input
              className="inp h-9 w-[170px] !rounded-full !py-1.5 pl-8 text-[13px]"
              placeholder={t2('fin.searchPh')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        }
      />
      <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto pb-0.5">
        <Chip active={!catFilter} onClick={() => setCatFilter(null)}>{t2('c.all')}</Chip>
        {[...new Set(transactions.map((x) => x.category))].slice(0, 8).map((c) => (
          <Chip key={c} active={catFilter === c} color={CAT_META[c]?.color} onClick={() => setCatFilter(catFilter === c ? null : c)}>
            {t2(`cat.${c}`)}
          </Chip>
        ))}
      </div>

      {grouped.length === 0 && (
        <div className="glass">
          <EmptyState title={t2('fin.noTransactions')} />
        </div>
      )}
      {grouped.map(([date, list]) => (
        <div key={date} className="mb-3">
          <div className="mb-1.5 px-1 text-[12px] font-semibold text-t3 capitalize">
            {relativeDay(date, locale, today)} · {fmtDate(date, locale)}
          </div>
          <div className="glass divide-y divide-white/6 overflow-hidden">
            {list.map((x) => {
              const meta = CAT_META[x.category] ?? CAT_META.other
              const Icon = meta.icon
              return (
                <button key={x.id} onClick={() => openEdit(x)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/6" style={{ color: meta.color }}>
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="clamp1 block text-sm font-medium">{x.note || t2(`cat.${x.category}`)}</span>
                    <span className="mt-0.5 block text-[11px] text-t3">
                      {t2(`cat.${x.category}`)}
                      {x.source === 'ai' && ' · AI'}
                    </span>
                  </span>
                  <span
                    className="tabular shrink-0 text-[15px] font-bold"
                    style={{ color: x.kind === 'expense' ? '#FF6B6B' : '#30D158' }}
                  >
                    {x.kind === 'expense' ? '−' : '+'}
                    {money(x.amount, x.currency, locale)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* add / edit transaction */}
      <Sheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        title={sheet?.edit ? t2('c.edit') : t2('fin.addTx')}
        footer={
          <div className="flex gap-2.5">
            {sheet?.edit && (
              <Btn
                variant="danger"
                onClick={() => {
                  deleteTransaction(sheet.edit!.id)
                  toast(t2('c.done'), 'ok')
                  setSheet(null)
                }}
              >
                <Trash2 size={15} />
              </Btn>
            )}
            <Btn className="flex-1" onClick={saveTx}>
              {t2('c.save')}
            </Btn>
          </div>
        }
      >
        {sheet && (
          <div className="flex flex-col gap-3.5">
            <Segmented
              value={sheet.kind}
              onChange={(v) => setSheet({ ...sheet, kind: v, category: v === 'expense' ? 'food' : 'salary' })}
              options={[
                { id: 'expense', label: t2('fin.expense') },
                { id: 'income', label: t2('fin.income') }
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t2('fin.amount')}>
                <input
                  className="inp tabular"
                  inputMode="decimal"
                  placeholder="0"
                  value={sheet.amount}
                  onChange={(e) => setSheet({ ...sheet, amount: e.target.value })}
                />
              </Field>
              <Field label="Currency">
                <select className="inp" value={sheet.currency} onChange={(e) => setSheet({ ...sheet, currency: e.target.value as Currency })}>
                  {(['EUR', 'USD', 'GBP', 'UAH', 'PLN', 'RUB'] as Currency[]).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label={t2('fin.category')}>
              <select className="inp" value={sheet.category} onChange={(e) => setSheet({ ...sheet, category: e.target.value })}>
                {(sheet.kind === 'expense' ? EXPENSE_CATS : INCOME_CATS).map((c) => (
                  <option key={c} value={c}>{t2(`cat.${c}`)}</option>
                ))}
              </select>
            </Field>
            <Field label={t2('fin.date')}>
              <input className="inp" type="date" value={sheet.date} onChange={(e) => setSheet({ ...sheet, date: e.target.value })} />
            </Field>
            <Field label={t2('fin.note')}>
              <input className="inp" value={sheet.note} onChange={(e) => setSheet({ ...sheet, note: e.target.value })} />
            </Field>
          </div>
        )}
      </Sheet>

      {/* budget editor */}
      <Sheet
        open={!!budgetCat}
        onClose={() => setBudgetCat(null)}
        title={budgetCat ? `${t2('fin.budgetEdit')} — ${t2(`cat.${budgetCat}`)}` : ''}
        footer={
          <Btn
            className="w-full"
            onClick={() => {
              if (!budgetCat) return
              const input = document.getElementById('budget-input') as HTMLInputElement
              const v = parseAmount(input?.value || '') ?? 0
              setBudget(budgetCat, Math.max(0, Math.round(v)))
              toast(t2('c.done'), 'ok')
              setBudgetCat(null)
            }}
          >
            {t2('c.save')}
          </Btn>
        }
      >
        {budgetCat && (
          <div className="flex flex-col gap-4">
            <div className="glass-sm p-3 text-[13px] text-t2">
              {t2('fin.spent')}: <b className="text-t1">{money(budgetCatSpent, settings.currency, locale)}</b>
            </div>
            <Field label={t2('fin.budgetEdit')}>
              <input id="budget-input" className="inp tabular" inputMode="decimal" defaultValue={budgets[budgetCat] || ''} placeholder={t2('fin.noBudget')} />
            </Field>
          </div>
        )}
      </Sheet>
    </div>
  )
}
