// SVGAnnotationOverlay — read-only counterpart to AnnotationCanvas.
//
// Renders saved annotation strokes on top of a video frame using SVG so
// they stay crisp at any size (instructor preview, student playback,
// tablet vs phone). Same Stroke shape as AnnotationCanvas — coordinates
// are normalized 0..1 and scaled to the parent's pixel dimensions here.
//
// This is a pure presentational component: no state, no events. Parent
// is responsible for layering it over the paused frame (position
// absolute + matching dimensions).

import type { Stroke, StrokeColor } from './AnnotationCanvas'

const COLOR_HEX: Record<StrokeColor, string> = {
  red: '#f04848',
  yellow: '#e8b930',
  green: '#34d178',
  white: '#ffffff',
}

const STROKE_WIDTH = 4
const ARROW_HEAD = 14

interface SVGAnnotationOverlayProps {
  width: number
  height: number
  strokes: Stroke[]
  className?: string
}

export function SVGAnnotationOverlay({ width, height, strokes, className }: SVGAnnotationOverlayProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ pointerEvents: 'none' }}
      aria-hidden
    >
      <defs>
        {/* One arrow marker per color so each <line> uses the matching head. */}
        {(Object.keys(COLOR_HEX) as StrokeColor[]).map((color) => (
          <marker
            key={color}
            id={`arrow-${color}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth={ARROW_HEAD / 2}
            markerHeight={ARROW_HEAD / 2}
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={COLOR_HEX[color]} />
          </marker>
        ))}
      </defs>

      {strokes.map((stroke, i) => renderStroke(stroke, i, width, height))}
    </svg>
  )
}

function renderStroke(stroke: Stroke, key: number, w: number, h: number) {
  const [a, b] = stroke.points
  const ax = a[0] * w, ay = a[1] * h
  const bx = b[0] * w, by = b[1] * h
  const stroke_ = COLOR_HEX[stroke.color]
  const common = {
    stroke: stroke_,
    strokeWidth: STROKE_WIDTH,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  }

  if (stroke.type === 'arrow') {
    return (
      <line
        key={key}
        x1={ax}
        y1={ay}
        x2={bx}
        y2={by}
        markerEnd={`url(#arrow-${stroke.color})`}
        {...common}
      />
    )
  }

  if (stroke.type === 'line') {
    return <line key={key} x1={ax} y1={ay} x2={bx} y2={by} {...common} />
  }

  if (stroke.type === 'circle') {
    const radius = Math.hypot(bx - ax, by - ay)
    return <circle key={key} cx={ax} cy={ay} r={radius} {...common} />
  }

  return null
}
