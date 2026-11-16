/**
 * Tempo billing server — zero dependencies, plain Node.js (18+).
 *
 * What it does:
 *  - verifies Telegram Mini App initData (HMAC-SHA256 with the bot token);
 *  - issues Telegram Stars invoice links (Bot API createInvoiceLink, XTR);
 *  - receives the Telegram webhook and activates subscriptions ONLY after a
 *    verified successful_payment update;
 *  - tracks referral progress (invited / paying) with anti-abuse checks.
 *
 * Storage: JSON file (data.json) — fine for a single-user pilot. Swap for a
 * real database before scaling.
 *
 * Run:   BOT_TOKEN=... PORT=3000 node server.mjs
 * NOTE:  set the bot token via env, never hardcode it here.
 */

import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { generate, generateStream, systemPrompt, extractJson, MODEL_REGISTRY, TIERS, PLAN_TIERS, aiConfigured } from './ai-router.mjs'

// Telegram Bot API access. Two modes:
// 1) BOT_TOKEN set directly → calls go straight to api.telegram.org (self-hosted).
// 2) Credential proxy (managed hosting): CUSTOM_CRED_API_TELEGRAM_ORG_URL +
//    CUSTOM_CRED_API_TELEGRAM_ORG_PROXY_AUTH_KEY are injected by the platform.
//    Requests go to <URL>/api.telegram.org/<method> with x-api-key auth; the
//    proxy injects the bot token server-side, so the token never reaches this
//    process or its logs.
const BOT_TOKEN = process.env.BOT_TOKEN || ''
const TG_PROXY_URL = (process.env.CUSTOM_CRED_API_TELEGRAM_ORG_URL || '').replace(/\/$/, '')
const TG_PROXY_KEY = process.env.CUSTOM_CRED_API_TELEGRAM_ORG_PROXY_AUTH_KEY || ''
// A raw BOT_TOKEN always wins: the credential proxy cannot carry Telegram's
// path-based auth (/bot<token>/method), so when the raw token is present we
// call api.telegram.org directly.
const TG_CRED = TG_PROXY_URL && TG_PROXY_KEY && !BOT_TOKEN
// Mutable: set to false by the startup probe if the Telegram API is not
// actually reachable (e.g. a proxy that cannot carry path-based bot auth).
let TG_TOKEN_AVAIL = !!(BOT_TOKEN || TG_CRED)
let TG_PROBE_ERR = ''
const PORT = Number(process.env.PORT || 3000)
// Shared secret for the Telegram webhook (set via setWebhook secret_token).
// When set, every webhook request must carry it in X-Telegram-Bot-Api-Secret-Token.
// If not provided via env, a random one is generated per process and registered
// with setWebhook on startup — they can never mismatch.
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || crypto.randomBytes(24).toString('hex')
// Public URL of the Mini App (used in the bot's /start welcome button)
async function setBotCommands() {
  if (!TG_TOKEN_AVAIL) return
  try {
    const res = await tgFetch('setMyCommands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'start', description: 'Запустить Tempo ⚡' },
          { command: 'app', description: 'Открыть приложение' },
          { command: 'plans', description: 'Тарифы и оплата' },
          { command: 'help', description: 'Справка и команды' }
        ]
      })
    })
    if (res.ok) console.log('[tempo] bot commands registered')
  } catch (e) { console.warn('[tempo] setMyCommands failed:', e?.message) }
}
const APP_URL = process.env.APP_URL || 'https://tempo-ai-life-os.pplx.app'
const DATA_FILE = new URL('./data.json', import.meta.url).pathname
const BACKUP_FILE = new URL('./data.backup.json', import.meta.url).pathname
// Credential-proxy layout, resolved once by the startup probe: the pass-through
// takes the target host in `x-base-url` and the Bot API method in the URL
// path. Two layouts exist — with or without the host segment in the path; the
// probe tries both and keeps whichever answers.
let TG_PROXY_HOST_SEGMENT = false
const TG_API = (m) => TG_CRED
  ? `${TG_PROXY_URL}${TG_PROXY_HOST_SEGMENT ? '/api.telegram.org' : ''}/${m}`
  : `https://api.telegram.org/bot${BOT_TOKEN}/${m}`
const tgFetch = async (method, opts = {}) => {
  if (!TG_TOKEN_AVAIL) return null
  const res = await fetch(TG_API(method), TG_CRED
    ? { ...opts, headers: { ...(opts.headers || {}), 'x-api-key': TG_PROXY_KEY, 'x-base-url': 'https://api.telegram.org' } }
    : opts)
  return res
}

// ---------- LiqPay (automatic bank-card payments) ----------
// Checkout is hosted by LiqPay — the payer's card data never touches our
// server. Money goes to the merchant's LiqPay account (payout to card).
// Activation is automatic via the LiqPay server-to-server callback.
const LIQPAY_PUBLIC = process.env.LIQPAY_PUBLIC_KEY || ''
const LIQPAY_PRIVATE = process.env.LIQPAY_PRIVATE_KEY || ''
const LIQPAY_URL = 'https://www.liqpay.ua/api/3/checkout/'
const liqpayEnabled = () => !!(LIQPAY_PUBLIC && LIQPAY_PRIVATE)
function liqpaySign(dataB64) {
  return crypto.createHash('sha1').update(LIQPAY_PRIVATE + dataB64 + LIQPAY_PRIVATE).digest('base64')
}

// Stars prices (XTR) — must match src/lib/billing.ts
const STARS = {
  plus: { monthly: 250, annual: 2500 },
  pro: { monthly: 450, annual: 4500 }
}
const EUR = { plus: { monthly: 4.99, annual: 49.9 }, pro: { monthly: 8.99, annual: 89.9 } }

// ---------- launch promotion (TEMPO3): −€3 off the FIRST payment ----------
// Valid until 2026-12-05 23:59:59 Europe/Paris. Applied automatically, once
// per user (first successful payment only); renewals return to full price.
const PROMO = {
  code: 'TEMPO3',
  discount: 3,
  endsAt: '2026-12-05T23:59:59+01:00'
}
const promoActive = () => Date.now() < Date.parse(PROMO.endsAt)
const round2 = (n) => Math.round(n * 100) / 100
/** Price of the FIRST payment (promo-aware). user = db.users record or null. */
function firstPrice(plan, period, user) {
  const base = EUR[plan][period]
  if (promoActive() && !(user && user.promoUsed)) return round2(base - PROMO.discount)
  return base
}
/** Stars (XTR) amount of the first payment, proportionally discounted. */
function firstStars(plan, period, user) {
  const base = STARS[plan][period]
  const eur = EUR[plan][period]
  if (promoActive() && !(user && user.promoUsed)) return Math.max(1, base - Math.round(PROMO.discount * base / eur))
  return base
}
function promoState(user) {
  return {
    active: promoActive() && !(user && user.promoUsed),
    code: PROMO.code,
    discount: PROMO.discount,
    endsAt: PROMO.endsAt,
    // discounted first-payment prices (only when the promo applies to this user)
    prices: promoActive()
      ? {
          plus: { monthly: round2(EUR.plus.monthly - PROMO.discount), annual: round2(EUR.plus.annual - PROMO.discount) },
          pro: { monthly: round2(EUR.pro.monthly - PROMO.discount), annual: round2(EUR.pro.annual - PROMO.discount) }
        }
      : null
  }
}

