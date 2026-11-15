/**
 * Client AI layer.
 *
 * Primary path: the server AI router (POST {BILLING_API}/ai/chat). The provider
 * API key lives ONLY on the server — it is not shipped in the client bundle.
 * The router enforces plan-based model tiers, server-side daily limits and
 * automatic model fallback (see ai-router.mjs).
 *
 * Secondary path (opt-in): the user's OWN Gemini key, entered in Profile →
 * AI settings, calls Google directly from their browser. That key belongs to
 * the user and is stored only in their local storage.
 *
 * Only models verified with real API requests are exposed. See MODEL_REGISTRY
 * in ai-router.mjs for the verification notes.
 */

import type { AiAction, AiResult, Currency, EventItem, Meal, Settings, Task, Transaction } from './types'
import { todayISO, startOfWeekISO, monthKey } from './utils'
import { BILLING_API } from './billing'
import { useStore } from './store'
import { tg } from './telegram'

// ---------- model tiers (verified only; server is the authority) ----------

export const AI_TIERS = [
  { id: 'fast', label: 'Gemini 3.5 Flash Lite', model: 'gemini-3.5-flash-lite', minPlan: 'free' as const, vision: true },
  { id: 'balanced', label: 'Gemini 3.5 Flash', model: 'gemini-3.5-flash', minPlan: 'plus' as const, vision: true },
  { id: 'advanced', label: 'Gemini 3.5 Flash · Deep', model: 'gemini-3.5-flash', minPlan: 'pro' as const, vision: true }
] as const
export type AiTier = (typeof AI_TIERS)[number]['id']

export const PLAN_ORDER_TIER: Record<string, AiTier[]> = {
  free: ['fast'],
  plus: ['fast', 'balanced'],
  pro: ['fast', 'balanced', 'advanced']
}

// ---------- personalization ----------

export interface AiPrefs {
  depth: 'fast' | 'balanced' | 'deep'
  length: 'short' | 'normal' | 'detailed'
  style: 'friendly' | 'professional' | 'neutral' | 'direct'
  behavior: 'simple' | 'detailed' | 'analytical' | 'step'
  /** 0–1, applied only by providers/models that support it */
  temperature?: number
}

export const DEFAULT_PREFS: AiPrefs = {
  depth: 'balanced',
  length: 'normal',
  style: 'friendly',
  behavior: 'simple'
}

