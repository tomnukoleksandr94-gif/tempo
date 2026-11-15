/**
 * QA: security hardening (CORS allow-list, security headers, body size cap,
 * account self-deletion, Telegram linking, LiqPay sandbox rejection,
 * AI configuration error, AI burst rate limit, auth rate limit, webhook secret).
 *
 * Requires NO real credentials: all checks run against a local server with
 * test LiqPay keys and NO GEMINI_API_KEY (which is itself one of the checks).
 *
 * NOT tested here (needs real credentials, see STATUS.md):
 *   - real Telegram initData verification (BOT_TOKEN)
 *   - real Gemini generation (GEMINI_API_KEY)
 *
 * Run: node qa/qa-security.mjs
 */
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'

const PORT = 3113
const BASE = `http://127.0.0.1:${PORT}`
const LIQ_PUBLIC = 'test_public_key'
const LIQ_PRIVATE = 'test_private_key'
let pass = 0, fail = 0
const fails = []

function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`) }
  else { fail++; fails.push(name + (detail ? ` — ${detail}` : '')); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

async function post(path, body, headers = {}) {
  try {
    const res = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    })
    return { status: res.status, json: await res.json().catch(() => ({})), headers: res.headers }
  } catch (e) { return { status: 0, json: { error: String(e) } } }
}

function orderIdOf(linkRes) {
  try {
    const u = new URL(linkRes.json.url)
    const data = JSON.parse(Buffer.from(u.searchParams.get('data'), 'base64').toString('utf8'))
    return data.order_id
  } catch { return '' }
}

for (const f of ['data.json', 'data.backup.json']) { try { fs.unlinkSync(f) } catch {} }

const server = spawn('node', ['server.mjs'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    ADMIN_PASS: 'test-admin-pass',
    LIQPAY_PUBLIC_KEY: LIQ_PUBLIC,
    LIQPAY_PRIVATE_KEY: LIQ_PRIVATE,
    WEBHOOK_SECRET: 'qa-webhook-secret'
    // NOTE: no GEMINI_API_KEY, no BOT_TOKEN — on purpose (part of the checks)
  },
  stdio: ['ignore', 'ignore', 'pipe']
})
server.stderr.on('data', (d) => console.log('[srv:err]', d.toString().trim()))
await new Promise((r) => setTimeout(r, 1200))

const liqSign = (b64) => crypto.createHash('sha1').update(LIQ_PRIVATE + b64 + LIQ_PRIVATE).digest('base64')

try {
  console.log('== health & security headers ==')
  const health = await post('/api/health', {})
  ok('health ok', health.status === 200)
  ok('AI reported unconfigured (no key)', health.json.ai === false, JSON.stringify(health.json))
  ok('nosniff header', health.headers.get('x-content-type-options') === 'nosniff')
  ok('frame deny header', health.headers.get('x-frame-options') === 'DENY')
  ok('referrer policy header', health.headers.get('referrer-policy') === 'no-referrer')
  ok('no-store header', health.headers.get('cache-control') === 'no-store')

  console.log('== CORS allow-list ==')
  const goodOrigin = await post('/api/health', {}, { Origin: 'http://localhost:5173' })
  ok('localhost origin allowed', goodOrigin.headers.get('access-control-allow-origin') === 'http://localhost:5173')
  const evilOrigin = await post('/api/health', {}, { Origin: 'https://evil.example' })
  ok('foreign origin NOT allowed', (evilOrigin.headers.get('access-control-allow-origin') || '') !== 'https://evil.example',
    evilOrigin.headers.get('access-control-allow-origin') || '(none)')
  const noOrigin = await post('/api/health', {})
  ok('no origin → no wildcard', noOrigin.headers.get('access-control-allow-origin') !== '*')

  console.log('== body size cap (12 MB) ==')
  {
    const big = 'x'.repeat(13 * 1024 * 1024)
    let destroyed = false, status = null
    try {
      const res = await fetch(BASE + '/api/reminders/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: 'x', events: [{ id: big }] })
      })
      status = res.status
      await res.text()
    } catch { destroyed = true }
    ok('oversized body rejected (destroyed or error, never 200)', destroyed || status === 0 || status >= 400,
      `status=${status} destroyed=${destroyed}`)
  }

  console.log('== account deletion (GDPR self-service) ==')
  const reg = await post('/api/auth/register', { username: 'qa_del', password: 'secret123' })
  const token = reg.json.token
  ok('registered', !!token)
  const wrong = await post('/api/account/delete', { token, password: 'nope' })
  ok('wrong password → 403', wrong.status === 403, `status=${wrong.status}`)
  const del = await post('/api/account/delete', { token, password: 'secret123' })
  ok('correct password deletes', del.status === 200, `status=${del.status}`)
  const after = await post('/api/account/data', { token })
  ok('old session revoked', after.status === 401, `status=${after.status}`)
  const re = await post('/api/auth/register', { username: 'qa_del', password: 'newpass123' })
  ok('username free again after deletion', !!re.json.token, JSON.stringify(re.json).slice(0, 100))

  console.log('== telegram linking (no BOT_TOKEN → honest failure) ==')
  const link = await post('/api/account/link-telegram', { token: re.json.token, initData: 'fakedata' })
  ok('fake initData rejected', link.status === 400, `status=${link.status}`)

  console.log('== telegram webhook secret ==')
  const hook = await post('/api/telegram-webhook', {}, {})
  ok('webhook without secret → 403', hook.status === 403, `status=${hook.status}`)

  console.log('== LiqPay: sandbox must NOT activate without LIQPAY_SANDBOX ==')
  const link2 = await post('/api/billing/card-link', { token: re.json.token, plan: 'plus', period: 'monthly' })
  ok('card-link ok', link2.status === 200, JSON.stringify(link2.json).slice(0, 150))
  const orderId = orderIdOf(link2)
  ok('order id extracted', !!orderId)
  {
    const ev = {
      order_id: orderId, status: 'sandbox', amount: link2.json.amountEur, currency: 'EUR'
    }
    const b64 = Buffer.from(JSON.stringify(ev)).toString('base64')
    const cb = await post('/api/liqpay-callback', { data: b64, signature: liqSign(b64) })
    ok('sandbox callback accepted as response (idempotent)', cb.status === 200, `status=${cb.status}`)
    const st = await post('/api/billing/status', { token: re.json.token })
    ok('sandbox did NOT activate subscription', st.json.plan !== 'plus' || st.json.status !== 'active',
      JSON.stringify({ plan: st.json.plan, status: st.json.status }))
  }
  {
    // unknown order with valid signature must be rejected
    const ev = { order_id: `lp_${re.json.userId || 'x'}_plus_monthly_${Date.now()}`, status: 'success', amount: 1.99, currency: 'EUR' }
    const b64 = Buffer.from(JSON.stringify(ev)).toString('base64')
    const cb = await post('/api/liqpay-callback', { data: b64, signature: liqSign(b64) })
    ok('unknown order rejected (400)', cb.status === 400, `status=${cb.status}`)
  }
  {
    // bad signature rejected
    const b64 = Buffer.from('{"order_id":"x","status":"success"}').toString('base64')
    const cb = await post('/api/liqpay-callback', { data: b64, signature: 'badsignature' })
    ok('bad signature rejected (403)', cb.status === 403, `status=${cb.status}`)
  }

  console.log('== AI: missing key → clear config error, quota untouched ==')
  {
    const chat = await post('/api/ai/chat', { token: re.json.token, text: 'hi', mode: 'chat', tzMinutes: 0 })
    ok('chat → 503 config error', chat.status === 503 && chat.json.error === 'config',
      `status=${chat.status} ${JSON.stringify(chat.json).slice(0, 120)}`)
    const usage = await post('/api/ai/usage', { token: re.json.token })
    ok('quota NOT consumed by config failure', (usage.json.count ?? 0) === 0, JSON.stringify(usage.json).slice(0, 100))
  }

  console.log('== AI burst rate limit (30/min) ==')
  {
    // the config-error test above already consumed 1 request; the limiter
    // therefore trips on the 30th request of this loop
    let rateLimitedAt = -1
    for (let i = 1; i <= 32; i++) {
      const r = await post('/api/ai/chat', { token: re.json.token, text: 'hi', mode: 'chat', tzMinutes: 0 })
      if (r.status === 429 && r.json.error === 'rate') { rateLimitedAt = i; break }
    }
    ok('30th request in a minute → 429 rate', rateLimitedAt === 30, `limited at #${rateLimitedAt}`)
  }
} finally {
  server.kill()
  await new Promise((r) => setTimeout(r, 300))
}