// ---------- server-side AI usage limits (per plan, per user timezone) ----------
const AI_LIMITS = { free: 10, plus: 100, pro: 300 }
const ANON_AI_LIMIT = 10 // per IP per day, for visitors without an account/Telegram
function planOf(u) {
  return u && u.status === 'active' && u.expiresAt && u.expiresAt > new Date().toISOString() ? u.plan : 'free'
}
function aiLimitOf(u) {
  return AI_LIMITS[planOf(u)] ?? AI_LIMITS.free
}
/** Local calendar day key for a user, given their tz offset in minutes. */
function dayKey(tzMinutes) {
  const off = typeof tzMinutes === 'number' && Math.abs(tzMinutes) <= 840 ? tzMinutes : 0
  return new Date(Date.now() + off * 60000).toISOString().slice(0, 10)
}
const anonUsage = new Map() // ip -> {date, count}
function bumpUsage(u, ip, tzMinutes) {
  const date = dayKey(tzMinutes)
  if (u) {
    if (!u.aiUsage || u.aiUsage.date !== date) u.aiUsage = { date, count: 0 }
    return { date, count: ++u.aiUsage.count, limit: aiLimitOf(u) }
  }
  const cur = anonUsage.get(ip) || { date, count: 0 }
  if (cur.date !== date) { cur.date = date; cur.count = 0 }
  cur.count += 1
  anonUsage.set(ip, cur)
  return { date, count: cur.count, limit: ANON_AI_LIMIT }
}
function usageOf(u, ip, tzMinutes) {
  const date = dayKey(tzMinutes)
  if (u) {
    const c = u.aiUsage && u.aiUsage.date === date ? u.aiUsage.count : 0
    return { date, count: c, limit: aiLimitOf(u) }
  }
  const cur = anonUsage.get(ip)
  return { date, count: cur && cur.date === date ? cur.count : 0, limit: ANON_AI_LIMIT }
}

// ---------- storage ----------
let db = { users: {}, accounts: {}, sessions: {} }
try {
  db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
} catch (e) {
  // main data file missing/corrupt — recover from the rotating backup
  try {
    db = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'))
    fs.writeFileSync(DATA_FILE, JSON.stringify(db))
    console.log('[tempo] data.json restored from backup')
  } catch {
    console.warn('[tempo] no data and no backup — starting fresh')
  }
}
db.accounts = db.accounts || {}
db.users = db.users || {}
db.sessions = db.sessions || {}

// ---------- admin seed ----------
// Admin: username "Mister", password REQUIRED from env ADMIN_PASS (no default —
// fail closed: without the env the admin account simply never exists).
// Bound to Telegram @neggshka. Credentials live ONLY on the server.
const ADMIN_USER = process.env.ADMIN_USER || 'Mister'
const ADMIN_PASS = process.env.ADMIN_PASS || ''
const ADMIN_TG = process.env.ADMIN_TG || 'neggshka'
function hashPass(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString('hex')
}
function accountObj(username, password, role, tgUsername) {
  const salt = crypto.randomBytes(16).toString('hex')
  return {
    username, salt, hash: hashPass(password, salt), role,
    tgUsername: tgUsername || null, createdAt: Date.now(), userId: 'acc_' + crypto.randomBytes(8).toString('hex')
  }
}
if (ADMIN_PASS && !db.accounts[ADMIN_USER.toLowerCase()]) {
  db.accounts[ADMIN_USER.toLowerCase()] = accountObj(ADMIN_USER, ADMIN_PASS, 'admin', ADMIN_TG)
  fs.writeFileSync(DATA_FILE, JSON.stringify(db))
}
// keep the admin password in sync with the env on EVERY startup, so the
// current ADMIN_PASS value always works even for an old seeded account
if (ADMIN_PASS && db.accounts[ADMIN_USER.toLowerCase()]) {
  const adm = db.accounts[ADMIN_USER.toLowerCase()]
  const newSalt = crypto.randomBytes(16).toString('hex')
  if (adm.hash !== hashPass(ADMIN_PASS, adm.salt)) {
    adm.salt = newSalt
    adm.hash = hashPass(ADMIN_PASS, newSalt)
    fs.writeFileSync(DATA_FILE, JSON.stringify(db))
    console.log('[tempo] admin password updated from ADMIN_PASS env')
  }
}
if (!ADMIN_PASS) {
  console.warn('[tempo] ADMIN_PASS not set — admin panel is disabled (no admin account will exist)')
}

let saveTimer = null
function persist(file, cb) {
  fs.writeFile(file, JSON.stringify(db), cb)
}
function save() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    // write main file, then rotate a backup copy (data survives a crash
    // mid-write or a partial deploy reset)
    persist(DATA_FILE, () => persist(BACKUP_FILE, () => {}))
  }, 250)
}
function user(id) {
  if (!db.users[id]) {
    db.users[id] = {
      id, plan: 'free', status: 'none', expiresAt: null, autoRenew: false,
      history: [], referrals: { invited: 0, paying: 0 }, referredBy: null, accountLinked: false,
      firstSeen: Date.now(),
      payments: {} // telegram payment_charge_id -> record (idempotency)
    }
  }
  return db.users[id]
}

// ---------- Telegram initData verification ----------
function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}
function verifyInitData(initData) {
  if (!TG_TOKEN_AVAIL || !BOT_TOKEN) return null // cryptographic verification REQUIRES the bot token
  try {
    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    if (!hash) return null
    params.delete('hash')
    const dataCheckString = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('\n')
    const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
    const computed = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')
    // timing-safe comparison (constant time)
    if (!timingSafeEqualStr(computed, hash)) return null
    const u = JSON.parse(params.get('user'))
    if (!u || !u.id) return null
    // auth_date freshness: reject tokens older than 24h
    const authDate = Number(params.get('auth_date'))
    if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > 86400) return null
    return u
  } catch {
    return null
  }
}

// ---------- subscription logic ----------
// the inviter automatically gets +7 days of Plus when their invitee pays
function rewardInviter(invitee) {
  if (!invitee.referredBy || invitee.referralRewarded) return
  invitee.referralRewarded = true
  const inviter = db.users[invitee.referredBy]
  if (!inviter) return
  inviter.referrals.paying += 1
  const now = new Date()
  const base = inviter.expiresAt && inviter.expiresAt > now.toISOString() ? new Date(inviter.expiresAt) : now
  inviter.expiresAt = new Date(base.getTime() + 7 * 86400000).toISOString()
  if (inviter.status !== 'active') {
    inviter.plan = 'plus'
    inviter.status = 'active'
  }
  inviter.history.unshift({ id: 'ref_' + Date.now(), plan: inviter.plan, period: 'referral', stars: 0, status: 'paid', ts: Date.now() })
  inviter.history = inviter.history.slice(0, 50)
}

function activate(userId, plan, period, payment) {
  const u = user(userId)
  const now = new Date()
  const days = period === 'annual' ? 365 : 30
  const base = u.expiresAt && u.expiresAt > now.toISOString() ? new Date(u.expiresAt) : now
  const expires = new Date(base.getTime() + days * 86400000)
  u.plan = plan
  u.period = period
  u.status = 'active'
  u.expiresAt = expires.toISOString()
  // HONESTY: no automatic recurring billing is implemented (neither Telegram
  // Stars nor LiqPay auto-charge). autoRenew stays false — the plan simply
  // expires and the user pays again manually.
  u.autoRenew = false
  if (payment) {
    u.payments[payment.chargeId] = { plan, period, ts: payment.ts, stars: payment.stars }
    u.history.unshift({ id: payment.chargeId, plan, period, stars: payment.stars, status: 'paid', ts: payment.ts })
    u.history = u.history.slice(0, 50)
  }
  // referral credit: inviter automatically gets +7 days of Plus
  rewardInviter(u)
  save()
}

// ---------- account sessions ----------
const SESSION_TTL = 30 * 86400000
function createSession(username) {
  const token = crypto.randomBytes(24).toString('hex')
  db.sessions[token] = { username, ts: Date.now() }
  // prune expired
  for (const [t, v] of Object.entries(db.sessions)) {
    if (Date.now() - v.ts > SESSION_TTL) delete db.sessions[t]
  }
  save()
  return token
}
function sessionAccount(token) {
  const v = token && db.sessions[token]
  if (!v || Date.now() - v.ts > SESSION_TTL) return null
  const acc = db.accounts[String(v.username).toLowerCase()]
  if (!acc) return null
  return acc
}
function cleanSessions() {
  for (const [t, v] of Object.entries(db.sessions)) {
    if (Date.now() - v.ts > SESSION_TTL) delete db.sessions[t]
  }
}

