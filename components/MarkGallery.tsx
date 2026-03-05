'use client'

import { useRef, useState } from 'react'
import type { CalibrationMark } from '@/lib/types'
import type { CameraAngle } from '@/lib/types'
import { METRIC_LABELS, METRIC_INFO } from '@/lib/baseline'
import { VideoTimelinePlayer } from '@/components/VideoTimelinePlayer'

interface MarkGalleryProps {
  videoUrl?: string
  skeletonUrl?: string
  marks: CalibrationMark[]
  cameraAngle: CameraAngle
  selectedMetrics?: string[]
  onDeleteMark?: (markIndex: number) => void
  onNoteChange?: (markIndex: number, note: string) => void
  className?: string
}

export function MarkGallery({
  videoUrl, skeletonUrl, marks, cameraAngle, selectedMetrics, onDeleteMark, onNoteChange, className,
}: MarkGalleryProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hasBoth = !!(videoUrl && skeletonUrl)
  const [activeSource, setActiveSource] = useState<'video' | 'skeleton'>(skeletonUrl ? 'skeleton' : 'video')
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [mirrored, setMirrored] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [showFullVideo, setShowFullVideo] = useState(false)
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null)
  const [dictatingIndex, setDictatingIndex] = useState<number | null>(null)
  const dictRecognitionRef = useRef<any>(null)
  const durationResolvedRef = useRef(false)
  const clipEndRef = useRef<number | null>(null)
  const pendingPlayRef = useRef<{ start: number; end: number } | null>(null)

  const isInstructor = !!onDeleteMark
  const activeUrl = activeSource === 'skeleton' ? skeletonUrl : videoUrl
  const hasVideo = !!activeUrl

  // WebM duration fix
  function handleLoadedMetadata() {
    const v = videoRef.current
    if (!v) return
    if (isFinite(v.duration) && v.duration > 0) {
      setDuration(v.duration)
      durationResolvedRef.current = true
    } else {
      v.currentTime = 1e10
    }
  }

  function handleSeeked() {
    const v = videoRef.current
    if (!v || durationResolvedRef.current) return
    if (isFinite(v.duration) && v.duration > 0) {
      setDuration(v.duration)
      durationResolvedRef.current = true
      v.currentTime = 0
    }
  }

  function handleDurationChange() {
    const v = videoRef.current
    if (!v) return
    if (isFinite(v.duration) && v.duration > 0) {
      setDuration(v.duration)
      durationResolvedRef.current = true
    }
  }

  function handleTimeUpdate() {
    const v = videoRef.current
    if (!v) return
    setCurrentTime(v.currentTime)
    // Auto-pause at clip end
    if (clipEndRef.current !== null && v.currentTime >= clipEndRef.current) {
      v.pause()
      setPlaying(false)
      clipEndRef.current = null
    }
  }

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    clipEndRef.current = null // Manual play clears clip boundary
    if (v.paused) { v.play(); setPlaying(true) }
    else { v.pause(); setPlaying(false) }
  }

  function playClip(index: number) {
    const mark = marks[index]
    if (!mark.relative_ms) return

    const markTime = mark.relative_ms / 1000
    const start = Math.max(0, markTime - 2)
    const end = Math.min(duration || Infinity, markTime + 2)

    setSelectedIndex(index)

    // If video already mounted, seek immediately
    const v = videoRef.current
    if (v) {
      clipEndRef.current = end
      v.currentTime = start
      v.play()
      setPlaying(true)
    } else {
      // Video will mount after state update — play once loaded
      pendingPlayRef.current = { start, end }
    }
  }

  function handleCanPlay() {
    const pending = pendingPlayRef.current
    const v = videoRef.current
    if (pending && v) {
      pendingPlayRef.current = null
      clipEndRef.current = pending.end
      v.currentTime = pending.start
      v.play()
      setPlaying(true)
    }
  }

  function toggleFullscreen() {
    const v = videoRef.current
    if (!v) return
    if ((v as any).webkitEnterFullscreen) (v as any).webkitEnterFullscreen()
    else if (v.requestFullscreen) v.requestFullscreen()
  }

  const formatTime = (s: number) => {
    if (!isFinite(s) || isNaN(s) || s < 0) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  function formatMetricValue(key: string, value: number): string {
    const info = METRIC_INFO[key]
    if (info?.unit === 'grados') return `${value.toFixed(1)}°`
    if (info?.unit === 'ratio') return value.toFixed(2)
    return value.toFixed(3)
  }

  // Reset video state when switching source
  function switchSource(src: 'video' | 'skeleton') {
    setActiveSource(src)
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    durationResolvedRef.current = false
    clipEndRef.current = null
  }

  // Speech-to-text dictation for mark notes
  function startDictation(index: number) {
    stopDictation()
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return

    const r = new SR()
    r.lang = 'es-MX'
    r.continuous = true
    r.interimResults = false
    r.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[])
        .filter((res: any) => res.isFinal)
        .map((res: any) => res[0].transcript)
        .join(' ')
      if (!transcript) return
      const ta = document.getElementById(`mark-note-${index}`) as HTMLTextAreaElement
      if (ta) ta.value = ta.value ? `${ta.value} ${transcript}` : transcript
    }
    r.onend = () => {
      setDictatingIndex(null)
      // Auto-save on dictation end
      const ta = document.getElementById(`mark-note-${index}`) as HTMLTextAreaElement
      if (ta && onNoteChange) {
        const val = ta.value.trim()
        if (val !== (marks[index]?.note ?? '')) onNoteChange(index, val)
      }
    }
    dictRecognitionRef.current = r
    r.start()
    setDictatingIndex(index)
  }

  function stopDictation() {
    dictRecognitionRef.current?.stop()
    dictRecognitionRef.current = null
    setDictatingIndex(null)
  }

  function toggleDictation(index: number) {
    if (dictatingIndex === index) stopDictation()
    else startDictation(index)
  }

  // Video player element — reused in both layouts
  const videoPlayer = hasVideo && selectedIndex !== null ? (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <video
        ref={videoRef}
        key={activeUrl}
        src={activeUrl}
        playsInline
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={handleDurationChange}
        onSeeked={handleSeeked}
        onTimeUpdate={handleTimeUpdate}
        onCanPlay={handleCanPlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); clipEndRef.current = null }}
        className={`w-full bg-black cursor-pointer ${mirrored ? 'scale-x-[-1]' : ''}`}
        onClick={togglePlay}
      />

      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
        <button onClick={togglePlay} className="text-foreground hover:text-ok transition-colors shrink-0">
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21" /></svg>
          )}
        </button>
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums shrink-0">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setMirrored(!mirrored)}
          title={mirrored ? 'Video normal' : 'Espejo'}
          className={`shrink-0 p-1 rounded transition-colors ${mirrored ? 'text-ok' : 'text-muted-foreground/50 hover:text-muted-foreground'}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3" /><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" /><line x1="12" y1="2" x2="12" y2="22" />
          </svg>
        </button>
        <button onClick={toggleFullscreen} title="Pantalla completa" className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors p-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </div>
    </div>
  ) : hasVideo ? (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col items-center justify-center" style={{ minHeight: '10rem' }}>
      <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-2">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/60 ml-0.5">
          <polygon points="6 3 20 12 6 21" />
        </svg>
      </div>
      <p className="text-muted-foreground text-sm">Toca <span className="text-ok font-medium">Ver clip</span> en una marca</p>
    </div>
  ) : null

  // Source toggle element
  const sourceToggle = hasBoth ? (
    <div className="flex gap-1 mb-2 lg:mb-3">
      <button
        onClick={() => switchSource('skeleton')}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
          activeSource === 'skeleton'
            ? 'bg-ok/10 border-ok/30 text-ok'
            : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
        }`}
      >
        Video + Ejes
      </button>
      <button
        onClick={() => switchSource('video')}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
          activeSource === 'video'
            ? 'bg-ok/10 border-ok/30 text-ok'
            : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
        }`}
      >
        Video
      </button>
    </div>
  ) : null

  return (
    <div className={className}>
      {/* Two-column layout on lg screens */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-5">
        {/* Left column: source toggle + video player */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          {sourceToggle}
          {videoPlayer}
        </div>

        {/* Right column: mark cards */}
        <div>
      {/* Mark cards */}
      <div className="flex flex-col gap-2 mt-3 lg:mt-0">
        {marks.length === 1 && (
          <p className="text-xs text-warn/80 bg-warn/5 border border-warn/15 rounded-lg px-3 py-2">
            Solo 1 marca. Se recomiendan 3–5 para una referencia confiable.
          </p>
        )}

        {marks.map((mark, i) => (
          <div
            key={i}
            className={`bg-card border rounded-xl px-4 py-3 transition-all ${
              selectedIndex === i
                ? 'border-ok/40 bg-ok/5'
                : 'border-border'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-ok/10 border border-ok/20 text-ok">
                  #{i + 1}
                </span>
                {mark.relative_ms != null && (
                  <span className="text-xs font-mono text-muted-foreground">
                    {formatTime(mark.relative_ms / 1000)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {mark.relative_ms != null && hasVideo && (
                  <button
                    onClick={() => playClip(i)}
                    className="text-xs text-ok hover:text-ok/80 flex items-center gap-1 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21" /></svg>
                    Ver clip
                  </button>
                )}
                {onDeleteMark && (
                  <button
                    onClick={() => setConfirmDeleteIndex(confirmDeleteIndex === i ? null : i)}
                    className="text-xs text-muted-foreground/50 hover:text-bad flex items-center gap-1 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Delete confirmation */}
            {confirmDeleteIndex === i && onDeleteMark && (
              <div className="flex items-center justify-between bg-bad/5 border border-bad/20 rounded-lg px-3 py-2 mb-2">
                <span className="text-xs text-bad">Eliminar esta marca?</span>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmDeleteIndex(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Cancelar
                  </button>
                  <button
                    onClick={() => { onDeleteMark(i); setConfirmDeleteIndex(null); if (selectedIndex === i) setSelectedIndex(null) }}
                    className="text-xs text-bad font-semibold hover:underline"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            )}

            {/* Instructor view: metrics + editable note */}
            {isInstructor && (
              <>
                <div className="flex flex-col gap-1">
                  {Object.entries(mark.metrics)
                    .filter(([key]) => !selectedMetrics?.length || selectedMetrics.includes(key))
                    .map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{METRIC_LABELS[key] ?? key.replace(/_/g, ' ')}</span>
                        <span className="font-mono text-foreground">{formatMetricValue(key, value)}</span>
                      </div>
                    ))}
                </div>
                {onNoteChange && (
                  <div className="mt-2 flex gap-1.5 items-start">
                    <textarea
                      id={`mark-note-${i}`}
                      defaultValue={mark.note ?? ''}
                      onBlur={(e) => {
                        if (dictatingIndex === i) return // Don't save mid-dictation
                        const val = e.target.value.trim()
                        if (val !== (mark.note ?? '')) onNoteChange(i, val)
                      }}
                      placeholder="Nota para el alumno..."
                      className="flex-1 text-xs bg-secondary border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:border-ok/30"
                      rows={2}
                    />
                    <button
                      onClick={() => toggleDictation(i)}
                      title={dictatingIndex === i ? 'Detener dictado' : 'Dictar nota'}
                      className={`shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center transition-all ${
                        dictatingIndex === i
                          ? 'bg-bad/20 border-bad/40 text-bad animate-pulse'
                          : 'bg-secondary border-border text-muted-foreground hover:border-ok/40 hover:text-ok'
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="2" width="6" height="11" rx="3" />
                        <path d="M5 10a7 7 0 0 0 14 0" />
                        <line x1="12" y1="19" x2="12" y2="22" />
                        <line x1="8" y1="22" x2="16" y2="22" />
                      </svg>
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Student view: note only, no metrics */}
            {!isInstructor && (
              mark.note ? (
                <p className="text-sm text-foreground leading-relaxed italic">
                  &ldquo;{mark.note}&rdquo;
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Posición de referencia
                </p>
              )
            )}
          </div>
        ))}
      </div>

      {/* Collapsible full video */}
      {hasVideo && marks.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowFullVideo(!showFullVideo)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              className={`transition-transform ${showFullVideo ? 'rotate-90' : ''}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Ver grabación completa
          </button>
          {showFullVideo && (
            <div className="mt-2">
              <VideoTimelinePlayer
                videoUrl={videoUrl}
                skeletonUrl={skeletonUrl}
                marks={marks}
                className="bg-card border border-border rounded-xl overflow-hidden p-3"
              />
            </div>
          )}
        </div>
      )}
      </div>{/* end mark cards column */}
      </div>{/* end grid */}
    </div>
  )
}
