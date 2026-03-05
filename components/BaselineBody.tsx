'use client'

import { METRIC_LABELS, METRIC_INFO, PHASE_LABELS } from '@/lib/baseline'
import type { CameraAngle, SwingPhaseName, SwingBaseline } from '@/lib/types'

interface Props {
  baseline: Record<string, { mean: number; std?: number }>
  cameraAngle: CameraAngle
  selectedMetrics?: string[]
}

function fmtVal(key: string, mean: number, std?: number): string {
  const info = METRIC_INFO[key]
  if (info?.unit === 'grados') {
    const s = std != null ? ` ±${std.toFixed(0)}°` : ''
    return `${mean.toFixed(0)}°${s}`
  }
  if (info?.unit === 'ratio') return mean.toFixed(2)
  return mean.toFixed(3)
}

// ─── Full-size stick figure joints (for position checkpoints) ───

const FO = {
  head: [200, 40], neck: [200, 62],
  ls: [150, 84], rs: [250, 84],
  le: [130, 142], re: [270, 142],
  lw: [118, 196], rw: [282, 196],
  lh: [172, 192], rh: [228, 192],
  lk: [168, 260], rk: [232, 260],
  la: [162, 322], ra: [238, 322],
}

const DT = {
  head: [162, 40], neck: [178, 62],
  sh: [198, 84],
  el: [176, 142], wr: [168, 196],
  hip: [220, 192],
  kn: [206, 260], an: [210, 322],
}

const DOT: Record<string, [number, number]> = {
  head_lateral:   [200, 40],
  shoulder_level: [200, 84],
  arm_angle:      [270, 142],
  hip_sway:       [200, 192],
  weight_shift:   [200, 218],
  stance_width:   [200, 322],
  head_forward:   [162, 40],
  head_height:    [162, 40],
  spine_angle:    [209, 138],
  trail_arm:      [176, 142],
  hip_hinge:      [220, 192],
  knee_flex:      [206, 260],
}

const LBL: Record<string, { x: number; y: number; side: 'r' | 'l' }> = {
  head_lateral:   { x: 322, y: 42, side: 'r' },
  shoulder_level: { x: 322, y: 86, side: 'r' },
  arm_angle:      { x: 322, y: 144, side: 'r' },
  hip_sway:       { x: 322, y: 194, side: 'r' },
  weight_shift:   { x: 72, y: 220, side: 'l' },
  stance_width:   { x: 322, y: 324, side: 'r' },
  head_forward:   { x: 58, y: 42, side: 'l' },
  head_height:    { x: 322, y: 42, side: 'r' },
  trail_arm:      { x: 58, y: 144, side: 'l' },
  spine_angle:    { x: 322, y: 138, side: 'r' },
  hip_hinge:      { x: 322, y: 194, side: 'r' },
  knee_flex:      { x: 322, y: 262, side: 'r' },
}

