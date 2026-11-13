import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type {
  AiAction, CaptureRecord, ChatMessage, Currency, CustomFood, EventItem, Meal,
  Settings, Subscription, Task, Transaction, ReferralStats, Plan
} from './types'
import { uid, todayISO, addDays, parseISODate, monthKey, startOfWeekISO } from './utils'
import { localStore, cloudStore, storageAvailable } from './storage'
import type { Validated } from './validate'
import { aiLimitFor } from './billing'
import type { PlanningTab } from '../pages/Planning'

export type { Plan }

export const DATA_KEY = 'tempo-data-v1'

export const DEFAULT_WIDGETS = ['overview', 'insight', 'upcoming', 'tasks', 'weekSpending', 'nutrition', 'history']

const initialSettings: Settings = {
  name: '',
  locale: 'ru',
  currency: 'EUR',
  model: 'gemini-3.5-flash-lite',
  apiKey: '',
  kcalTarget: 2200,
  widgets: DEFAULT_WIDGETS,
  autoConfirm: false,
  theme: 'dark'
}

/** Free until a payment is verified server-side. Never set locally. */
export const freeSubscription = (): Subscription => ({
  plan: 'free',
  period: null,
  expiresAt: null,
  status: 'none',
  autoRenew: false,
  history: []
})

interface AppData {
  version: 1
  updatedAt: number
  settings: Settings
  subscription: Subscription
  referralCode: string
  referral: ReferralStats
  planningTab: PlanningTab
  transactions: Transaction[]
  tasks: Task[]
  events: EventItem[]
  meals: Meal[]
  foods: CustomFood[]
  budgets: Record<string, number>
  aiUsage: { date: string; count: number }
  insight: { date: string; text: string } | null
  chat: ChatMessage[]
  captures: CaptureRecord[]
}

const initialData = (): AppData => ({
  version: 1,
  updatedAt: Date.now(),
  settings: { ...initialSettings },
  subscription: freeSubscription(),
  referralCode: uid().slice(0, 8),
  referral: { invited: 0, paying: 0, claimed: [] },
  planningTab: 'calendar',
  transactions: [],
  tasks: [],
  events: [],
  meals: [],
  foods: [],
  budgets: {},
  aiUsage: { date: todayISO(), count: 0 },
  insight: null,
  chat: [],
  captures: []
})

// ---------- dedupe registry (5 minutes) ----------
const recentHashes = new Map<string, number>()
const DEDUPE_MS = 5 * 60 * 1000
function isDuplicate(hash: string): boolean {
  const now = Date.now()
  for (const [h, ts] of recentHashes) if (now - ts > DEDUPE_MS) recentHashes.delete(h)
  return recentHashes.has(hash)
}

// ---------- recurring helpers ----------
export function eventOccursOn(e: EventItem, date: string): boolean {
  if (e.date > date) return false
  if (!e.recurrence) return e.date === date
  const diff = Math.round((parseISODate(date).getTime() - parseISODate(e.date).getTime()) / 86400000)
  if (diff < 0) return false
  switch (e.recurrence) {
    case 'daily':
      return true
    case 'weekdays': {
      const dow = parseISODate(date).getDay()
      return dow >= 1 && dow <= 5
    }
    case 'weekly':
      return diff % 7 === 0
    case 'monthly': {
      const a = parseISODate(e.date)
      const b = parseISODate(date)
      return b.getDate() === a.getDate()
    }
  }
}

/** next occurrence date of an event (recurrence-aware), or null if in the past */
export function nextEventDate(e: EventItem, from: string): string | null {
  if (e.date >= from) return e.date
  if (!e.recurrence) return null
  let d = from
  for (let i = 0; i < 400; i++) {
    if (eventOccursOn(e, d)) return d
    d = addDays(d, 1)
  }
  return null
}

export function nextTaskDue(task: Task, from: string): string | undefined {
  if (!task.recurrence || !task.due) return task.due
  let d = task.due
  let guard = 0
  while (d < from && guard++ < 400) {
    switch (task.recurrence) {
      case 'daily':
        d = addDays(d, 1)
        break
      case 'weekdays': {
        do {
          d = addDays(d, 1)
        } while ([0, 6].includes(parseISODate(d).getDay()))
        break
      }
      case 'weekly':
        d = addDays(d, 7)
        break
      case 'monthly': {
        const dt = parseISODate(d)
        dt.setMonth(dt.getMonth() + 1)
        d = todayISO(dt)
        break
      }
    }
  }
  return d
}

