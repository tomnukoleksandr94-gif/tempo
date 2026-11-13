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

// ---------- launch discount ----------
// −3 € on monthly plans, valid until 2026-12-01. Displayed explicitly in the UI.
export const LAUNCH_DISCOUNT = 3
export const LAUNCH_DISCOUNT_UNTIL = '2026-12-01'

export function launchDiscountActive(now = new Date()): boolean {
  return now.getTime() < new Date(`${LAUNCH_DISCOUNT_UNTIL}T23:59:59`).getTime()
}

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

/** Display price of a plan for a period, including launch discount when active. */
export function planPrice(plan: Plan, period: BillingPeriod, now = new Date()): number {
  const base = period === 'monthly' ? PLANS[plan].monthly : PLANS[plan].annual
  if (plan === 'free') return 0
  if (period === 'monthly' && launchDiscountActive(now)) return Math.max(0, base - LAUNCH_DISCOUNT)
  return base
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

// ---------- server API (secure verification) ----------

/**
 * Server base for billing. The backend verifies Telegram initData (HMAC with
 * the bot token) — the client only relays its initData, never claims payments
 * itself. '__PORT_3000__' is a deploy-time placeholder: the
 * hosting layer rewrites it to the public proxy of this app's backend (Node
 * server.mjs on port 3000). For self-hosting, replace it with your own server
 * URL, e.g. 'https://your-host/api' (the server must expose /api/* routes).
 */
export const BILLING_API = '__PORT_3000__/api'

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
    if (!res.ok) return { error: `HTTP ${res.status}` }
    return await res.json()
  } catch (e: any) {
    return { error: e?.name === 'AbortError' ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}

export interface ServerUserState {
  plan: Plan
  status: 'active' | 'expired' | 'none'
  expiresAt: string | null
  autoRenew: boolean
  history: { id: string; plan: Plan; period: string; stars: number; status: string; ts: number }[]
  referrals: { invited: number; paying: number }
  billingAvailable: boolean
}

/** Ask the server for the authoritative subscription state. */
export async function fetchUserState(initData: string): Promise<ServerUserState | { error: string }> {
  return api('/billing/status', { initData })
}

/** Ask the server for a Telegram Stars invoice link for a plan. */
export async function createStarsInvoice(
  initData: string,
  plan: Exclude<Plan, 'free'>,
  period: BillingPeriod
): Promise<{ link?: string; error?: string }> {
  return api('/billing/stars-invoice', { initData, plan, period })
}

/** Cancel auto-renewal (server-side). */
export async function cancelSubscription(initData: string): Promise<{ ok?: boolean; error?: string }> {
  return api('/billing/cancel', { initData })
}