export class AiError extends Error {
  constructor(
    message: string,
    public code: 'network' | 'auth' | 'quota' | 'parse' | 'busy' | 'timeout' | 'limit' | 'plan' | 'unavailable' | 'config'
  ) {
    super(message)
  }
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
  const weekTx = d.transactions.filter((t) => t.kind === 'expense' && t.date >= wk && t.date <= today)
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
    ui_language: d.settings.locale,
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

// ---------- server request plumbing ----------

function tzMinutes(): number {
  try { return -new Date().getTimezoneOffset() } catch { return 0 }
}

function authPayload(): Record<string, unknown> {
  const out: Record<string, unknown> = { tzMinutes: tzMinutes() }
  try {
    const token = localStorage.getItem('tempo-account-token')
    if (token) out.token = token
  } catch { /* ignore */ }
  const initData = (window as any)?.Telegram?.WebViewApp?.initData || tg?.initData || ''
  if (initData) out.initData = initData
  return out
}

/** Mirror the server-authoritative usage counter into the local store (display only). */
function mirrorUsage(usage?: { date: string; count: number }) {
  if (usage && usage.date) useStore.setState({ aiUsage: usage })
}

export interface AiMeta {
  model: string
  tier: AiTier
  fellBack: boolean
  downgraded: boolean
  usage: { date: string; count: number; limit: number }
}

interface ServerChatOpts {
  mode: 'chat' | 'action' | 'insight' | 'finance'
  text?: string
  image?: { b64: string; mime: string }
  tier: AiTier
  prefs: AiPrefs
  context: CtxData
  history?: { role: 'user' | 'ai'; text: string }[]
  onMeta?: (meta: AiMeta) => void
  onDelta?: (chunk: string) => void
  signal?: AbortSignal
}

/**
 * Classify a failed /ai/chat response. When the platform proxy (or any
 * intermediary) strips the JSON body from a 5xx, fall back to /api/health to
 * distinguish "AI not configured on the server" from a transient outage, so
 * the UI can show the localized, actionable config hint instead of a generic
 * "AI is unavailable" toast.
 */
async function classifyServerError(res: Response, signal?: AbortSignal): Promise<AiError> {
  let parsed: any = null
  try { parsed = await res.clone().json() } catch { /* ignore */ }
  const detail: string = parsed?.message || ''
  if (res.status === 429) return new AiError(detail || 'Daily limit reached', 'limit')
  if (res.status === 403) return new AiError(detail || 'Upgrade required', 'plan')
  if (res.status === 502 || res.status === 503) {
    // pass through server config/auth failures so the UI shows the localized hint
    if (parsed?.error === 'config') return new AiError(detail || 'AI unavailable', 'config')
    if (parsed?.error === 'auth') return new AiError(detail || 'AI unavailable', 'auth')
    // body was stripped (e.g. by a proxy) — ask health once for the real reason
    try {
      const h = await fetch(`${BILLING_API}/health`, { method: 'POST', signal })
      if (h.ok) {
        const hj: any = await h.json()
        if (hj?.ai === false) return new AiError('AI is not configured on the server (GEMINI_API_KEY missing)', 'config')
      }
    } catch { /* fall through to unavailable */ }
    return new AiError(detail || 'AI unavailable', 'unavailable')
  }
  return new AiError(detail || `HTTP ${res.status}`, 'network')
}

/** Non-streaming server call (action / insight / finance modes). */
async function serverChat(opts: ServerChatOpts): Promise<{ json: any; meta: AiMeta }> {
  const settings = useStore.getState().settings
  const body = {
    ...authPayload(),
    mode: opts.mode,
    text: opts.text,
    image: opts.image,
    tier: opts.tier,
    prefs: opts.prefs,
    context: buildContext(opts.context),
    history: opts.history,
    locale: settings.locale
  }
  const res = await fetch(`${BILLING_API}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal
  })
  if (!res.ok) {
    const err = await classifyServerError(res, opts.signal)
    throw err
  }
  const json = await res.json()
  const meta: AiMeta = {
    model: json.model,
    tier: json.tier ?? opts.tier,
    fellBack: !!json.fellBack,
    downgraded: !!json.downgraded,
    usage: json.usage
  }
  mirrorUsage(json.usage)
  opts.onMeta?.(meta)
  return { json, meta }
}

/** Streaming server call (chat mode). Reads SSE events from the router. */
async function serverChatStream(opts: ServerChatOpts): Promise<{ text: string; meta: AiMeta }> {
  const settings = useStore.getState().settings
  const body = {
    ...authPayload(),
    mode: 'chat',
    stream: true,
    text: opts.text,
    tier: opts.tier,
    prefs: opts.prefs,
    context: buildContext(opts.context),
    history: opts.history,
    locale: settings.locale
  }
  const res = await fetch(`${BILLING_API}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal
  })
  if (!res.ok || !res.body) {
    const err = await classifyServerError(res, opts.signal)
    throw err
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let text = ''
  let meta: AiMeta | null = null
  let err: AiError | null = null
  // Client-side stall watchdog: if the stream goes silent (server dead or model
  // hung), abort instead of spinning forever — the UI shows an error + retry.
  const stallCtrl = new AbortController()
  let stallTimer: ReturnType<typeof setTimeout> | null = null
  const armStall = () => { if (stallTimer) clearTimeout(stallTimer); stallTimer = setTimeout(() => stallCtrl.abort(), 30_000) }
  armStall()
  opts.signal?.addEventListener('abort', () => stallCtrl.abort(), { once: true })
  try {
  for (;;) {
    const read = await Promise.race([
      reader.read(),
      new Promise<never>((_, rej) => stallCtrl.signal.addEventListener('abort', () => rej(new DOMException('stall', 'AbortError')), { once: true }))
    ])
    const { done, value } = read
    if (done) break
    armStall()
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      let ev: any
      try { ev = JSON.parse(line.slice(6)) } catch { continue }
      if (ev.type === 'meta') {
        meta = { model: ev.model, tier: ev.tier, fellBack: false, downgraded: !!ev.downgraded, usage: ev.usage }
        mirrorUsage(ev.usage)
        opts.onMeta?.(meta)
      } else if (ev.type === 'delta') {
        text += ev.text || ''
        opts.onDelta?.(ev.text || '')
      } else if (ev.type === 'done') {
        if (meta) { meta.model = ev.model; meta.fellBack = !!ev.fellBack }
        mirrorUsage(ev.usage)
      } else if (ev.type === 'error') {
        err = new AiError(ev.message || 'AI error', ev.code === 'quota' ? 'quota' : ev.code === 'timeout' ? 'timeout' : 'unavailable')
      }
    }
  }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      try { await reader.cancel() } catch { /* ignore */ }
      // user pressed Stop — keep partial text; stream stalled — timeout error
      if (text.trim()) return { text, meta: meta ?? { model: '', tier: opts.tier, fellBack: false, downgraded: false, usage: { date: '', count: 0, limit: 0 } } }
      throw new AiError('Відповідь надто довго не приходила — спробуйте ще раз або виберіть швидшу модель', 'timeout')
    }
    throw e
  } finally {
    if (stallTimer) clearTimeout(stallTimer)
  }
  if (err) throw err
  if (!text.trim()) throw new AiError('Empty AI response', 'parse')
  return { text, meta: meta ?? { model: '', tier: opts.tier, fellBack: false, downgraded: false, usage: { date: '', count: 0, limit: 0 } } }
}