// ---------- auth rate limit: separate server process (fresh limiter state) ----------
{
  const p2 = 3114
  const BASE2 = `http://127.0.0.1:${p2}`
  const s2 = spawn('node', ['server.mjs'], {
    env: { ...process.env, PORT: String(p2), ADMIN_PASS: 'test-admin-pass' },
    stdio: ['ignore', 'ignore', 'ignore']
  })
  await new Promise((r) => setTimeout(r, 1200))
  try {
    console.log('== auth rate limit (fresh server) ==')
    const reg = await fetch(`${BASE2}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'qa_sec', password: 'secret123' })
    }).then((r) => r.json())
    ok('registered (rate-limit server)', !!reg.token)
    let limitedAt = -1
    for (let i = 1; i <= 6; i++) {
      const r = await fetch(`${BASE2}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'qa_sec', password: 'wrong' })
      })
      if (r.status === 429) { limitedAt = i; break }
    }
    ok('5th failed login rate limited (429; register counts as 1st hit)', limitedAt === 5, `limited at #${limitedAt}`)
  } finally {
    s2.kill()
    await new Promise((r) => setTimeout(r, 300))
  }
}

for (const f of ['data.json', 'data.backup.json']) { try { fs.unlinkSync(f) } catch {} }

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
if (fail) { console.log('FAILURES:'); fails.forEach((f) => console.log(' -', f)); process.exit(1) }