interface Store extends AppData {
  setSettings(patch: Partial<Settings>): void
  // finance
  addTransaction(input: Omit<Transaction, 'id' | 'createdAt'>): Transaction
  updateTransaction(id: string, patch: Partial<Transaction>): void
  deleteTransaction(id: string): void
  setBudget(cat: string, amount: number): void
  // tasks
  addTask(input: Omit<Task, 'id' | 'createdAt' | 'done'>): Task
  toggleTask(id: string): void
  updateTask(id: string, patch: Partial<Task>): void
  deleteTask(id: string): void
  // events
  addEvent(input: Omit<EventItem, 'id' | 'createdAt'>): EventItem
  updateEvent(id: string, patch: Partial<EventItem>): void
  deleteEvent(id: string): void
  // nutrition
  addMeal(input: Omit<Meal, 'id' | 'createdAt'>): Meal
  deleteMeal(id: string): void
  addFood(input: Omit<CustomFood, 'id'>): void
  deleteFood(id: string): void
  // ai / capture
  pushChat(msg: ChatMessage): void
  pushCapture(rec: CaptureRecord): void
  updateCapture(id: string, patch: Partial<CaptureRecord>): void
  bumpAiUsage(): { ok: boolean; count: number; limit: number }
  aiLeftToday(): number
  setPlanningTab(tab: PlanningTab): void
  syncSubscription(sub: Partial<Subscription>): void
  setReferral(stats: Partial<ReferralStats>): void
  setInsight(text: string): void
  applyActions(list: Validated[]): { applied: string[]; skipped: number }
  // data
  exportJson(): string
  importJson(raw: string): boolean
  clearAll(): void
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...initialData(),

      setSettings(patch) {
        set((s) => ({ settings: { ...s.settings, ...patch }, updatedAt: Date.now() }))
      },