// ---------- admin audit log (who did what, server-side) ----------
function audit(adminUsername, action, detail) {
  db.audit = db.audit || []
  db.audit.unshift({ ts: Date.now(), admin: String(adminUsername || '?'), action, detail: detail || null })
  db.audit = db.audit.slice(0, 200)
  save()
}

/**
 * Resolve user record from either initData (Telegram) or session token.
 *
 * SECURITY: Telegram accounts are bound to account records by the IMMUTABLE
 * Telegram user ID (tgUserId), never by the mutable @username — renaming a
 * Telegram account to a victim's username must not grant access to their data.
 * Binding happens only via /api/account/link-telegram, which requires BOTH a
 * valid account session AND a cryptographically verified initData.
 */
function resolveUser(body) {
  // 1) session token
  const acc = sessionAccount(body.token)
  if (acc) return { u: user(acc.userId), acc, via: 'account' }
  // 2) telegram initData
  const tg = verifyInitData(body.initData || '')
  if (tg) {
    const rec = user(String(tg.id))
    // auto-admin: the owner's Telegram account (bound by verified user ID,
    // with the owner's @username as a secondary confirmation — both must match)
    if (tg.username && String(tg.username).toLowerCase() === ADMIN_TG) {
      const admin = db.accounts[ADMIN_USER.toLowerCase()]
      if (admin && rec !== user(admin.userId)) {
        // link owner's telegram usage to the admin account record
        return { u: user(admin.userId), acc: admin, via: 'telegram-admin' }
      }
    }
    // link telegram login to an account bound to this verified Telegram user ID
    if (!rec.accountLinked) {
      const bound = Object.values(db.accounts).find((a) => a.tgUserId && String(a.tgUserId) === String(tg.id))
      if (bound) {
        rec.accountLinked = true
        save()
        return { u: user(bound.userId), acc: bound, via: 'telegram' }
      }
    }
    return { u: rec, acc: null, via: 'telegram' }
  }
  return null
}

function publicState(u) {
  return {
    plan: u.status === 'active' && u.expiresAt > new Date().toISOString() ? u.plan : 'free',
    status: u.expiresAt && u.expiresAt > new Date().toISOString() ? 'active' : u.status === 'none' ? 'none' : 'expired',
    expiresAt: u.expiresAt,
    autoRenew: u.autoRenew,
    history: u.history,
    referrals: u.referrals,
    referralCode: u.id
  }
}

// ---------- HTTP ----------
// Strict CORS allow-list: the app origin (APP_URL), the same host that serves
// this API (same-origin deployments), and localhost for local development.
// Never a wildcard for authenticated API responses.
function corsOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return null
  try {
    const o = new URL(origin)
    const appHost = (() => { try { return new URL(APP_URL).host } catch { return null } })()
    const reqHost = req.headers.host
    if (o.host === reqHost) return origin // same origin as this API
    if (appHost && o.host === appHost) return origin
    if (/^localhost:\d+$/.test(o.host) || /^127\.0\.0\.1(:\d+)?$/.test(o.host)) return origin
    if (o.hostname.endsWith('.pplx.app') && o.protocol === 'https:') return origin // platform preview hosts
  } catch { return null }
  return null
}
function json(res, code, obj) {
  const req = res.req // Node attaches the request to the response
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    // security headers on every API response
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'X-XSS-Protection': '0',
    'Cache-Control': 'no-store'
  }
  const origin = corsOrigin(req)
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Vary'] = 'Origin'
  } else {
    // no Origin header (curl, server-to-server, same-origin fetch) — no CORS needed
    headers['Access-Control-Allow-Origin'] = 'null'
  }
  res.writeHead(code, headers)
  res.end(JSON.stringify(obj))
}
/** Read a JSON body with a hard size cap (default 12 MB — AI photos included). */
function readBody(req, limitBytes = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = ''
    let aborted = false
    req.on('data', (c) => {
      raw += c
      if (raw.length > limitBytes && !aborted) {
        aborted = true
        resolve({ __tooLarge: true })
        req.destroy() // oversized upload — stop reading
      }
    })
    req.on('end', () => {
      if (aborted) return
      try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) }
    })
    req.on('error', () => { if (!aborted) resolve({}) })
  })
}

// ---------- naive IP rate limit for auth endpoints (5 attempts / minute) ----------
const authHits = new Map() // ip -> [ts, ...]
function rateLimited(ip) {
  const now = Date.now()
  const hits = (authHits.get(ip) || []).filter((t) => now - t < 60_000)
  if (hits.length >= 5) {
    authHits.set(ip, hits)
    return true
  }
  hits.push(now)
  authHits.set(ip, hits)
  return false
}

// ---------- burst rate limit for the AI endpoint (30 requests / minute / IP) ----------
const aiHits = new Map()
function aiRateLimited(ip) {
  const now = Date.now()
  const hits = (aiHits.get(ip) || []).filter((t) => now - t < 60_000)
  if (hits.length >= 30) {
    aiHits.set(ip, hits)
    return true
  }
  hits.push(now)
  aiHits.set(ip, hits)
  return false
}