// ---------- public API ----------

/**
 * Conversational chat (plain text, streaming). CHAT MODE — no data changes.
 */
export async function chat(opts: {
  text: string
  history?: { role: 'user' | 'ai'; text: string }[]
  tier: AiTier
  prefs: AiPrefs
  context: CtxData
  onMeta?: (meta: AiMeta) => void
  onDelta?: (chunk: string) => void
  signal?: AbortSignal
}): Promise<{ text: string; meta: AiMeta }> {
  if (opts.context.settings.apiKey?.trim()) return directChat(opts)
  return serverChatStream({ ...opts, mode: 'chat' })
}

/**
 * ACTION MODE: natural language → validated records (expense/task/event/meal).
 * Server-side structured output; the caller confirms before applying.
 */
export async function processInput(text: string, data: CtxData): Promise<AiResult> {
  const settings = data.settings
  if (settings.apiKey?.trim()) return directAction(text, data)
  const { json } = await serverChat({
    mode: 'action',
    text,
    tier: tierOfSettings(settings),
    prefs: prefsOfSettings(settings),
    context: data
  })
  return {
    reply: typeof json.reply === 'string' ? json.reply : '',
    actions: Array.isArray(json.actions) ? json.actions : [],
    clarify: typeof json.clarify === 'string' && json.clarify.trim() ? json.clarify : null
  }
}

