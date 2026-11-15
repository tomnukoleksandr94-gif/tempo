/**
 * AI Router — provider-independent model registry + fallback chain.
 *
 * Every model in the registry was verified with a REAL API request
 * (2026-11-13, generativelanguage.googleapis.com v1beta):
 *   gemini-3.5-flash-lite  — 1.2s, stable, JSON + systemInstruction + vision OK
 *   gemini-3.5-flash       — 1.6s, stable, JSON + systemInstruction + vision OK
 *   gemini-3.1-flash-lite  — 8.6s, stable (kept as last-resort fallback only)
 * NOT enabled (verified unstable at test time — hangs/503, see STATUS.md):
 *   gemini-3.8-flash, gemini-3.7-flash, gemini-3.6-flash, gemini-flash-latest,
 *   gemma-4-31b-it (17s, ignores system instructions).
 *
 * SECURITY: the API key lives ONLY in the server environment variable
 * GEMINI_API_KEY. There is NO embedded fallback key — an exposed key that was
 * once committed to this public repository is treated as compromised and was
 * removed. If the env is missing, every AI call fails with a clear
 * configuration error ('config') instead of silently using a public key.
 */

const GEMINI_KEY = process.env.GEMINI_API_KEY || ''
const API = 'https://generativelanguage.googleapis.com/v1beta/models'

/** Whether the server has a Gemini key configured (health/UI reporting). */
export const aiConfigured = () => !!GEMINI_KEY
const TIMEOUT_MS = 25_000
// Inactivity window mid-stream: a healthy model streams chunks every few
// hundred ms; 20s of silence means it stalled — abort, deliver the partial
// text or fall back to the next model.
const INACTIVITY_MS = 20_000

// ---------- registry (only verified models; never invented names) ----------

export const MODEL_REGISTRY = [
  {
    id: 'gemini-3.5-flash-lite',
    provider: 'google',
    displayName: 'Gemini 3.5 Flash Lite',
    tier: 'fast',
    plans: ['free', 'plus', 'pro'],
    vision: true,
    toolCalling: false,
    maxContextTokens: 1048576,
    freeTier: true,
    selectable: true,
    verified: true,
    note: 'Default model — fastest verified, used as the primary fallback.'
  },
  {
    id: 'gemini-3.5-flash',
    provider: 'google',
    displayName: 'Gemini 3.5 Flash',
    tier: 'balanced',
    plans: ['plus', 'pro'],
    vision: true,
    toolCalling: false,
    maxContextTokens: 1048576,
    freeTier: true,
    selectable: true,
    verified: true,
    note: 'Most intelligent verified model. Higher tiers of Gemini (3.6–3.8) are currently unstable and disabled.'
  },
  {
    id: 'gemini-3.1-flash-lite',
    provider: 'google',
    displayName: 'Gemini 3.1 Flash Lite',
    tier: 'fallback',
    plans: ['free', 'plus', 'pro'],
    vision: true,
    toolCalling: false,
    maxContextTokens: 1048576,
    freeTier: true,
    selectable: false, // slower; used automatically when the primary models fail
    verified: true,
    note: 'Automatic last-resort fallback.'
  }
]

/** Selection tiers exposed to users (map to registry models + generation params). */
export const TIERS = {
  fast: { model: 'gemini-3.5-flash-lite', maxOutputTokens: 2048, temperature: 0.3, label: 'Fast' },
  balanced: { model: 'gemini-3.5-flash', maxOutputTokens: 4096, temperature: 0.4, label: 'Balanced' },
  advanced: { model: 'gemini-3.5-flash', maxOutputTokens: 8192, temperature: 0.5, label: 'Advanced' }
}

const FALLBACK_CHAIN = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']

/** Plan → allowed tiers. Free = fast only; Plus = +balanced; Pro = +advanced. */
export const PLAN_TIERS = {
  free: ['fast'],
  plus: ['fast', 'balanced'],
  pro: ['fast', 'balanced', 'advanced']
}

export class AiRouterError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code // 'network' | 'auth' | 'quota' | 'parse' | 'busy' | 'timeout' | 'bad_request' | 'config'
  }
}

/** Fail fast with a clear configuration error when the key is missing. */
function requireKey() {
  if (!GEMINI_KEY) {
    throw new AiRouterError(
      'GEMINI_API_KEY is not configured on the server. Set it in the hosting environment (see .env.example).',
      'config'
    )
  }
}

function chainFor(tier) {
  const primary = TIERS[tier]?.model || TIERS.fast.model
  return [...new Set([primary, ...FALLBACK_CHAIN])]
}

// ---------- request body ----------

function buildBody({ parts, system, tier, prefs, jsonMode }) {
  const t = TIERS[tier] || TIERS.fast
  const gen = {
    temperature: typeof prefs?.temperature === 'number' ? Math.max(0, Math.min(1, prefs.temperature)) : t.temperature,
    maxOutputTokens: t.maxOutputTokens,
    responseMimeType: jsonMode ? 'application/json' : 'text/plain'
  }
  return {
    contents: [{ role: 'user', parts }],
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: gen
  }
}

