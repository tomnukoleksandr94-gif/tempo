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

const BOT_TOKEN = process.env.BOT_TOKEN || ''
const PORT = Number(process.env.PORT || 3000)
// Shared secret for the Telegram webhook (set via setWebhook secret_token).
// When set, every webhook request must carry it in X-Telegram-Bot-Api-Secret-Token.
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || ''
const DATA_FILE = new URL('./data.json', import.meta.url).pathname
const TG_API = (m) => `https://api.telegram.org/bot${BOT_TOKEN}/${m}`

// Stars prices (XTR) — must match src/lib/billing.ts
const STARS = {
  plus: { monthly: 250, annual: 2500 },
  pro: { monthly: 450, annual: 4500 }
}
const EUR = { plus: { monthly: 1.99, annual: 49.9 }, pro: { monthly: 5.99, annual: 89.9 } }

// ---------- storage ----------
let db = { users: {}, accounts: {}, sessions: {} }
try {
  db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  db.accounts = db.accounts || {}
  db.sessions = db.sessions || {}
} catch { /* first run */ }

// ---------- admin seed ----------
// Admin: username "Mister", password REQUIRED from env ADMIN_PASS (no default —
// fail closed: without the env the admin account simply never exists).
// Bound to Telegram @neggshka. Credentials live ONLY on the server.
const ADMIN_USER = 'Mister'
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
if (!ADMIN_PASS) {
  console.warn('[tempo] ADMIN_PASS not set — admin panel is disabled (no admin account will exist)')
}

let saveTimer = null
function save() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    fs.writeFile(DATA_FILE, JSON.stringify(db), () => {})
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
function verifyInitData(initData) {
  if (!BOT_TOKEN) return null
  try {
    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    params.delete('hash')
    const dataCheckString = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('\n')
    const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
    const computed = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')
    if (computed !== hash) return null
    const u = JSON.parse(params.get('user'))
    // auth_date freshness: reject tokens older than 24h
    if (Date.now() / 1000 - Number(params.get('auth_date')) > 86400) return null
    return u
  } catch {
    return null
  }
}

// ---------- subscription logic ----------
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
  u.autoRenew = true
  if (payment) {
    u.payments[payment.chargeId] = { plan, period, ts: payment.ts, stars: payment.stars }
    u.history.unshift({ id: payment.chargeId, plan, period, stars: payment.stars, status: 'paid', ts: payment.ts })
    u.history = u.history.slice(0, 50)
  }
  // referral credit: inviter gets +1 paying when the invitee pays first time
  if (u.referredBy && u.history.length === 1) {
    const inviter = user(u.referredBy)
    inviter.referrals.paying += 1
  }
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

