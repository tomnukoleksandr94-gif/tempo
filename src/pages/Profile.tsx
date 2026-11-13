import { useRef, useState } from 'react'
import {
  User, Languages, Coins, Sparkles, Target, LayoutGrid, Database,
  Download, Upload, Trash2, ShieldCheck, Crown
, Headset} from 'lucide-react'
import { Sheet, Btn, Field, Switch, SectionHeader, useToast } from '../components/ui'
import { useStore, DEFAULT_WIDGETS } from '../lib/store'
import { effectivePlan, aiLimitFor } from '../lib/billing'
import { PricingSheet } from '../components/Pricing'
import { ReferralBlock } from '../components/Referral'
import { AccountSection } from '../components/Account'
import { LegalSection } from '../components/Legal'
import { useT } from '../lib/hooks'

import { t } from '../lib/i18n'
import { download } from '../lib/utils'
import type { Currency } from '../lib/types'
import { LogoMark } from '../App'

const CURRENCIES: Currency[] = ['EUR', 'USD', 'GBP', 'UAH', 'PLN', 'RUB']

const WIDGETS: { id: string; key: string }[] = [
  { id: 'overview', key: 'home.spendToday' },
  { id: 'insight', key: 'home.insight' },
  { id: 'upcoming', key: 'home.upcoming' },
  { id: 'tasks', key: 'home.pendingTasks' },
  { id: 'weekSpending', key: 'home.weekSpending' },
  { id: 'nutrition', key: 'home.todayNutrition' },
  { id: 'history', key: 'home.history' }
]