      addTransaction(input) {
        const tx: Transaction = { ...input, id: uid(), createdAt: Date.now() }
        set((s) => ({ transactions: [...s.transactions, tx], updatedAt: Date.now() }))
        return tx
      },
      updateTransaction(id, patch) {
        set((s) => ({
          transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
          updatedAt: Date.now()
        }))
      },
      deleteTransaction(id) {
        set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id), updatedAt: Date.now() }))
      },
      setBudget(cat, amount) {
        set((s) => ({ budgets: { ...s.budgets, [cat]: amount }, updatedAt: Date.now() }))
      },

      addTask(input) {
        const task: Task = { ...input, id: uid(), createdAt: Date.now(), done: false }
        set((s) => ({ tasks: [...s.tasks, task], updatedAt: Date.now() }))
        return task
      },
      toggleTask(id) {
        const s = get()
        const task = s.tasks.find((t) => t.id === id)
        if (!task) return
        if (!task.done && task.recurrence && task.due) {
          // completing a recurring task rolls it to the next occurrence
          const next = nextTaskDue({ ...task, due: task.due }, addDays(todayISO(), 1))
          set((st) => ({
            tasks: st.tasks.map((t) =>
              t.id === id ? { ...t, due: next ?? t.due, done: false, doneAt: undefined } : t
            ),
            updatedAt: Date.now()
          }))
          return
        }
        set((st) => ({
          tasks: st.tasks.map((t) =>
            t.id === id ? { ...t, done: !t.done, doneAt: !t.done ? Date.now() : undefined } : t
          ),
          updatedAt: Date.now()
        }))
      },
      updateTask(id, patch) {
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)), updatedAt: Date.now() }))
      },
      deleteTask(id) {
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id), updatedAt: Date.now() }))
      },

      addEvent(input) {
        const ev: EventItem = { ...input, id: uid(), createdAt: Date.now() }
        set((s) => ({ events: [...s.events, ev], updatedAt: Date.now() }))
        return ev
      },
      updateEvent(id, patch) {
        set((s) => ({ events: s.events.map((e) => (e.id === id ? { ...e, ...patch } : e)), updatedAt: Date.now() }))
      },
      deleteEvent(id) {
        set((s) => ({ events: s.events.filter((e) => e.id !== id), updatedAt: Date.now() }))
      },

      addMeal(input) {
        const meal: Meal = { ...input, id: uid(), createdAt: Date.now() }
        set((s) => ({ meals: [...s.meals, meal], updatedAt: Date.now() }))
        return meal
      },
      deleteMeal(id) {
        set((s) => ({ meals: s.meals.filter((m) => m.id !== id), updatedAt: Date.now() }))
      },
      addFood(input) {
        set((s) => ({ foods: [...s.foods, { ...input, id: uid() }], updatedAt: Date.now() }))
      },
      deleteFood(id) {
        set((s) => ({ foods: s.foods.filter((f) => f.id !== id), updatedAt: Date.now() }))
      },

      pushChat(msg) {
        set((s) => ({ chat: [...s.chat, msg].slice(-40), updatedAt: Date.now() }))
      },
      pushCapture(rec) {
        set((s) => ({ captures: [rec, ...s.captures].slice(0, 20), updatedAt: Date.now() }))
      },
      updateCapture(id, patch) {
        set((s) => ({
          captures: s.captures.map((c) => (c.id === id ? { ...c, ...patch } : c)),
          updatedAt: Date.now()
        }))
      },

      bumpAiUsage() {
        const s = get()
        const today = todayISO()
        const count = s.aiUsage.date === today ? s.aiUsage.count : 0
        const limit = aiLimitFor(s.subscription)
        if (count >= limit) return { ok: false, count, limit }
        set({ aiUsage: { date: today, count: count + 1 } })
        return { ok: true, count: count + 1, limit }
      },

      aiLeftToday() {
        const s = get()
        const today = todayISO()
        const count = s.aiUsage.date === today ? s.aiUsage.count : 0
        return Math.max(0, aiLimitFor(s.subscription) - count)
      },

      setPlanningTab(tab) {
        set({ planningTab: tab })
      },

      /** mirror server-verified subscription state locally */
      syncSubscription(sub) {
        set((s) => ({ subscription: { ...s.subscription, ...sub }, updatedAt: Date.now() }))
      },

      setReferral(stats) {
        set((s) => ({ referral: { ...s.referral, ...stats }, updatedAt: Date.now() }))
      },

      setInsight(text) {
        set({ insight: { date: todayISO(), text }, updatedAt: Date.now() })
      },

      applyActions(list) {
        const s = get()
        const applied: string[] = []
        let skipped = 0
        const newTxs: Transaction[] = []
        const newTasks: Task[] = []
        const newEvents: EventItem[] = []
        const newMeals: Meal[] = []

        for (const { action, hash } of list) {
          if (isDuplicate(hash)) {
            skipped++
            continue
          }
          recentHashes.set(hash, Date.now())
          switch (action.type) {
            case 'expense':
            case 'income':
              newTxs.push({
                id: uid(),
                kind: action.type,
                amount: action.amount,
                currency: action.currency as Currency,
                category: action.category,
                note: action.note,
                date: action.date,
                createdAt: Date.now(),
                source: 'ai'
              })
              applied.push(action.type)
              break
            case 'task':
              newTasks.push({
                id: uid(),
                title: action.title,
                note: action.note,
                priority: action.priority,
                due: action.due ?? undefined,
                time: action.time ?? undefined,
                recurrence: action.recurrence,
                done: false,
                createdAt: Date.now()
              })
              applied.push('task')
              break
            case 'event':
              newEvents.push({
                id: uid(),
                title: action.title,
                date: action.date,
                time: action.time ?? undefined,
                durationMin: action.durationMin ?? undefined,
                remindMin: action.remindMin ?? null,
                location: action.location ?? undefined,
                recurrence: action.recurrence,
                createdAt: Date.now()
              })
              applied.push('event')
              break
            case 'meal':
              newMeals.push({
                id: uid(),
                title: action.title,
                mealType: action.mealType,
                items: action.items,
                date: todayISO(),
                createdAt: Date.now(),
                source: 'ai'
              })
              applied.push('meal')
              break
          }
        }

        if (newTxs.length || newTasks.length || newEvents.length || newMeals.length) {
          set((st) => ({
            transactions: [...st.transactions, ...newTxs],
            tasks: [...st.tasks, ...newTasks],
            events: [...st.events, ...newEvents],
            meals: [...st.meals, ...newMeals],
            updatedAt: Date.now()
          }))
        }
        return { applied, skipped }
      },

      exportJson() {
        const { version, updatedAt, settings, transactions, tasks, events, meals, foods, budgets } = get()
        return JSON.stringify(
          { app: 'tempo', version, updatedAt, settings, transactions, tasks, events, meals, foods, budgets },
          null,
          1
        )
      },

      importJson(raw) {
        try {
          const d = JSON.parse(raw)
          if (d?.app !== 'tempo' || d?.version !== 1) return false
          const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
          set({
            version: 1,
            updatedAt: num(d.updatedAt) || Date.now(),
            settings: { ...initialData().settings, ...(typeof d.settings === 'object' ? d.settings : {}) },
            transactions: Array.isArray(d.transactions) ? d.transactions.slice(0, 20000) : [],
            tasks: Array.isArray(d.tasks) ? d.tasks.slice(0, 5000) : [],
            events: Array.isArray(d.events) ? d.events.slice(0, 5000) : [],
            meals: Array.isArray(d.meals) ? d.meals.slice(0, 5000) : [],
            foods: Array.isArray(d.foods) ? d.foods.slice(0, 500) : [],
            budgets: typeof d.budgets === 'object' && d.budgets ? d.budgets : {}
          })
          return true
        } catch {
          return false
        }
      },

      clearAll() {
        set({ ...initialData(), updatedAt: Date.now() })
      }
    }),
    {
      name: DATA_KEY,
      version: 2,
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<AppData>
        return {
          ...current,
          ...p,
          settings: { ...current.settings, ...(p.settings || {}) },
          subscription: { ...current.subscription, ...(p.subscription as object) },
          referral: { ...current.referral, ...(p.referral as object) }
        }
      },
      storage: createJSONStorage(() => localStore),
      partialize: (s) => {
        const { version, updatedAt, settings, subscription, referralCode, referral, planningTab, transactions, tasks, events, meals, foods, budgets, aiUsage, insight, chat, captures } = s as any
        return { version, updatedAt, settings, subscription, referralCode, referral, planningTab, transactions, tasks, events, meals, foods, budgets, aiUsage, insight, chat, captures }
      },
      migrate: (persisted: any) => {
        // v1 had settings.plan with fake values (free/pro/premium) and no
        // server-verified subscription — reset to honest free state.
        if (persisted?.state?.settings?.plan != null) {
          delete persisted.state.settings.plan
          persisted.state.subscription = freeSubscription()
        }
        persisted.state.settings = { ...initialSettings, ...(persisted.state.settings || {}) }
        persisted.state.subscription = persisted.state.subscription || freeSubscription()
        persisted.state.referralCode = persisted.state.referralCode || uid().slice(0, 8)
        persisted.state.referral = persisted.state.referral || { invited: 0, paying: 0, claimed: [] }
        persisted.state.planningTab = 'calendar'
        return persisted
      }
    }
  )
)