export async function analyzeFoodPhoto(b64: string, mime: string, data: CtxData): Promise<AiResult> {
  const settings = data.settings
  const tier = tierOfSettings(settings)
  const body = {
    ...authPayload(),
    mode: 'action',
    text: 'Analyze this food photo. Identify visible foods and estimate calories and macros per item. Reply with a "meal" action (title = short meal description, mealType by time of day). If the photo has no food, reply with no actions and say so in "reply".',
    image: { b64, mime },
    tier,
    prefs: prefsOfSettings(settings),
    context: buildContext(data),
    locale: settings.locale
  }
  const res = await fetch(`${BILLING_API}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json())?.message || '' } catch { /* ignore */ }
    if (res.status === 429) throw new AiError(detail || 'Daily limit reached', 'limit')
    if (res.status === 403) throw new AiError(detail || 'Photo analysis is a Plus feature', 'plan')
    throw new AiError(detail || 'AI unavailable', 'unavailable')
  }
  const json = await res.json()
  mirrorUsage(json.usage)
  return {
    reply: typeof json.reply === 'string' ? json.reply : '',
    actions: Array.isArray(json.actions) ? json.actions : [],
    clarify: typeof json.clarify === 'string' && json.clarify.trim() ? json.clarify : null
  }
}

export async function generateInsight(data: CtxData): Promise<string> {
  if (data.settings.apiKey?.trim()) return directTextMode('insight', data)
  const { json } = await serverChat({ mode: 'insight', text: "Give today's insight.", tier: tierOfSettings(data.settings), prefs: prefsOfSettings(data.settings), context: data })
  return String(json.text || '').trim().slice(0, 400)
}

export async function generateFinanceReport(data: CtxData): Promise<string> {
  if (data.settings.apiKey?.trim()) return directTextMode('finance', data)
  const { json } = await serverChat({ mode: 'finance', text: "Generate this month's finance report.", tier: tierOfSettings(data.settings), prefs: prefsOfSettings(data.settings), context: data })
  return String(json.text || '').trim().slice(0, 600)
}

// ---------- settings helpers ----------

export function tierOfSettings(settings: Settings): AiTier {
  const t = (settings as any).aiTier
  return t === 'balanced' || t === 'advanced' ? t : 'fast'
}

export function prefsOfSettings(settings: Settings): AiPrefs {
  const p = (settings as any).aiPrefs
  return { ...DEFAULT_PREFS, ...(typeof p === 'object' && p ? p : {}) }
}

// ---------- direct path (the user's OWN key, from Profile) ----------

const DIRECT_API = 'https://generativelanguage.googleapis.com/v1beta/models'
const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']

function directBody(opts: { parts: any[]; system: string; prefs: AiPrefs; jsonMode: boolean; temperature?: number }) {
  return {
    contents: [{ role: 'user', parts: opts.parts }],
    systemInstruction: { parts: [{ text: opts.system }] },
    generationConfig: {
      temperature: typeof opts.prefs.temperature === 'number' ? Math.max(0, Math.min(1, opts.prefs.temperature)) : 0.3,
      maxOutputTokens: 4096,
      responseMimeType: opts.jsonMode ? 'application/json' : 'text/plain'
    }
  }
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

async function directGenerate(parts: any[], system: string, settings: Settings, jsonMode: boolean): Promise<string> {
  const key = settings.apiKey.trim()
  const chain = [...new Set([tierOfSettings(settings) === 'fast' ? 'gemini-3.5-flash-lite' : 'gemini-3.5-flash', ...FALLBACK_MODELS])]
  let lastErr: AiError = new AiError('AI unavailable', 'busy')
  for (const model of chain) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 25000)
    try {
      const res = await fetch(`${DIRECT_API}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(directBody({ parts, system, prefs: prefsOfSettings(settings), jsonMode })),
        signal: ctrl.signal
      })
      clearTimeout(timer)
      if (res.ok) {
        const json = await res.json()
        const text: string =
          json?.candidates?.[0]?.content?.parts
            ?.filter((p: any) => typeof p.text === 'string' && !p.thought)
            .map((p: any) => p.text)
            .join('') ?? ''
        if (text.trim()) return text
        lastErr = new AiError('Empty AI response', 'parse')
        continue
      }
      const err = await res.json().catch(() => ({}))
      const msg: string = err?.error?.message || `HTTP ${res.status}`
      if (res.status === 401 || res.status === 403 || /api key/i.test(msg)) throw new AiError('Invalid API key', 'auth')
      if (res.status === 429) { lastErr = new AiError('Quota exceeded', 'quota'); break }
      lastErr = new AiError(msg, 'network')
      break
    } catch (e: any) {
      clearTimeout(timer)
      if (e instanceof AiError) throw e
      if (e?.name === 'AbortError') { lastErr = new AiError('Timeout', 'timeout'); break }
      lastErr = new AiError(e?.message || 'Network error', 'network')
      break
    }
  }
  throw lastErr
}

