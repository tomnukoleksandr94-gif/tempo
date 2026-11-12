/**
 * Safe storage layer.
 * - Primary: localStorage (Telegram webviews, normal browsers)
 * - Fallback: in-memory Map (sandboxed preview iframes block storage)
 * - Mirror: Telegram CloudStorage (syncs data across the user's devices
 *   inside Telegram) — best-effort, non-blocking.
 */

const mem = new Map<string, string>()
let lsOk = true
try {
  const k = '__tempo_test__'
  window.localStorage.setItem(k, '1')
  window.localStorage.removeItem(k)
} catch {
  lsOk = false
}

export const storageAvailable = lsOk

export const localStore = {
  getItem(key: string): string | null {
    if (lsOk) {
      try {
        return window.localStorage.getItem(key)
      } catch {
        /* fall through */
      }
    }
    return mem.get(key) ?? null
  },
  removeItem(key: string) {
    mem.delete(key)
    if (lsOk) {
      try {
        window.localStorage.removeItem(key)
      } catch {
        /* ignore */
      }
    }
  },
  setItem(key: string, value: string) {
    mem.set(key, value)
    if (lsOk) {
      try {
        window.localStorage.setItem(key, value)
      } catch {
        /* quota or blocked */
      }
    }
  }
}

/** Telegram CloudStorage — available only inside the Telegram client. */
export const cloudStore = {
  available(): boolean {
    try {
      return !!(window as any)?.Telegram?.WebApp?.CloudStorage
    } catch {
      return false
    }
  },
  get(key: string): Promise<string | null> {
    return new Promise((resolve) => {
      try {
        ;(window as any).Telegram.WebApp.CloudStorage.getItem(key, (err: any, val: any) =>
          resolve(err ? null : (val as string | null))
        )
      } catch {
        resolve(null)
      }
    })
  },
  set(key: string, value: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        ;(window as any).Telegram.WebApp.CloudStorage.setItem(key, value, () => resolve())
      } catch {
        resolve()
      }
    })
  }
}