export default function Profile({ go }: { go?: (t: import('../App').TabId) => void }) {
  const t2 = useT()
  const toast = useToast()
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const usage = useStore((s) => s.aiUsage)
  const exportJson = useStore((s) => s.exportJson)
  const importJson = useStore((s) => s.importJson)
  const clearAll = useStore((s) => s.clearAll)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pricing, setPricing] = useState(false)
  const [clearSheet, setClearSheet] = useState(false)

  const subscription = useStore((s) => s.subscription)
  const usedToday = usage.date === new Date().toISOString().slice(0, 10) ? usage.count : 0
  const limit = aiLimitFor(subscription)
  const currentPlan = effectivePlan(subscription)

  const Group = ({ icon, title, children }: { icon: any; title: string; children: any }) => (
    <div className="glass overflow-hidden">
      <div className="flex items-center gap-2 border-b bd-soft px-4 py-3">
        {icon}
        <span className="text-[13px] font-bold text-t2">{title}</span>
      </div>
      {children}
    </div>
  )

  const Row = ({ label, children }: { label: string; children: any }) => (
    <div className="flex items-center justify-between gap-4 border-b bd-soft px-4 py-3 last:border-0">
      <span className="shrink-0 text-[14px]">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )

  return (
    <div className="mx-auto max-w-[640px] md:max-w-none">
      <h1 className="mb-4 text-lg font-extrabold">{t2('pr.title')}</h1>

      {/* identity */}
      <div className="glass mb-4 flex items-center gap-4 p-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[22px] font-extrabold text-acc2">
          {(settings.name || 'T')[0].toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <input
            className="w-full bg-transparent text-[17px] font-bold outline-none placeholder:text-t3"
            placeholder={t2('pr.name')}
            value={settings.name}
            maxLength={30}
            onChange={(e) => setSettings({ name: e.target.value })}
          />
          <div className="mt-1 text-[12px] text-t3">Tempo AI Life OS · v1.0</div>
        </div>
      </div>

      <Group icon={<Languages size={15} className="text-acc" />} title={t2('pr.general')}>
        <Row label={t2('pr.language')}>
          <div className="flex rounded-full bg-soft p-1">
            {(['ru', 'uk', 'en', 'de', 'fr'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setSettings({ locale: l, localeChosen: true })}
                className={`press rounded-full px-3.5 py-1 text-[13px] font-semibold ${settings.locale === l ? 'bg-soft3 text-t1' : 'text-t2'}`}
              >
                {{ ru: 'Рус', uk: 'Укр', en: 'Eng', de: 'De', fr: 'Fr' }[l]}
              </button>
            ))}
          </div>
        </Row>
        <Row label={t2('pr.currency')}>
          <select className="inp h-9 w-[110px] !rounded-full" value={settings.currency} onChange={(e) => setSettings({ currency: e.target.value as Currency })}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Row>
        <Row label={t2('pr.theme')}>
          <div className="flex rounded-full bg-soft p-1">
            {(['auto', 'dark', 'light'] as const).map((th) => (
              <button
                key={th}
                onClick={() => setSettings({ theme: th })}
                className={`press rounded-full px-3 py-1 text-[12px] font-semibold ${settings.theme === th ? 'bg-soft3 text-t1' : 'text-t2'}`}
              >
                {t2(`pr.theme${th === 'auto' ? 'Auto' : th === 'dark' ? 'Dark' : 'Light'}`)}
              </button>
            ))}
          </div>
        </Row>
        <Row label={t2('pr.effects')}>
          <button
            onClick={() => setSettings({ effects: !settings.effects })}
            className={`press rounded-full px-4 py-1 text-[12px] font-semibold ${settings.effects ? 'bg-acc/15 text-acc' : 'bg-soft text-t2'}`}
          >
            {settings.effects ? t2('pr.on') : t2('pr.off')}
          </button>
        </Row>
        <Row label={t2('pr.reminders')}>
          <button
            onClick={() => setSettings({ eventReminders: !settings.eventReminders })}
            className={`press rounded-full px-4 py-1 text-[12px] font-semibold ${settings.eventReminders !== false ? 'bg-acc/15 text-acc' : 'bg-soft text-t2'}`}
          >
            {settings.eventReminders !== false ? t2('pr.on') : t2('pr.off')}
          </button>
        </Row>
      </Group>

      <SectionHeader title={t2('pr.aiSettings')} />
      <Group icon={<Sparkles size={15} className="text-acc" />} title={t2('pr.aiSettings')}>
        <Row label={t2('pr.model')}>
          <select
            className="inp h-9 w-[190px] !rounded-full"
            value={settings.aiTier || 'fast'}
            onChange={(e) => setSettings({ aiTier: e.target.value as 'fast' | 'balanced' | 'advanced' })}
          >
            <option value="fast">{t2('ai.tier_fast')} — Gemini 3.5 Flash Lite</option>
            <option value="balanced">{t2('ai.tier_balanced')} — Gemini 3.5 Flash</option>
            <option value="advanced">{t2('ai.tier_advanced')} — Gemini 3.5 Flash · Deep</option>
          </select>
        </Row>
        <Row label={t2('pr.aiPersonalization')}>
          <span className="text-[12px] text-t3">{t2('pr.aiPersonalizationHint')}</span>
        </Row>
        <Row label={t2('pr.apiKey')}>
          <input
            className="inp h-9 w-[190px] text-[12px]"
            type="password"
            placeholder={settings.apiKey ? '••••••••' : t('pr.apiKeyHint', settings.locale).slice(0, 18) + '…'}
            value={settings.apiKey}
            onChange={(e) => setSettings({ apiKey: e.target.value.trim() })}
            autoComplete="off"
          />
        </Row>
        <Row label={t2('pr.usageToday')}>
          <span className="tabular text-[13px] font-semibold text-t2">
            {usedToday} / {limit}
          </span>
        </Row>
      </Group>
      <p className="mt-1.5 px-1 text-[11px] leading-snug text-t3">{t2('pr.apiKeyHint')}</p>

      <SectionHeader title={t2('pr.goals')} />
      <Group icon={<Target size={15} className="text-acc" />} title={t2('pr.goals')}>
        <Row label={t2('pr.kcalTarget')}>
          <input
            className="inp tabular h-9 w-[100px] text-center"
            inputMode="numeric"
            value={settings.kcalTarget}
            onChange={(e) => setSettings({ kcalTarget: Math.max(500, Math.min(10000, Number(e.target.value) || 0)) })}
          />
        </Row>
      </Group>

      <SectionHeader title={t2('pr.widgets')} />
      <Group icon={<LayoutGrid size={15} className="text-acc" />} title={t2('pr.widgets')}>
        {WIDGETS.map((w) => (
          <Row key={w.id} label={t2(w.key)}>
            <Switch
              checked={settings.widgets.includes(w.id)}
              onChange={(v) =>
                setSettings({
                  widgets: v
                    ? DEFAULT_WIDGETS.filter((x) => settings.widgets.includes(x) || x === w.id)
                    : settings.widgets.filter((x) => x !== w.id)
                })
              }
            />
          </Row>
        ))}
      </Group>

      <SectionHeader title={t2('acc.title')} />
      <AccountSection />

      <button onClick={() => go && go('support')} className="glass lift press mt-4 flex w-full items-center gap-3 p-4 text-left">
        <Headset size={17} className="text-acc" />
        <div>
          <div className="text-[15px] font-bold">{t2('pr.support')}</div>
          <div className="text-[12px] text-t3">{t2('support.subtitle')}</div>
        </div>
      </button>

      <SectionHeader title={t2('pr.subscription')} />
      <button onClick={() => go ? go('billing') : setPricing(true)} className="glass lift block w-full p-4 text-left">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[15px] font-bold">
            <Crown size={16} className="text-acc" />
            {t2(`plan.${currentPlan}`)}
          </span>
          <span className="tabular text-[12px] text-t2">
            {usedToday}/{limit} · {t2('ai.usage')}
          </span>
        </div>
        {subscription.expiresAt && (
          <p className="mt-1 text-[12px] text-t3">
            {t2('plan.expires')} {subscription.expiresAt.slice(0, 10)}
          </p>
        )}
      </button>

      <div className="mt-4">
        <ReferralBlock />
      </div>

      <div className="mt-3">
        <LegalSection />
      </div>

      <SectionHeader title={t2('pr.data')} />
      <Group icon={<Database size={15} className="text-acc" />} title={t2('pr.data')}>
        <Row label={t2('pr.export')}>
          <Btn
            size="sm"
            variant="ghost"
            onClick={() => {
              download(`tempo-backup-${new Date().toISOString().slice(0, 10)}.json`, exportJson())
              toast(t2('c.done'), 'ok')
            }}
          >
            <Download size={14} /> JSON
          </Btn>
        </Row>
        <Row label={t2('pr.import')}>
          <>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                try {
                  const text = await f.text()
                  const ok = importJson(text)
                  toast(ok ? t2('c.done') : t2('err.parse'), ok ? 'ok' : 'err')
                } catch {
                  toast(t2('err.parse'), 'err')
                }
              }}
            />
            <Btn size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
              <Upload size={14} />
            </Btn>
          </>
        </Row>
        <Row label={t2('pr.clearAll')}>
          <Btn size="sm" variant="danger" onClick={() => setClearSheet(true)}>
            <Trash2 size={14} />
          </Btn>
        </Row>
      </Group>

      <SectionHeader title={t2('pr.security')} />
      <div className="glass flex gap-3 p-4">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-green" />
        <p className="text-[12px] leading-relaxed text-t2">{t2('pr.securityText')}</p>
      </div>

      <div className="mt-6 flex items-center justify-center gap-2 pb-2 text-t3">
        <LogoMark size={20} />
        <span className="text-[13px] font-extrabold tracking-tight">tempo</span>
        <span className="text-[11px]">· AI Life OS</span>
      </div>
      <p className="mb-2 text-center text-[11px] leading-relaxed text-t3">{t2('pr.aboutText')}</p>

      {/* pricing */}
      <Sheet open={pricing} onClose={() => setPricing(false)} title={t2('pr.subscription')}>
        <PricingSheet go={go} onClose={() => setPricing(false)} />
      </Sheet>

      {/* clear data */}
      <Sheet
        open={clearSheet}
        onClose={() => setClearSheet(false)}
        title={t2('pr.clearAll')}
        footer={
          <div className="flex gap-2.5">
            <Btn variant="ghost" className="flex-1" onClick={() => setClearSheet(false)}>
              {t2('c.cancel')}
            </Btn>
            <Btn
              variant="danger"
              className="flex-1"
              onClick={() => {
                clearAll()
                toast(t2('c.done'), 'ok')
                setClearSheet(false)
              }}
            >
              {t2('c.delete')}
            </Btn>
          </div>
        }
      >
        <p className="py-4 text-center text-[14px] text-t2">{t2('pr.clearWarn')}</p>
      </Sheet>
    </div>
  )
}
