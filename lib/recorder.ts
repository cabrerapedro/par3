'use client'

// Single source of truth for MediaRecorder format handling across every
// capture flow (instructor clip, annotation audio, student practice). The
// recurring iOS bug — recordings that "record but don't play" or bounce back —
// came from each flow guessing the MIME type differently and defaulting to
// webm. WebKit (every iPad/iPhone browser) records mp4, not webm, and often
// leaves recorder.mimeType empty + reports isTypeSupported(webm) === false.

const PREFERRED_VIDEO_MIMES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
]

const PREFERRED_AUDIO_MIMES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
]

function pick(list: string[]): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  for (const m of list) {
    try { if (MediaRecorder.isTypeSupported(m)) return m } catch { /* ignore */ }
  }
  return undefined
}

export const pickVideoMime = (): string | undefined => pick(PREFERRED_VIDEO_MIMES)
export const pickAudioMime = (): string | undefined => pick(PREFERRED_AUDIO_MIMES)

// iOS/iPadOS (every browser there is WebKit). MediaRecorder for VIDEO is
// unreliable on iOS — empty recordings in Chrome-iOS, black ones in standalone
// PWA. We use the native camera (<input capture>) for video on iOS instead.
// (iPadOS Safari reports as Mac, hence the touch-points check.)
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

// Read a video file's duration (ms) via a throwaway <video>. mp4 from the
// native camera carries a real duration; returns 0 if it can't be read.
export function readVideoDurationMs(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file)
      const v = document.createElement('video')
      v.preload = 'metadata'
      const done = (ms: number) => {
        v.removeAttribute('src')
        URL.revokeObjectURL(url)
        resolve(ms)
      }
      v.onloadedmetadata = () => done(Number.isFinite(v.duration) && v.duration > 0 ? Math.round(v.duration * 1000) : 0)
      v.onerror = () => done(0)
      v.src = url
      setTimeout(() => done(0), 4000)
    } catch {
      resolve(0)
    }
  })
}

// iOS needs a periodic dataavailable to capture reliably; without a timeslice,
// stop() can yield an empty recording.
export const RECORDER_TIMESLICE_MS = 1000

/**
 * Resolve the REAL container of a finished recording. Never assume webm:
 * trust recorder.mimeType, then the recorded chunk's own type, then the
 * requested mime, then a safe mp4 default (what WebKit actually produces).
 */
export function resolveRecordedMime(
  recorder: MediaRecorder,
  chunks: Blob[],
  requested: string | undefined,
  kind: 'video' | 'audio',
): string {
  return (
    recorder.mimeType ||
    chunks[0]?.type ||
    requested ||
    (kind === 'video' ? 'video/mp4' : 'audio/mp4')
  )
}
