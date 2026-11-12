import { useRef, useState } from 'react'
import { ArrowUp, Mic, MicOff, Camera, Sparkles } from 'lucide-react'
import { useT } from '../lib/hooks'
import { useSpeechInput } from '../lib/hooks'
import { imageToB64 } from '../lib/utils'
import { haptic } from '../lib/telegram'

/**
 * Universal capture bar: text, voice (Web Speech API) and photo input.
 * Used by the Home quick capture and the AI assistant.
 */
export function CaptureInput({
  big = false,
  busy = false,
  onSubmitText,
  onSubmitImage,
  autoFocus = false
}: {
  big?: boolean
  busy?: boolean
  onSubmitText: (text: string) => void
  onSubmitImage: (b64: string, mime: string) => void
  autoFocus?: boolean
}) {
  const t = useT()
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const { supported, listening, start, stop } = useSpeechInput()

  const send = () => {
    const v = text.trim()
    if (!v || busy) return
    haptic('light')
    onSubmitText(v)
    setText('')
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    try {
      const { b64, mime } = await imageToB64(f)
      onSubmitImage(b64, mime)
    } catch {
      /* ignore bad images */
    }
  }

  return (
    <div className={`glass flex items-end gap-1.5 ${big ? 'p-2' : 'p-1.5'}`}>
      <input
        className={`min-w-0 flex-1 bg-transparent px-2 outline-none placeholder:text-t3 ${big ? 'h-11 text-[15px]' : 'h-9 text-sm'}`}
        placeholder={listening ? t('ai.listening') : t('home.capturePh')}
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && send()}
        inputMode="text"
        maxLength={600}
      />
      {supported && (
        <button
          aria-label="voice input"
          onClick={() => {
            haptic('light')
            if (listening) {
              stop()
              const v = text.trim()
              if (v) send()
            } else {
              start(setText)
            }
          }}
          className={`press flex ${big ? 'h-11 w-11' : 'h-9 w-9'} shrink-0 items-center justify-center rounded-full ${
            listening ? 'bg-red/20 text-red' : 'bg-white/8 text-t2'
          }`}
        >
          {listening ? <Mic size={17} className="animate-pulse" /> : <Mic size={17} />}
        </button>
      )}
      <button
        aria-label="photo input"
        onClick={() => {
          haptic('light')
          fileRef.current?.click()
        }}
        className={`press flex ${big ? 'h-11 w-11' : 'h-9 w-9'} shrink-0 items-center justify-center rounded-full bg-white/8 text-t2`}
      >
        <Camera size={17} />
      </button>
      <button
        aria-label="send"
        onClick={send}
        disabled={!text.trim() || busy}
        className={`press flex ${big ? 'h-11 w-11' : 'h-9 w-9'} shrink-0 items-center justify-center rounded-full transition-all ${
          text.trim() && !busy ? 'bg-acc text-black' : 'bg-white/8 text-t3'
        }`}
      >
        {busy ? <Sparkles size={16} className="animate-pulse" /> : <ArrowUp size={18} strokeWidth={2.5} />}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}

export { MicOff }
