// Vector annotation strokes — the single source of truth for the drawing
// model (CLAUDE.md: annotations are vector JSON, never rasterized).
//
// Shared by the instructor's canvas (live drawing + preview), the snapshot
// compositor (frame + strokes → JPEG for the student), the degree-label
// overlay on top of that snapshot, and the annotation-focus mapping in
// lib/baseline.ts. Keeping it here means a new tool is implemented once.
//
// Tool set = the common core of V1 Golf, OnForm, Hudl Technique and CoachNow:
// line, arrow, circle, angle ("la V", with degrees), freehand, rectangle.

export type StrokeKind = 'line' | 'arrow' | 'circle' | 'angle' | 'freehand' | 'rect'
export type StrokeColor = 'red' | 'yellow' | 'green' | 'white'

export interface Stroke {
  type: StrokeKind
  color: StrokeColor
  /**
   * Normalized coordinates (0..1 of the video frame).
   *   line/arrow: [start, end]
   *   circle:     [center, pointOnRadius] — radius derived as distance
   *   rect:       [corner, oppositeCorner]
   *   angle:      [vertex, armEnd1, armEnd2]
   *   freehand:   N points in drawing order
   */
  points: [number, number][]
  /** freehand only — per-point pen pressure 0..1 (absent when drawn with a finger). */
  widths?: number[]
  /**
   * angle only — degrees at the vertex, computed on the instructor's canvas
   * with the real frame aspect ratio (normalized coords aren't square). Stored
   * so every viewer shows exactly the number the instructor saw.
   */
  degrees?: number
}

export const STROKE_COLOR_HEX: Record<StrokeColor, string> = {
  red: '#f04848',
  yellow: '#e8b930',
  green: '#34d178',
  white: '#ffffff',
}

/**
 * Angle in degrees at `vertex` between the arms to `a` and `b`, in PIXEL
 * space: normalized x must be scaled by the frame aspect (w/h) or a 90°
 * angle on a 16:9 frame would read as ~60°.
 */
export function angleDegrees(
  vertex: [number, number],
  a: [number, number],
  b: [number, number],
  aspect: number,
): number {
  const v1 = [(a[0] - vertex[0]) * aspect, a[1] - vertex[1]]
  const v2 = [(b[0] - vertex[0]) * aspect, b[1] - vertex[1]]
  const n1 = Math.hypot(v1[0], v1[1])
  const n2 = Math.hypot(v2[0], v2[1])
  if (n1 === 0 || n2 === 0) return 0
  const cos = Math.min(1, Math.max(-1, (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)))
  return Math.round((Math.acos(cos) * 180) / Math.PI)
}

/**
 * Where a stroke "points at" on the body — the vertex of an angle, the
 * center of a circle/rectangle, the centroid of a line/arrow/freehand path.
 * Used to map drawings to body zones (annotation focus).
 */
export function strokeAnchor(stroke: { type: string; points?: number[][]; center?: number[] }): number[] | null {
  if (stroke.center) return stroke.center
  const pts = stroke.points
  if (!pts?.length) return null
  switch (stroke.type) {
    case 'circle':
    case 'angle':
      return pts[0]
    case 'rect':
      return pts.length >= 2 ? [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2] : pts[0]
    default: {
      const sx = pts.reduce((acc, p) => acc + p[0], 0)
      const sy = pts.reduce((acc, p) => acc + p[1], 0)
      return [sx / pts.length, sy / pts.length]
    }
  }
}

// ─── Rendering ──────────────────────────────────────────────────────────────

export interface DrawOptions {
  /** Draw the degree pill next to angle vertices. The snapshot leaves it out
   *  so viewers can toggle the label as a separate layer. */
  labels?: boolean
  /** Render as an in-progress preview (dashed). */
  draft?: boolean
  /** Base line width in px (scales with the surface). */
  lineWidth?: number
}

