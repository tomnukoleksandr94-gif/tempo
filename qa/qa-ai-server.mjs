/**
 * QA: AI router + billing/promo logic on the real server (node server.mjs).
 * Starts the server on a test port, then exercises:
 *   - health
 *   - account registration + billing/status (promo + usage + tiers)
 *   - model registry
 *   - chat mode (real streaming SSE from Gemini via the router)
 *   - action mode (real structured output: expense + meal + event)
 *   - tier gating (free user requesting 'advanced' → honest downgrade)
 *   - daily limit enforcement (server-side, 429 after the limit)
 *   - auth rejection (401 without credentials)
 *
 * Run: node qa/qa-ai-server.mjs
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const PORT = 3111
const BASE = `http://127.0.0.1:${PORT}`
let pass = 0, fail = 0
const fails = []

function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`) }
  else { fail++; fails.push(name + (detail ? ` — ${detail}` : '')); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

async function post(path, body, timeoutMs = 60000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    })
    const json = await res.json().catch(() => ({}))
    return { status: res.status, json }
  } catch (e) {
    return { status: 0, json: { error: e?.name === 'AbortError' ? 'timeout' : String(e) } }
  } finally {
    clearTimeout(timer)
  }
}

// clean data file for a deterministic run
for (const f of ['data.json', 'data.backup.json']) { try { fs.unlinkSync(f) } catch {} }

const server = spawn('node', ['server.mjs'], {
  env: { ...process.env, PORT: String(PORT), ADMIN_PASS: 'test-admin-pass' },
  stdio: ['ignore', 'pipe', 'pipe']
})
server.stdout.on('data', (d) => process.env.VERBOSE && console.log('[srv]', d.toString().trim()))
server.stderr.on('data', (d) => console.log('[srv:err]', d.toString().trim()))
await new Promise((r) => setTimeout(r, 1200))

try {
  console.log('== health ==')
  const health = await post('/api/health', {})
  ok('health responds', health.status === 200 && health.json.ok === true)

  console.log('== auth: reject anonymous billing ==')
  const noAuth = await post('/api/billing/status', {})
  ok('billing/status without auth → 401', noAuth.status === 401)

  console.log('== account ==')
  const reg = await post('/api/auth/register', { username: 'qa_tester', password: 'secret123' })
  ok('register returns token', reg.status === 200 && !!reg.json.token)
  const token = reg.json.token

  console.log('== billing/status: promo + usage + tiers ==')
  const st = await post('/api/billing/status', { token, tzMinutes: 60 })
  ok('status ok', st.status === 200, JSON.stringify(st.json).slice(0, 200))
  ok('plan is free', st.json.plan === 'free')
  ok('promo active for new user', st.json.promo?.active === true)
  ok('promo code TEMPO3', st.json.promo?.code === 'TEMPO3')
  ok('promo prices discounted (plus monthly 1.99)', st.json.promo?.prices?.plus?.monthly === 1.99)
  ok('promo prices discounted (pro annual 86.9)', st.json.promo?.prices?.pro?.annual === 86.9)
  ok('usage limit 10 (free)', st.json.usage?.limit === 10)
  ok('tiers = [fast] on free', Array.isArray(st.json.tiers) && st.json.tiers.join() === 'fast')

  console.log('== model registry ==')
  const models = await post('/api/ai/models', { token })
  ok('registry lists only verified models', models.status === 200 && models.json.models?.length === 3)
  ok('all models verified', models.json.models?.every((m) => m.verified === true))
  ok('fast allowed, advanced locked on free', models.json.tiers?.find((t) => t.id === 'fast')?.allowed === true && models.json.tiers?.find((t) => t.id === 'advanced')?.allowed === false)

  console.log('== chat mode: real streaming (Gemini via router) ==')
  const t0 = Date.now()
  const chatRes = await fetch(BASE + '/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, tzMinutes: 60, mode: 'chat', stream: true, text: 'Say exactly: hello from tempo', tier: 'fast', prefs: { depth: 'fast', length: 'short', style: 'direct', behavior: 'simple' }, context: { today: '2026-11-13' }, locale: 'en' })
  })
  ok('stream responds 200', chatRes.status === 200)
  const reader = chatRes.body.getReader()
  const dec = new TextDecoder()
  let buf = '', full = '', meta = null, doneEv = null, errEv = null
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n'); buf = lines.pop() || ''
    for (const ln of lines) {
      if (!ln.startsWith('data: ')) continue
      try {
        const ev = JSON.parse(ln.slice(6))
        if (ev.type === 'meta') meta = ev
        if (ev.type === 'delta') full += ev.text
        if (ev.type === 'done') doneEv = ev
        if (ev.type === 'error') errEv = ev
      } catch {}
    }
  }
  ok('stream has meta event with model', !!meta?.model, JSON.stringify(meta))
  ok('stream has text deltas', full.trim().length > 0, `text="${full.slice(0, 60)}"`)
  ok('stream has done event', !!doneEv)
  ok('no stream error', !errEv, JSON.stringify(errEv))
  ok('usage counted (count 1)', meta?.usage?.count === 1, JSON.stringify(meta?.usage))
  console.log(`    (${Date.now() - t0}ms, model=${meta?.model}, text="${full.slice(0, 50)}")`)

  console.log('== action mode: real structured output ==')
  const act = await post('/api/ai/chat', {
    token, tzMinutes: 60, mode: 'action', text: 'Потратил 18 евро на обед, курица с рисом, завтра встреча в 15:00',
    tier: 'fast', prefs: { depth: 'fast', length: 'short', style: 'friendly', behavior: 'simple' },
    context: { today: '2026-11-13', currency: 'EUR', ui_language: 'ru' }, locale: 'ru'
  })
  ok('action responds 200', act.status === 200, JSON.stringify(act.json).slice(0, 300))
  const actions = act.json.actions || []
  const types = actions.map((a) => a.type).sort()
  ok('recognizes expense + meal + event', types.join(',') === 'event,expense,meal', `types=${types.join(',')}`)
  const exp = actions.find((a) => a.type === 'expense')
  ok('expense amount 18', exp && Math.abs(exp.amount - 18) < 0.01, JSON.stringify(exp))
  ok('usage counted (count 2)', act.json.usage?.count === 2, JSON.stringify(act.json.usage))
  console.log(`    reply="${(act.json.reply || '').slice(0, 60)}" actions=${types.join(',')}`)

  console.log('== tier gating: free user requests advanced ==')
  const adv = await post('/api/ai/chat', { token, tzMinutes: 60, mode: 'chat', text: 'hi', tier: 'advanced', prefs: {}, context: { today: '2026-11-13' }, locale: 'en' })
  ok('responds 200', adv.status === 200)
  ok('honestly downgraded to fast', adv.json.tier === 'fast' && adv.json.downgraded === true, JSON.stringify({ tier: adv.json.tier, downgraded: adv.json.downgraded }))

  console.log('== daily limit enforcement (server-side) ==')
  // already used 3 (chat, action, advanced); free limit is 10 → 7 more, then 429
  let last = null
  for (let i = 0; i < 8; i++) {
    last = await post('/api/ai/chat', { token, tzMinutes: 60, mode: 'chat', text: `count ${i}`, tier: 'fast', prefs: {}, context: { today: '2026-11-13' }, locale: 'en' }, 30000)
    if (last.status === 429) break
  }
  ok('11th request → 429 limit', last.status === 429 && last.json.error === 'limit', `status=${last.status}`)
  const usage = await post('/api/ai/usage', { token, tzMinutes: 60 })
  ok('usage endpoint reports 10/10', usage.json.count === 10 && usage.json.limit === 10, JSON.stringify(usage.json))

  console.log('== anonymous allowance ==')
  const anon = await post('/api/ai/usage', { tzMinutes: 60 })
  ok('anonymous usage 0/10', anon.status === 200 && anon.json.count === 0 && anon.json.limit === 10, JSON.stringify(anon.json))

  console.log('== timezone reset check (per-user local day) ==')
  // UTC+13 and UTC-11 are ALWAYS different calendar days, so exactly one of
  // them is the day the 10 requests were made on (count 10) and the other is
  // fresh (count 0) — deterministic at any hour of the day.
  const u13 = await post('/api/ai/usage', { token, tzMinutes: 780 })
  const u11 = await post('/api/ai/usage', { token, tzMinutes: -660 })
  ok('tz +13 and tz -11 are different local days', u13.json.date !== u11.json.date, JSON.stringify([u13.json, u11.json]))
  ok('the other local day is fresh (count 0)', (u13.json.count === 0) !== (u11.json.count === 0), JSON.stringify([u13.json, u11.json]))
} finally {
  server.kill('SIGTERM')
  await new Promise((r) => setTimeout(r, 300))
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
if (fails.length) { console.log('FAILURES:'); fails.forEach((f) => console.log('  - ' + f)); process.exit(1) }
