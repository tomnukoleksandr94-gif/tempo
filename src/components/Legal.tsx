import { useState } from 'react'
import { FileText, ShieldCheck } from 'lucide-react'
import { Sheet, Btn } from './ui'
import { useStore } from '../lib/store'
import { useT } from '../lib/hooks'

/**
 * Privacy Policy and Terms of Service. Honest, plain-language documents that
 * describe exactly what data Tempo processes and what is sent to AI providers.
 * Displayed as sheets from the Profile page (keeps the app a single page and
 * avoids extra routes in the Telegram Mini App environment).
 */

const PRIVACY: Record<string, string[]> = {
  en: [
    'Tempo is a personal life-OS app (finance, tasks, calendar, nutrition) with an AI assistant. This policy explains what data we process.',
    'What is stored: your records (transactions, tasks, events, meals), app settings and chat history. In the browser/Telegram Mini App they are stored locally on your device; if you create an account, an encrypted snapshot is also mirrored to our server so you can log in from other devices.',
    'What is sent to AI providers: to answer your messages, Tempo sends your message, a compact summary of your recent data (recent transactions, today\'s tasks and events, nutrition totals) and your language to Google (Gemini API). Photos you attach for food analysis are sent to the same provider for analysis. The AI provider processes this data under its own terms; we do not send your full database, only the compact context.',
    'Payments: Telegram Stars payments are processed by Telegram; card payments are processed by LiqPay. We never see or store your card details. We keep a record of the payment (plan, period, date) to activate your subscription.',
    'Retention: local data stays until you delete it (Profile → Data). Server snapshots are deleted when you delete your account. AI providers retain data according to their own policies.',
    'Your rights: export all data as JSON at any time (Profile → Export), and permanently delete your account and data (Profile → Account → Delete).',
    'Contact: use the in-app Support chat.'
  ],
  ru: [
    'Tempo — приложение-жизненный ОС (финансы, задачи, календарь, питание) с ИИ-ассистентом. Эта политика объясняет, какие данные мы обрабатываем.',
    'Что хранится: ваши записи (операции, задачи, события, приёмы пищи), настройки и история чата. В браузере и Telegram Mini App они хранятся локально на вашем устройстве; при создании аккаунта снимок данных также дублируется на наш сервер, чтобы вы могли войти с других устройств.',
    'Что отправляется к ИИ-провайдерам: чтобы ответить на сообщение, Tempo отправляет ваш текст, компактную сводку ваших недавних данных (последние операции, задачи и события на сегодня, итоги питания) и ваш язык в Google (Gemini API). Фото для анализа еды отправляются туда же. Провайдер обрабатывает эти данные по своим условиям; мы не отправляем всю вашу базу — только компактный контекст.',
    'Оплата: платежи Telegram Stars обрабатывает Telegram; картой — LiqPay. Мы не видим и не храним данные вашей карты. Мы храним запись о платеже (тариф, период, дата) для активации подписки.',
    'Хранение: локальные данные хранятся до их удаления (Профиль → Данные). Серверные копии удаляются вместе с аккаунтом. ИИ-провайдеры хранят данные согласно своим политикам.',
    'Ваши права: экспортировать все данные в JSON в любой момент (Профиль → Экспорт) и навсегда удалить аккаунт и данные (Профиль → Аккаунт → Удалить).',
    'Контакты: чат поддержки внутри приложения.'
  ]
}