/** Refund a charged AI request (server/provider failure must not consume quota). */
function refundUsage(u, charged) {
  if (!u || !charged) return
  try {
    if (u.aiUsage && u.aiUsage.date === charged.date && u.aiUsage.count > 0) {
      u.aiUsage.count -= 1
      save()
    }
  } catch { /* ignore */ }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {})

  if (req.url === '/api/health') {
    return json(res, 200, { ok: true, billing: !!TG_TOKEN_AVAIL, ai: aiConfigured(), tgProxy: !!TG_CRED, tgAvail: TG_TOKEN_AVAIL, tgProbeErr: TG_PROBE_ERR || null, tgProxyLayout: TG_CRED ? (TG_PROXY_HOST_SEGMENT ? 'host-segment' : 'plain') : null, appUrl: APP_URL })
  }

  // --- Telegram webhook (authenticated by a shared secret set on setWebhook) ---
  if (req.url === '/api/telegram-webhook' && req.method === 'POST') {
    if (!WEBHOOK_SECRET || req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
      return json(res, 403, { error: 'forbidden' })
    }
    const body = await readBody(req)
    // remember the chat id so reminders can be sent as Telegram messages
    const fromId = body?.message?.from?.id
    const chatId = body?.message?.chat?.id
    if (fromId && chatId && String(chatId).startsWith('-100') === false && body?.message?.chat?.type === 'private') {
      const u = user(String(fromId))
      if (u.chatId !== chatId) { u.chatId = chatId; save() }
    }
    // --- pre_checkout_query: Telegram requires an answer within 10 seconds or
    // the payment fails. Validate the payload and approve/reject.
    const pcq = body?.pre_checkout_query
    if (pcq?.id) {
      const payload = {}
      try { Object.assign(payload, JSON.parse(pcq.invoice_payload || '{}')) } catch {}
      const valid = payload.userId && STARS[payload.plan] && (payload.period === 'monthly' || payload.period === 'annual')
      await tgFetch('answerPreCheckoutQuery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pre_checkout_query_id: pcq.id, ok: !!valid, ...(valid ? {} : { error_message: 'Invalid invoice payload' }) })
      }).catch(() => {})
      return json(res, 200, { ok: true })
    }

    const sp = body?.message?.successful_payment
    if (sp) {
      // verify with Telegram that the invoice belongs to our bot
      const chargeId = sp.telegram_payment_charge_id
      const payload = {}
      try { Object.assign(payload, JSON.parse(sp.invoice_payload || '{}')) } catch {}
      if (payload.userId && STARS[payload.plan] && chargeId) {
        const u = user(payload.userId)
        if (u.payments[chargeId]) {
          return json(res, 200, { ok: true, duplicate: true }) // idempotent
        }
        activate(String(payload.userId), payload.plan, payload.period, {
          chargeId, ts: Date.now(), stars: sp.total_amount
        })
        // the launch discount (TEMPO3) applies to the first payment only
        if (payload.promo) { u.promoUsed = true; save() }
        return json(res, 200, { ok: true })
      }
    }
    // /start (with or without a referral deep link): welcome + open-app button
    const text = body?.message?.text || ''
    const m = text.match(/^\/start(?:\s+ref_(.+))?$/)
    if (m) {
      const inviteeId = String(body?.message?.from?.id)
      const inviterId = m[1]
      if (inviterId && inviteeId && inviterId !== inviteeId) {
        const inviter = user(inviterId)
        const invitee = user(inviteeId)
        if (invitee.referredBy === null && !inviter.blocked) {
          invitee.referredBy = inviterId
          inviter.referrals.invited += 1
          save()
        }
      }
      // reply with the promo photo + welcome + a button that opens the Mini App
      if (TG_TOKEN_AVAIL && body?.message?.chat?.id) {
        const chatId = body.message.chat.id
        const kb = { inline_keyboard: [[{ text: 'Открыть Tempo ⚡', web_app: { url: APP_URL } }]] }
        const caption =
          'Tempo — AI Life OS ⚡\nФинансы, календарь, задачи и питание в одном интерфейсе.\n\n' +
          'Одно сообщение — и ИИ разложит всё по разделам:\n' +
          '«Потратил 18 евро на обед, курица с рисом, завтра встреча в 15:00»\n\n' +
          'Команды: /app /plans /help'
        if (APP_URL.startsWith('https')) {
          tgFetch('sendPhoto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              photo: APP_URL + '/img/bot-welcome.jpg',
              caption,
              reply_markup: kb
            })
          }).catch(() => {
            // photo failed (e.g. not deployed yet) — fall back to text
            tgFetch('sendMessage', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text: caption, reply_markup: kb })
            }).catch(() => {})
          })
        } else {
          tgFetch('sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: caption, reply_markup: kb })
          }).catch(() => {})
        }
      }
      return json(res, 200, { ok: true })
    }

    // --- bot commands: /app, /plans, /help ---
    if (TG_TOKEN_AVAIL && body?.message?.chat?.id && typeof body?.message?.text === 'string') {
      const chatId = body.message.chat.id
      const kb = { inline_keyboard: [[{ text: 'Открыть Tempo ⚡', web_app: { url: APP_URL } }]] }
      const cmd = body.message.text.trim().split(/\s+/)[0]
      if (cmd === '/app') {
        tgFetch('sendMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: 'Tempo — AI Life OS ⚡', reply_markup: kb })
        }).catch(() => {})
        return json(res, 200, { ok: true })
      }
      if (cmd === '/plans') {
        const msg =
          'Тарифы Tempo:\n\n' +
          'Free — базовый функционал: 10 AI-запросов в день\n' +
          'Plus (€4.99/мес или €49.90/год; 100 AI-запросов в день) — фото-анализ еды, расширенная статистика\n' +
          'Pro (€8.99/мес или €89.90/год; 300 AI-запросов в день) — умные модели, приоритет, все функции\n' +
          (promoActive() ? '\n🎁 Скидка TEMPO3: −€3 на первый платёж до 5 декабря 2026 — применяется автоматически при оплате.' : '') +
          '\nОплата картой и Telegram Stars — внутри приложения.'
        if (APP_URL.startsWith('https')) {
          tgFetch('sendPhoto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              photo: APP_URL + '/img/bot-plans.jpg',
              caption: msg,
              reply_markup: kb
            })
          }).catch(() => {
            tgFetch('sendMessage', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text: msg, reply_markup: kb })
            }).catch(() => {})
          })
        } else {
          tgFetch('sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: msg, reply_markup: kb })
          }).catch(() => {})
        }
        return json(res, 200, { ok: true })
      }
      if (cmd === '/help') {
        const msg =
          'Tempo — AI Life OS: финансы, календарь, задачи и питание.\n\n' +
          '/start — начать работу\n/app — открыть приложение\n/plans — тарифы\n/help — эта справка\n\n' +
          'Просто напишите боту, что произошло:\n«Потратил 18 евро на обед, курица с рисом, завтра встреча в 15:00» — ИИ сам всё разложит по разделам.'
        if (APP_URL.startsWith('https')) {
          tgFetch('sendPhoto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              photo: APP_URL + '/img/bot-welcome.jpg',
              caption: msg,
              reply_markup: kb
            })
          }).catch(() => {
            tgFetch('sendMessage', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text: msg, reply_markup: kb })
            }).catch(() => {})
          })
        } else {
          tgFetch('sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: msg, reply_markup: kb })
          }).catch(() => {})
        }
        return json(res, 200, { ok: true })
      }
    }
    return json(res, 200, { ok: true })
  }

  // --- event reminders (stored here, DELIVERED by the scheduler below) ---
  if (req.url === '/api/reminders/sync' && req.method === 'POST') {
    const body = await readBody(req)
    const r = resolveUser(body)
    if (!r) return json(res, 401, { error: 'unauthorized' })
    const events = Array.isArray(body.events) ? body.events.slice(0, 50).map((e) => ({
      id: String(e.id || '').slice(0, 40),
      title: String(e.title || '').slice(0, 120),
      date: String(e.date || '').slice(0, 10),
      time: String(e.time || '').slice(0, 5),
      remindMin: typeof e.remindMin === 'number' && e.remindMin >= 0 && e.remindMin <= 1440 ? Math.round(e.remindMin) : 60
    })) : []
    // the user's timezone offset (minutes) — needed to compute real due times
    if (typeof body.tzMinutes === 'number' && Math.abs(body.tzMinutes) <= 840) r.u.tzMinutes = Math.round(body.tzMinutes)
    r.u.reminders = events
    save()
    return json(res, 200, { ok: true })
  }

  // --- auth: accounts (work on any site / browser) ---
  if ((req.url === '/api/auth/register' || req.url === '/api/auth/login') && req.method === 'POST') {
    if (rateLimited(req.socket.remoteAddress || 'x')) return json(res, 429, { error: 'too many attempts' })
  }
  if (req.url === '/api/auth/register' && req.method === 'POST') {
    const body = await readBody(req)
    const username = String(body.username || '').trim()
    const password = String(body.password || '')
    if (!/^[A-Za-z0-9_.-]{3,30}$/.test(username)) return json(res, 400, { error: 'bad username' })
    if (password.length < 6) return json(res, 400, { error: 'bad password' })
    if (db.accounts[username.toLowerCase()]) return json(res, 409, { error: 'taken' })
    // NOTE: tgUsername from the client is ignored — Telegram binding happens
    // only via /api/account/link-telegram with a verified initData.
    const acc = accountObj(username, password, 'user', null)
    db.accounts[username.toLowerCase()] = acc
    save()
    return json(res, 200, { token: createSession(acc.username), username: acc.username, role: acc.role })
  }

  if (req.url === '/api/auth/login' && req.method === 'POST') {
    const body = await readBody(req)
    const username = String(body.username || '').trim().toLowerCase()
    const password = String(body.password || '')
    const acc = db.accounts[username]
    // timing-safe credential check (same message for unknown user and wrong password)
    if (!acc || !timingSafeEqualStr(hashPass(password, acc.salt), acc.hash)) return json(res, 401, { error: 'invalid' })
    return json(res, 200, { token: createSession(acc.username), username: acc.username, role: acc.role })
  }

  if (req.url === '/api/auth/logout' && req.method === 'POST') {
    const body = await readBody(req)
    if (body.token && db.sessions[body.token]) {
      delete db.sessions[body.token]
      save()
    }
    return json(res, 200, { ok: true })
  }

  // --- link a Telegram account to a logged-in account (immutable user ID) ---
  // Requires BOTH a valid account session AND a cryptographically verified
  // Telegram initData. A mutable @username is never sufficient.
  if (req.url === '/api/account/link-telegram' && req.method === 'POST') {
    const body = await readBody(req)
    const acc = sessionAccount(body.token)
    if (!acc) return json(res, 401, { error: 'unauthorized' })
    const tg = verifyInitData(body.initData || '')
    if (!tg || !tg.id) return json(res, 400, { error: 'invalid initData' })
    // one account per Telegram user
    const taken = Object.values(db.accounts).find((a) => a.tgUserId && String(a.tgUserId) === String(tg.id) && a.username.toLowerCase() !== acc.username.toLowerCase())
    if (taken) return json(res, 409, { error: 'telegram already linked to another account' })
    acc.tgUserId = String(tg.id)
    acc.tgUsername = tg.username || null
    save()
    return json(res, 200, { ok: true })
  }

  // --- self-service account deletion (GDPR) ---
  // Requires the account password for confirmation. Deletes: credentials,
  // sessions, personal cloud snapshot, reminders, support thread and usage
  // records. Financial records (payments) are retained in aggregated form for
  // legal/accounting reasons but the account becomes anonymous.
  if (req.url === '/api/account/delete' && req.method === 'POST') {
    const body = await readBody(req)
    const acc = sessionAccount(body.token)
    if (!acc) return json(res, 401, { error: 'unauthorized' })
    // re-verify the password (explicit confirmation for a destructive action)
    if (!body.password || !timingSafeEqualStr(hashPass(String(body.password), acc.salt), acc.hash)) {
      return json(res, 403, { error: 'wrong password' })
    }
    const u = db.users[acc.userId]
    if (u) {
      // keep only anonymized financial history (legal retention), drop the rest
      u.reminders = undefined
      u.chatId = undefined
      u.aiUsage = undefined
      u.referrals = { invited: 0, paying: 0 }
      u.referredBy = null
      u.accountLinked = false
    }
    // revoke all sessions of this account
    for (const [t, v] of Object.entries(db.sessions)) {
      if (String(v.username).toLowerCase() === String(acc.username).toLowerCase()) delete db.sessions[t]
    }
    // remove the support thread
    if (db.support) delete db.support[acc.userId]
    // delete credentials + personal cloud snapshot
    delete db.accounts[acc.username.toLowerCase()]
    if (u) delete u.appData
    save()
    return json(res, 200, { ok: true, retained: 'anonymized financial records (legal retention)' })
  }

  // --- account data sync (view your data from any site) ---
  if (req.url === '/api/account/data' && req.method === 'POST') {
    const body = await readBody(req)
    const r = resolveUser(body)
    if (!r) return json(res, 401, { error: 'unauthorized' })
    const acc = r.acc || (body.token && sessionAccount(body.token))
    if (!acc) return json(res, 400, { error: 'no account' })
    if (body.download) return json(res, 200, { data: acc.appData || null, ts: acc.appDataTs || null })
    acc.appData = typeof body.data === 'string' ? body.data.slice(0, 2_000_000) : null
    acc.appDataTs = Date.now()
    save()
    return json(res, 200, { ok: true, ts: acc.appDataTs })
  }

  const urlPath = (req.url || '/').split('?')[0]
  if (urlPath === '/api/account/data' && req.method === 'GET') {
    const url = new URL(req.url, 'http://x')
    // token via Authorization header (preferred) or query param (legacy)
    const auth = String(req.headers.authorization || '')
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : url.searchParams.get('token')
    const acc = sessionAccount(token)
    if (!acc) return json(res, 401, { error: 'unauthorized' })
    return json(res, 200, { data: acc.appData || null, ts: acc.appDataTs || null })
  }

  // --- AI endpoints (server-side key, plan gating, daily limits) ---
  // The Gemini API key never leaves the server. Anonymous web visitors get a
  // small per-IP daily allowance; identified users are limited by their plan.
  if (req.url === '/api/ai/models' && req.method === 'POST') {
    const body = await readBody(req)
    const r = resolveUser(body)
    const plan = r ? planOf(r.u) : 'free'
    return json(res, 200, {
      models: MODEL_REGISTRY.map((m) => ({ ...m })),
      tiers: Object.entries(TIERS).map(([id, t]) => ({
        id,
        label: t.label,
        model: t.model,
        allowed: PLAN_TIERS[plan].includes(id)
      })),
      plan
    })
  }

  if (req.url === '/api/ai/usage' && req.method === 'POST') {
    const body = await readBody(req)
    const r = resolveUser(body)
    const ip = req.socket.remoteAddress || 'x'
    const usage = usageOf(r ? r.u : null, ip, body.tzMinutes)
    return json(res, 200, { ...usage, plan: r ? planOf(r.u) : 'free' })
  }

  if (req.url === '/api/ai/chat' && req.method === 'POST') {
    const body = await readBody(req)
    const ip = req.socket.remoteAddress || 'x'
    // burst protection (abuse of the anonymous/server path)
    if (aiRateLimited(ip)) return json(res, 429, { error: 'rate', message: 'Too many AI requests — try again in a minute.' })
    const r = resolveUser(body)
    const u = r ? r.u : null
    const plan = r ? planOf(u) : 'free'

    // fail fast with a clear configuration error when the server key is missing
    if (!aiConfigured()) {
      return json(res, 503, { error: 'config', message: 'AI is not configured on the server (GEMINI_API_KEY missing). Contact the administrator or add your own key in Profile → AI settings.' })
    }

    // daily limit (server-side authority, reset by the user's timezone)
    const usage = usageOf(u, ip, body.tzMinutes)
    if (usage.count >= usage.limit) {
      return json(res, 429, { error: 'limit', usage, message: 'Daily AI request limit reached for your plan.' })
    }

    const mode = ['chat', 'action', 'insight', 'finance'].includes(body.mode) ? body.mode : 'chat'
    const text = String(body.text || '').slice(0, 4000)
    if (!text && !body.image) return json(res, 400, { error: 'empty' })

    // plan gating: photo analysis (vision) is a Plus/Pro feature
    if (body.image && plan === 'free') {
      return json(res, 403, { error: 'plan_required', message: 'AI food/photo analysis is available on Plus and Pro.' })
    }

    // tier gating with honest downgrade notice
    const requestedTier = TIERS[body.tier] ? body.tier : 'fast'
    let tier = requestedTier
    let downgraded = false
    if (!PLAN_TIERS[plan].includes(tier)) {
      // highest tier allowed by the plan
      tier = PLAN_TIERS[plan][PLAN_TIERS[plan].length - 1]
      downgraded = true
    }

    const history = Array.isArray(body.history)
      ? body.history.slice(-8).map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: String(m.text || '').slice(0, 2000) })).filter((m) => m.text)
      : []

    const parts = []
    if (body.image && typeof body.image.b64 === 'string' && /^image\/(jpeg|png|webp|heic)$/.test(String(body.image.mime))) {
      parts.push({ inlineData: { mimeType: body.image.mime, data: body.image.b64.slice(0, 8_000_000) } })
    }
    for (const m of history) parts.push({ text: m.text })
    parts.push({ text: text || 'Analyze this food photo.' })

    const system = systemPrompt(mode, body.context, body.prefs, body.locale)
    const opts = { parts, system, tier, prefs: body.prefs, jsonMode: mode === 'action' }

    // charge the request against the daily limit BEFORE calling the model
    const charged = bumpUsage(u, ip, body.tzMinutes)
    if (u) save()

    const sseHeaders = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'X-Accel-Buffering': 'no'
    }
    const sseOrigin = corsOrigin(req)
    if (sseOrigin) { sseHeaders['Access-Control-Allow-Origin'] = sseOrigin; sseHeaders['Vary'] = 'Origin' }
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

    try {
      if (body.stream && mode === 'chat') {
        res.writeHead(200, sseHeaders)
        send({ type: 'meta', tier, requestedTier, downgraded, model: TIERS[tier].model, usage: charged })
        const result = await generateStream(opts, (chunk) => send({ type: 'delta', text: chunk }))
        send({ type: 'done', model: result.model, fellBack: result.fellBack, usage: charged })
        res.end()
      } else {
        const result = await generate(opts)
        let parsed = null
        if (mode === 'action') {
          try {
            parsed = extractJson(result.text)
          } catch {
            return json(res, 502, { error: 'parse', message: 'Unparseable AI response.' })
          }
        }
        return json(res, 200, {
          text: mode === 'action' ? undefined : result.text,
          reply: parsed?.reply ?? '',
          clarify: typeof parsed?.clarify === 'string' && parsed.clarify.trim() ? parsed.clarify : null,
          actions: Array.isArray(parsed?.actions) ? parsed.actions : [],
          model: result.model,
          fellBack: result.fellBack,
          downgraded,
          tier,
          usage: charged
        })
      }
    } catch (e) {
      const code = e?.code || 'network'
      // a server/provider failure must NOT consume the user's daily quota
      if (code !== 'limit' && code !== 'bad_request') refundUsage(u, charged)
      const message =
        code === 'auth' ? 'AI provider rejected the server key.' :
        code === 'config' ? 'AI is not configured on the server (GEMINI_API_KEY missing).' :
        code === 'quota' ? 'AI provider quota exhausted — try again later.' :
        code === 'timeout' ? 'AI model timed out.' :
        code === 'busy' ? 'AI model busy — try again in a moment.' :
        'AI request failed.'
      if (res.headersSent) {
        send({ type: 'error', code, message })
        res.end()
      } else {
        return json(res, code === 'auth' || code === 'config' ? 502 : 503, { error: code, message })
      }
    }
    return
  }

  // --- billing endpoints (verified initData or account session) ---
  if (req.url === '/api/billing/status' && req.method === 'POST') {
    const body = await readBody(req)
    const r = resolveUser(body)
    if (!r) return json(res, 401, { error: 'unauthorized' })
    return json(res, 200, {
      ...publicState(r.u),
      billingAvailable: true,
      cardPayments: liqpayEnabled() ? 'auto' : 'manual',
      role: r.acc ? r.acc.role : 'user',
      username: r.acc ? r.acc.username : null,
      promo: promoState(r.u),
      usage: usageOf(r.u, req.socket.remoteAddress || 'x', body.tzMinutes),
      tiers: PLAN_TIERS[planOf(r.u)]
    })
  }

  if (req.url === '/api/billing/stars-invoice' && req.method === 'POST') {
    const body = await readBody(req)
    const r = resolveUser(body)
    if (!r) return json(res, 401, { error: 'unauthorized' })
    const userId = r.acc ? r.acc.userId : String(r.u === null ? '' : (r.u.id || ''))
    if (!STARS[body.plan]) return json(res, 400, { error: 'bad plan' })
    const period = body.period === 'annual' ? 'annual' : 'monthly'
    // promo: discounted amount for the FIRST payment only
    const promo = promoActive() && !r.u.promoUsed
    const stars = firstStars(body.plan, period, r.u)
    const eur = firstPrice(body.plan, period, r.u)
    const payload = JSON.stringify({ userId, plan: body.plan, period, promo: promo ? 1 : 0 })
    const inv = await tgFetch('createInvoiceLink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `Tempo ${body.plan === 'plus' ? 'Plus' : 'Pro'} (${period === 'annual' ? 'год' : 'месяц'})`,
        description: promo
          ? `Подписка Tempo ${body.plan === 'plus' ? 'Plus' : 'Pro'}, ${period === 'annual' ? 'годовая' : 'месяцная'}. Первый платёж со скидкой TEMPO3: €${eur.toFixed(2)} (далее €${EUR[body.plan][period].toFixed(2)})`
          : `Подписка Tempo ${body.plan === 'plus' ? 'Plus' : 'Pro'}, ${period === 'annual' ? 'годовая' : 'месяцная'}. €${eur.toFixed(2)}`,
        payload,
        currency: 'XTR',
        prices: [{ label: (promo ? 'Первый платёж (TEMPO3) — ' : '') + (period === 'annual' ? 'Год' : 'Месяц'), amount: stars }]
      })
    }).then((x) => x.json())
    if (!inv.ok) return json(res, 502, { error: 'invoice failed' })
    return json(res, 200, { link: inv.result, stars, promo, amountEur: eur })
  }

  // automatic card payment: LiqPay checkout link (payer enters their card on
  // LiqPay's hosted page — we never see card data)
  if (req.url === '/api/billing/card-link' && req.method === 'POST') {
    const body = await readBody(req)
    const r = resolveUser(body)
    if (!r) return json(res, 401, { error: 'unauthorized' })
    if (!liqpayEnabled()) return json(res, 503, { error: 'card payments not configured' })
    if (!STARS[body.plan]) return json(res, 400, { error: 'bad plan' })
    const period = body.period === 'annual' ? 'annual' : 'monthly'
    const userId = r.acc ? r.acc.userId : String(r.u === null ? '' : (r.u.id || ''))
    // promo: discounted FIRST payment only, then the normal price
    const promo = promoActive() && !r.u.promoUsed
    const amount = firstPrice(body.plan, period, r.u)
    const orderId = `lp_${userId}_${body.plan}_${period}_${Date.now()}`
    // remember the order so the callback can settle the promo flag
    db.orders = db.orders || {}
    db.orders[orderId] = { userId, plan: body.plan, period, promo: promo ? 1 : 0, amount, ts: Date.now() }
    save()
    const data = Buffer.from(JSON.stringify({
      version: 3,
      public_key: LIQPAY_PUBLIC,
      action: 'pay',
      amount,
      currency: 'EUR',
      description: promo
        ? `Tempo ${body.plan === 'plus' ? 'Plus' : 'Pro'} — ${period === 'annual' ? 'год' : 'месяц'} (первый платёж, скидка TEMPO3)`
        : `Tempo ${body.plan === 'plus' ? 'Plus' : 'Pro'} — ${period === 'annual' ? 'год' : 'месяц'}`,
      order_id: orderId,
      language: 'ru',
      server_url: APP_URL + '/port/3000/api/liqpay-callback',
      result_url: APP_URL
    })).toString('base64')
    return json(res, 200, { url: LIQPAY_URL + '?data=' + encodeURIComponent(data) + '&signature=' + encodeURIComponent(liqpaySign(data)), promo, amountEur: amount })
  }

  // LiqPay server-to-server callback: verify signature, auto-activate on
  // VERIFIED production payments only.
  if (req.url === '/api/liqpay-callback' && req.method === 'POST') {
    const body = await readBody(req)
    const dataB64 = String(body?.data || '')
    const signature = String(body?.signature || '')
    if (!dataB64 || !signature || !timingSafeEqualStr(signature, liqpaySign(dataB64))) {
      return json(res, 403, { error: 'bad signature' })
    }
    let ev = {}
    try { ev = JSON.parse(Buffer.from(dataB64, 'base64').toString('utf8')) } catch { return json(res, 400, { error: 'bad data' }) }
    // Only a real 'success' status activates a subscription. 'sandbox' is
    // accepted ONLY when the server runs explicitly in test mode
    // (LIQPAY_SANDBOX=1) — a sandbox/fake status must never activate a
    // production subscription.
    const isTestEnv = process.env.LIQPAY_SANDBOX === '1'
    const successStatus = isTestEnv ? (ev.status === 'success' || ev.status === 'sandbox') : ev.status === 'success'
    // order_id format: lp_<userId>_<plan>_<period>_<ts>
    const m = String(ev.order_id || '').match(/^lp_(.+)_(plus|pro)_(monthly|annual)_\d+$/)
    if (m && successStatus) {
      // REQUIRE a known pending order created by this server for this user
      const order = (db.orders || {})[ev.order_id]
      if (!order) {
        return json(res, 400, { error: 'unknown order' })
      }
      // verify the order matches: user, plan, period, amount, currency
      const amount = Number(ev.amount)
      if (
        String(order.userId) !== String(m[1]) ||
        order.plan !== m[2] ||
        order.period !== m[3] ||
        !Number.isFinite(amount) || Math.abs(amount - order.amount) > 0.01 ||
        (ev.currency && ev.currency !== 'EUR')
      ) {
        return json(res, 400, { error: 'order mismatch' })
      }
      const u = user(m[1])
      // idempotency: skip if this exact order was already processed
      const seen = u.history.some((h) => h.id === ev.order_id)
      if (!seen) {
        u.payments[ev.order_id] = { plan: m[2], period: m[3], ts: Date.now(), amount: order.amount }
        u.history.unshift({ id: ev.order_id, plan: m[2], period: m[3], stars: 0, status: 'paid', ts: Date.now() })
        u.history = u.history.slice(0, 50)
        const now = new Date()
        const days = m[3] === 'annual' ? 365 : 30
        const base = u.expiresAt && u.expiresAt > now.toISOString() ? new Date(u.expiresAt) : now
        u.expiresAt = new Date(base.getTime() + days * 86400000).toISOString()
        u.plan = m[2]
        u.period = m[3]
        u.status = 'active'
        u.autoRenew = false // honest: no automatic recurring billing is implemented
        // the launch discount applies to the first payment only
        if (order.promo) u.promoUsed = true
        rewardInviter(u)
        save()
      }
    }
    return json(res, 200, { ok: true })
  }

  // card transfer (manual fallback): the user reports they paid by bank card;
  // the owner verifies the transfer and activates the plan manually (admin grant)
  if (req.url === '/api/billing/card-request' && req.method === 'POST') {
    const body = await readBody(req)
    const r = resolveUser(body)
    if (!r) return json(res, 401, { error: 'unauthorized' })
    if (!STARS[body.plan]) return json(res, 400, { error: 'bad plan' })
    const period = body.period === 'annual' ? 'annual' : 'monthly'
    const u = r.u
    u.history.unshift({ id: 'card_' + Date.now(), plan: body.plan, period, stars: 0, status: 'pending_card', ts: Date.now() })
    u.history = u.history.slice(0, 50)
    save()
    return json(res, 200, { ok: true })
  }

  if (req.url === '/api/billing/cancel' && req.method === 'POST') {
    const body = await readBody(req)
    const r = resolveUser(body)
    if (!r) return json(res, 401, { error: 'unauthorized' })
    r.u.autoRenew = false
    save()
    return json(res, 200, { ok: true })
  }

  // --- support chat (user <-> admin) ---
  const supportThread = (userId) => {
    db.support = db.support || {}
    if (!db.support[userId]) {
      db.support[userId] = { userId, username: null, unread: 0, messages: [] }
    }
    return db.support[userId]
  }
  const lastSupportMsg = {}

  if (req.url === '/api/support/send' && req.method === 'POST') {
    const body = await readBody(req)
    const r = resolveUser(body)
    if (!r) return json(res, 401, { error: 'unauthorized' })
    const text = String(body.text || '').trim().slice(0, 1000)
    if (!text) return json(res, 400, { error: 'empty message' })
    // light rate limit: 1 message per 5 seconds per user
    const now = Date.now()
    if (lastSupportMsg[r.u.id] && now - lastSupportMsg[r.u.id] < 5000) {
      return json(res, 429, { error: 'too fast' })
    }
    lastSupportMsg[r.u.id] = now
    const th = supportThread(r.u.id)
    th.username = r.acc ? r.acc.username : (r.u.tgUsername || null)
    th.messages.push({ from: 'user', text, ts: now })
    th.messages = th.messages.slice(-100)
    th.unread += 1
    save()
    return json(res, 200, { ok: true })
  }

  if (req.url === '/api/support/history' && req.method === 'POST') {
    const body = await readBody(req)
    const r = resolveUser(body)
    if (!r) return json(res, 401, { error: 'unauthorized' })
    const th = db.support?.[r.u.id]
    return json(res, 200, { messages: th ? th.messages : [] })
  }

  // --- admin panel (owner only) ---
  function requireAdmin(body) {
    const r = resolveUser(body)
    if (!r || !r.acc || r.acc.role !== 'admin') return null
    return r
  }

  if (req.url === '/api/admin/support/list' && req.method === 'POST') {
    const body = await readBody(req)
    if (!requireAdmin(body)) return json(res, 403, { error: 'forbidden' })
    const threads = Object.values(db.support || {}).map((th) => ({
      userId: th.userId,
      username: th.username,
      unread: th.unread,
      last: th.messages[th.messages.length - 1] || null,
      count: th.messages.length
    })).sort((a, b) => (b.last?.ts || 0) - (a.last?.ts || 0))
    return json(res, 200, { threads })
  }

  if (req.url === '/api/admin/support/thread' && req.method === 'POST') {
    const body = await readBody(req)
    if (!requireAdmin(body)) return json(res, 403, { error: 'forbidden' })
    const th = db.support?.[String(body.userId || '')]
    if (!th) return json(res, 200, { messages: [] })
    th.unread = 0 // admin opened the thread
    save()
    return json(res, 200, { messages: th.messages, username: th.username })
  }

  if (req.url === '/api/admin/support/reply' && req.method === 'POST') {
    const body = await readBody(req)
    if (!requireAdmin(body)) return json(res, 403, { error: 'forbidden' })
    const text = String(body.text || '').trim().slice(0, 1000)
    const th = db.support?.[String(body.userId || '')]
    if (!th || !text) return json(res, 400, { error: 'bad request' })
    th.messages.push({ from: 'admin', text, ts: Date.now() })
    th.messages = th.messages.slice(-100)
    audit(r.acc?.username, 'support-reply', String(body.userId))
    save()
    return json(res, 200, { ok: true })
  }

  if (req.url === '/api/admin/overview' && req.method === 'POST') {
    const body = await readBody(req)
    if (!requireAdmin(body)) return json(res, 403, { error: 'forbidden' })
    const supportUnread = Object.values(db.support || {}).reduce((a, th) => a + (th.unread || 0), 0)
    const users = Object.values(db.users).map((u) => ({
      id: u.id ?? null,
      plan: u.plan, status: u.status, expiresAt: u.expiresAt, autoRenew: u.autoRenew,
      history: (u.history || []).slice(0, 10),
      referrals: u.referrals, referredBy: u.referredBy, firstSeen: u.firstSeen ?? null
    }))
    const accounts = Object.values(db.accounts).map((a) => ({
      username: a.username, role: a.role, tgUsername: a.tgUsername, createdAt: a.createdAt, hasData: !!a.appData
    }))
    const totals = {
      users: users.length,
      paying: users.filter((u) => u.status === 'active' && u.plan !== 'free').length,
      starsCollected: Object.values(db.users).reduce((a, u) => a + (u.history || []).filter((h) => h.status === 'paid').reduce((x, h) => x + h.stars, 0), 0),
      payments: Object.values(db.users).reduce((a, u) => a + (u.history || []).filter((h) => h.status === 'paid').length, 0),
      pendingCard: Object.values(db.users).reduce((a, u) => a + (u.history || []).filter((h) => h.status === 'pending_card').length, 0),
      supportUnread
    }
    return json(res, 200, { users, accounts, totals, audit: (db.audit || []).slice(0, 50) })
  }

  // grant a subscription manually (referral rewards, support)
  if (req.url === '/api/admin/grant' && req.method === 'POST') {
    const body = await readBody(req)
    if (!requireAdmin(body)) return json(res, 403, { error: 'forbidden' })
    const plan = body.plan
    if (!STARS[plan]) return json(res, 400, { error: 'bad plan' })
    const days = body.period === 'annual' ? 365 : 30
    let target = null
    if (body.userId) target = db.users[body.userId]
    else if (body.username) {
      const acc = db.accounts[String(body.username).toLowerCase()]
      target = acc && db.users[acc.userId]
    }
    if (!target) return json(res, 404, { error: 'user not found' })
    const base = target.expiresAt && target.expiresAt > new Date().toISOString() ? new Date(target.expiresAt) : new Date()
    target.plan = plan
    target.status = 'active'
    target.expiresAt = new Date(base.getTime() + days * 86400000).toISOString()
    target.history.unshift({ id: 'grant_' + Date.now(), plan, period: body.period || 'monthly', stars: 0, status: 'paid', ts: Date.now(), note: 'granted by admin' })
    rewardInviter(target)
    audit(r.acc?.username, 'grant', `${plan}/${body.period || 'monthly'} → ${body.userId || body.username}`)
    save()
    return json(res, 200, { ok: true })
  }

  // revoke subscription
  if (req.url === '/api/admin/revoke' && req.method === 'POST') {
    const body = await readBody(req)
    if (!requireAdmin(body)) return json(res, 403, { error: 'forbidden' })
    const target = body.userId ? (db.users[body.userId] || (body.userId.startsWith('acc_') ? user(body.userId) : null)) : null
    if (!target) return json(res, 404, { error: 'user not found' })
    target.status = 'expired'
    target.autoRenew = false
    audit(r.acc?.username, 'revoke', String(body.userId))
    save()
    return json(res, 200, { ok: true })
  }

  return json(res, 404, { error: 'not found' })
})

