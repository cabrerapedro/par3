import type { Status } from '@/lib/poseAnalysis'

const PILL: Record<Status, string> = {
  ok:   'bg-ok/15  text-ok  border-ok/30',
  warn: 'bg-warn/15 text-warn border-warn/30',
  bad:  'bg-bad/15  text-bad  border-bad/30',
  off:  'bg-black/40 text-muted border-white/10',
}

const DOT: Record<Status, string> = {
  ok:   'bg-ok animate-pulse',
  warn: 'bg-warn',
  bad:  'bg-bad animate-pulse',
  off:  'bg-dim',
}

const LABEL: Record<Status, string> = {
  ok:   'Postura correcta',
  warn: 'Ajustar postura',
  bad:  'Corregir postura',
  off:  'Detectando...',
}

interface StatusPillProps {
  status: Status
}

export function StatusPill({ status }: StatusPillProps) {
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border font-mono text-xs font-medium backdrop-blur-sm ${PILL[status]}`}>
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT[status]}`} />
      {LABEL[status]}
    </div>
  )
}