const DIRECT_CHAT_SYSTEM = (ctx: string) =>
  `You are Tempo, the AI assistant of a personal life OS (finance, tasks, calendar, nutrition).
Current user context (REAL data, the only source of truth):
${ctx}

Rules: reply in the user's language; plain text; answer questions about data ONLY from context; be concrete and brief; if asked to create records, say to switch to Action mode.`

const DIRECT_ACTION_SYSTEM = (ctx: string) =>
  `You are Tempo, the AI core of a personal life OS (finance, tasks, calendar, nutrition).
Current user context (REAL data):
${ctx}

Rules:
1. Reply in the user's language (default: Russian). "reply" max 15 words.
2. Create records ONLY via action objects. NEVER invent data.
3. Resolve relative dates to absolute YYYY-MM-DD.
4. Output STRICT JSON only: {"reply": string, "clarify": string|null, "actions": Action[]}
Actions: {"type":"expense","amount":18,"currency":"EUR","category":"food","note":"lunch","date":"2026-01-15"} | income (same shape) | {"type":"task","title":"...","priority":2,"due":"2026-01-16","time":"18:00","recurrence":null} | {"type":"event","title":"...","date":"2026-01-16","time":"15:00","durationMin":60,"remindMin":30,"recurrence":null,"location":null} | {"type":"meal","title":"...","mealType":"lunch","items":[{"name":"...","kcal":250,"p":31,"c":0,"f":6}]}`

async function directChat(opts: {
  text: string
  tier: AiTier
  prefs: AiPrefs
  context: CtxData
  history?: { role: 'user' | 'ai'; text: string }[]
  onMeta?: (meta: AiMeta) => void
  onDelta?: (chunk: string) => void
  signal?: AbortSignal
}): Promise<{ text: string; meta: AiMeta }> {
  const settings = opts.context.settings
  const ctx = buildContext(opts.context)
  const parts: any[] = (opts.history || []).slice(-8).map((m) => ({ text: m.text }))
  parts.push({ text: opts.text })
  const text = await directGenerate(parts, DIRECT_CHAT_SYSTEM(ctx), settings, false)
  opts.onDelta?.(text)
  const usage = { date: todayISO(), count: -1, limit: -1 }
  const meta: AiMeta = { model: tierOfSettings(settings) === 'fast' ? 'gemini-3.5-flash-lite' : 'gemini-3.5-flash', tier: opts.tier, fellBack: false, downgraded: false, usage }
  opts.onMeta?.(meta)
  return { text, meta }
}

async function directAction(text: string, data: CtxData): Promise<AiResult> {
  const raw = await directGenerate([{ text }], DIRECT_ACTION_SYSTEM(buildContext(data)), data.settings, true)
  const parsed = extractJson(raw)
  return {
    reply: typeof parsed?.reply === 'string' ? parsed.reply : '',
    actions: Array.isArray(parsed?.actions) ? parsed.actions : [],
    clarify: typeof parsed?.clarify === 'string' && parsed.clarify.trim() ? parsed.clarify : null
  }
}

async function directTextMode(mode: 'insight' | 'finance', data: CtxData): Promise<string> {
  const ctx = buildContext(data)
  const system =
    mode === 'insight'
      ? `You generate ONE short personal insight (max 2 sentences) based ONLY on this real data. Reply in the user's language (default Russian). Plain text.\n\n${ctx}`
      : `You generate a SHORT personal finance report (max 4 sentences) about the current month based ONLY on this real data: income vs expenses, top categories, one actionable tip. Reply in the user's language (default Russian). Plain text.\n\n${ctx}`
  const text = await directGenerate([{ text: mode === 'insight' ? "Give today's insight." : "Generate this month's finance report." }], system, data.settings, false)
  return text.trim().slice(mode === 'insight' ? 0 : 0, mode === 'insight' ? 400 : 600)
}
