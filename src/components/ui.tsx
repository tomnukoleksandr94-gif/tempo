import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type ButtonHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { haptic, setBackButton } from '../lib/telegram'

// ---------- Toast ----------
type ToastKind = 'ok' | 'err' | 'info'
interface ToastItem { id: number; msg: string; kind: ToastKind }
const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((msg: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random()
    setItems((s) => [...s, { id, msg, kind }])
    setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), 2600)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-anchor pointer-events-none fixed inset-x-0 top-0 z-[95] flex flex-col items-center gap-2 px-4">
        {items.map((i) => (
          <div
            key={i.id}
            className="pop glass-sm max-w-full px-4 py-2.5 text-sm font-medium shadow-xl"
            style={{ borderColor: i.kind === 'err' ? 'rgba(255,69,58,0.4)' : i.kind === 'ok' ? 'rgba(48,209,88,0.4)' : undefined }}
          >
            {i.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

// ---------- Sheet (bottom sheet / centered on desktop) ----------
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    haptic('light')
    setBackButton(true, onClose)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      setBackButton(false)
    }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true">
      <div className="fade absolute inset-0 bg-black/60 backdrop-blur-[6px]" onClick={onClose} />
      <div className="sheet-up glass relative flex max-h-[88dvh] w-full max-w-[560px] flex-col overflow-hidden !rounded-b-none md:!rounded-[24px]">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div className="text-base font-bold">{title}</div>
          <button
            onClick={onClose}
            aria-label="close"
            className="press flex h-9 w-9 items-center justify-center rounded-full bg-soft2 text-t2"
          >
            <X size={17} />
          </button>
        </div>
        <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-[max(env(safe-area-inset-bottom),28px)] pt-1">{children}</div>
        {footer && <div className="border-t bd-soft bg-black/40 px-5 py-3 backdrop-blur-xl">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}

// ---------- Buttons ----------
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'soft'
  size?: 'sm' | 'md' | 'lg'
}
export function Btn({ variant = 'primary', size = 'md', className = '', children, onClick, ...rest }: BtnProps) {
  const base = 'press inline-flex items-center justify-center gap-2 rounded-full font-semibold disabled:opacity-40 disabled:pointer-events-none'
  const sizes = { sm: 'h-9 px-4 text-[13px]', md: 'h-11 px-5 text-sm', lg: 'h-12 px-6 text-[15px]' }
  const variants = {
    primary: 'bg-acc text-black hover:brightness-110',
    ghost: 'bg-soft2 text-t1 border bd-soft hover:bg-soft3',
    danger: 'bg-red/15 text-red',
    soft: 'bg-[rgba(142,123,239,0.15)] text-acc2'
  }
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      onClick={(e) => {
        haptic('light')
        onClick?.(e)
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

export function IconBtn({
  children,
  label,
  className = '',
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }) {
  return (
    <button
      aria-label={label}
      className={`press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-soft2 text-t2 hover:bg-soft3 ${className}`}
      onClick={(e) => {
        haptic('select')
        onClick?.(e)
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

// ---------- Form field ----------
export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-t3">{label}</div>
      {children}
      {hint && <div className="mt-1.5 text-xs text-t3">{hint}</div>}
    </label>
  )
}

// ---------- Segmented control ----------
export function Segmented<T extends string>({
  options,
  value,
  onChange
}: {
  options: { id: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-full bg-soft p-1">
      {options.map((o) => (
        <button
          key={o.id}
          className={`press flex-1 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
            value === o.id ? 'bg-soft3 text-t1 shadow' : 'text-t2'
          }`}
          onClick={() => {
            haptic('select')
            onChange(o.id)
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---------- Chip ----------
export function Chip({
  active,
  children,
  onClick,
  color
}: {
  active?: boolean
  children: ReactNode
  onClick?: () => void
  color?: string
}) {
  return (
    <button
      className={`press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
        active ? 'bd-soft2 bg-soft3 text-t1' : 'bd-soft bg-soft text-t2 hover:bg-soft2'
      }`}
      onClick={() => {
        haptic('select')
        onClick?.()
      }}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  )
}

// ---------- Switch (iOS) ----------
export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${checked ? 'bg-acc' : 'bg-soft3'}`}
      onClick={() => {
        haptic('light')
        onChange(!checked)
      }}
    >
      <span
        className="absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: checked ? 'translateX(20px)' : 'none' }}
      />
    </button>
  )
}

// ---------- Stat tile ----------
export function StatTile({
  label,
  value,
  sub,
  icon,
  onClick
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: ReactNode
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`glass-sm lift flex min-w-0 flex-col gap-1 p-3.5 text-left ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-center gap-1.5 text-t3">
        {icon}
        <span className="truncate text-xs font-medium">{label}</span>
      </div>
      <div className="tabular truncate text-[17px] font-bold leading-tight">{value}</div>
      {sub && <div className="truncate text-xs text-t2">{sub}</div>}
    </button>
  )
}

// ---------- Section header ----------
export function SectionHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-6 flex items-baseline justify-between first:mt-0">
      <h2 className="text-[15px] font-bold">{title}</h2>
      {action}
    </div>
  )
}

// ---------- Empty state ----------
export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-t3">{icon}</div>}
      <div className="text-sm font-semibold text-t2">{title}</div>
      {text && <div className="max-w-[34ch] text-[13px] leading-snug text-t3">{text}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
