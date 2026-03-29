/**
 * OneEuro Filter — adaptive low-pass filter for pose landmark smoothing.
 * Smooth when still (eliminates jitter), responsive when moving.
 * Standard algorithm used in professional motion capture systems.
 *
 * Reference: Casiez et al., "1€ Filter: A Simple Speed-based Low-pass Filter
 * for Noisy Input in Interactive Systems", CHI 2012.
 */

import type { Landmark } from './types'

const MIN_CUTOFF = 0.8  // lower = smoother when still
const BETA = 0.4        // higher = more responsive to fast movement
const D_CUTOFF = 1.0

function smoothingFactor(te: number, cutoff: number): number {
  const r = 2 * Math.PI * cutoff * te
  return r / (r + 1)
}

export interface OneEuroState {
  x: number[]
  dx: number[]
  lastTime: number
  initialized: boolean
}

export function createOneEuroState(): OneEuroState {
  return { x: [], dx: [], lastTime: 0, initialized: false }
}

function filterValues(state: OneEuroState, values: number[], timestamp: number): number[] {
  if (!state.initialized || !state.x.length) {
    state.x = [...values]
    state.dx = values.map(() => 0)
    state.lastTime = timestamp
    state.initialized = true
    return values
  }

  const te = Math.max(timestamp - state.lastTime, 1e-6)
  state.lastTime = timestamp

  const aD = smoothingFactor(te, D_CUTOFF)
  return values.map((v, i) => {
    const dx = aD * ((v - state.x[i]) / te) + (1 - aD) * (state.dx[i] ?? 0)
    state.dx[i] = dx
    const cutoff = MIN_CUTOFF + BETA * Math.abs(dx)
    const a = smoothingFactor(te, cutoff)
    const out = a * v + (1 - a) * state.x[i]
    state.x[i] = out
    return out
  })
}

export function filterLandmarks(state: OneEuroState, landmarks: Landmark[], time: number): Landmark[] {
  const flat = landmarks.flatMap(lm => [lm.x, lm.y, lm.z])
  const filtered = filterValues(state, flat, time)
  return landmarks.map((lm, i) => ({
    x: filtered[i * 3],
    y: filtered[i * 3 + 1],
    z: filtered[i * 3 + 2],
    visibility: lm.visibility,
  }))
}
