import { useEffect, useState } from 'react'
import { Gift, Users } from 'lucide-react'
import { useStore } from '../lib/store'
import { useT } from '../lib/hooks'
import { tg, isTelegram } from '../lib/telegram'
import { fetchUserState } from '../lib/billing'

/**
 * Referral program: 1 friend = progress, 3 paying friends = 1 month Plus,
 * 5 paying friends = 1 month Pro. Counts come from the server (verified
 * payments only) — the client never guesses them.
 */
export function ReferralBlock() {
  const t2 = useT()
  const referralCode = useStore((s) => s.referralCode)
  const referral = useStore((s) => s.referral)
  const setReferral = useStore((s) => s.setReferral)
  const [copied, setCopied] = useState(false)

  const link = `https://t.me/Tempo00Bot?start=ref_${referralCode}`

  // sync server-verified referral counts (Telegram only)
  useEffect(() => {
    if (!isTelegram || !tg?.initData) return
    fetchUserState(tg.initData).then((res) => {
      if ('error' in res) return
      setReferral({ invited: res.referrals.invited, paying: res.referrals.paying })
    })
  }, [setReferral])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard may be unavailable in iframes — Telegram share as fallback
      tg?.openTelegramLink?.(`https://t.me/share/url?url=${encodeURIComponent(link)}`)
    }
  }

  const tiers = [
    { at: 1, label: t2('ref.tier1'), done: referral.invited >= 1 },
    { at: 3, label: t2('ref.tier2'), done: referral.paying >= 3 },
    { at: 5, label: t2('ref.tier3'), done: referral.paying >= 5 }
  ]

  return (
    <div className="glass p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 text-[15px] font-bold">
          <Gift size={16} className="text-acc" />
          {t2('ref.title')}
        </span>
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-t2">
          <Users size={13} className="text-acc" />
          {t2('ref.invited')}: {referral.invited} · {t2('ref.paying')}: {referral.paying}
        </span>
      </div>
      <p className="mb-3 text-[12px] leading-relaxed text-t2">{t2('ref.text')}</p>

      {/* link + copy */}
      <div className="mb-3 flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate rounded-xl bg-soft px-3 py-2 text-[12px] text-t2">
          {link}
        </div>
        <button
          onClick={copy}
          className="press shrink-0 rounded-xl bg-accent-soft px-3 py-2 text-[12px] font-bold text-acc2"
        >
          {copied ? t2('ref.copied') : t2('ref.copy')}
        </button>
      </div>

      {/* progress tiers */}
      <div className="space-y-2">
        {tiers.map((tr) => (
          <div key={tr.at} className="flex items-center gap-2.5 text-[13px]">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                tr.done ? 'bg-green text-black' : 'bg-soft3 text-t3'
              }`}
            >
              {tr.done ? '✓' : tr.at}
            </span>
            <span className={tr.done ? 'font-semibold text-t1' : 'text-t2'}>{tr.label}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-t3">{t2('ref.antiAbuse')}</p>
    </div>
  )
}
