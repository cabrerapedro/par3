'use client'

// Guided practice Layer 3 (docs/GUIDED-PRACTICE-PLAN.md): an OPTIONAL short audio
// the coach records at the end of a lesson to reinforce/tie the per-clip points
// ("this week, focus on X"). Reuses the existing audio stack: same recorder
// helpers, WAV re-encode, the clip-annotations-audio bucket, and /api/transcribe.
// Stored on the class row; shown to the student at the top of their home.

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { supabase } from '@/lib/supabase'
import { pickAudioMime, resolveRecordedMime, RECORDER_TIMESLICE_MS } from '@/lib/recorder'
import { reencodeAudioToWav } from '@/lib/media'

const MAX_MS = 120_000 // hard cap; the conclusion is meant to be short

interface Props {
  classId: string
  audioUrl?: string | null
  transcript?: string | null
}

type State = 'idle' | 'recording' | 'saving'

export function ClassConclusionRecorder({ classId, audioUrl, transcript }: Props) {
  const t = useTranslations('instructor.conclusion')
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<string | null>(null)
  const [savedUrl, setSavedUrl] = useState<string | null>(audioUrl ?? null)
  const [savedTranscript, setSavedTranscript] = useState<string | null>(transcript ?? null)
  const [seconds, setSeconds] = useState(0)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeRef = useRef<string | undefined>(undefined)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const capRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Release the mic and clear timers if the instructor navigates away mid-record
  // (otherwise the recording indicator stays on). Mirrors AnnotationCanvas.
  useEffect(() => {
    return () => {
      const rec = recorderRef.current
      if (rec && rec.state !== 'inactive') {
        try { rec.stop() } catch {}
      }
      streamRef.current?.getTracks().forEach((tr) => tr.stop())
      streamRef.current = null
      if (timerRef.current) clearInterval(timerRef.current)
      if (capRef.current) clearTimeout(capRef.current)
    }
  }, [])

  async function start() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream
      const mime = pickAudioMime()
      mimeRef.current = mime
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = () => { void finalize(rec) }
      rec.start(RECORDER_TIMESLICE_MS)
      recorderRef.current = rec
      setSeconds(0)
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
      capRef.current = setTimeout(() => stop(), MAX_MS)
      setState('recording')
    } catch {
      setError(t('micError'))
    }
  }

  function stop() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (capRef.current) { clearTimeout(capRef.current); capRef.current = null }
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') {
      try { rec.requestData() } catch {}
      rec.stop()
    }
  }

  async function finalize(rec: MediaRecorder) {
    setState('saving')
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null

    const rawMime = resolveRecordedMime(rec, chunksRef.current, mimeRef.current, 'audio')
    const raw = new Blob(chunksRef.current, { type: rawMime })
    if (raw.size === 0) { setError(t('saveError')); setState('idle'); return }

    const wav = await reencodeAudioToWav(raw)
    const blob = wav ?? raw
    const mime = wav ? 'audio/wav' : rawMime
    const ext = mime.includes('wav') ? 'wav' : mime.includes('mp4') ? 'm4a' : 'webm'

    try {
      // First path segment must be the bare class UUID: the storage RLS policy
      // checks it against classes owned by this instructor (mirrors the per-clip
      // audio convention `${clipId}/...`).
      const path = `${classId}/conclusion-${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('clip-annotations-audio')
        .upload(path, blob, { contentType: mime })
      if (upErr) throw upErr
      const url = supabase.storage.from('clip-annotations-audio').getPublicUrl(path).data.publicUrl

      // Transcribe (best-effort — saving the audio is what matters).
      let tx: string | null = null
      try {
        const fd = new FormData()
        fd.append('audio', blob, `conclusion.${ext}`)
        const res = await fetch('/api/transcribe', { method: 'POST', body: fd })
        if (res.ok) { const d = await res.json(); tx = d.transcript ?? null }
      } catch { /* non-fatal */ }

      const { error: updErr } = await supabase
        .from('classes')
        .update({ conclusion_audio_url: url, conclusion_transcript: tx })
        .eq('id', classId)
      if (updErr) throw updErr

      setSavedUrl(url)
      setSavedTranscript(tx)
      setState('idle')
    } catch {
      setError(t('saveError'))
      setState('idle')
    }
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

  return (
    <div className="border border-rule bg-paper-2/40 p-4 md:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="small-caps font-mono text-[10px] text-accent mb-1">
            {t('title')} <span className="text-ink-mute">{t('optional')}</span>
          </p>
          <p className="text-sm text-ink-soft leading-snug">{t('hint')}</p>
        </div>
      </div>

      {savedUrl && state !== 'recording' && (
        <div className="mb-3">
          {savedTranscript && (
            <p className="text-sm text-ink leading-relaxed mb-2">&ldquo;{savedTranscript}&rdquo;</p>
          )}
          <audio src={savedUrl} controls className="w-full h-9" />
        </div>
      )}

      {state === 'recording' ? (
        <button
          type="button"
          onClick={stop}
          className="inline-flex items-center gap-2 h-11 px-5 rounded-md bg-bad text-white font-medium text-sm"
        >
          <span className="size-2.5 rounded-full bg-white animate-pulse" />
          {t('stop')} · <span className="font-mono tabular-nums">{mmss}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={state === 'saving'}
          className="inline-flex items-center gap-2 h-11 px-5 rounded-md border border-rule bg-paper text-ink font-medium text-sm hover:bg-paper-2 disabled:opacity-50 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <line x1="12" y1="18" x2="12" y2="21" />
          </svg>
          {state === 'saving' ? t('saving') : savedUrl ? t('rerecord') : t('record')}
        </button>
      )}

      {error && <p className="text-bad text-sm mt-2">{error}</p>}
    </div>
  )
}
