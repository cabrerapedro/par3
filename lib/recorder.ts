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

// iOS needs a periodic dataavailable to capture reliably; without a timeslice,
// stop() can yield an empty recording.
export const RECORDER_TIMESLICE_MS = 1000

// Cap the video bitrate. Uncapped, WebKit records 720p H.264 at ~4-8 Mbps —
// a 30 s clip of 15-30 MB that takes minutes (or forever) to upload from a
// range hotspot. ~2.5 Mbps at 720p is more than enough for pose analysis and
// cuts the file 2-4x. Browsers that ignore the hint just record as before.
export const VIDEO_BITS_PER_SECOND = 2_500_000

/** MediaRecorder options for video capture: picked mime (if any) + bitrate cap. */
export function videoRecorderOptions(mime?: string): MediaRecorderOptions {
  return {
    ...(mime ? { mimeType: mime } : {}),
    videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
  }
}

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