const TERMS: Record<string, string[]> = {
  en: [
    'By using Tempo you agree to these terms.',
    'Service: Tempo provides an AI assistant and personal productivity tools. The Free plan includes 10 AI requests per day; Plus — 100/day (€4.99/month or €49.90/year); Pro — 300/day (€8.90/month or €89.90/year). Limits reset daily by your timezone.',
    'Launch promotion: until December 5, 2026 23:59:59 (Paris time) the promo code TEMPO3 gives −€3 off your first payment (Plus monthly €1.99, Pro monthly €5.99, Plus annual €46.90, Pro annual €86.90). The discount applies once per user to the first payment only; renewals are at the normal price. The offer expires automatically.',
    'Payments: subscriptions are paid via Telegram Stars or bank card (LiqPay). Prices include applicable taxes; payment-provider fees may apply on the provider side. Subscriptions do not auto-renew through card payments unless you repeat the payment; Stars renewals happen when you pay again.',
    'Cancellation: you can stop using the paid plan at any time — the subscription stays active until the end of the paid period.',
    'AI disclaimer: AI answers are generated automatically and may contain mistakes. Always double-check important financial or health-related information. Nutrition estimates are approximations.',
    'Acceptable use: do not use Tempo for illegal purposes, attempt to break its security, or abuse the free AI limits.',
    'Liability: the service is provided "as is"; we are not liable for decisions made based on AI-generated content. Our liability is limited to the amount paid in the last 3 months.'
  ],
  ru: [
    'Используя Tempo, вы соглашаетесь с этими условиями.',
    'Сервис: Tempo предоставляет ИИ-ассистента и инструменты личной продуктивности. Тариф Free — 10 ИИ-запросов в день; Plus — 100/день (€4.99/мес или €49.90/год); Pro — 300/день (€8.99/мес или €89.90/год). Лимиты обновляются ежедневно по вашему часовому поясу.',
    'Акция запуска: до 5 декабря 2026 23:59:59 (по Парижу) промокод TEMPO3 даёт −€3 на первый платёж (Plus monthly €1.99, Pro monthly €5.99, Plus annual €46.90, Pro annual €86.90). Скидка действует один раз на первый платёж; продления — по обычной цене. Акция завершается автоматически.',
    'Оплата: подписки оплачиваются через Telegram Stars или банковской картой (LiqPay). Цены включают применимые налоги; комиссии платёжных систем могут взиматься на стороне провайдера. Подписки не продлеваются автоматически при оплате картой, если вы не повторите платёж; продление Stars происходит при повторной оплате.',
    'Отмена: вы можете прекратить использование платного тарифа в любой момент — подписка действует до конца оплаченного периода.',
    'Дисклеймер ИИ: ответы ИИ генерируются автоматически и могут содержать ошибки. Всегда перепроверяйте важную финансовую или связанную со здоровьем информацию. Оценки питания приблизительны.',
    'Допустимое использование: не используйте Tempo в незаконных целях, не пытайтесь взломать его защиту и не злоупотребляйте бесплатными лимитами ИИ.',
    'Ответственность: сервис предоставляется «как есть»; мы не несём ответственности за решения, принятые на основе ИИ-контента. Наша ответственность ограничена суммой, оплаченной за последние 3 месяца.'
  ]
}

function pick(map: Record<string, string[]>, locale: string): string[] {
  return map[locale] || (locale === 'ru' || locale === 'uk' ? map.ru : map.en)
}

export function LegalSection() {
  const t2 = useT()
  const locale = useStore((s) => s.settings.locale)
  const [open, setOpen] = useState<'privacy' | 'terms' | null>(null)
  const doc = open ? pick(open === 'privacy' ? PRIVACY : TERMS, locale) : []

  return (
    <>
      <div className="glass-sm flex gap-2 p-2">
        <Btn variant="ghost" className="flex-1 !text-[12px]" onClick={() => setOpen('privacy')}>
          <ShieldCheck size={13} /> {t2('pr.privacy')}
        </Btn>
        <Btn variant="ghost" className="flex-1 !text-[12px]" onClick={() => setOpen('terms')}>
          <FileText size={13} /> {t2('pr.terms')}
        </Btn>
      </div>

      <Sheet
        open={!!open}
        onClose={() => setOpen(null)}
        title={
          <span className="flex items-center gap-2">
            {open === 'privacy' ? <ShieldCheck size={16} className="text-acc" /> : <FileText size={16} className="text-acc" />}
            {open === 'privacy' ? t2('pr.privacy') : t2('pr.terms')}
          </span>
        }
        footer={
          <Btn className="w-full" onClick={() => setOpen(null)}>
            {t2('c.close')}
          </Btn>
        }
      >
        <div className="space-y-3 text-[13px] leading-relaxed text-t2">
          {doc.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p className="text-[11px] text-t3">Tempo — tempo-lifeos-app.pplx.app · 2026</p>
        </div>
      </Sheet>
    </>
  )
}