export const storageOk = storageAvailable

// ---------- Telegram Cloud sync (best-effort mirror) ----------
let cloudTimer: ReturnType<typeof setTimeout> | null = null
export function initCloudSync() {
  // adopt newer cloud snapshot if present
  if (cloudStore.available()) {
    cloudStore.get(DATA_KEY).then((val) => {
      if (!val) return
      try {
        const cloud = JSON.parse(val)
        const cloudState = cloud?.state
        const localRaw = localStore.getItem(DATA_KEY)
        const localTs = localRaw ? (JSON.parse(localRaw)?.state?.updatedAt ?? 0) : 0
        if (cloudState?.updatedAt > localTs) {
          useStore.setState(cloudState, true)
        }
      } catch {
        /* ignore corrupt cloud data */
      }
    })
  }
  useStore.subscribe(() => {
    if (!cloudStore.available()) return
    if (cloudTimer) clearTimeout(cloudTimer)
    cloudTimer = setTimeout(() => {
      const { version, updatedAt, settings, subscription, referralCode, referral, planningTab, transactions, tasks, events, meals, foods, budgets, aiUsage, insight, chat, captures } = useStore.getState() as any
      cloudStore.set(
        DATA_KEY,
        JSON.stringify({ state: { version, updatedAt, settings, subscription, referralCode, referral, planningTab, transactions, tasks, events, meals, foods, budgets, aiUsage, insight, chat, captures } })
      )
    }, 2000)
  })
}

// ---------- derived selectors ----------
export function useDayExpense(date: string): number {
  return useStore((s) =>
    s.transactions
      .filter((t) => t.kind === 'expense' && t.date === date)
      .reduce((a, t) => a + t.amount, 0)
  )
}

export function weekDailyTotals(transactions: Transaction[], today: string): { date: string; value: number }[] {
  const start = startOfWeekISO(today)
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i)
    return {
      date: d,
      value: Math.round(
        transactions.filter((t) => t.kind === 'expense' && t.date === d).reduce((a, t) => a + t.amount, 0)
      )
    }
  })
}

export function monthTotals(transactions: Transaction[], today: string) {
  const mk = monthKey(today)
  let exp = 0
  let inc = 0
  for (const t of transactions) {
    if (monthKey(t.date) !== mk) continue
    if (t.kind === 'expense') exp += t.amount
    else inc += t.amount
  }
  return { exp: Math.round(exp * 100) / 100, inc: Math.round(inc * 100) / 100 }
}

export function expensesByCategory(
  transactions: Transaction[],
  from: string,
  to: string,
  kind: 'expense' | 'income' = 'expense'
) {
  const map = new Map<string, number>()
  for (const t of transactions) {
    if (t.kind !== kind || t.date < from || t.date > to) continue
    map.set(t.category, (map.get(t.category) || 0) + t.amount)
  }
  return [...map.entries()]
    .map(([category, value]) => ({ category, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value)
}

export function mealsKcal(meals: Meal[]): number {
  return Math.round(meals.reduce((a, m) => a + m.items.reduce((x, i) => x + i.kcal, 0), 0))
}
export function mealsMacros(meals: Meal[]) {
  return meals.reduce(
    (a, m) => {
      for (const i of m.items) {
        a.p += i.p
        a.c += i.c
        a.f += i.f
      }
      return a
    },
    { p: 0, c: 0, f: 0 }
  )
}
