'use client'

// On-device diagnostics for the clip recording flow. iPad/WebKit has no easy
// console, and the bug "stop bounces back to record" spans a navigation
// (record → annotate), so we persist a log in sessionStorage that survives the
// route change AND a bounce back to /record. The visible panel + all logging
// are gated behind ?debug=1 (the flag is remembered for the session so it keeps
// working after router.push drops the query string).

const LOG_KEY = 'par3_rec_debug_log'
const FLAG_KEY = 'par3_rec_debug_on'

// Generated once per JS module evaluation (i.e. once per document load). If the
// SAME id shows up on /record and /annotate, the JS context survived → it was a
// client-side (soft) navigation and the React layout re-mounted. If the ids
// DIFFER, it was a hard navigation (full document reload).
const JS_INSTANCE = Math.random().toString(36).slice(2, 8)
export function jsInstanceId(): string {
  return JS_INSTANCE
}

export function debugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.has('debug')) {
      sessionStorage.setItem(FLAG_KEY, '1')
      return true
    }
    return sessionStorage.getItem(FLAG_KEY) === '1'
  } catch {
    return false
  }
}

export function rlog(msg: string): void {
  if (!debugEnabled()) return
  const stamp = new Date().toISOString().slice(11, 23)
  const line = `${stamp}  ${msg}`
  try {
    const prev = sessionStorage.getItem(LOG_KEY) ?? ''
    sessionStorage.setItem(LOG_KEY, prev + line + '\n')
  } catch {
    /* ignore quota */
  }
  console.log('[rec]', msg)
}

export function getDebugLog(): string {
  if (typeof window === 'undefined') return ''
  try {
    return sessionStorage.getItem(LOG_KEY) ?? ''
  } catch {
    return ''
  }
}

export function clearDebugLog(): void {
  try {
    sessionStorage.removeItem(LOG_KEY)
  } catch {
    /* ignore */
  }
}

// Log the MediaRecorder capability matrix once, so we can see exactly what this
// device claims to support vs. what it actually produces.
export function logRecorderSupport(): void {
  if (!debugEnabled()) return
  if (typeof MediaRecorder === 'undefined') {
    rlog('MediaRecorder: UNDEFINED on this device')
    return
  }
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
    'video/mp4;codecs=h264',
    'video/mp4;codecs=avc1',
  ]
  for (const c of candidates) {
    let ok = false
    try {
      ok = MediaRecorder.isTypeSupported(c)
    } catch {
      ok = false
    }
    rlog(`isTypeSupported(${c}) = ${ok}`)
  }
  try {
    rlog(`UA: ${navigator.userAgent}`)
  } catch {
    /* ignore */
  }
}