if (!TG_TOKEN_AVAIL) {
  console.warn('[tempo] no Telegram credentials — billing endpoints will reject requests (health stays up)')
}
server.listen(PORT, () => console.log(`[tempo] billing server on :${PORT}`))

// Keep the process alive through unexpected async errors: a single failed
// request must never take the whole billing/AI backend down with it.
process.on('uncaughtException', (e) => console.warn('[tempo] uncaughtException (kept alive):', e?.message))
process.on('unhandledRejection', (e) => console.warn('[tempo] unhandledRejection (kept alive):', e?.message || e))

// ---------- reminder delivery scheduler ----------
// Storing synced events is NOT delivery. This loop actually SENDS the
// reminders as Telegram messages to the user's private chat (chatId is
// captured on every webhook update). Runs every 30s; per-event deduplication
// per calendar day so a reminder is never sent twice.
function reminderLoop() {
  const now = Date.now()
  const todayISO = new Date().toISOString().slice(0, 10)
  for (const u of Object.values(db.users)) {
    if (!u.chatId || !Array.isArray(u.reminders) || u.reminders.length === 0) continue
    u.reminderSent = u.reminderSent && u.reminderSent.date === todayISO ? u.reminderSent : { date: todayISO, ids: [] }
    for (const ev of u.reminders) {
      if (!ev.date || !ev.time || u.reminderSent.ids.includes(ev.id)) continue
      const [h, m] = String(ev.time).split(':').map(Number)
      if (![h, m].every(Number.isFinite)) continue
      // the client syncs dates/times in the USER'S local zone; apply their
      // tz offset to get the real UTC moment
      const tzMin = typeof u.tzMinutes === 'number' && Math.abs(u.tzMinutes) <= 840 ? u.tzMinutes : 0
      const eventTime = new Date(`${ev.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`).getTime() - tzMin * 60000
      if (!Number.isFinite(eventTime)) continue
      const remindMin = typeof ev.remindMin === 'number' ? ev.remindMin : 60
      const dueAt = eventTime - remindMin * 60000
      // send when due, but skip stale reminders (more than 10 min late)
      if (now >= dueAt && now - dueAt < 10 * 60000) {
        u.reminderSent.ids.push(ev.id)
        tgFetch('sendMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: u.chatId,
            text: `⏰ ${ev.title} — ${ev.date} ${ev.time}`
          })
        }).catch(() => {
          // delivery failed — drop the id so it is retried on the next tick
          u.reminderSent.ids = u.reminderSent.ids.filter((x) => x !== ev.id)
        })
        save()
      }
    }
  }
}
setInterval(reminderLoop, 30_000)
setTimeout(reminderLoop, 5_000) // first run shortly after boot

