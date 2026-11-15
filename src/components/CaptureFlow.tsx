import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Sheet, Btn, useToast } from './ui'
import { ActionCards } from './ActionCards'
import { useStore } from '../lib/store'
import { processInput, analyzeFoodPhoto } from '../lib/ai'
import { validateAiActions, type Validated } from '../lib/validate'
import { t } from '../lib/i18n'
import { haptic } from '../lib/telegram'

export interface CaptureRequest {
  id: number
  text?: string
  image?: { b64: string; mime: string }
}

export interface CaptureOutcome {
  ok: boolean
  reply: string
  applied: string[]
  error?: string
}

/**
 * Shared AI capture pipeline: input → AI → validation → user confirmation
 * → database writes. Nothing is saved without explicit confirmation
 * (unless the user enabled auto-confirm for simple actions).
 */
export function CaptureFlow({
  request,
  onFinish
}: {
  request: CaptureRequest | null
  onFinish: (outcome: CaptureOutcome) => void
}) {
  const toast = useToast()
  const [pending, setPending] = useState<Validated[] | null>(null)
  const [reply, setReply] = useState('')
  const busyRef = useRef(false)
  const settings = useStore((s) => s.settings)
  const applyActions = useStore((s) => s.applyActions)

  useEffect(() => {
    if (!request || busyRef.current) return
    busyRef.current = true

    // NOTE: the daily limit is enforced SERVER-side (the server owns the API
    // key and the usage counter). The local counter is only a display mirror
    // updated from every server response.

    const data = {
      transactions: useStore.getState().transactions,
      tasks: useStore.getState().tasks,
      events: useStore.getState().events,
      meals: useStore.getState().meals,
      settings: useStore.getState().settings
    }

    const run = request.image
      ? analyzeFoodPhoto(request.image.b64, request.image.mime, data)
      : processInput(request.text || '', data)

    run
      .then((result) => {
        const validated = validateAiActions(result.actions, settings.currency)
        if (validated.length === 0) {
          onFinish({ ok: true, reply: result.clarify || result.reply, applied: [] })
          return
        }
        setReply(result.reply)
        if (settings.autoConfirm && validated.length === 1) {
          const { applied } = applyActions(validated)
          haptic('success')
          onFinish({ ok: true, reply: result.reply, applied })
        } else {
          setPending(validated)
        }
      })
      .catch((e: any) => {
        const msg =
          e?.code === 'limit' ? t('ai.limitReached', settings.locale) :
          e?.code === 'plan' ? t('ai.planRequired', settings.locale) :
          e?.code === 'auth' ? t('pr.apiKeyHint', settings.locale) :
          e?.code === 'config' ? t('ai.serverConfig', settings.locale) :
          e?.code === 'quota' ? t('ai.quota', settings.locale) :
          e?.code === 'timeout' ? t('ai.timeout', settings.locale) :
          t('err.ai', settings.locale)
        toast(msg, 'err')
        onFinish({ ok: false, reply: '', applied: [], error: String(e?.code || e?.message || e) })
      })
      .finally(() => {
        busyRef.current = false
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id])

  const confirm = () => {
    if (!pending) return
    const { applied, skipped } = applyActions(pending)
    haptic('success')
    if (skipped) toast(t('cap.skippedDup', settings.locale), 'info')
    toast(`${t('cap.applied', settings.locale)} · ${applied.length}`, 'ok')
    onFinish({ ok: true, reply, applied })
    setPending(null)
  }

  return (
    <Sheet
      open={!!pending}
      onClose={() => {
        setPending(null)
        onFinish({ ok: false, reply: '', applied: [], error: 'cancelled' })
      }}
      title={
        <span className="flex items-center gap-2">
          <Sparkles size={16} className="text-acc" />
          {t('cap.review', settings.locale)} · {pending?.length ?? 0}
        </span>
      }
      footer={
        <div className="flex gap-2.5">
          <Btn
            variant="ghost"
            className="flex-1"
            onClick={() => {
              setPending(null)
              onFinish({ ok: false, reply: '', applied: [], error: 'cancelled' })
            }}
          >
            {t('c.cancel', settings.locale)}
          </Btn>
          <Btn className="flex-1" onClick={confirm}>
            {t('cap.applyAll', settings.locale)}
          </Btn>
        </div>
      }
    >
      {pending && <ActionCards items={pending} onUpdate={(i, v) => setPending(pending.map((x, j) => (j === i ? v : x)))} onRemove={(i) => setPending(pending.filter((_, j) => j !== i))} />}
    </Sheet>
  )
}
