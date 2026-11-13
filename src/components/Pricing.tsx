import { useEffect, useState } from 'react'
import { Check, Crown, Info, XCircle } from 'lucide-react'
import { useStore } from '../lib/store'
import { useT } from '../lib/hooks'
import { tg, isTelegram, haptic } from '../lib/telegram'
import {
  PLANS, PLAN_ORDER, planPrice, launchDiscountActive, LAUNCH_DISCOUNT_UNTIL,
  effectivePlan, fetchUserState, createStarsInvoice, cancelSubscription
} from '../lib/billing'
import type { BillingPeriod, Plan } from '../lib/types'
import { Btn } from './ui'

/**
 * Honest pricing UI:
 * - prices show the launch discount with an explicit label and expiry date;
 * - payment only via Telegram Stars through the server (server verifies initData
 *   and activates the subscription via the Telegram webhook);
 * - if the billing server is unreachable, it says so — no fake activations.
 */
export function PricingSheet({ onClose }: { onClose?: () => void }) {
  const t2 = useT()
  const subscription = useStore((s) => s.subscription)
  const syncSubscription = useStore((s) => s.syncSubscription)
  const [period, setPeriod] = useState<BillingPeriod>('monthly')
  const [busy, setBusy] = useState<Plan | null>(null)
  const [serverOk, setServerOk] = useState<boolean | null>(null)
  const discount = launchDiscountActive()

  // fetch authoritative state from the server (only makes sense in Telegram)
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!isTelegram || !tg?.initData) {
        setServerOk(false)
        return
      }
      const res = await fetchUserState(tg.initData)
      if (cancelled) return
      if ('error' in res) {
        setServerOk(false)
        return
      }
      setServerOk(true)
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
    if (!isTelegram || !tg?.initData || !serverOk) return
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

      {/* launch discount label */}
      {discount && period === 'monthly' && (
        <div className="flex items-center gap-2 rounded-2xl bg-accent-soft px-3.5 py-2.5 text-[12px] font-semibold text-acc2">
          <Info size={14} className="shrink-0" />
          {t2('plan.discount')}
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
              <span className="tabular text-[22px] font-extrabold">
                {p === 'free' ? '€0' : `€${price.toFixed(2)}`}
              </span>
              <span className="text-[12px] text-t3">
                {t2(period === 'monthly' ? 'plan.perMonth' : 'plan.perYear')}
              </span>
              {p !== 'free' && discount && period === 'monthly' && (
                <span className="tabular text-[12px] text-t3 line-through">
                  €{def.monthly.toFixed(2)}
                </span>
              )}
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
                disabled={isCurrent || !serverOk || busy !== null}
                onClick={() => pay(p)}
              >
                {isCurrent ? t2('plan.current') : `${t2('plan.starsPay')} · ${period === 'monthly' ? def.starsMonthly : def.starsAnnual} ⭐`}
              </Btn>
            )}
          </div>
        )
      })}

      <p className="px-1 text-[11px] leading-relaxed text-t3">{t2('plan.starsNote')}</p>

      {/* honest unavailability */}
      {serverOk === false && (
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
