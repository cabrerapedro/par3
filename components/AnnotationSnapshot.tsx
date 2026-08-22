'use client'

// The student- and instructor-facing view of an annotation: the composited
// snapshot (frozen frame + strokes, rendered WITHOUT degree labels) plus an
// HTML overlay with the angle degrees positioned at each vertex. Keeping the
// degrees as a separate layer is what lets the viewer toggle them — the
// instructor drew the angle (their authority), the student decides whether
// they want to see the number.

import type { Stroke } from '@/lib/strokes'

interface Props {
  src: string
  alt: string
  strokes: Stroke[]
  showDegrees: boolean
  className?: string
  onClick?: () => void
}

export function AnnotationSnapshot({ src, alt, strokes, showDegrees, className, onClick }: Props) {
  // Defensive against legacy/malformed rows: a null `strokes` or a stroke
  // without a numeric vertex must not take the whole clip page down.
  const labels = showDegrees
    ? (Array.isArray(strokes) ? strokes : []).filter(
        (s) =>
          s?.type === 'angle' &&
          typeof s.degrees === 'number' &&
          Array.isArray(s.points) && s.points.length >= 3 &&
          Array.isArray(s.points[0]) && typeof s.points[0][0] === 'number' && typeof s.points[0][1] === 'number',
      )
    : []

  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className="block w-full rounded-lg border border-border" loading="lazy" />
  )

  return (
    <div className={`relative ${className ?? ''}`}>
      {onClick ? (
        <button type="button" onClick={onClick} className="block w-full text-left" aria-label={alt}>
          {image}
        </button>
      ) : image}
      {labels.map((s, i) => {
        const [vx, vy] = s.points[0]
        return (
          <span
            key={i}
            className="absolute -translate-y-full pointer-events-none select-none rounded-full px-2 py-0.5 text-xs font-semibold text-white bg-black/75 shadow"
            style={{ left: `${(vx * 100).toFixed(2)}%`, top: `${(vy * 100).toFixed(2)}%`, marginLeft: 10, marginTop: -6 }}
          >
            {s.degrees}°
          </span>
        )
      })}
    </div>
  )
}
