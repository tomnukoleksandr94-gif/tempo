/**
 * Account system: login works on any site (Telegram Mini App or plain browser).
 * The server verifies credentials and issues a session token; the token is
 * stored locally and sent with billing/admin requests.
 * Admin (owner) accounts get access to the admin panel.
 */

import { BILLING_API } from './billing'

const TOKEN_KEY = 'tempo-account-token'
const USER_KEY = 'tempo-account-user'

export interface AccountInfo {
  username: string
  role: 'user' | 'admin'
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getAccount(): AccountInfo | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function persist(token: string, info: AccountInfo) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(info))
  } catch { /* storage unavailable */ }
}

function clear() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  } catch { /* ignore */ }
}

async function api(path: string, body: object, timeoutMs = 8000): Promise<any> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${BILLING_API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    return await res.json()
  } catch {
    return { error: 'network' }
  } finally {
    clearTimeout(timer)
  }
}

export async function login(username: string, password: string): Promise<{ ok: boolean; account?: AccountInfo; error?: string }> {
  const res = await api('/auth/login', { username, password })
  if (res.error || !res.token) return { ok: false, error: res.error || 'invalid' }
  const account = { username: res.username, role: res.role }
  persist(res.token, account)
  return { ok: true, account }
}

export async function register(username: string, password: string): Promise<{ ok: boolean; account?: AccountInfo; error?: string }> {
  const res = await api('/auth/register', { username, password })
  if (res.error || !res.token) return { ok: false, error: res.error || 'failed' }
  const account = { username: res.username, role: res.role }
  persist(res.token, account)
  return { ok: true, account }
}

export function logout() {
  const token = getToken()
  clear()
  if (token) api('/auth/logout', { token }).catch(() => {})
}

/** upload the app data snapshot to the account (works from any site) */
export async function uploadData(data: string): Promise<{ ok: boolean; error?: string }> {
  const token = getToken()
  if (!token) return { ok: false, error: 'no account' }
  const res = await api('/account/data', { token, data })
  return res.error ? { ok: false, error: res.error } : { ok: true }
}

/** download the account's app data snapshot */
export async function downloadData(): Promise<{ data: string | null; error?: string }> {
  const token = getToken()
  if (!token) return { data: null, error: 'no account' }
  try {
    const res = await fetch(`${BILLING_API}/account/data`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return { data: null, error: `HTTP ${res.status}` }
    const json = await res.json()
    return { data: json.data }
  } catch {
    return { data: null, error: 'network' }
  }
}

// ---------- admin API (owner only, verified server-side) ----------

export interface AdminUser {
  id: string | null
  plan: string
  status: string
  expiresAt: string | null
  autoRenew: boolean
  history: { id: string; plan: string; period: string; stars: number; status: string; ts: number; note?: string }[]
  referrals: { invited: number; paying: number }
  referredBy: string | null
  firstSeen: number | null
}

export interface AdminOverview {
  users: AdminUser[]
  accounts: { username: string; role: string; tgUsername: string | null; createdAt: number; hasData: boolean }[]
  totals: { users: number; paying: number; starsCollected: number; payments: number; pendingCard: number }
}

export async function adminOverview(): Promise<{ data?: AdminOverview; error?: string }> {
  const token = getToken()
  if (!token) return { error: 'no account' }
  const res = await api('/admin/overview', { token })
  return res.error ? { error: res.error } : { data: res }
}

export async function adminGrant(username: string, plan: 'plus' | 'pro', period: 'monthly' | 'annual'): Promise<{ ok: boolean; error?: string }> {
  const token = getToken()
  if (!token) return { ok: false, error: 'no account' }
  const res = await api('/admin/grant', { token, username, plan, period })
  return res.error ? { ok: false, error: res.error } : { ok: true }
}

export async function adminGrantUserId(userId: string, plan: 'plus' | 'pro', period: 'monthly' | 'annual'): Promise<{ ok: boolean; error?: string }> {
  const token = getToken()
  if (!token) return { ok: false, error: 'no account' }
  const res = await api('/admin/grant', { token, userId, plan, period })
  return res.error ? { ok: false, error: res.error } : { ok: true }
}

export async function adminRevoke(userId: string): Promise<{ ok: boolean; error?: string }> {
  const token = getToken()
  if (!token) return { ok: false, error: 'no account' }
  const res = await api('/admin/revoke', { token, userId })
  return res.error ? { ok: false, error: res.error } : { ok: true }
}
