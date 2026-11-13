/**
 * Billing domain: plans, prices, launch discount, limits, referral program.
 *
 * PRINCIPLES (honest billing):
 * - The client never decides "paid" status by itself — subscription state is
 *   requested from the server (see billingApi) and only mirrored locally.
 * - Payments happen via Telegram Stars invoices created by the server;
 *   activation is confirmed by the server through the Telegram webhook.
 * - When the server is unreachable, the UI says payments are unavailable
 *   instead of pretending they worked.
 */

import type { BillingPeriod, Plan, Subscription } from './types'

// ---------- plans ----------

export interface PlanDef {
  id: Plan
  name: string
  /** monthly price in EUR (without discount) */
  monthly: number
  /** annual price in EUR (2 months free) */
  annual: number
  /** AI actions per day */
  aiLimit: number
  /** Telegram Stars price (XTR) — server-side authority, mirrored for display */
  starsMonthly: number
  starsAnnual: number
}

export const PLANS: Record<Plan, PlanDef> = {
  free: { id: 'free', name: 'Free', monthly: 0, annual: 0, aiLimit: 10, starsMonthly: 0, starsAnnual: 0 },
  plus: { id: 'plus', name: 'Plus', monthly: 4.99, annual: 49.9, aiLimit: 100, starsMonthly: 250, starsAnnual: 2500 },
  pro: { id: 'pro', name: 'Pro', monthly: 8.99, annual: 89.9, aiLimit: 300, starsMonthly: 450, starsAnnual: 4500 }
}

export const PLAN_ORDER: Plan[] = ['free', 'plus', 'pro']

/** Display price of a plan for a period. */
export function planPrice(plan: Plan, period: BillingPeriod): number {
  if (plan === 'free') return 0
  return period === 'monthly' ? PLANS[plan].monthly : PLANS[plan].annual
}

/** Daily AI action limit for the active plan. */
export function aiLimitFor(subscription: Subscription): number {
  const active = subscription.status === 'active' && subscription.expiresAt && subscription.expiresAt > new Date().toISOString()
  return active ? PLANS[subscription.plan].aiLimit : PLANS.free.aiLimit
}

/** Effective plan, considering expiry. */
export function effectivePlan(subscription: Subscription): Plan {
  const active = subscription.status === 'active' && subscription.expiresAt && subscription.expiresAt > new Date().toISOString()
  return active ? subscription.plan : 'free'
}

// ---------- referral program ----------
// 1 invited friend — progress; 3 paying — 1 month of Plus; 5 paying — 1 month Pro trial.
export const REFERRAL_TIERS = [
  { count: 1, reward: 'progress' as const },
  { count: 3, reward: 'plus_month' as const },
  { count: 5, reward: 'pro_month' as const }
]

// ---------- card transfer (manual, owner-verified) ----------
// Bank-card payment: the app shows the recipient card, the user transfers the
// amount from their own banking app, then taps "I paid" — the request is logged
// on the server and the owner activates the subscription after verifying the
// transfer (admin panel). No card data of the payer is ever collected.
export const CARD_PAY = {
  number: '4441 1110 0576 3481',
  holder: 'Tempo'
}

/** Report a card transfer so the owner can verify and activate the plan. */
export async function submitCardRequest(
  initData: string,
  plan: Exclude<Plan, 'free'>,
  period: BillingPeriod
): Promise<{ ok?: boolean; error?: string }> {
  return api('/billing/card-request', { initData, plan, period })
}

// ---------- server API (secure verification) ----------

/**
 * Server base for billing. The backend verifies Telegram initData (HMAC with
 * the bot token) — the client only relays its initData, never claims payments
 * itself. '__PORT_3000__' is a deploy-time placeholder: the
 * hosting layer rewrites it to the public proxy of this app's backend (Node
 * server.mjs on port 3000). For self-hosting, replace it with your own server
 * URL, e.g. 'https://your-host/api' (the server must expose /api/* routes).
 */
