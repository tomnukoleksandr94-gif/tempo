import { useEffect, useState } from 'react'
import { Check, CreditCard, Crown, LogIn, Sparkles, XCircle } from 'lucide-react'
import { useStore } from '../lib/store'
import { useT } from '../lib/hooks'
import { useToast } from './ui'
import { tg, haptic } from '../lib/telegram'
import {
  PLANS, PLAN_ORDER, planPrice, firstPrice, PROMO, promoActive,
  effectivePlan, fetchUserState, createStarsInvoice, createCardLink, cancelSubscription
} from '../lib/billing'
import type { BillingPeriod, Plan } from '../lib/types'
import { Btn } from './ui'

/**
 * Honest pricing UI:
 * - two payment methods: Telegram Stars (automatic, via the server) and bank
 *   card transfer (manual — the app shows the recipient card, the user pays from
 *   their own banking app and taps "I paid"; the owner activates after checking);
 * - no card data of the payer is ever collected;
 * - if the billing server is unreachable, it says so — no fake activations.
 */
export function PricingSheet({ onClose, go }: { onClose?: () => void; go?: (tab: any) => void }) {
  const t2 = useT()
  const toast = useToast()
  const subscription = useStore((s) => s.subscription)
  const syncSubscription = useStore((s) => s.syncSubscription)
  const [period, setPeriod] = useState<BillingPeriod>('monthly')
  const [busy, setBusy] = useState<Plan | null>(null)
  const [serverOk, setServerOk] = useState<boolean | null>(null)
  const [method, setMethod] = useState<'stars' | 'card'>('stars')
  const [cardMode, setCardMode] = useState<'auto' | 'manual' | null>(null)
  const [needLogin, setNeedLogin] = useState(false)
  // promo: server-authoritative (knows if the user already used it);
  // local mirror as the display fallback when the server is unreachable
  const [promoForUser, setPromoForUser] = useState<boolean | null>(null)
  const promoApplies = promoForUser === null ? promoActive() : promoForUser
  // auto card payment: poll status when the user returns from the checkout
  useEffect(() => {
    function onFocus() { refreshState() }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  async function refreshState() {
    const initData = tg?.initData || ''
    if (!initData) return
    const st = await fetchUserState(initData)
    if (!('error' in st)) {
      syncSubscription({
        plan: st.plan, status: st.status, expiresAt: st.expiresAt, autoRenew: st.autoRenew,
        history: st.history.map((h: any) => ({ id: h.id, plan: h.plan, period: h.period, stars: h.stars, status: h.status, ts: h.ts }))
      })
    }
  }

  // fetch authoritative state from the server (Telegram initData or account token)
  useEffect(() => {
    let cancelled = false
    async function load() {
      const initData = tg?.initData || ''
      let hasAccount = false
      try { hasAccount = !!localStorage.getItem('tempo-account-token') } catch { /* ignore */ }
      if (!initData && !hasAccount) {
        setServerOk(false)
        return
      }
      const res = await fetchUserState(initData)
      if (cancelled) return
      if ('error' in res) {
        if (res.error === 'unauthorized') setNeedLogin(true)
        setServerOk(false)
        return
      }
      setServerOk(true)
      if (res.cardPayments) setCardMode(res.cardPayments)
      if (res.promo) setPromoForUser(!!res.promo.active)
      if (res.referralCode) {
        try { localStorage.setItem('tempo-referral-code', res.referralCode) } catch { /* ignore */ }
      }
      syncSubscription({
        plan: res.plan,
        status: res.status,
        expiresAt: res.expiresAt,
        autoRenew: res.autoRenew,
        history: res.history.map((h: any) => ({
          id: h.id, plan: h.plan, period: h.period, stars: h.stars, status: h.status, ts: h.ts
        }))
      })
    }
    load()
    return () => { cancelled = true }
  }, [syncSubscription])

  const current = effectivePlan(subscription)

  async function pay(plan: Exclude<Plan, 'free'>) {
    if (!serverOk || !tg?.initData) return // Stars checkout exists only inside Telegram
    setBusy(plan)
    haptic('medium')
    const res = await createStarsInvoice(tg.initData, plan, period)
    if (res?.link) {
      // openInvoice resolves when the user closes the payment dialog
      tg.openInvoice?.(res.link, async () => {
        // re-check authoritative state after the dialog closes
        const st = await fetchUserState(tg.initData)
        if (!('error' in st)) {
          syncSubscription({
            plan: st.plan, status: st.status, expiresAt: st.expiresAt, autoRenew: st.autoRenew
          })
        }
      })
    } else {
      haptic('error')
    }
    setBusy(null)
  }

  async function payByCard(plan: Exclude<Plan, 'free'>) {
    setBusy(plan)
    haptic('medium')
    const res = await createCardLink(tg?.initData || '', plan, period)
    if (res?.url) {
      try {
        tg?.openLink?.(res.url)
      } catch {
        window.open(res.url, '_blank')
      }
      // poll for activation while/after the user pays on LiqPay's page
      const poll = setInterval(async () => {
        await refreshState()
      }, 6000)
      setTimeout(() => clearInterval(poll), 180000)
    } else {
      haptic('error')
      toast(t2('plan.cardFail'), 'err')
    }
    setBusy(null)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* period toggle */}
      <div className="glass-sm flex items-center gap-1 p-1">
        {(['monthly', 'annual'] as BillingPeriod[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`press flex-1 rounded-[11px] py-2 text-[13px] font-semibold transition-colors ${
              period === p ? 'bg-soft3 text-t1' : 'text-t2'
            }`}
          >
            {t2(p === 'monthly' ? 'plan.monthly' : 'plan.annualBtn')}
          </button>
        ))}
      </div>

      {/* launch promo banner (real dates, auto-expires) */}
      {promoActive() && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-(--color-acc)/40 bg-acc/10 px-3.5 py-2.5">
          <span className="text-[16px]">🎁</span>
          <div className="text-[12px] leading-snug text-t2">
            <span className="font-bold text-t1">{PROMO.code}</span> — {t2('plan.promoText').replace('{n}', String(PROMO.discount))}{' '}
            <span className="text-t3">{t2('plan.promoUntil')} 05.12.2026</span>
          </div>
        </div>
      )}

      {/* payment method toggle (card shown only when LiqPay checkout is configured) */}
      {cardMode === 'auto' && (
        <div className="glass-sm flex items-center gap-1 p-1">
          <button
            onClick={() => setMethod('stars')}
            className={`press flex flex-1 items-center justify-center gap-1.5 rounded-[11px] py-2 text-[13px] font-semibold transition-colors ${
              method === 'stars' ? 'bg-soft3 text-t1' : 'text-t2'
            }`}
          >
            <Sparkles size={14} className={method === 'stars' ? 'text-acc' : ''} />
            {t2('plan.payStars')}
          </button>
          <button
            onClick={() => setMethod('card')}
            className={`press flex flex-1 items-center justify-center gap-1.5 rounded-[11px] py-2 text-[13px] font-semibold transition-colors ${
              method === 'card' ? 'bg-soft3 text-t1' : 'text-t2'
            }`}
          >
            <CreditCard size={14} className={method === 'card' ? 'text-acc' : ''} />
            {t2('plan.payCard')}
          </button>
        </div>
      )}

      {/* plans */}
      {PLAN_ORDER.map((p) => {
        const def = PLANS[p]
        const price = planPrice(p, period)
        const isCurrent = current === p
        return (
          <div
            key={p}
            className={`glass-sm p-4 ${isCurrent ? 'border-[rgba(142,123,239,0.5)]' : ''}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[15px] font-bold">
                {p !== 'free' && <Crown size={15} className="text-acc" />}
                {t2(`plan.${p}`)}
              </span>
              {isCurrent ? (
                <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold text-acc2">
                  {t2('plan.current')}
                </span>
              ) : null}
            </div>

            <div className="mb-2.5 flex items-baseline gap-1.5">
              {p !== 'free' && promoApplies && price > firstPrice(p, period, promoApplies) ? (
                <>
                  <span className="tabular text-[22px] font-extrabold text-acc">
                    €{firstPrice(p, period, promoApplies).toFixed(2)}
                  </span>
                  <span className="tabular text-[13px] text-t3 line-through">€{price.toFixed(2)}</span>
                  <span className="text-[11px] font-semibold text-t3">{t2('plan.firstPayment')}</span>
                </>
              ) : (
                <>
                  <span className="tabular text-[22px] font-extrabold">
                    {p === 'free' ? '€0' : `€${price.toFixed(2)}`}
                  </span>
                </>
              )}
              <span className="text-[12px] text-t3">
                {t2(period === 'monthly' ? 'plan.perMonth' : 'plan.perYear')}
              </span>
            </div>

            <ul className="mb-3 space-y-1.5">
              {Array.from({ length: p === 'free' ? 3 : 6 }, (_, i) => i + 1).map((n) => {
                const key = `${p === 'free' ? 'f' : p === 'plus' ? 'p' : 'm'}${n}`
                return (
                  <li key={n} className="flex items-center gap-2 text-[13px] text-t2">
                    <Check size={13} className="shrink-0 text-acc" />
                    {t2(`plan.${key}`)}
                  </li>
                )
              })}
            </ul>

            {p !== 'free' && (
              <Btn
                className="w-full"
                variant={isCurrent ? 'ghost' : 'primary'}
                disabled={isCurrent || !serverOk || busy !== null || !tg?.initData}
                onClick={() => (method === 'card' ? payByCard(p) : pay(p))}
              >
                {isCurrent
                  ? t2('plan.current')
                  : method === 'card'
                    ? t2(cardMode === 'auto' ? 'plan.payCardAuto' : 'plan.payCardBtn')
                    : (() => {
                        const base = period === 'monthly' ? def.starsMonthly : def.starsAnnual
                        const stars = promoApplies
                          ? Math.max(1, base - Math.round(PROMO.discount * base / price))
                          : base
                        return `${t2('plan.starsPay')} · ${stars} ⭐${promoApplies ? ` (−${base - stars} ⭐)` : ''}`
                      })()}
              </Btn>
            )}
          </div>
        )
      })}

      <p className="px-1 text-[11px] leading-relaxed text-t3">{t2('plan.starsNote')}</p>

      {/* login prompt (web visitors without an account) */}
      {needLogin && (
        <div className="glass-sm flex flex-col items-start gap-2.5 p-4">
          <div className="flex items-start gap-2.5 text-[13px] leading-relaxed text-t2">
            <LogIn size={15} className="mt-0.5 shrink-0 text-acc" />
            {t2('plan.loginHint')}
          </div>
          {go && (
            <Btn variant="primary" className="w-full" onClick={() => { go('profile'); onClose?.() }}>
              {t2('plan.loginBtn')}
            </Btn>
          )}
        </div>
      )}

      {/* honest unavailability */}
      {serverOk === false && !needLogin && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-soft p-3.5 text-[12px] leading-relaxed text-t2">
          <XCircle size={14} className="mt-0.5 shrink-0 text-red" />
          {t2('plan.serverOff')}
        </div>
      )}

      {/* active subscription details */}
      {current !== 'free' && (
        <div className="glass-sm p-4 text-[13px] text-t2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-t1">{t2(`plan.${current}`)}</span>
            {subscription.expiresAt && (
              <span className="text-[12px] text-t3">
                {t2('plan.expires')} {subscription.expiresAt.slice(0, 10)}
              </span>
            )}
          </div>
          {subscription.autoRenew && (
            <button
              className="press mt-2.5 text-[12px] font-semibold text-red"
              onClick={async () => {
                if (!tg?.initData) return
                const res = await cancelSubscription(tg.initData)
                if (res?.ok) syncSubscription({ autoRenew: false })
              }}
            >
              {t2('plan.cancel')}
            </button>
          )}
        </div>
      )}

      {/* history */}
      {subscription.history.length > 0 && (
        <div className="glass-sm overflow-hidden">
          <div className="px-4 pt-3 text-[13px] font-bold text-t2">{t2('plan.history')}</div>
          {subscription.history.map((h, i) => (
            <div key={h.id} className={`flex items-center justify-between px-4 py-2.5 text-[12px] ${i > 0 ? 'border-t bd-soft' : ''}`}>
              <span className="text-t2">
                {t2(`plan.${h.plan}`)} · {t2(h.period === 'annual' ? 'plan.annualBtn' : 'plan.monthly')}
              </span>
              <span className="tabular text-t3">
                {h.stars} ⭐ · {new Date(h.ts).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {onClose && (
        <Btn className="w-full" variant="ghost" onClick={onClose}>
          {t2('c.close')}
        </Btn>
      )}
    </div>
  )
}
