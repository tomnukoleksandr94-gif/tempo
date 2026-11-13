/**
 * QA: payments & promo logic (LiqPay flow with TEST keys + webhook security).
 * Uses test LiqPay keys so signatures can be forged locally — verifies:
 *   - card-link applies the TEMPO3 discount to the first payment (€1.99/€5.99)
 *   - the LiqPay callback activates the subscription and consumes the promo
 *   - a second purchase returns to the normal price (no duplicate discount)
 *   - duplicate callbacks are idempotent (no double activation)
 *   - the Telegram webhook rejects requests without the secret token (403)
 *   - bad signatures are rejected (403)
 *
 * NOTE: real money flows (live LiqPay keys, Telegram Stars invoices) require
 * merchant credentials and are NOT tested here — see STATUS.md.
 * Run: node qa/qa-payments.mjs
 */
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'

const PORT = 3112
const BASE = `http://127.0.0.1:${PORT}`
const LIQ_PUBLIC = 'test_public_key'
const LIQ_PRIVATE = 'test_private_key'
let pass = 0, fail = 0
const fails = []

function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`) }
  else { fail++; fails.push(name + (detail ? ` — ${detail}` : '')); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

async function post(path, body) {
  try {
    const res = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { status: res.status, json: await res.json().catch(() => ({})) }
  } catch (e) { return { status: 0, json: { error: String(e) } } }
}

/** Extract order_id from a LiqPay checkout URL (data param is base64 JSON). */
function orderIdOf(linkRes) {
  try {
    const u = new URL(linkRes.json.url)
    const data = JSON.parse(Buffer.from(u.searchParams.get('data'), 'base64').toString('utf8'))
    return data.order_id
  } catch { return '' }
}

for (const f of ['data.json', 'data.backup.json']) { try { fs.unlinkSync(f) } catch {} }

const server = spawn('node', ['server.mjs'], {
  env: { ...process.env, PORT: String(PORT), ADMIN_PASS: 'test-admin-pass', LIQPAY_PUBLIC_KEY: LIQ_PUBLIC, LIQPAY_PRIVATE_KEY: LIQ_PRIVATE },
  stdio: ['ignore', 'ignore', 'pipe']
})
server.stderr.on('data', (d) => console.log('[srv:err]', d.toString().trim()))
await new Promise((r) => setTimeout(r, 1200))

const sign = (b64) => crypto.createHash('sha1').update(LIQ_PRIVATE + b64 + LIQ_PRIVATE).digest('base64')

try {
  console.log('== setup: account ==')
  const reg = await post('/api/auth/register', { username: 'qa_pay', password: 'secret123' })
  const token = reg.json.token
  ok('registered', !!token)

  console.log('== card link with promo (first payment) ==')
  const link1 = await post('/api/billing/card-link', { token, plan: 'plus', period: 'monthly' })
  ok('card-link ok', link1.status === 200, JSON.stringify(link1.json).slice(0, 200))
  ok('first payment discounted €1.99', link1.json.amountEur === 1.99, `amount=${link1.json.amountEur}`)
  ok('promo flag set', link1.json.promo === true)
  const orderId = orderIdOf(link1)
  ok('order id extracted', !!orderId, orderId)

  console.log('== webhook security ==')
  const noSecret = await post('/api/telegram-webhook', { message: { text: 'hi' } })
  ok('telegram webhook without secret → 403', noSecret.status === 403)
  const badSig = await post('/api/liqpay-callback', { data: Buffer.from('{}').toString('base64'), signature: 'forged' })
  ok('liqpay callback with bad signature → 403', badSig.status === 403)

  console.log('== liqpay callback: activation + promo consumption ==')
  const ev = Buffer.from(JSON.stringify({ status: 'success', order_id: orderId, amount: 1.99, currency: 'EUR' })).toString('base64')
  const cb1 = await post('/api/liqpay-callback', { data: ev, signature: sign(ev) })
  ok('callback accepted', cb1.status === 200)
  const st1 = await post('/api/billing/status', { token })
  ok('subscription active plus', st1.json.plan === 'plus' && st1.json.status === 'active', JSON.stringify({ plan: st1.json.plan, status: st1.json.status }))
  ok('promo consumed (active=false)', st1.json.promo?.active === false)
  ok('usage limit now 100 (plus)', st1.json.usage?.limit === 100)
  ok('tiers now fast+balanced', st1.json.tiers?.join() === 'fast,balanced')
  const exp1 = new Date(st1.json.expiresAt).getTime()

  console.log('== duplicate callback is idempotent ==')
  const cb2 = await post('/api/liqpay-callback', { data: ev, signature: sign(ev) })
  ok('duplicate accepted', cb2.status === 200)
  const st2 = await post('/api/billing/status', { token })
  const exp2 = new Date(st2.json.expiresAt).getTime()
  ok('expiry unchanged (no double activation)', exp1 === exp2, `${exp1} vs ${exp2}`)

  console.log('== second purchase: normal price (no duplicate discount) ==')
  const link2 = await post('/api/billing/card-link', { token, plan: 'pro', period: 'monthly' })
  ok('second payment at full €8.99', link2.json.amountEur === 8.99, `amount=${link2.json.amountEur}`)
  ok('promo flag false', link2.json.promo === false)

  console.log('== failed payment does not activate ==')
  const failOrder = orderIdOf(await post('/api/billing/card-link', { token, plan: 'plus', period: 'annual' }))
  const evFail = Buffer.from(JSON.stringify({ status: 'failure', order_id: failOrder })).toString('base64')
  await post('/api/liqpay-callback', { data: evFail, signature: sign(evFail) })
  const st3 = await post('/api/billing/status', { token })
  ok('failure callback leaves plan unchanged', st3.json.plan === 'plus')
} finally {
  server.kill('SIGTERM')
  await new Promise((r) => setTimeout(r, 300))
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
if (fails.length) { console.log('FAILURES:'); fails.forEach((f) => console.log('  - ' + f)); process.exit(1) }
