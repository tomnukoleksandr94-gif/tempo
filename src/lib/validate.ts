import type { AiAction, Currency, MealType, Recurrence } from './types'
import { clamp, hashStr, todayISO } from './utils'

const CURRENCIES: Currency[] = ['EUR', 'USD', 'GBP', 'UAH', 'PLN', 'RUB']
const EXPENSE_CATS = [
  'food', 'groceries', 'transport', 'home', 'health', 'fun', 'clothes', 'education', 'gifts', 'bills', 'other'
]
const INCOME_CATS = ['salary', 'freelance', 'gift', 'invest', 'other']
const RECURRENCES: Recurrence[] = ['daily', 'weekdays', 'weekly', 'monthly']
const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

export function sanitizeStr(s: unknown, max = 200): string {
  if (typeof s !== 'string') return ''
  // strip control chars + trim + cap length
  return s.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max)
}

function safeNum(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  if (!Number.isFinite(n)) return null
  return clamp(n, min, max)
}

function validDate(v: unknown, fallback = todayISO()): string {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number)
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100) return v
  }
  return fallback
}

function validTime(v: unknown): string | null {
  if (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v)) {
    const [h, m] = v.split(':').map(Number)
    if (h <= 23 && m <= 59) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  return null
}

function safeRecurrence(v: unknown): Recurrence | null {
  return RECURRENCES.includes(v as Recurrence) ? (v as Recurrence) : null
}

function catFrom(v: unknown, allowed: string[]): string {
  const s = sanitizeStr(v, 40).toLowerCase()
  return allowed.includes(s) ? s : 'other'
}

function mealTypeGuess(): MealType {
  const h = new Date().getHours()
  if (h < 11) return 'breakfast'
  if (h < 16) return 'lunch'
  if (h < 21) return 'dinner'
  return 'snack'
}

export interface Validated {
  action: AiAction
  hash: string
  issues: string[]
}

/**
 * Validate raw AI actions before anything touches the database.
 * Every field is sanitized, clamped and defaulted — the AI can never
 * write arbitrary or malformed data.
 */
export function validateAiAction(raw: any, defCurrency: Currency): Validated | null {
  if (!raw || typeof raw !== 'object') return null
  const issues: string[] = []

  switch (sanitizeStr(raw.type, 10).toLowerCase()) {
    case 'expense':
    case 'income': {
      const kind = sanitizeStr(raw.type, 10).toLowerCase() as 'expense' | 'income'
      const amount = safeNum(raw.amount, 0.01, 1e8)
      if (amount == null) {
        issues.push('amount')
        break
      }
      const cur = sanitizeStr(raw.currency, 4).toUpperCase()
      const action: AiAction = {
        type: kind,
        amount: Math.round(amount * 100) / 100,
        currency: CURRENCIES.includes(cur as Currency) ? (cur as Currency) : defCurrency,
        category: catFrom(raw.category, kind === 'expense' ? EXPENSE_CATS : INCOME_CATS),
        note: sanitizeStr(raw.note, 120) || undefined,
        date: validDate(raw.date)
      }
      return { action, hash: hashStr(JSON.stringify(action)), issues }
    }
    case 'task': {
      const title = sanitizeStr(raw.title, 140)
      if (!title) return null
      const action: AiAction = {
        type: 'task',
        title,
        note: sanitizeStr(raw.note, 300) || undefined,
        priority: (clamp(Math.round(safeNum(raw.priority, 1, 3) ?? 2), 1, 3) as 1 | 2 | 3),
        due: raw.due ? validDate(raw.due) : null,
        time: validTime(raw.time),
        recurrence: safeRecurrence(raw.recurrence)
      }
      return { action, hash: hashStr(JSON.stringify(action)), issues }
    }
    case 'event': {
      const title = sanitizeStr(raw.title, 140)
      if (!title) return null
      const action: AiAction = {
        type: 'event',
        title,
        date: validDate(raw.date),
        time: validTime(raw.time),
        durationMin: raw.durationMin == null ? null : safeNum(raw.durationMin, 5, 1440),
        remindMin: raw.remindMin == null ? null : safeNum(raw.remindMin, 0, 1440),
        recurrence: safeRecurrence(raw.recurrence),
        location: sanitizeStr(raw.location, 120) || null
      }
      return { action, hash: hashStr(JSON.stringify(action)), issues }
    }
    case 'meal': {
      const title = sanitizeStr(raw.title, 140)
      const rawItems: any[] = Array.isArray(raw.items) ? raw.items.slice(0, 15) : []
      const items = rawItems
        .map((i: any) => ({
          name: sanitizeStr(i?.name, 80),
          kcal: Math.round(safeNum(i?.kcal, 0, 2000) ?? 0),
          p: Math.round(safeNum(i?.p, 0, 300) ?? 0),
          c: Math.round(safeNum(i?.c, 0, 300) ?? 0),
          f: Math.round(safeNum(i?.f, 0, 300) ?? 0)
        }))
        .filter((i) => i.name && i.kcal > 0)
      if (!items.length) {
        issues.push('items')
        break
      }
      const mt = sanitizeStr(raw.mealType, 12).toLowerCase()
      const action: AiAction = {
        type: 'meal',
        title: title || items[0].name,
        mealType: MEAL_TYPES.includes(mt as MealType) ? (mt as MealType) : mealTypeGuess(),
        items,
        note: sanitizeStr(raw.note, 200) || undefined
      }
      return { action, hash: hashStr(JSON.stringify(action)), issues }
    }
    default:
      return null
  }
  // any collected issue means the action is dropped entirely
  return null
}

export function validateAiActions(rawList: any[], defCurrency: Currency): Validated[] {
  const out: Validated[] = []
  const seen = new Set<string>()
  for (const raw of rawList) {
    const v = validateAiAction(raw, defCurrency)
    if (!v || !v.action) continue
    if (seen.has(v.hash)) continue // duplicate within one batch
    seen.add(v.hash)
    out.push(v)
  }
  return out
}
