import { useEffect } from 'react'
import { CreditCard, Sparkles } from 'lucide-react'
import { useStore } from '../lib/store'
import { useT } from '../lib/hooks'
import { aiLimitFor, effectivePlan } from '../lib/billing'
import { PricingSheet } from '../components/Pricing'
import { t } from '../lib/i18n'

/**
 * Dedicated Billing tab: current plan, usage and the pricing/payment sheet
 * (Telegram Stars or bank-card transfer — see PricingSheet).
 */
export default function BillingPage() {
  const t2 = useT()
  const subscription = useStore((s) => s.subscription)
  const usage = useStore((s) => s.aiUsage)
  const usedToday = usage.date === new Date().toISOString().slice(0, 10) ? usage.count : 0
  const limit = aiLimitFor(subscription)
  const current = effectivePlan(subscription)

  useEffect(() => {
    document.title = 'Tempo — Billing'
    return () => { document.title = 'Tempo — AI Life OS' }
  }, [])

  return (
    <div className="mx-auto max-w-[640px] md:max-w-none">
      {/* header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="glass-sm flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
          <CreditCard size={20} className="text-acc" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight">{t2('billing.title')}</h1>
          <p className="text-[13px] text-t2">{t2('billing.subtitle')}</p>
        </div>
      </div>

      {/* current plan + usage */}
      <div className="glass mb-6 p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[15px] font-bold">
            <Sparkles size={15} className="text-acc" />
            {t2(`plan.${current}`)}
            {subscription.expiresAt && current !== 'free' && (
              <span className="text-[12px] font-medium text-t3">
                · {t2('plan.expires')} {subscription.expiresAt.slice(0, 10)}
              </span>
            )}
          </span>
          <span className="tabular rounded-full bg-soft px-2.5 py-1 text-[12px] font-bold text-t2">
            {usedToday}/{limit} AI
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-soft">
          <div
            className="h-full rounded-full bg-acc transition-all"
            style={{ width: `${Math.min(100, Math.round((usedToday / limit) * 100))}%` }}
          />
        </div>
      </div>

      {/* pricing / payment */}
      <PricingSheet />
    </div>
  )
}
