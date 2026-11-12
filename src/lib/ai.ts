import type { AiAction, AiResult, Currency, EventItem, Meal, Settings, Task, Transaction } from './types'
import { todayISO, addDays, monthKey, startOfWeekISO } from './utils'

// Built-in key (free tier). Rotatable in Profile → AI settings.
const BUILTIN_KEY = 'AQ.Ab8RN6LXMjzMTS9a6y20pLDqosG0rpFwgHsr2mzvcT44r9wTkg'

export const MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite' },
  { id: 'gemma-4-31b-it', label: 'Gemma 4 31B' }
]

const FALLBACKS = ['gemini-3.5-flash-lite', 'gemma-4-31b-it']
const API = 'https://generativelanguage.googleapis.com/v1beta/models'
const TIMEOUT = 25000

export function apiKeyOf(settings: Settings): string {
  return settings.apiKey?.trim() || BUILTIN_KEY
}

export class AiError extends Error {
  constructor(
    message: string,
    public code: 'network' | 'auth' | 'quota' | 'parse' | 'busy'
  ) {
    super(message)
  }
}

interface GenOpts {
  parts: any[]
  system: string
  settings: Settings
}

/** Call Gemini with model fallback. Returns raw text. */
async function generate(opts: GenOpts): Promise<string> {
  const key = apiKeyOf(opts.settings)
  // gemini-3.8-flash is currently unstable (503/hangs) — never put it first in the chain
  const chain = [opts.settings.model, ...FALLBACKS]
    .filter((m) => m && m !== 'gemini-3.8-flash')
    .filter((m, i, arr) => arr.indexOf(m) === i)
  let lastErr: AiError = new AiError('AI unavailable', 'busy')

  for (const model of chain) {
    for (let attempt = 0; attempt < 1; attempt++) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
      try {
        const body: any = {
          contents: [{ role: 'user', parts: opts.parts }],
          systemInstruction: { parts: [{ text: opts.system }] },
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json'
          }
        }
        // NOTE: responseSchema intentionally NOT used — on flash-lite models the
        // structured-output schema made the model emit only "reply" and drop
        // the action objects. The strict JSON shape is fully specified in the
        // system prompt instead, and extractJson() + validateAiActions() guard
        // the result.
        const res = await fetch(`${API}/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(body),
          signal: ctrl.signal
        })
        clearTimeout(timer)
        if (res.ok) {
          const json = await res.json()
          const finish: string = json?.candidates?.[0]?.finishReason || ''
          const text: string =
            json?.candidates?.[0]?.content?.parts
              ?.filter((p: any) => typeof p.text === 'string' && !p.thought)
              .map((p: any) => p.text)
              .join('') ?? ''
          if (finish === 'MAX_TOKENS') {
            // truncated output would produce broken JSON — reject and try the next strategy
            lastErr = new AiError('AI response truncated', 'parse')
            continue
          }
          if (text.trim()) return text
          lastErr = new AiError('Empty AI response', 'parse')
          continue
        }
        const err = await res.json().catch(() => ({}))
        const msg: string = err?.error?.message || `HTTP ${res.status}`
        if (res.status === 401 || res.status === 403 || /api key/i.test(msg)) {
          throw new AiError('Invalid API key', 'auth')
        }
        if (res.status === 429) {
          lastErr = new AiError('Quota exceeded', 'quota')
          break // try next model
        }
        if (res.status === 503) {
          lastErr = new AiError('Model busy', 'busy')
          break // try next model
        }
        if (res.status === 400 && /schema/i.test(msg)) continue // retry without schema
        if (res.status === 400 && /not found|no longer/i.test(msg)) break // try next model
        lastErr = new AiError(msg, 'network')
        break
      } catch (e: any) {
        clearTimeout(timer)
        if (e instanceof AiError) throw e
        if (e?.name === 'AbortError') {
          lastErr = new AiError('Timeout', 'network')
          break // try next model
        }
        lastErr = new AiError(e?.message || 'Network error', 'network')
        break
      }
    }
  }
  throw lastErr
}

function extractJson(text: string): any {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) t = t.slice(start, end + 1)
  return JSON.parse(t)
}

// ---------- context building (real user data, never invented) ----------

export interface CtxData {
  transactions: Transaction[]
  tasks: Task[]
  events: EventItem[]
  meals: Meal[]
  settings: Settings
}

export function buildContext(d: CtxData): string {
  const today = todayISO()
  const wk = startOfWeekISO(today)
  const weekTx = d.transactions.filter(
    (t) => t.kind === 'expense' && t.date >= wk && t.date <= today
  )
  const month = monthKey(today)
  const monthExp = d.transactions.filter((t) => t.kind === 'expense' && monthKey(t.date) === month)
  const monthInc = d.transactions.filter((t) => t.kind === 'income' && monthKey(t.date) === month)
  const byCat: Record<string, number> = {}
  for (const t of weekTx) byCat[t.category] = (byCat[t.category] || 0) + t.amount
  const todayMeals = d.meals.filter((m) => m.date === today)
  const sum = (f: (m: Meal) => number) => todayMeals.reduce((a, m) => a + f(m), 0)
  const kcal = sum((m) => m.items.reduce((a, i) => a + i.kcal, 0))
  const todayTasks = d.tasks.filter((t) => !t.done && (!t.due || t.due <= today))
  const overdue = d.tasks.filter((t) => !t.done && t.due && t.due < today)
  const nextEvents = d.events
    .filter((e) => e.date >= today)
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
    .slice(0, 5)

  return JSON.stringify({
    today,
    weekday: new Date().toLocaleDateString('en-GB', { weekday: 'long' }),
    currency: d.settings.currency,
    expense_categories: [
      'food', 'groceries', 'transport', 'home', 'health', 'fun', 'clothes', 'education', 'gifts', 'bills', 'other'
    ],
    income_categories: ['salary', 'freelance', 'gift', 'invest', 'other'],
    week_expense_total: Math.round(weekTx.reduce((a, t) => a + t.amount, 0) * 100) / 100,
    week_expense_by_category: byCat,
    month_expense: Math.round(monthExp.reduce((a, t) => a + t.amount, 0) * 100) / 100,
    month_income: Math.round(monthInc.reduce((a, t) => a + t.amount, 0) * 100) / 100,
    tasks_today: todayTasks.slice(0, 10).map((t) => ({ title: t.title, priority: t.priority, due: t.due ?? null })),
    tasks_overdue_count: overdue.length,
    upcoming_events: nextEvents.map((e) => ({ title: e.title, date: e.date, time: e.time ?? null })),
    nutrition_today: {
      kcal: Math.round(kcal),
      protein_g: Math.round(sum((m) => m.items.reduce((a, i) => a + i.p, 0))),
      carbs_g: Math.round(sum((m) => m.items.reduce((a, i) => a + i.c, 0))),
      fat_g: Math.round(sum((m) => m.items.reduce((a, i) => a + i.f, 0)))
    },
    kcal_target: d.settings.kcalTarget,
    recent_transactions: d.transactions
      .slice(-8)
      .reverse()
      .map((t) => ({ kind: t.kind, amount: t.amount, currency: t.currency, category: t.category, date: t.date }))
  })
}

const SYSTEM_RULES = `You are Tempo, the AI core of a personal life OS (finance, tasks, calendar, nutrition).
Current user context (REAL data, the only source of truth about their records):
{CONTEXT}

Rules:
1. Reply in the user's language (default: Russian). The "reply" field MUST be at most 15 words — a single short confirmation like "Готово: расход, блюдо и встреча записаны". NEVER write long paragraphs or repeat yourself.
2. You may create records ONLY by emitting action objects. NEVER invent data: if the user did not state an amount, date, or food — do not guess it. Omit the action or ask in "clarify".
3. One message can contain several actions (e.g. an expense + a task + a meal). Detect all of them.
4. Resolve relative dates ("tomorrow", "в среду") to absolute YYYY-MM-DD using today's date from context.
5. Currency: use the user's context currency unless the user names another one.
6. Nutrition: estimate kcal/macros ONLY from foods the user actually described. Conservative estimates. If a food is unknown, ask instead of guessing.
7. Questions about the user's data ("how much did I spend this week?") must be answered ONLY from CONTEXT. If the data is not there, say you don't have that information.
8. "clarify" — a single short question to the user when required info is missing (set actions to [] in that case).
9. Output STRICT JSON only: {"reply": string, "clarify": string|null, "actions": Action[]}
Action formats:
- {"type":"expense","amount":18,"currency":"EUR","category":"food","note":"lunch","date":"2026-01-15"}
- {"type":"income","amount":...,"currency":...,"category":"salary","note":...,"date":...}
- {"type":"task","title":"Call Alex","priority":2,"due":"2026-01-16","time":"18:00","recurrence":null}
  (priority: 1 low, 2 normal, 3 high; recurrence: "daily"|"weekdays"|"weekly"|"monthly"|null)
- {"type":"event","title":"Meeting","date":"2026-01-16","time":"15:00","durationMin":60,"remindMin":30,"recurrence":null,"location":null}
- {"type":"meal","title":"Chicken and rice","mealType":"lunch","items":[{"name":"chicken breast 150g","kcal":250,"p":31,"c":0,"f":6}]}
  (mealType: breakfast|lunch|dinner|snack)`

// ---------- public API ----------

export async function processInput(text: string, data: CtxData): Promise<AiResult> {
  const system = SYSTEM_RULES.replace('{CONTEXT}', buildContext(data))
  const raw = await generate({ parts: [{ text }], system, settings: data.settings })
  let parsed: any
  try {
    parsed = extractJson(raw)
  } catch {
    throw new AiError('Unparseable AI response', 'parse')
  }
  const actions: AiAction[] = Array.isArray(parsed?.actions) ? parsed.actions : []
  return {
    reply: typeof parsed?.reply === 'string' ? parsed.reply : '',
    actions,
    clarify: typeof parsed?.clarify === 'string' && parsed.clarify.trim() ? parsed.clarify : null
  }
}

export async function analyzeFoodPhoto(
  b64: string,
  mime: string,
  data: CtxData
): Promise<AiResult> {
  const system = SYSTEM_RULES.replace('{CONTEXT}', buildContext(data))
  const raw = await generate({
    parts: [
      { text: 'Analyze this food photo. Identify visible foods and estimate calories and macros per item. Reply with a "meal" action (title = short meal description, mealType by time of day). If the photo has no food, reply with no actions and say so in "reply".' },
      { inlineData: { mimeType: mime, data: b64 } }
    ],
    system,
    settings: data.settings
  })
  let parsed: any
  try {
    parsed = extractJson(raw)
  } catch {
    throw new AiError('Unparseable AI response', 'parse')
  }
  return {
    reply: typeof parsed?.reply === 'string' ? parsed.reply : '',
    actions: Array.isArray(parsed?.actions) ? parsed.actions : [],
    clarify: null
  }
}

export async function generateInsight(data: CtxData): Promise<string> {
  const system =
    buildContext(data) +
    '\n\nYou generate ONE short personal insight (max 2 sentences) about the user\'s day/week based ONLY on this real data. Point out something concrete and useful (spending pattern, task load, nutrition balance, upcoming event). Reply in the user\'s language (default Russian). Plain text, no JSON.'
  const key = apiKeyOf(data.settings)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    const res = await fetch(`${API}/${data.settings.model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Give today\'s insight.' }] }],
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: { temperature: 0.6, maxOutputTokens: 300 }
      }),
      signal: ctrl.signal
    })
    clearTimeout(timer)
    if (!res.ok) throw new AiError('insight failed', 'network')
    const json = await res.json()
    const text: string =
      json?.candidates?.[0]?.content?.parts
        ?.filter((p: any) => typeof p.text === 'string' && !p.thought)
        .map((p: any) => p.text)
        .join('') ?? ''
    return text.trim().slice(0, 400)
  } finally {
    clearTimeout(timer)
  }
}
