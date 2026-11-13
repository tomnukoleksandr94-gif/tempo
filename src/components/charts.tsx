import type { ReactNode } from 'react'

// ---------- Progress ring ----------
export function Ring({
  value,
  size = 120,
  stroke = 11,
  color = '#8E7BEF',
  track = 'rgba(255,255,255,0.08)',
  children
}: {
  value: number
  size?: number
  stroke?: number
  color?: string
  track?: string
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

// ---------- Donut ----------
export function Donut({
  segments,
  size = 150,
  stroke = 18,
  children
}: {
  segments: { value: number; color: string }[]
  size?: number
  stroke?: number
  children?: ReactNode
}) {
  const total = segments.reduce((a, s) => a + s.value, 0)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  let acc = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        {total > 0 &&
          segments.map((s, i) => {
            const len = (s.value / total) * c
            const off = -acc
            acc += len
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeLinecap="butt"
                strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
                strokeDashoffset={off}
                style={{ transition: 'stroke-dasharray 0.7s cubic-bezier(0.16,1,0.3,1)' }}
              />
            )
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

// ---------- Bar chart ----------
export function Bars({
  data,
  height = 130,
  color = '#8E7BEF',
  highlightLast = false,
  formatValue
}: {
  data: { label: string; value: number }[]
  height?: number
  color?: string
  highlightLast?: boolean
  formatValue?: (v: number) => string
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => {
          const h = Math.max(2, Math.round((d.value / max) * (height - 22)))
          const isHi = highlightLast && i === data.length - 1
          return (
            <div key={i} className="group relative flex flex-1 flex-col items-center justify-end gap-1">
              {d.value > 0 && formatValue && (
                <span className="tabular absolute -top-1 text-[10px] font-semibold text-t3 opacity-0 transition group-hover:opacity-100">
                  {formatValue(d.value)}
                </span>
              )}
              <div
                className="w-full max-w-[26px] rounded-t-[5px] rounded-b-[2px] transition-all duration-500"
                style={{ height: h, background: isHi ? color : d.value > 0 ? `${color}b3` : 'rgba(255,255,255,0.07)' }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex-1 truncate text-center text-[10px] font-medium text-t2">
            {/* thin out labels when there are many bars (month view) */}
            {data.length <= 14 || i % Math.ceil(data.length / 7) === 0 ? d.label : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Sparkline ----------
export function Sparkline({ values, height = 44, color = '#8E7BEF' }: { values: number[]; height?: number; color?: string }) {
  const w = 100
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * w
    const y = height - 4 - (v / max) * (height - 10)
    return [x, y] as const
  })
  const line = pts.map((p) => p.join(',')).join(' ')
  const area = `0,${height} ${line} ${w},${height}`
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <polygon points={area} fill={color} opacity="0.1" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.6" fill={color} />}
    </svg>
  )
}

// ---------- Macro bar ----------
export function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, target)) * 100))
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium text-t2">{label}</span>
        <span className="tabular text-xs font-semibold">
          {Math.round(value)} <span className="text-t3">/ {target} г</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-soft2">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}
