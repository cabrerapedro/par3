'use client'

import { useRef, useState, useEffect } from 'react'
import type { CalibrationMark } from '@/lib/types'

interface VideoTimelinePlayerProps {
  videoUrl?: string
  skeletonUrl?: string
  marks?: CalibrationMark[]
  className?: string
}

export function VideoTimelinePlayer({ videoUrl, skeletonUrl, marks, className }: VideoTimelinePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hasBoth = !!(videoUrl && skeletonUrl)
  const [active, setActive] = useState<'video' | 'skeleton'>(skeletonUrl ? 'skeleton' : 'video')
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [mirrored, setMirrored] = useState(false)
  const durationResolvedRef = useRef(false)

  const activeUrl = active === 'skeleton' ? skeletonUrl : videoUrl
  const timelineMarks = marks?.filter(m => m.relative_ms != null) ?? []
  const hasTimeline = timelineMarks.length > 0

  useEffect(() => {
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    durationResolvedRef.current = false
  }, [activeUrl])

  if (!activeUrl) return null

  function handleTimeUpdate() {
    const v = videoRef.current
    if (v) setCurrentTime(v.currentTime)
  }

  function handleLoadedMetadata() {
    const v = videoRef.current
    if (!v) return
    if (isFinite(v.duration) && v.duration > 0) {
      setDuration(v.duration)
      durationResolvedRef.current = true
    } else {
      // WebM from MediaRecorder often reports Infinity duration.
      // Seeking to a huge time forces the browser to resolve the real duration.
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

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setPlaying(true) }
    else { v.pause(); setPlaying(false) }
  }

  function seekTo(time: number) {
    const v = videoRef.current
    if (v) { v.currentTime = time; setCurrentTime(time) }
  }

  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    seekTo(pct * duration)
  }

  function toggleFullscreen() {
    const v = videoRef.current
    if (!v) return
    // iOS Safari needs webkitEnterFullscreen; others use requestFullscreen
    if ((v as any).webkitEnterFullscreen) {
      (v as any).webkitEnterFullscreen()
    } else if (v.requestFullscreen) {
      v.requestFullscreen()
    }
  }

  const formatTime = (s: number) => {
    if (!isFinite(s) || isNaN(s) || s < 0) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const toggleButtons = hasBoth ? (
    <div className="flex gap-1 mb-2">
      <button
        onClick={() => setActive('skeleton')}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
          active === 'skeleton'
            ? 'bg-ok/10 border-ok/30 text-ok'
            : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
        }`}
      >
        Video + Ejes
      </button>
      <button
        onClick={() => setActive('video')}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
          active === 'video'
            ? 'bg-ok/10 border-ok/30 text-ok'
            : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
        }`}
      >
        Video
      </button>
    </div>
  ) : null

  // If no timeline data, render simple player with native controls
  if (!hasTimeline) {
    return (
      <div className={className}>
        {toggleButtons}
        <video
          key={activeUrl}
          src={activeUrl}
          controls
          playsInline
          className="w-full rounded-xl bg-black"
          style={{ maxHeight: '14rem' }}
        />
      </div>
    )
  }

  return (
    <div className={className}>
      {toggleButtons}

      {/* Video */}
      <div className="relative">
        <video
          ref={videoRef}
          key={activeUrl}
          src={activeUrl}
          playsInline
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onDurationChange={handleDurationChange}
          onSeeked={handleSeeked}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          className={`w-full rounded-t-xl bg-black cursor-pointer ${mirrored ? 'scale-x-[-1]' : ''}`}
          style={{ maxHeight: '14rem' }}
          onClick={togglePlay}
        />
      </div>

      {/* Custom controls + timeline */}
      <div className="bg-card border border-t-0 border-border rounded-b-xl px-3 py-2.5">
        <div className="flex items-center gap-2">
          {/* Play/pause */}
          <button
            onClick={togglePlay}
            className="text-foreground hover:text-ok transition-colors shrink-0"
          >
            {playing ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6 3 20 12 6 21" />
              </svg>
            )}
          </button>

          {/* Time */}
          <span className="text-[10px] font-mono text-muted-foreground tabular-nums shrink-0 w-[70px]">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          {/* Timeline bar */}
          <div
            className="relative flex-1 h-5 flex items-center cursor-pointer group"
            onClick={handleTimelineClick}
          >
            {/* Track */}
            <div className="absolute inset-x-0 h-1 bg-border rounded-full">
              {/* Progress */}
              <div
                className="h-full bg-ok/60 rounded-full"
                style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
              />
            </div>

            {/* Mark dots */}
            {timelineMarks.map((mark, i) => {
              const pct = duration > 0 ? (mark.relative_ms! / 1000 / duration) * 100 : 0
              return (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); seekTo(mark.relative_ms! / 1000) }}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-ok border-2 border-card z-10 hover:scale-150 transition-transform"
                  style={{ left: `${pct}%` }}
                  title={`Marca ${i + 1}`}
                />
              )
            })}

            {/* Playhead */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-foreground border-2 border-card z-20 shadow-sm"
              style={{ left: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
            />
          </div>

          {/* Mirror toggle */}
          <button
            onClick={() => setMirrored(!mirrored)}
            title={mirrored ? 'Video normal' : 'Espejo'}
            className={`shrink-0 p-1 rounded transition-colors ${mirrored ? 'text-ok' : 'text-muted-foreground/50 hover:text-muted-foreground'}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3" />
              <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
              <line x1="12" y1="2" x2="12" y2="22" />
            </svg>
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            title="Pantalla completa"
            className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors p-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>

        {/* Mark index — clickable buttons to jump to each mark */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className="text-[10px] text-muted-foreground/60 mr-0.5">
            {timelineMarks.length} marca{timelineMarks.length !== 1 ? 's' : ''}:
          </span>
          {timelineMarks.map((mark, i) => (
            <button
              key={i}
              onClick={() => seekTo(mark.relative_ms! / 1000)}
              className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-ok/20 bg-ok/5 text-ok hover:bg-ok/15 transition-colors"
            >
              #{i + 1} {formatTime(mark.relative_ms! / 1000)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