/** Non-streaming generation with automatic fallback. Returns {text, model, fellBack}. */
export async function generate(opts) {
  requireKey()
  const chain = chainFor(opts.tier)
  let lastErr = new AiRouterError('AI unavailable', 'busy')
  for (const model of chain) {
    // one retry with backoff per model on transient network failure
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
      try {
        const res = await fetch(`${API}/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
          body: JSON.stringify(buildBody({ ...opts, tier: tierOfModel(model, opts.tier) })),
          signal: ctrl.signal
        })
        clearTimeout(timer)
        if (res.ok) {
          const json = await res.json()
          const finish = json?.candidates?.[0]?.finishReason || ''
          const text = (json?.candidates?.[0]?.content?.parts || [])
            .filter((p) => typeof p.text === 'string' && !p.thought)
            .map((p) => p.text)
            .join('') ?? ''
          if (finish === 'MAX_TOKENS') {
            lastErr = new AiRouterError('AI response truncated', 'parse')
            break // truncated JSON is unusable — next model
          }
          if (text.trim()) return { text, model, fellBack: model !== chain[0] }
          lastErr = new AiRouterError('Empty AI response', 'parse')
          continue
        }
        const err = await res.json().catch(() => ({}))
        const msg = err?.error?.message || `HTTP ${res.status}`
        if (res.status === 401 || res.status === 403 || /api key/i.test(msg)) {
          throw new AiRouterError('Invalid API key', 'auth')
        }
        if (res.status === 429) { lastErr = new AiRouterError('Quota exceeded', 'quota'); break }
        if (res.status === 503) { lastErr = new AiRouterError('Model busy', 'busy'); break }
        if (res.status === 400 && /not found|no longer/i.test(msg)) { lastErr = new AiRouterError('Model unavailable', 'busy'); break }
        if (res.status === 400 && /schema/i.test(msg)) { lastErr = new AiRouterError('Bad request', 'bad_request'); break }
        lastErr = new AiRouterError(msg, 'network')
        break
      } catch (e) {
        clearTimeout(timer)
        if (e instanceof AiRouterError) throw e
        if (e?.name === 'AbortError') {
          lastErr = new AiRouterError('Timeout', 'timeout')
          break // this model hangs — next model
        }
        if (attempt === 0) {
          // exponential backoff before the single retry
          await new Promise((r) => setTimeout(r, 700 * (attempt + 1)))
          continue
        }
        lastErr = new AiRouterError(e?.message || 'Network error', 'network')
        break
      }
    }
  }
  throw lastErr
}

function tierOfModel(model, requestedTier) {
  // keep the user's tier params, just swap the model id in the fallback chain
  return requestedTier
}

/**
 * Streaming generation (SSE). Calls onDelta(textChunk) as chunks arrive.
 * Returns {text, model, fellBack}. Falls back to the next model only BEFORE
 * the first chunk (mid-stream failures surface as an error to the caller).
 */
export async function generateStream(opts, onDelta) {
  requireKey()
  const chain = chainFor(opts.tier)
  let lastErr = new AiRouterError('AI unavailable', 'busy')
  for (const model of chain) {
    const ctrl = new AbortController()
    // Sliding watchdog: fires if NO chunk arrives within the window — covers
    // both a hung connect and a model that stalls mid-response. Any received
    // chunk re-arms it, so a healthy stream is never aborted.
    let timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    const armWatchdog = () => { clearTimeout(timer); timer = setTimeout(() => ctrl.abort(), INACTIVITY_MS) }
    try {
      const res = await fetch(`${API}/${model}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body: JSON.stringify(buildBody(opts)),
        signal: ctrl.signal
      })
      if (!res.ok) {
        clearTimeout(timer)
        const err = await res.json().catch(() => ({}))
        const msg = err?.error?.message || `HTTP ${res.status}`
        if (res.status === 401 || res.status === 403 || /api key/i.test(msg)) throw new AiRouterError('Invalid API key', 'auth')
        if (res.status === 429) { lastErr = new AiRouterError('Quota exceeded', 'quota'); continue }
        if (res.status === 503) { lastErr = new AiRouterError('Model busy', 'busy'); continue }
        if (res.status === 400 && /not found|no longer/i.test(msg)) { lastErr = new AiRouterError('Model unavailable', 'busy'); continue }
        lastErr = new AiRouterError(msg, 'network')
        continue
      }
      // stream SSE chunks
      let text = ''
      let first = true
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (!payload || payload === '[DONE]') continue
          try {
            const ev = JSON.parse(payload)
            const chunk = (ev?.candidates?.[0]?.content?.parts || [])
              .filter((p) => typeof p.text === 'string' && !p.thought)
              .map((p) => p.text)
              .join('')
            if (chunk) {
              if (first) first = false
              armWatchdog() // model is alive — re-arm the inactivity watchdog
              text += chunk
              onDelta(chunk)
            }
          } catch { /* skip malformed SSE frame */ }
        }
      }
      if (text.trim()) return { text, model, fellBack: model !== chain[0] }
      lastErr = new AiRouterError('Empty AI response', 'parse')
    } catch (e) {
      clearTimeout(timer)
      if (e instanceof AiRouterError) throw e
      if (e?.name === 'AbortError') {
        // watchdog fired. Partial text already streamed → deliver it (better
        // than losing a mostly-complete answer); nothing streamed → this
        // model hangs, fall back to the next one in the chain.
        if (text.trim()) return { text, model, fellBack: model !== chain[0] }
        lastErr = new AiRouterError('Timeout', 'timeout')
        continue
      }
      lastErr = new AiRouterError(e?.message || 'Network error', 'network')
      continue
    }
  }
  throw lastErr
}

