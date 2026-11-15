import { useState } from 'react'
import { Sparkles, ArrowRight, SkipForward } from 'lucide-react'
import { Sheet, Btn } from './ui'
import { useStore } from '../lib/store'
import { useT } from '../lib/hooks'
import type { Currency } from '../lib/types'

const CURRENCIES: Currency[] = ['EUR', 'USD', 'GBP', 'UAH', 'PLN', 'RUB']
const LOCALES = [
  { id: 'ru', label: 'Русский' },
  { id: 'uk', label: 'Українська' },
  { id: 'en', label: 'English' },
  { id: 'de', label: 'Deutsch' },
  { id: 'fr', label: 'Français' }
] as const

/**
 * First-run onboarding: name, language, currency, optional kcal target.
 * Skippable in one tap; nothing is required.
 */
export function Onboarding() {
  const t2 = useT()
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const [step, setStep] = useState(0)
  const [name, setName] = useState(settings.name)
  const [kcal, setKcal] = useState(String(settings.kcalTarget))

  if (settings.onboarded) return null

  const finish = (withTargets: boolean) => {
    setSettings({
      onboarded: true,
      name: name.trim().slice(0, 30),
      ...(withTargets ? { kcalTarget: Math.max(500, Math.min(10000, Number(kcal) || 2200)) } : {})
    })
  }

  return (
    <Sheet
      open
      onClose={() => finish(false)}
      title={
        <span className="flex items-center gap-2">
          <Sparkles size={16} className="text-acc" />
          {t2('on.title')}
        </span>
      }
      footer={
        <div className="flex gap-2.5">
          {step > 0 && (
            <Btn variant="ghost" className="flex-1" onClick={() => setStep(step - 1)}>
              {t2('c.back')}
            </Btn>
          )}
          {step < 2 ? (
            <Btn className="flex-1" onClick={() => setStep(step + 1)}>
              {t2('on.next')} <ArrowRight size={14} />
            </Btn>
          ) : (
            <Btn className="flex-1" onClick={() => finish(true)}>
              {t2('on.finish')}
            </Btn>
          )}
        </div>
      }
    >
      <div className="mb-4 flex items-center justify-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-acc' : 'w-2 bg-soft3'}`} />
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <p className="text-[14px] leading-relaxed text-t2">{t2('on.welcomeText')}</p>
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-t3">{t2('on.nameLabel')}</label>
            <input
              className="inp h-11 w-full"
              placeholder={t2('pr.name')}
              value={name}
              maxLength={30}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-t3">{t2('on.langLabel')}</label>
            <div className="flex flex-wrap gap-2">
              {LOCALES.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setSettings({ locale: l.id, localeChosen: true })}
                  className={`press rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${settings.locale === l.id ? 'bg-acc/15 text-acc' : 'bg-soft text-t2'}`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-t3">{t2('on.currencyLabel')}</label>
            <div className="flex flex-wrap gap-2">
              {CURRENCIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setSettings({ currency: c })}
                  className={`press rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${settings.currency === c ? 'bg-acc/15 text-acc' : 'bg-soft text-t2'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[12px] leading-snug text-t3">{t2('on.currencyHint')}</p>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-t3">{t2('on.kcalLabel')}</label>
            <input
              className="inp tabular h-11 w-[120px] text-center"
              inputMode="numeric"
              placeholder="2200"
              value={kcal}
              onChange={(e) => setKcal(e.target.value.replace(/[^\d]/g, '').slice(0, 5))}
            />
            <p className="mt-1.5 text-[11px] leading-snug text-t3">{t2('on.kcalHint')}</p>
          </div>
          <button onClick={() => finish(false)} className="flex items-center gap-1.5 text-[13px] font-semibold text-t3">
            <SkipForward size={14} /> {t2('on.skip')}
          </button>
        </div>
      )}
    </Sheet>
  )
}