export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  strokes: Stroke[],
  opts: DrawOptions = {},
) {
  for (const s of strokes) drawStroke(ctx, w, h, s, opts)
}

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  s: Stroke,
  opts: DrawOptions = {},
) {
  const base = opts.lineWidth ?? Math.max(3, Math.round(w / 240))
  const dotR = base * 1.5
  const hex = STROKE_COLOR_HEX[s.color] ?? STROKE_COLOR_HEX.red
  ctx.save()
  ctx.strokeStyle = hex
  ctx.fillStyle = hex
  ctx.lineWidth = base
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (opts.draft) ctx.setLineDash([base * 2, base * 1.5])

  const P = s.points.map(([x, y]) => [x * w, y * h] as [number, number])

  switch (s.type) {
    case 'line':
    case 'arrow': {
      if (P.length < 2) break
      const [a, b] = P
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke()
      ctx.setLineDash([])
      if (s.type === 'arrow') drawArrowHead(ctx, a, b, base * 3.5)
      else { drawDot(ctx, a, dotR); drawDot(ctx, b, dotR) }
      break
    }
    case 'circle': {
      if (P.length < 2) break
      const r = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1])
      ctx.beginPath(); ctx.arc(P[0][0], P[0][1], r, 0, Math.PI * 2); ctx.stroke()
      break
    }
    case 'rect': {
      if (P.length < 2) break
      ctx.beginPath()
      ctx.rect(Math.min(P[0][0], P[1][0]), Math.min(P[0][1], P[1][1]), Math.abs(P[1][0] - P[0][0]), Math.abs(P[1][1] - P[0][1]))
      ctx.stroke()
      break
    }
    case 'angle': {
      if (P.length < 2) break
      const [v, a, b] = P
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(v[0], v[1])
      if (b) ctx.lineTo(b[0], b[1])
      ctx.stroke()
      ctx.setLineDash([])
      drawDot(ctx, v, dotR)
      if (b) {
        // Small arc at the vertex, like every golf analysis app draws it.
        const a1 = Math.atan2(a[1] - v[1], a[0] - v[0])
        const a2 = Math.atan2(b[1] - v[1], b[0] - v[0])
        const r = Math.min(Math.hypot(a[0] - v[0], a[1] - v[1]), Math.hypot(b[0] - v[0], b[1] - v[1])) * 0.3
        let d = a2 - a1
        while (d > Math.PI) d -= 2 * Math.PI
        while (d < -Math.PI) d += 2 * Math.PI
        ctx.beginPath(); ctx.arc(v[0], v[1], Math.max(base * 3, r), a1, a1 + d, d < 0); ctx.stroke()
        if (opts.labels && typeof s.degrees === 'number') drawDegreeLabel(ctx, v, s.degrees, base)
      }
      break
    }
    case 'freehand': {
      if (P.length < 2) break
      const widths = s.widths
      if (widths && widths.length === P.length) {
        // Pressure-sensitive: draw segment by segment, width from pen pressure.
        for (let i = 1; i < P.length; i++) {
          const pressure = (widths[i - 1] + widths[i]) / 2
          ctx.lineWidth = base * (0.5 + pressure)
          ctx.beginPath(); ctx.moveTo(P[i - 1][0], P[i - 1][1]); ctx.lineTo(P[i][0], P[i][1]); ctx.stroke()
        }
      } else {
        ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1])
        for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1])
        ctx.stroke()
      }
      break
    }
  }
  ctx.restore()
}

function drawDot(ctx: CanvasRenderingContext2D, p: [number, number], r: number) {
  ctx.setLineDash([])
  ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill()
}

function drawArrowHead(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], head: number) {
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0])
  const left = angle + Math.PI - Math.PI / 7
  const right = angle + Math.PI + Math.PI / 7
  ctx.beginPath()
  ctx.moveTo(b[0], b[1])
  ctx.lineTo(b[0] + head * Math.cos(left), b[1] + head * Math.sin(left))
  ctx.lineTo(b[0] + head * Math.cos(right), b[1] + head * Math.sin(right))
  ctx.closePath()
  ctx.fill()
}

/** Degree pill next to the vertex (canvas-side; viewers use an HTML overlay). */
export function drawDegreeLabel(ctx: CanvasRenderingContext2D, v: [number, number], degrees: number, base: number) {
  const text = `${degrees}°`
  const fontPx = Math.max(14, base * 4)
  ctx.save()
  ctx.setLineDash([])
  ctx.font = `600 ${fontPx}px system-ui, -apple-system, sans-serif`
  const padX = fontPx * 0.5
  const tw = ctx.measureText(text).width
  const x = v[0] + fontPx * 0.8
  const y = v[1] - fontPx * 0.8
  ctx.fillStyle = 'rgba(6, 10, 8, 0.78)'
  const rx = x - padX, ry = y - fontPx * 0.85, rw = tw + padX * 2, rh = fontPx * 1.3
  ctx.beginPath()
  // roundRect landed in Safari/iPadOS 16; older iPads get a plain box.
  if (typeof ctx.roundRect === 'function') ctx.roundRect(rx, ry, rw, rh, rh / 2)
  else ctx.rect(rx, ry, rw, rh)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, x, y)
  ctx.restore()
}
