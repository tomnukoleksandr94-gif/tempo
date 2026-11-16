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

/**
 * Telegram CloudStorage — available only inside the Telegram client.
 *
 * IMPORTANT: single CloudStorage values have a size limit (~4 KB). The whole
 * app state is much larger, so values are stored as CHUNKS with a small
 * manifest: `<key>/manifest` holds {n, updatedAt} and `<key>/c0..n` hold the
 * data. This keeps cross-device sync working for realistic data sizes and
 * never corrupts the snapshot (partial chunk failure → whole value ignored).
 */
const CHUNK = 3500 // chars per chunk (Telegram CloudStorage value limit is 4096 bytes)

function cs(): any {
  try {
    const webapp = (window as any)?.Telegram?.WebApp
    // Only use CloudStorage inside a real Telegram client: outside Telegram
    // the SDK still defines the methods but every call logs an error to the
    // console ("CloudStorage is not supported") and does nothing useful.
    if (!webapp?.initData) return null
    return webapp.CloudStorage
  } catch {
    return null
  }
}
function csGet(key: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      cs().getItem(key, (err: any, val: any) => resolve(err || val == null ? null : String(val)))
    } catch {
      resolve(null)
    }
  })
}
function csSet(key: string, value: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      cs().setItem(key, value, () => resolve())
    } catch {
      resolve()
    }
  })
}

export const cloudStore = {
  available(): boolean {
    try {
      return !!cs()
    } catch {
      return false
    }
  },
  /** Read a (possibly chunked) value. Returns null on any inconsistency. */
  async get(key: string): Promise<string | null> {
    if (!this.available()) return null
    // new chunked format?
    const manifestRaw = await csGet(`${key}/manifest`)
    if (manifestRaw) {
      try {
        const m = JSON.parse(manifestRaw) as { n: number }
        if (!Number.isFinite(m.n) || m.n < 1 || m.n > 600) return null
        const chunks: string[] = []
        for (let i = 0; i < m.n; i++) {
          const c = await csGet(`${key}/c${i}`)
          if (c == null) return null // incomplete snapshot — ignore entirely
          chunks.push(c)
        }
        return chunks.join('')
      } catch {
        return null
      }
    }
    // legacy single-value format (small snapshots)
    return csGet(key)
  },
  /** Write a value, splitting it into chunks when it exceeds the size limit. */
  async set(key: string, value: string): Promise<void> {
    if (!this.available()) return
    try {
      if (value.length <= CHUNK) {
        // legacy single-value format (readable without a manifest)
        await csSet(key, value)
        return
      }
      const n = Math.ceil(value.length / CHUNK)
      if (n > 600) return // too large for CloudStorage sync — skip honestly
      for (let i = 0; i < n; i++) {
        await csSet(`${key}/c${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK))
      }
      // manifest last: readers only see chunked data when it is complete
      await csSet(`${key}/manifest`, JSON.stringify({ n }))
    } catch {
      /* best-effort sync — local storage stays the primary source */
    }
  }
}
