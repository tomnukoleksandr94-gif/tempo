// ---------- Core domain types ----------

export type Currency = 'EUR' | 'USD' | 'GBP' | 'UAH' | 'PLN' | 'RUB'

export type ExpenseCat =
  | 'food' | 'groceries' | 'transport' | 'home' | 'health'
  | 'fun' | 'clothes' | 'education' | 'gifts' | 'bills' | 'other'

export type IncomeCat = 'salary' | 'freelance' | 'gift' | 'invest' | 'other'

export interface Transaction {
  id: string
  kind: 'expense' | 'income'
  amount: number
  currency: Currency
  category: string
  note?: string
  date: string // YYYY-MM-DD
  createdAt: number
  source: 'manual' | 'ai'
}

export type Priority = 1 | 2 | 3 // 3 = high
export type Recurrence = 'daily' | 'weekdays' | 'weekly' | 'monthly'

export interface Task {
  id: string
  title: string
  note?: string
  priority: Priority
  due?: string
  time?: string
  recurrence?: Recurrence | null
  done: boolean
  doneAt?: number
  createdAt: number
}

export interface EventItem {
  id: string
  title: string
  date: string // YYYY-MM-DD
  time?: string // HH:MM
  durationMin?: number
  remindMin?: number | null
  location?: string
  note?: string
  recurrence?: Recurrence | null
  createdAt: number
  remindedAt?: number
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface FoodItem {
  name: string
  kcal: number
  p: number
  c: number
  f: number
}

export interface Meal {
  id: string
  title: string
  mealType: MealType
  items: FoodItem[]
  date: string
  createdAt: number
  source: 'manual' | 'ai'
  photo?: boolean
  note?: string
}

export interface CustomFood {
  id: string
  name: string
  kcal: number
  p: number
  c: number
  f: number
}

export interface Settings {
  name: string
  locale: 'ru' | 'uk' | 'en' | 'de' | 'fr'
  localeChosen?: boolean
  currency: Currency
  model: string
  apiKey: string
  kcalTarget: number
  widgets: string[]
  autoConfirm: boolean
  theme: 'auto' | 'dark' | 'light'
  effects: boolean
}

// ---------- subscription & billing ----------

export type Plan = 'free' | 'plus' | 'pro'
export type BillingPeriod = 'monthly' | 'annual'

export interface PaymentRecord {
  id: string
  plan: Plan
  period: BillingPeriod
  stars: number
  status: 'pending' | 'paid' | 'refunded'
  ts: number
}

export interface Subscription {
  plan: Plan
  period: BillingPeriod | null
  /** ISO date of expiry (null for free) */
  expiresAt: string | null
  status: 'active' | 'expired' | 'none'
  /** auto-renewal: Stars payments repeat via bot chat, status shown from server */
  autoRenew: boolean
  history: PaymentRecord[]
}

export interface ReferralStats {
  invited: number
  paying: number
  /** claimed reward keys */
  claimed: string[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  text: string
  ts: number
  /** ids of applied action records, for context */
  applied?: string[]
}

export interface CaptureRecord {
  id: string
  input: string
  ts: number
  status: 'processing' | 'done' | 'error' | 'cancelled'
  applied: string[]
  error?: string
}

export interface AiUsage {
  date: string
  count: number
}

// ---------- AI structured output ----------

export interface AiExpenseAction {
  type: 'expense'
  amount: number
  currency: string
  category: string
  note?: string
  date: string
}
export interface AiIncomeAction {
  type: 'income'
  amount: number
  currency: string
  category: string
  note?: string
  date: string
}
export interface AiTaskAction {
  type: 'task'
  title: string
  note?: string
  priority: 1 | 2 | 3
  due: string | null
  time: string | null
  recurrence: Recurrence | null
}
export interface AiEventAction {
  type: 'event'
  title: string
  date: string
  time: string | null
  durationMin: number | null
  remindMin: number | null
  recurrence: Recurrence | null
  location: string | null
}
export interface AiMealAction {
  type: 'meal'
  title: string
  mealType: MealType
  items: FoodItem[]
  note?: string
}
export type AiAction = AiExpenseAction | AiIncomeAction | AiTaskAction | AiEventAction | AiMealAction

export interface AiResult {
  reply: string
  actions: AiAction[]
  clarify: string | null
}
