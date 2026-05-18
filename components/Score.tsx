import { cn } from '@/lib/utils'

/**
 * Score notation display.
 * E = matches baseline (par). Negative is theoretically possible but
 * uncommon. +N means N units off baseline (higher = worse).
 *
 * Accepts either a string ("E", "+1", "+3", "—") or a number deviation
 * from baseline.
 */
interface ScoreProps {
  value: string | number | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZE_CLASSES = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
  xl: 'text-3xl',
}

export function Score({ value, size = 'md', className }: ScoreProps) {
  const label = formatScore(value)
  const color = scoreColor(label)
  return (
    <span
      className={cn('font-mono font-medium tabular-nums leading-none', SIZE_CLASSES[size], className)}
      style={{ color }}
    >
      {label}
    </span>
  )
}

export function formatScore(value: string | number | null): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  if (value === 0) return 'E'
  if (value > 0) return `+${value}`
  return String(value)
}

export function scoreColor(label: string): string {
  if (label === '—') return 'var(--color-ink-mute)'
  if (label === 'E')  return 'var(--color-ok)'
  if (label === '+1') return 'var(--color-warn)'
  // anything else (+2, +3, +5, negative) = bad zone
  return 'var(--color-bad)'
}
