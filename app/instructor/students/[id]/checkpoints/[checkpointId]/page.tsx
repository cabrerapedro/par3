'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Checkpoint } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { METRIC_LABELS, METRIC_INFO, PHASE_LABELS, calculateBaseline, calculateSwingBaseline, isSwingBaseline } from '@/lib/baseline'
import type { SwingPhaseName, PracticeSession } from '@/lib/types'
import { MarkGallery } from '@/components/MarkGallery'
import { ProgressChart } from '@/components/ProgressChart'
import Link from 'next/link'

type Tab = 'calibration' | 'baseline' | 'practice'

export default function InstructorCheckpointDetail() {
  const { instructor, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const studentId = params.id as string
  const checkpointId = params.checkpointId as string

  const [cp, setCp] = useState<Checkpoint | null>(null)
  const [sessions, setSessions] = useState<PracticeSession[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('calibration')
  const [dictating, setDictating] = useState(false)
  const [recording, setRecording] = useState(false)
  const dictRef = useRef<any>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const noteRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (authLoading) return
    if (!instructor) { router.replace('/instructor/login'); return }
    Promise.all([
      supabase.from('checkpoints').select('*').eq('id', checkpointId).single(),
      supabase.from('practice_sessions').select('id, student_id, checkpoint_id, date, duration_seconds, overall_score, results, created_at').eq('checkpoint_id', checkpointId).order('date', { ascending: true }),
    ]).then(([{ data: cpData }, { data: sessData }]) => {
      if (cpData) setCp(cpData)
      setSessions(sessData ?? [])
      setLoading(false)
    })
  }, [authLoading])

  async function handleDeleteMark(index: number) {
    if (!cp) return
    const newMarks = cp.calibration_marks.filter((_, i) => i !== index)
    const newBaseline = newMarks.length > 0
      ? (cp.checkpoint_type === 'swing' ? calculateSwingBaseline(newMarks, cp.selected_metrics) : calculateBaseline(newMarks, cp.selected_metrics))
      : null
    const newStatus = newMarks.length > 0 ? 'calibrated' : 'pending'

    await supabase.from('checkpoints').update({
      calibration_marks: newMarks,
      baseline: newBaseline,
      status: newStatus,
    }).eq('id', cp.id)

    setCp({ ...cp, calibration_marks: newMarks, baseline: newBaseline, status: newStatus as any })
  }

  async function handleNoteChange(index: number, note: string) {
    if (!cp) return
    const newMarks = cp.calibration_marks.map((m, i) => i === index ? { ...m, note: note || undefined } : m)

    await supabase.from('checkpoints').update({
      calibration_marks: newMarks,
    }).eq('id', cp.id)

    setCp({ ...cp, calibration_marks: newMarks })
  }

  // Save instructor text note
  async function saveNote(text: string) {
    if (!cp) return
    const val = text.trim() || null
    if (val === (cp.instructor_note ?? null)) return
    await supabase.from('checkpoints').update({ instructor_note: val }).eq('id', cp.id)
    setCp({ ...cp, instructor_note: val ?? undefined })
  }

  // Speech-to-text dictation for instructor note
  function toggleDictation() {
    if (dictating) {
      dictRef.current?.stop()
      dictRef.current = null
      setDictating(false)
      return
    }
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
      if (!transcript || !noteRef.current) return
      noteRef.current.value = noteRef.current.value
        ? `${noteRef.current.value} ${transcript}`
        : transcript
    }
    r.onend = () => {
      setDictating(false)
      if (noteRef.current) saveNote(noteRef.current.value)
    }
    dictRef.current = r
    r.start()
    setDictating(true)
  }

  // Record audio note and upload
  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      audioChunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setRecording(false)
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const path = `${cp!.id}/note-${Date.now()}.webm`
        const { error } = await supabase.storage.from('instructor-notes').upload(path, blob, { contentType: 'audio/webm', upsert: true })
        if (error) return
        const { data: urlData } = supabase.storage.from('instructor-notes').getPublicUrl(path)
        const audioUrl = urlData.publicUrl
        await supabase.from('checkpoints').update({ instructor_audio_url: audioUrl }).eq('id', cp!.id)
        setCp(prev => prev ? { ...prev, instructor_audio_url: audioUrl } : prev)
      }
      mediaRecorderRef.current = mr
      mr.start()
      setRecording(true)
    } catch {}
  }

  // Delete audio note
  async function deleteAudio() {
    if (!cp?.instructor_audio_url) return
    await supabase.from('checkpoints').update({ instructor_audio_url: null }).eq('id', cp.id)
    setCp({ ...cp, instructor_audio_url: undefined })
  }

  if (loading) return <LoadingScreen />
  if (!cp) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Ejercicio no encontrado.</p>
    </div>
  )

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'calibration', label: 'Calibración', count: cp.calibration_marks?.length || 0 },
    { key: 'baseline', label: 'Referencia' },
    { key: 'practice', label: 'Práctica', count: sessions.length },
  ]

  // Practice stats — computed once outside JSX
  const practiceAvg = sessions.length > 0
    ? Math.round(sessions.reduce((s, x) => s + x.overall_score, 0) / sessions.length)
    : 0
  const practiceLatest = sessions.length > 0 ? sessions[sessions.length - 1] : null
  const practiceTrend = sessions.length >= 2
    ? sessions[sessions.length - 1].overall_score - sessions[0].overall_score
    : null

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 lg:px-6 h-14 flex items-center gap-3">
          <Link href={`/instructor/students/${studentId}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            Perfil del alumno
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 lg:px-6 py-10">
        {/* Checkpoint title + inline actions */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn("text-xs", cp.status === 'calibrated' ? "text-ok border-ok/20 bg-ok/10" : "text-muted-foreground border-border")}>
                {cp.status === 'calibrated' ? 'Calibrado' : 'Pendiente'}
              </Badge>
              <Badge variant="outline" className="text-muted-foreground border-border text-xs">
                {cp.camera_angle === 'face_on' ? 'De frente' : 'De perfil'}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <Link
                href={`/instructor/students/${studentId}/checkpoints/${checkpointId}/calibrate`}
                title={cp.status === 'calibrated' ? 'Recalibrar' : 'Calibrar'}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-muted-foreground hover:border-ok/40 hover:text-ok hover:bg-ok/5 transition-all"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                {cp.status === 'calibrated' ? 'Recalibrar' : 'Calibrar'}
              </Link>
              <Link
                href={`/instructor/students/${studentId}/checkpoints/${checkpointId}/edit`}
                title="Editar ejercicio"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-muted-foreground hover:border-blue/40 hover:text-blue hover:bg-blue/5 transition-all"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Editar
              </Link>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{cp.name}</h1>
          {cp.calibration_marks?.length > 0 && (
            <p className="text-muted-foreground text-sm mt-1">
              {cp.calibration_marks.length} posicion{cp.calibration_marks.length !== 1 ? 'es' : ''} calibrada{cp.calibration_marks.length !== 1 ? 's' : ''} · referencia personal activa
            </p>
          )}
        </div>

        {/* Instructor note — editable inline */}
        <div className="bg-blue/5 border border-blue/20 rounded-xl px-4 py-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="size-6 rounded-full bg-blue/10 border border-blue/20 flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-blue/80 uppercase tracking-wide">Nota para el alumno</p>
          </div>

          {/* Audio note */}
          {cp.instructor_audio_url && (
            <div className="flex items-center gap-2 mb-3">
              <audio src={cp.instructor_audio_url} controls className="flex-1 h-9" style={{ accentColor: '#60a5fa' }} />
              <button
                onClick={deleteAudio}
                title="Eliminar audio"
                className="shrink-0 w-9 h-9 rounded-lg border border-border bg-secondary text-muted-foreground hover:text-bad hover:border-bad/30 flex items-center justify-center transition-all"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          )}

          {/* Text note */}
          <textarea
            ref={noteRef}
            defaultValue={cp.instructor_note ?? ''}
            onBlur={(e) => {
              if (dictating) return
              saveNote(e.target.value)
            }}
            placeholder="Escribe una nota para el alumno..."
            className="w-full text-sm bg-background/50 border border-blue/15 rounded-lg px-3 py-2.5 text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:border-blue/40 leading-relaxed"
            rows={2}
          />

          {/* Action buttons — row below textarea */}
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={toggleDictation}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all",
                dictating
                  ? "bg-bad/15 border-bad/30 text-bad animate-pulse"
                  : "border-blue/20 text-blue/70 hover:bg-blue/5 hover:text-blue"
              )}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="11" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
              {dictating ? 'Dictando...' : 'Dictar'}
            </button>
            <button
              onClick={toggleRecording}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all",
                recording
                  ? "bg-bad/15 border-bad/30 text-bad animate-pulse"
                  : "border-blue/20 text-blue/70 hover:bg-blue/5 hover:text-blue"
              )}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {recording
                  ? <rect x="6" y="6" width="12" height="12" rx="2" />
                  : <circle cx="12" cy="12" r="6" />
                }
              </svg>
              {recording ? 'Grabando...' : 'Nota de voz'}
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-border mb-6">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition-all relative",
                activeTab === tab.key
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="flex items-center gap-1.5">
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
                    activeTab === tab.key ? "bg-ok/15 text-ok" : "bg-secondary text-muted-foreground"
                  )}>
                    {tab.count}
                  </span>
                )}
              </span>
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-ok rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'calibration' && (
          cp.calibration_marks?.length > 0 ? (
            <MarkGallery
              videoUrl={cp.calibration_video_url}
              skeletonUrl={cp.calibration_skeleton_url}
              marks={cp.calibration_marks}
              cameraAngle={cp.camera_angle}
              selectedMetrics={cp.selected_metrics}
              onDeleteMark={handleDeleteMark}
              onNoteChange={handleNoteChange}
            />
          ) : (
            <EmptyState
              icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>}
              title="Sin marcas de calibración"
              description="Calibra este ejercicio para crear la referencia personal del alumno."
              action={
                <Link
                  href={`/instructor/students/${studentId}/checkpoints/${checkpointId}/calibrate`}
                  className="inline-flex items-center gap-1.5 bg-ok text-black text-sm font-semibold rounded-lg px-4 py-2 hover:bg-ok/90 transition-all"
                >
                  Calibrar ahora
                </Link>
              }
            />
          )
        )}

        {activeTab === 'baseline' && (
          cp.baseline && Object.keys(cp.baseline).length > 0 ? (
            isSwingBaseline(cp.baseline) ? (
              <div className="flex flex-col gap-4">
                {Object.entries(cp.baseline.phases).map(([phase, phaseBaseline]) => (
                  <div key={phase} className="bg-card border border-border rounded-xl px-4 py-4">
                    <p className="text-xs text-muted-foreground font-medium mb-2">{PHASE_LABELS[phase as SwingPhaseName] ?? phase}</p>
                    <div className="flex flex-col gap-1.5">
                      {Object.entries(phaseBaseline as Record<string, any>)
                        .filter(([key]) => !cp.selected_metrics?.length || cp.selected_metrics.includes(key))
                        .map(([key, val]) => {
                          const info = METRIC_INFO[key]
                          const unitSuffix = info?.unit === 'grados' ? '°' : ''
                          return (
                            <div key={key} className="flex items-center justify-between bg-secondary border border-border rounded-lg px-3 py-2 text-xs">
                              <span className="text-muted-foreground">{METRIC_LABELS[key] ?? key}</span>
                              <span className="text-ok font-mono font-semibold">
                                {val.mean.toFixed(1)}{unitSuffix}
                                <span className="text-muted-foreground/60 font-normal ml-1.5">
                                  ({val.min.toFixed(1)} – {val.max.toFixed(1)})
                                </span>
                              </span>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl px-4 py-4">
                <div className="flex flex-col gap-1.5">
                  {Object.entries(cp.baseline)
                    .filter(([key]) => !cp.selected_metrics?.length || cp.selected_metrics.includes(key))
                    .map(([key, val]) => {
                      const info = METRIC_INFO[key]
                      const unitSuffix = info?.unit === 'grados' ? '°' : ''
                      return (
                        <div key={key} className="flex items-center justify-between bg-secondary border border-border rounded-lg px-3 py-2 text-xs">
                          <span className="text-muted-foreground">{METRIC_LABELS[key] ?? key.replace(/_/g, ' ')}</span>
                          <span className="text-ok font-mono font-semibold">
                            {val.mean.toFixed(1)}{unitSuffix}
                            <span className="text-muted-foreground/60 font-normal ml-1.5">
                              ({val.min.toFixed(1)} – {val.max.toFixed(1)})
                            </span>
                          </span>
                        </div>
                      )
                    })}
                </div>
              </div>
            )
          ) : (
            <EmptyState
              icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" /></svg>}
              title="Sin referencia personal"
              description="Calibra al menos una posición para generar la referencia."
            />
          )
        )}

        {activeTab === 'practice' && (
          sessions.length > 0 ? (
            <div className="flex flex-col gap-5">
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-card border border-border rounded-xl px-3 py-3 text-center">
                  <p className={`text-xl font-bold font-mono ${practiceAvg >= 80 ? 'text-ok' : practiceAvg >= 50 ? 'text-warn' : 'text-bad'}`}>{practiceAvg}%</p>
                  <p className="text-xs text-muted-foreground">Promedio</p>
                </div>
                <div className="bg-card border border-border rounded-xl px-3 py-3 text-center">
                  <p className={`text-xl font-bold font-mono ${practiceLatest!.overall_score >= 80 ? 'text-ok' : practiceLatest!.overall_score >= 50 ? 'text-warn' : 'text-bad'}`}>{practiceLatest!.overall_score}%</p>
                  <p className="text-xs text-muted-foreground">Última</p>
                </div>
                <div className="bg-card border border-border rounded-xl px-3 py-3 text-center">
                  {practiceTrend !== null ? (
                    <p className={`text-xl font-bold font-mono ${practiceTrend > 0 ? 'text-ok' : practiceTrend < 0 ? 'text-bad' : 'text-muted-foreground'}`}>
                      {practiceTrend > 0 ? '+' : ''}{practiceTrend}%
                    </p>
                  ) : (
                    <p className="text-xl font-bold font-mono text-muted-foreground">—</p>
                  )}
                  <p className="text-xs text-muted-foreground">Tendencia</p>
                </div>
              </div>

              {/* Chart */}
              {sessions.length >= 2 && (
                <div className="bg-card border border-border rounded-xl px-4 py-4">
                  <ProgressChart
                    data={sessions.map(s => ({ date: s.date, score: s.overall_score }))}
                    height={130}
                  />
                </div>
              )}

              {/* Sessions list */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Sesiones recientes</p>
                <div className="flex flex-col gap-2">
                  {[...sessions].reverse().slice(0, 8).map((s, i) => {
                    const metricEntries = Object.entries(s.results ?? {})
                      .filter(([key]) => {
                        if (!cp?.selected_metrics?.length) return true
                        const baseKey = key.includes('__') ? key.split('__')[1] : key
                        return cp.selected_metrics.includes(baseKey)
                      })
                    const date = new Date(s.date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
                    return (
                      <div key={s.id} className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5",
                        i === 0 ? "bg-ok/5 border border-ok/15" : "bg-card border border-border"
                      )}>
                        <span className="text-xs text-muted-foreground w-14 shrink-0">{date}</span>
                        <span className={cn(
                          "text-sm font-bold font-mono w-10",
                          s.overall_score >= 80 ? 'text-ok' : s.overall_score >= 50 ? 'text-warn' : 'text-bad'
                        )}>
                          {s.overall_score}%
                        </span>
                        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                          {metricEntries.slice(0, 4).map(([key, val]) => {
                            let label: string
                            if (key.includes('__')) {
                              const [phase, metric] = key.split('__')
                              label = `${PHASE_LABELS[phase as SwingPhaseName] ?? phase}: ${METRIC_LABELS[metric] ?? metric}`
                            } else {
                              label = METRIC_LABELS[key] ?? key
                            }
                            return (
                              <span
                                key={key}
                                className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded-full border",
                                  (val as any).status === 'ok' ? 'text-ok border-ok/20' :
                                  (val as any).status === 'warn' ? 'text-warn border-warn/20' :
                                  'text-bad border-bad/20'
                                )}
                              >
                                {label}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                  {sessions.length > 8 && (
                    <p className="text-xs text-muted-foreground text-center mt-1">
                      +{sessions.length - 8} sesiones anteriores
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" /></svg>}
              title="Sin sesiones de práctica"
              description="El alumno aún no ha practicado este ejercicio."
            />
          )
        )}

      </div>
    </div>
  )
}

function EmptyState({ icon, title, description, action }: {
  icon: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-muted-foreground/40 mb-3">{icon}</div>
      <p className="text-foreground font-medium mb-1">{title}</p>
      <p className="text-muted-foreground text-sm mb-4">{description}</p>
      {action}
    </div>
  )
}

function LoadingScreen() {
  return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-5 h-5 rounded-full border-2 border-ok border-t-transparent animate-spin" /></div>
}