export const BILLING_API = (() => {
  const base = '__PORT_3000__/api'
  // The deploy rewrites the placeholder to the public backend proxy. In local
  // dev it stays literal — fall back to the local server on the same host.
  if (base.startsWith('__PORT')) {
    try { return `http://${location.hostname}:3000/api` } catch { return base }
  }
  return base
})()

async function api(path: string, body?: object, timeoutMs = 8000): Promise<any> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    // attach the account session token when logged in (web payments)
    let payload = body
    if (body && (body as any).initData !== undefined) {
      let token: string | null = null
      try { token = localStorage.getItem('tempo-account-token') } catch { /* ignore */ }
      if (token) payload = { ...body, token }
    }
    const res = await fetch(`${BILLING_API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: ctrl.signal
    })
    if (!res.ok) return { error: res.status === 401 ? 'unauthorized' : `HTTP ${res.status}` }
    return await res.json()
  } catch (e: any) {
    return { error: e?.name === 'AbortError' ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}

/** one retry wrapper — the billing server can take a moment to wake up */
async function apiWithRetry(path: string, body?: object) {
  let res = await api(path, body)
  if (res && (res.error === 'timeout' || res.error === 'network')) {
    await new Promise((r) => setTimeout(r, 1500))
    res = await api(path, body)
  }
  return res
}

export interface ServerUserState {
  plan: Plan
  status: 'active' | 'expired' | 'none'
  expiresAt: string | null
  autoRenew: boolean
  history: { id: string; plan: Plan; period: string; stars: number; status: string; ts: number }[]
  referrals: { invited: number; paying: number }
  referralCode?: string
  billingAvailable: boolean
  cardPayments?: 'auto' | 'manual'
}

/** Ask the server for the authoritative subscription state. */
export async function fetchUserState(initData: string): Promise<ServerUserState | { error: string }> {
  return apiWithRetry('/billing/status', { initData })
}

/** Ask the server for a Telegram Stars invoice link for a plan. */
export async function createStarsInvoice(
  initData: string,
  plan: Exclude<Plan, 'free'>,
  period: BillingPeriod
): Promise<{ link?: string; error?: string }> {
  return apiWithRetry('/billing/stars-invoice', { initData, plan, period })
}

/** Ask the server for a LiqPay card-checkout link (automatic card payment). */
export async function createCardLink(
  initData: string,
  plan: Exclude<Plan, 'free'>,
  period: BillingPeriod
): Promise<{ url?: string; error?: string }> {
  return apiWithRetry('/billing/card-link', { initData, plan, period })
}

// ---------- support chat ----------

export interface SupportMessage { from: 'user' | 'admin'; text: string; ts: number }

/** Send a message to support. */
export async function supportSend(initData: string, text: string): Promise<{ ok?: boolean; error?: string }> {
  return apiWithRetry('/support/send', { initData, text })
}

/** Fetch the user's support thread. */
export async function supportHistory(initData: string): Promise<{ messages?: SupportMessage[]; error?: string }> {
  return apiWithRetry('/support/history', { initData })
}

/** Admin: list all support threads. */
export async function adminSupportList(initData: string): Promise<{ threads?: any[]; error?: string }> {
  return api('/admin/support/list', { initData })
}

/** Admin: open one support thread (marks it read). */
export async function adminSupportThread(initData: string, userId: string): Promise<{ messages?: SupportMessage[]; username?: string | null; error?: string }> {
  return api('/admin/support/thread', { initData, userId })
}

/** Admin: reply to a user's support thread. */
export async function adminSupportReply(initData: string, userId: string, text: string): Promise<{ ok?: boolean; error?: string }> {
  return api('/admin/support/reply', { initData, userId, text })
}

/** Push upcoming events to the server so it can send Telegram reminders. */
export async function remindersSync(
  initData: string,
  events: { id: string; title: string; date: string; time?: string | null }[]
): Promise<{ ok?: boolean; error?: string }> {
  return api('/reminders/sync', { initData, events })
}

/** Cancel auto-renewal (server-side). */
export async function cancelSubscription(initData: string): Promise<{ ok?: boolean; error?: string }> {
  return api('/billing/cancel', { initData })
}
