import type { Currency } from './types'

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

export const pad = (n: number) => String(n).padStart(2, '0')

export function todayISO(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + days)
  return todayISO(d)
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

export function startOfWeekISO(iso: string): string {
  const d = parseISODate(iso)
  const dow = (d.getDay() + 6) % 7 // monday first
  return addDays(iso, -dow)
}

export function weekdayShort(iso: string, locale: string): string {
  const d = parseISODate(iso)
  return d.toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-GB', { weekday: 'short' })
}

export function fmtDate(iso: string, locale: string, style: 'short' | 'long' | 'day' = 'short'): string {
  const d = parseISODate(iso)
  const loc = locale === 'ru' ? 'ru-RU' : 'en-GB'
  if (style === 'long') return d.toLocaleDateString(loc, { day: 'numeric', month: 'long' })
  if (style === 'day') return d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' })
  return d.toLocaleDateString(loc, { day: 'numeric', month: 'short' })
}

export function relativeDay(iso: string, locale: 'ru' | 'en', today = todayISO()): string {
  if (iso === today) return locale === 'ru' ? 'сегодня' : 'today'
  if (iso === addDays(today, 1)) return locale === 'ru' ? 'завтра' : 'tomorrow'
  if (iso === addDays(today, -1)) return locale === 'ru' ? 'вчера' : 'yesterday'
  return fmtDate(iso, locale)
}

const CUR_SYMB: Record<Currency, string> = { EUR: '€', USD: '$', GBP: '£', UAH: '₴', PLN: 'zł', RUB: '₽' }

export function money(amount: number, cur: Currency, locale: string, withSign = false): string {
  const sym = CUR_SYMB[cur] ?? cur
  const v = Math.abs(amount).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-GB', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2
  })
  const sign = amount < 0 ? '−' : withSign ? '+' : ''
  return `${sign}${v} ${sym}`
}

export function parseAmount(s: string): number | null {
  const t = s.replace(/\s/g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

export function hashStr(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export function greeting(hour: number, locale: 'ru' | 'en'): string {
  if (locale === 'ru') {
    if (hour < 5) return 'Доброй ночи'
    if (hour < 12) return 'Доброе утро'
    if (hour < 18) return 'Добрый день'
    return 'Добрый вечер'
  }
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** resize an image file to a max dimension, return base64 jpeg (no headers) */
export function imageToB64(file: File, max = 1024): Promise<{ b64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read error'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('image error'))
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const ctx = c.getContext('2d')!
        ctx.drawImage(img, 0, 0, w, h)
        const dataUrl = c.toDataURL('image/jpeg', 0.85)
        resolve({ b64: dataUrl.split(',')[1], mime: 'image/jpeg' })
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

export const plural = (n: number, ru: [string, string, string], en: [string, string]): string => {
  const abs = Math.abs(n) % 100
  const n1 = abs % 10
  if (typeof window !== 'undefined') {
    // locale decided by caller; helper for ru forms
    if (abs > 10 && abs < 20) return ru[2]
    if (n1 > 1 && n1 < 5) return ru[1]
    if (n1 === 1) return ru[0]
    return ru[2]
  }
  return n === 1 ? en[0] : en[1]
}
