// Small network-resilience helpers for the save/upload pipelines.
//
// Field conditions (iPad on an iPhone hotspot at the range) mean every network
// call can stall indefinitely — fetch has no default timeout, and supabase-js
// requests are plain fetches. Nothing here aborts the underlying request (the
// browser will eventually kill it); the point is that OUR flow stops waiting,
// surfaces a state, and can retry with a fresh request instead of hanging a
// "Guardando…" overlay forever.

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`)
    this.name = 'TimeoutError'
  }
}

/** Resolve with the promise, or reject with TimeoutError after `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

export interface RetryOptions {
  /** Total attempts, including the first one. */
  tries?: number
  /** Delay before the 2nd attempt; doubles each retry. */
  baseDelayMs?: number
  label?: string
}

/** Run `fn` with exponential backoff. Throws the last error when exhausted. */
export async function retry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { tries = 3, baseDelayMs = 1000, label = 'operation' } = opts
  let lastError: unknown
  for (let attempt = 0; attempt < tries; attempt++) {
    if (attempt > 0) {
      const delay = baseDelayMs * 2 ** (attempt - 1)
      await new Promise((r) => setTimeout(r, delay))
      console.info(`[net] retrying ${label} (attempt ${attempt + 1}/${tries})`)
    }
    try {
      return await fn()
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

/**
 * Await a supabase (PostgREST) call with a timeout, throwing on `error` so it
 * composes with retry(). Usage:
 *   await retry(() => sbCall(supabase.from('clips').update(...).eq(...), 'update clip'))
 */
export async function sbCall(
  thenable: PromiseLike<{ error: { message?: string } | null }>,
  label: string,
  timeoutMs = 20_000,
): Promise<void> {
  const { error } = await withTimeout(Promise.resolve(thenable), timeoutMs, label)
  if (error) throw new Error(`${label}: ${error.message ?? 'unknown error'}`)
}