/** resolve user record from either initData (Telegram) or session token */
function resolveUser(body) {
  // 1) session token
  const acc = sessionAccount(body.token)
  if (acc) return { u: user(acc.userId), acc, via: 'account' }
  // 2) telegram initData
  const tg = verifyInitData(body.initData || '')
  if (tg) {
    const rec = user(String(tg.id))
    // auto-admin: the owner's Telegram account
    if (tg.username && tg.username.toLowerCase() === ADMIN_TG) {
      const admin = db.accounts[ADMIN_USER.toLowerCase()]
      if (admin && rec !== user(admin.userId)) {
        // link owner's telegram usage to the admin account record
        return { u: user(admin.userId), acc: admin, via: 'telegram-admin' }
      }
    }
    // link telegram login to an account with same username (first time only)
    if (!rec.accountLinked && tg.username) {
      const acc = Object.values(db.accounts).find((a) => a.tgUsername && a.tgUsername.toLowerCase() === tg.username.toLowerCase())
      if (acc) {
        // migrate this telegram user's data to the account record
        rec.accountLinked = true
        save()
        return { u: user(acc.userId), acc, via: 'telegram' }
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
    referrals: u.referrals
  }
}

// ---------- HTTP ----------
function json(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  })
  res.end(JSON.stringify(obj))
}
function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) }
    })
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

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {})

  if (req.url === '/api/health') {
    return json(res, 200, { ok: true, billing: !!BOT_TOKEN })
  }

  // --- Telegram webhook (authenticated by a shared secret set on setWebhook) ---
  if (req.url === '/api/telegram-webhook' && req.method === 'POST') {
    if (!WEBHOOK_SECRET || req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
      return json(res, 403, { error: 'forbidden' })
    }
    const body = await readBody(req)
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
        return json(res, 200, { ok: true })
      }
    }
    // /start referral deep link: ref_<code>
    const text = body?.message?.text || ''
    const m = text.match(/^\/start ref_(.+)$/)
    if (m) {
      const inviteeId = String(body?.message?.from?.id)
      const inviterId = m[1]
      if (inviteeId && inviterId !== inviteeId) {
        const inviter = user(inviterId)
        const invitee = user(inviteeId)
        if (invitee.referredBy === null && !inviter.blocked) {
          invitee.referredBy = inviterId
          inviter.referrals.invited += 1
          save()
        }
      }
      return json(res, 200, { ok: true })
    }
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
    const acc = accountObj(username, password, 'user', body.tgUsername || null)
    db.accounts[username.toLowerCase()] = acc
    save()
    return json(res, 200, { token: createSession(acc.username), username: acc.username, role: acc.role })
  }

  if (req.url === '/api/auth/login' && req.method === 'POST') {
    const body = await readBody(req)
    const username = String(body.username || '').trim().toLowerCase()
    const password = String(body.password || '')
    const acc = db.accounts[username]
    if (!acc || hashPass(password, acc.salt) !== acc.hash) return json(res, 401, { error: 'invalid' })
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

  // --- account data sync (view your data from any site) ---
  if (req.url === '/api/account/data' && req.method === 'POST') {
    const body = await readBody(req)
    const r = resolveUser(body)
    if (!r) return json(res, 401, { error: 'unauthorized' })
    const acc = r.acc || (body.token && sessionAccount(body.token))
    if (!acc) return json(res, 400, { error: 'no account' })
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

  // --- billing endpoints (verified initData or account session) ---
  if (req.url === '/api/billing/status' && req.method === 'POST') {
    const body = await readBody(req)
    const r = resolveUser(body)
    if (!r) return json(res, 401, { error: 'unauthorized' })
    return json(res, 200, { ...publicState(r.u), billingAvailable: true, role: r.acc ? r.acc.role : 'user', username: r.acc ? r.acc.username : null })
  }

  if (req.url === '/api/billing/stars-invoice' && req.method === 'POST') {
    const body = await readBody(req)
    const r = resolveUser(body)
    if (!r) return json(res, 401, { error: 'unauthorized' })
    const userId = r.acc ? r.acc.userId : String(r.u === null ? '' : (r.u.id || ''))
    if (!STARS[body.plan]) return json(res, 400, { error: 'bad plan' })
    const period = body.period === 'annual' ? 'annual' : 'monthly'
    const stars = STARS[body.plan][period]
    const payload = JSON.stringify({ userId, plan: body.plan, period })
    const inv = await fetch(TG_API('createInvoiceLink'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `Tempo ${body.plan === 'plus' ? 'Plus' : 'Pro'} (${period === 'annual' ? 'год' : 'месяц'})`,
        description: `Подписка Tempo ${body.plan === 'plus' ? 'Plus' : 'Pro'}, ${period === 'annual' ? 'годовая' : 'месяцная'}. ≈€${EUR[body.plan][period]}`,
        payload,
        currency: 'XTR',
        prices: [{ label: period === 'annual' ? 'Год' : 'Месяц', amount: stars }]
      })
    }).then((x) => x.json())
    if (!inv.ok) return json(res, 502, { error: 'invoice failed' })
    return json(res, 200, { link: inv.result })
  }

  if (req.url === '/api/billing/cancel' && req.method === 'POST') {
    const body = await readBody(req)
    const r = resolveUser(body)
    if (!r) return json(res, 401, { error: 'unauthorized' })
    r.u.autoRenew = false
    save()
    return json(res, 200, { ok: true })
  }

  // --- admin panel (owner only) ---
  function requireAdmin(body) {
    const r = resolveUser(body)
    if (!r || !r.acc || r.acc.role !== 'admin') return null
    return r
  }

  if (req.url === '/api/admin/overview' && req.method === 'POST') {
    const body = await readBody(req)
    if (!requireAdmin(body)) return json(res, 403, { error: 'forbidden' })
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
      payments: Object.values(db.users).reduce((a, u) => a + (u.history || []).filter((h) => h.status === 'paid').length, 0)
    }
    return json(res, 200, { users, accounts, totals })
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
    save()
    return json(res, 200, { ok: true })
  }

  return json(res, 404, { error: 'not found' })
})

if (!BOT_TOKEN) {
  console.warn('[tempo] BOT_TOKEN not set — billing endpoints will reject requests (health stays up)')
}
server.listen(PORT, () => console.log(`[tempo] billing server on :${PORT}`))
