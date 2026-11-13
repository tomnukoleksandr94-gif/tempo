import { useT } from '../lib/hooks'
import { haptic } from '../lib/telegram'

/**
 * Payment-success overlay: animated checkmark + soft particles,
 * shown for a few seconds when a subscription becomes active.
 */
export function SuccessOverlay() {
  const t2 = useT()
  haptic('success')
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md anim-fade" onClick={() => {}}>
      <div className="anim-pop glass flex w-[300px] flex-col items-center gap-3 rounded-[28px] p-7 text-center">
        {/* animated check */}
        <div className="relative flex h-20 w-20 items-center justify-center">
          <svg viewBox="0 0 96 96" className="h-20 w-20">
            <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(142,123,239,0.25)" strokeWidth="6" className="anim-draw-circle" />
            <path d="M30 50 L43 62 L66 34" fill="none" stroke="#8E7BEF" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" className="anim-draw-check" />
          </svg>
          {/* particles */}
          {[...Array(8)].map((_, i) => (
            <span
              key={i}
              className="particle"
              style={{ '--i': i } as React.CSSProperties}
            />
          ))}
        </div>
        <div className="text-[19px] font-extrabold tracking-tight">{t2('pay.thanks')}</div>
        <div className="text-[13px] leading-snug text-t2">{t2('pay.activated')}</div>
      </div>
    </div>
  )
}