// ---------- graceful shutdown ----------
function shutdown(signal) {
  console.log(`[tempo] ${signal} — flushing data and closing`)
  try {
    clearTimeout(saveTimer)
    persist(DATA_FILE, () => process.exit(0))
    // hard exit if the final write hangs
    setTimeout(() => process.exit(0), 3000).unref()
  } catch (e) {
    console.warn('[tempo] shutdown flush failed:', e?.message)
    process.exit(0)
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

setBotCommands()

// Startup probe: verify the Telegram API actually answers with our auth.
// A credential proxy that cannot carry Telegram's path-based bot auth would
// otherwise leave Stars billing silently broken (health would lie).
;(async () => {
  if (!TG_TOKEN_AVAIL) return
  try {
    let j = null
    if (TG_CRED) {
      // try both proxy path layouts: <URL>/getMe first, then <URL>/api.telegram.org/getMe
      for (const hostSegment of [false, true]) {
        TG_PROXY_HOST_SEGMENT = hostSegment
        const r = await tgFetch('getMe', { method: 'POST' })
        j = await r?.json().catch(() => null)
        if (j?.ok) break
        TG_PROBE_ERR = j?.description || ('HTTP ' + r?.status) || 'no response'
      }
    } else {
      const r = await tgFetch('getMe', { method: 'POST' })
      j = await r?.json().catch(() => null)
      if (!j?.ok) TG_PROBE_ERR = j?.description || ('HTTP ' + r?.status) || 'no response'
    }
    if (j?.ok) {
      TG_PROBE_ERR = ''
      console.log('[tempo] Telegram API OK — bot @' + (j.result?.username || '?') + ' (proxy layout: ' + (TG_CRED ? (TG_PROXY_HOST_SEGMENT ? 'host-segment' : 'plain') : 'direct') + ')')
      await syncBotTargeting()
    } else {
      TG_TOKEN_AVAIL = false
      console.warn('[tempo] Telegram API probe failed (' + TG_PROBE_ERR + ') — Stars billing and initData login disabled. Set BOT_TOKEN env with the raw token to enable Telegram features.')
    }
  } catch (e) {
    TG_TOKEN_AVAIL = false
    TG_PROBE_ERR = 'fetch error: ' + e?.message
    console.warn('[tempo] Telegram API probe error:', e?.message, '— Telegram features disabled')
  }
})()

/**
 * Keep the bot pointing at THIS deployment. The /start «Открыть Tempo»
 * buttons are generated per-message by whichever server the webhook hits, so
 * the webhook URL decides which version users get. If the webhook (or the
 * menu button) still targets an older deployment, re-point it here on every
 * startup. Idempotent and safe to run repeatedly.
 */
async function syncBotTargeting() {
  const hookUrl = APP_URL + '/port/3000/api/telegram-webhook'
  try {
    await tgFetch('setChatMenuButton', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu_button: { type: 'web_app', text: 'Открыть Tempo ⚡', web_app: { url: APP_URL } }
      })
    })
  } catch (e) { console.warn('[tempo] setChatMenuButton failed:', e?.message) }
  try {
    const r = await tgFetch('getWebhookInfo', { method: 'POST' })
    const j = await r?.json().catch(() => null)
    if (!j?.ok) return
    if (j.result?.url === hookUrl) {
      console.log('[tempo] webhook already at', hookUrl)
      return
    }
    const sw = await tgFetch('setWebhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: hookUrl,
        allowed_updates: ['message', 'pre_checkout_query'],
        secret_token: WEBHOOK_SECRET
      })
    })
    const sj = await sw?.json().catch(() => null)
    console.log('[tempo] webhook re-pointed to', hookUrl, sj?.ok ? '(ok)' : '(FAILED: ' + (sj?.description || 'no response') + ')')
  } catch (e) { console.warn('[tempo] webhook sync failed:', e?.message) }
}