export function BaselineBody({ baseline, cameraAngle, selectedMetrics }: Props) {
  const entries = Object.entries(baseline)
    .filter(([key]) => !selectedMetrics?.length || selectedMetrics.includes(key))

  if (!entries.length) return null

  const isFO = cameraAngle === 'face_on'

  return (
    <svg viewBox="0 0 440 350" className="w-full max-w-lg" preserveAspectRatio="xMidYMid meet">
      <g stroke="var(--color-muted-foreground)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.18">
        {isFO ? (
          <>
            <line x1={FO.neck[0]} y1={FO.neck[1]} x2={200} y2={FO.lh[1]} />
            <line x1={FO.ls[0]} y1={FO.ls[1]} x2={FO.rs[0]} y2={FO.rs[1]} />
            <polyline points={`${FO.ls[0]},${FO.ls[1]} ${FO.le[0]},${FO.le[1]} ${FO.lw[0]},${FO.lw[1]}`} />
            <polyline points={`${FO.rs[0]},${FO.rs[1]} ${FO.re[0]},${FO.re[1]} ${FO.rw[0]},${FO.rw[1]}`} />
            <line x1={FO.lh[0]} y1={FO.lh[1]} x2={FO.rh[0]} y2={FO.rh[1]} />
            <polyline points={`${FO.lh[0]},${FO.lh[1]} ${FO.lk[0]},${FO.lk[1]} ${FO.la[0]},${FO.la[1]}`} />
            <polyline points={`${FO.rh[0]},${FO.rh[1]} ${FO.rk[0]},${FO.rk[1]} ${FO.ra[0]},${FO.ra[1]}`} />
          </>
        ) : (
          <>
            <polyline points={`${DT.neck[0]},${DT.neck[1]} ${DT.sh[0]},${DT.sh[1]} ${DT.hip[0]},${DT.hip[1]}`} />
            <polyline points={`${DT.sh[0]},${DT.sh[1]} ${DT.el[0]},${DT.el[1]} ${DT.wr[0]},${DT.wr[1]}`} />
            <polyline points={`${DT.hip[0]},${DT.hip[1]} ${DT.kn[0]},${DT.kn[1]} ${DT.an[0]},${DT.an[1]}`} />
          </>
        )}
      </g>

      <circle
        cx={isFO ? 200 : 162} cy={40} r={16}
        fill="var(--color-secondary)" stroke="var(--color-muted-foreground)" strokeWidth="2" opacity="0.2"
      />

      {entries.map(([key, val]) => {
        const dot = DOT[key]
        const lbl = LBL[key]
        if (!dot || !lbl) return null

        const connEnd = lbl.side === 'r' ? lbl.x - 6 : lbl.x + 6
        const anchor = lbl.side === 'r' ? 'start' : 'end'
        const v = val as { mean: number; std?: number }

        return (
          <g key={key}>
            <line
              x1={dot[0]} y1={dot[1]} x2={connEnd} y2={lbl.y}
              stroke="var(--color-ok)" strokeWidth="1" strokeDasharray="3,3" opacity="0.25"
            />
            <circle cx={dot[0]} cy={dot[1]} r={5} fill="var(--color-ok)" opacity="0.65" />
            <text
              x={lbl.x} y={lbl.y - 4}
              textAnchor={anchor} fontSize="11"
              fill="var(--color-muted-foreground)"
            >
              {METRIC_LABELS[key] ?? key}
            </text>
            <text
              x={lbl.x} y={lbl.y + 12}
              textAnchor={anchor} fontSize="14" fontWeight="600"
              fill="var(--color-ok)"
              style={{ fontFamily: 'var(--font-mono, monospace)' }}
            >
              {fmtVal(key, v.mean, v.std)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Swing phase stick figures (hands together + club) ───

// Face-on mini joints — both arms converge to a single grip point
type SwingJointsFO = {
  head: number[]; neck: number[]
  ls: number[]; rs: number[]   // shoulders
  le: number[]; re: number[]   // elbows
  grip: number[]               // both hands together
  club: number[]               // end of club shaft
  lh: number[]; rh: number[]   // hips
  lk: number[]; rk: number[]   // knees
  la: number[]; ra: number[]   // ankles
}

const SWING_FO: Record<SwingPhaseName, SwingJointsFO> = {
  address: {
    head: [60, 18], neck: [60, 32],
    ls: [44, 44], rs: [76, 44],
    le: [42, 64], re: [78, 64],
    grip: [60, 80],
    club: [60, 160],
    lh: [50, 100], rh: [70, 100],
    lk: [48, 136], rk: [72, 136],
    la: [46, 170], ra: [74, 170],
  },
  top: {
    head: [64, 16], neck: [62, 30],
    ls: [44, 42], rs: [80, 38],
    le: [40, 56], re: [90, 26],
    grip: [84, 10],
    club: [36, 6],
    lh: [52, 98], rh: [72, 94],
    lk: [50, 134], rk: [76, 134],
    la: [48, 170], ra: [78, 170],
  },
  impact: {
    head: [56, 16], neck: [58, 30],
    ls: [42, 42], rs: [78, 46],
    le: [38, 60], re: [72, 62],
    grip: [56, 78],
    club: [58, 158],
    lh: [48, 98], rh: [70, 102],
    lk: [44, 136], rk: [72, 138],
    la: [42, 170], ra: [74, 170],
  },
  finish: {
    head: [54, 14], neck: [56, 28],
    ls: [44, 40], rs: [76, 44],
    le: [36, 28], re: [66, 30],
    grip: [28, 10],
    club: [68, 4],
    lh: [48, 98], rh: [68, 102],
    lk: [46, 136], rk: [70, 138],
    la: [48, 172], ra: [72, 172],
  },
}

// DTL mini joints
type SwingJointsDTL = {
  head: number[]; neck: number[]
  sh: number[]                // shoulder
  el: number[]                // elbow (visible arm)
  grip: number[]              // hands
  club: number[]              // end of club
  hip: number[]
  kn: number[]; an: number[]
}

const SWING_DTL: Record<SwingPhaseName, SwingJointsDTL> = {
  address: {
    head: [40, 18], neck: [46, 32],
    sh: [54, 44], el: [48, 64], grip: [44, 80],
    club: [36, 160],
    hip: [66, 100], kn: [60, 136], an: [62, 170],
  },
  top: {
    head: [44, 16], neck: [48, 30],
    sh: [56, 42], el: [58, 24], grip: [50, 8],
    club: [28, 14],
    hip: [66, 98], kn: [60, 134], an: [62, 170],
  },
  impact: {
    head: [38, 16], neck: [44, 30],
    sh: [52, 42], el: [46, 60], grip: [42, 76],
    club: [34, 158],
    hip: [64, 98], kn: [58, 136], an: [60, 170],
  },
  finish: {
    head: [48, 14], neck: [50, 28],
    sh: [56, 40], el: [54, 22], grip: [46, 6],
    club: [68, 12],
    hip: [60, 100], kn: [56, 136], an: [54, 172],
  },
}

const PHASE_ORDER: SwingPhaseName[] = ['address', 'top', 'impact', 'finish']

function MiniSwingFigure({ phase, isFO }: { phase: SwingPhaseName; isFO: boolean }) {
  if (isFO) {
    const j = SWING_FO[phase]
    const hipMid = [(j.lh[0] + j.rh[0]) / 2, j.lh[1]]
    return (
      <svg viewBox="0 0 120 185" className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Club shaft */}
        <line
          x1={j.grip[0]} y1={j.grip[1]} x2={j.club[0]} y2={j.club[1]}
          stroke="var(--color-ok)" strokeWidth="2" strokeLinecap="round" opacity="0.35"
        />
        {/* Body */}
        <g stroke="var(--color-muted-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.4">
          {/* Torso */}
          <line x1={j.neck[0]} y1={j.neck[1]} x2={hipMid[0]} y2={hipMid[1]} />
          {/* Shoulders */}
          <line x1={j.ls[0]} y1={j.ls[1]} x2={j.rs[0]} y2={j.rs[1]} />
          {/* Left arm → grip */}
          <polyline points={`${j.ls[0]},${j.ls[1]} ${j.le[0]},${j.le[1]} ${j.grip[0]},${j.grip[1]}`} />
          {/* Right arm → grip */}
          <polyline points={`${j.rs[0]},${j.rs[1]} ${j.re[0]},${j.re[1]} ${j.grip[0]},${j.grip[1]}`} />
          {/* Hips */}
          <line x1={j.lh[0]} y1={j.lh[1]} x2={j.rh[0]} y2={j.rh[1]} />
          {/* Legs */}
          <polyline points={`${j.lh[0]},${j.lh[1]} ${j.lk[0]},${j.lk[1]} ${j.la[0]},${j.la[1]}`} />
          <polyline points={`${j.rh[0]},${j.rh[1]} ${j.rk[0]},${j.rk[1]} ${j.ra[0]},${j.ra[1]}`} />
        </g>
        {/* Grip dot */}
        <circle cx={j.grip[0]} cy={j.grip[1]} r={3} fill="var(--color-ok)" opacity="0.5" />
        {/* Head */}
        <circle cx={j.head[0]} cy={j.head[1]} r={10}
          fill="var(--color-secondary)" stroke="var(--color-muted-foreground)" strokeWidth="1.5" opacity="0.4"
        />
      </svg>
    )
  }

  const j = SWING_DTL[phase]
  return (
    <svg viewBox="0 0 120 185" className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Club shaft */}
      <line
        x1={j.grip[0]} y1={j.grip[1]} x2={j.club[0]} y2={j.club[1]}
        stroke="var(--color-ok)" strokeWidth="2" strokeLinecap="round" opacity="0.35"
      />
      {/* Body */}
      <g stroke="var(--color-muted-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.4">
        {/* Spine: neck → shoulder → hip */}
        <polyline points={`${j.neck[0]},${j.neck[1]} ${j.sh[0]},${j.sh[1]} ${j.hip[0]},${j.hip[1]}`} />
        {/* Arm → grip */}
        <polyline points={`${j.sh[0]},${j.sh[1]} ${j.el[0]},${j.el[1]} ${j.grip[0]},${j.grip[1]}`} />
        {/* Leg */}
        <polyline points={`${j.hip[0]},${j.hip[1]} ${j.kn[0]},${j.kn[1]} ${j.an[0]},${j.an[1]}`} />
      </g>
      {/* Grip dot */}
      <circle cx={j.grip[0]} cy={j.grip[1]} r={3} fill="var(--color-ok)" opacity="0.5" />
      {/* Head */}
      <circle cx={j.head[0]} cy={j.head[1]} r={10}
        fill="var(--color-secondary)" stroke="var(--color-muted-foreground)" strokeWidth="1.5" opacity="0.4"
      />
    </svg>
  )
}

interface SwingProps {
  baseline: SwingBaseline
  cameraAngle: CameraAngle
  selectedMetrics?: string[]
}

export function SwingPhaseFigures({ baseline, cameraAngle, selectedMetrics }: SwingProps) {
  const isFO = cameraAngle === 'face_on'
  const phases = PHASE_ORDER.filter(p => baseline.phases[p])

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {phases.map(phase => {
        const phaseBaseline = baseline.phases[phase]!
        const entries = Object.entries(phaseBaseline)
          .filter(([key]) => !selectedMetrics?.length || selectedMetrics.includes(key))

        return (
          <div key={phase} className="bg-secondary/50 border border-border rounded-xl p-3 flex flex-col items-center">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              {PHASE_LABELS[phase]}
            </p>
            <div className="w-full max-w-[140px]">
              <MiniSwingFigure phase={phase} isFO={isFO} />
            </div>
            <div className="flex flex-col gap-1 mt-2 w-full">
              {entries.map(([key, val]) => (
                <div key={key} className="flex items-baseline justify-between gap-1 text-xs">
                  <span className="text-muted-foreground truncate">{METRIC_LABELS[key] ?? key}</span>
                  <span className="text-ok font-mono font-semibold shrink-0">
                    {fmtVal(key, val.mean, val.std)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