// ---------- prompts (server-owned; the client never defines them) ----------

const PREFERENCES = {
  depth: {
    fast: 'Answer concisely and quickly — prioritize speed over completeness.',
    balanced: '',
    deep: 'Think the answer through carefully and analyze the user\'s data in depth before answering.'
  },
  length: {
    short: 'Keep the answer short: at most 2 sentences.',
    normal: '',
    detailed: 'Give a detailed, well-structured answer.'
  },
  style: {
    friendly: 'Communicate in a warm, friendly tone.',
    professional: 'Communicate in a professional, business-like tone.',
    neutral: 'Communicate in a neutral, matter-of-fact tone.',
    direct: 'Be direct and to the point; no small talk.'
  },
  behavior: {
    simple: 'Explain things simply, without jargon.',
    detailed: 'Explain things thoroughly and in detail.',
    analytical: 'Be analytical: use numbers, comparisons and concrete observations from the data.',
    step: 'When giving instructions, present them as a numbered step-by-step list.'
  }
}

export function prefsToPrompt(prefs) {
  const p = prefs || {}
  const parts = []
  for (const [key, map] of Object.entries(PREFERENCES)) {
    const v = p[key]
    if (v && map[v]) parts.push(map[v])
  }
  return parts.length ? '\n\nResponse style preferences:\n- ' + parts.join('\n- ') : ''
}

const ACTION_RULES = `You are Tempo, the AI core of a personal life OS (finance, tasks, calendar, nutrition).
Current user context (REAL data, the only source of truth about their records):
{CONTEXT}{PREFS}

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

const CHAT_RULES = `You are Tempo, the AI assistant of a personal life OS (finance, tasks, calendar, nutrition).
Current user context (REAL data, the only source of truth about their records):
{CONTEXT}{PREFS}

Rules:
1. Reply in the user's language (default: Russian). Plain text only — no JSON, no markdown code fences.
2. Answer questions about the user's data ONLY from the context. If the information is not there, say so honestly.
3. Be helpful, concrete and brief. Do not invent numbers, dates or records.
4. If the user asks to create/change records (add an expense, a task, an event, a meal), tell them to switch to Action mode (the toggle above the input) — in Chat mode you cannot modify data.`

const INSIGHT_RULES = `You generate ONE short personal insight (max 2 sentences) about the user's day/week based ONLY on this real data. Point out something concrete and useful (spending pattern, task load, nutrition balance, upcoming event). Reply in the user's language (default Russian). Plain text, no JSON.

{CONTEXT}`

const FINANCE_RULES = `You generate a SHORT personal finance report (max 4 sentences) about the current month based ONLY on this real data: total income vs expenses, top spending categories, budget overruns if visible, and ONE concrete actionable tip. If there is almost no financial data, say so honestly and briefly. Reply in the user's language (default Russian). Plain text, no JSON.

{CONTEXT}`

export function systemPrompt(mode, context, prefs, locale) {
  const ctx = typeof context === 'string' ? context : JSON.stringify(context || {})
  // Language directive for EVERY mode (chat, action, insight, finance) — the
  // assistant must never silently fall back to Russian when the user picked
  // another language.
  const lang = locale && locale !== 'ru' ? `\nIMPORTANT: The user's interface language is "${locale}". Reply in ${locale}. Do not reply in Russian unless the user writes in Russian.` : ''
  if (mode === 'action') return ACTION_RULES.replace('{CONTEXT}', ctx).replace('{PREFS}', prefsToPrompt(prefs)) + lang
  if (mode === 'insight') return INSIGHT_RULES.replace('{CONTEXT}', ctx) + lang
  if (mode === 'finance') return FINANCE_RULES.replace('{CONTEXT}', ctx) + lang
  return CHAT_RULES.replace('{CONTEXT}', ctx).replace('{PREFS}', prefsToPrompt(prefs)) + lang
}

/** Extract the first JSON object from a model reply. */
export function extractJson(text) {
  let t = String(text || '').trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) t = t.slice(start, end + 1)
  return JSON.parse(t)
}
