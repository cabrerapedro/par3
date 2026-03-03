import type { Check, Status } from '@/lib/poseAnalysis'

const STRIP: Record<Status, string> = {
  ok:   'bg-ok',
  warn: 'bg-warn',
  bad:  'bg-bad',
  off:  'bg-border',
}

const CARD_BG: Record<Status, string> = {
  ok:   'border-ok/25   bg-ok/5',
  warn: 'border-warn/25 bg-warn/5',
  bad:  'border-bad/25  bg-bad/5',
  off:  'border-border  bg-transparent',
}

const LABEL_COLOR: Record<Status, string> = {
  ok:   'text-ok',
  warn: 'text-warn',
  bad:  'text-bad',
  off:  'text-dim',
}

const BADGE_LABEL: Record<Status, string> = {
  ok:   'OK',
  warn: 'Ajustar',
  bad:  'Corregir',
  off:  '—',
}

function StatusIcon({ status }: { status: Status }) {
  if (status === 'ok') return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-ok flex-shrink-0">
      <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 9l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
  if (status === 'warn') return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-warn flex-shrink-0">
      <path d="M9 2L16.5 15H1.5L9 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 7.5v3M9 12.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
  if (status === 'bad') return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-bad flex-shrink-0">
      <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 6l6 6M12 6l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
  return <div className="w-4.5 h-4.5 rounded-full border border-dim flex-shrink-0" />
}

interface CheckPanelProps {
  checks: Check[]
  tip: string
}

export function CheckPanel({ checks, tip }: CheckPanelProps) {
  return (
    <div className="flex flex-col gap-3 h-full">
      <p className="font-mono text-xs text-dim uppercase tracking-widest">Análisis de postura</p>

      {checks.map(check => (
        <div
          key={check.id}
          className={`relative rounded-xl border overflow-hidden transition-all duration-300 ${CARD_BG[check.status]}`}
        >
          {/* Left color strip */}
          <div className={`absolute left-0 top-0 bottom-0 w-1 ${STRIP[check.status]}`} />

          <div className="pl-4 pr-3 py-3 sm:pl-5 sm:pr-4 sm:py-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <StatusIcon status={check.status} />
                <span className="font-semibold text-sm sm:text-base text-txt">{check.label}</span>
              </div>
              <span className={`font-mono text-xs font-bold ${LABEL_COLOR[check.status]}`}>
                {BADGE_LABEL[check.status]}
              </span>
            </div>
            {check.status !== 'off' && (
              <p className="text-xs sm:text-sm text-muted leading-relaxed pl-6 sm:pl-7">{check.message}</p>
            )}
          </div>
        </div>
      ))}

      {/* Tip box */}
      <div className="mt-auto pt-1">
        <div className="relative rounded-xl border border-ok/25 bg-ok/8 overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-ok" />
          <div className="pl-4 pr-3 py-3 sm:pl-5 sm:pr-4 sm:py-4">
            <p className="font-mono text-xs text-ok uppercase tracking-widest mb-1.5 sm:mb-2">Consejo principal</p>
            <p className="text-xs sm:text-sm text-txt leading-relaxed">{tip}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
