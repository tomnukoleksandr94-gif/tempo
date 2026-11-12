/** Telegram Mini App SDK wrapper — degrades gracefully in a normal browser. */

type TG = any

export const tg: TG | undefined = (() => {
  try {
    return (window as any)?.Telegram?.WebApp
  } catch {
    return undefined
  }
})()

export const isTelegram = !!tg?.initData

export function tgReady() {
  try {
    tg?.ready()
    tg?.expand()
    tg?.setHeaderColor?.('#000000')
    tg?.setBackgroundColor?.('#000000')
  } catch {
    /* not in Telegram */
  }
}

export function tgUser(): { id: number; first_name: string; username?: string } | null {
  try {
    return tg?.initDataUnsafe?.user ?? null
  } catch {
    return null
  }
}

export function haptic(kind: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'select' = 'light') {
  try {
    if (kind === 'success' || kind === 'error') {
      tg?.HapticFeedback?.notificationOccurred(kind)
    } else if (kind === 'select') {
      tg?.HapticFeedback?.selectionChanged()
    } else {
      tg?.HapticFeedback?.impactOccurred(kind)
    }
  } catch {
    /* ignore */
  }
}

export function setBackButton(show: boolean, onClick?: () => void) {
  try {
    const b = tg?.BackButton
    if (!b) return
    if (show) {
      if (onClick) b.onClick(onClick)
      b.show()
    } else {
      b.hide()
    }
  } catch {
    /* ignore */
  }
}

export function alertInTelegram(message: string) {
  try {
    if (tg?.showAlert) {
      tg.showAlert(message)
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}
