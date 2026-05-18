import { cn } from '@/lib/utils'

interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZES = {
  sm: { font: 16, dot: 4, gap: 2, mb: 1 },
  md: { font: 22, dot: 5.5, gap: 3, mb: 2 },
  lg: { font: 44, dot: 10, gap: 6, mb: 3 },
  xl: { font: 76, dot: 16, gap: 10, mb: 6 },
}

export function Wordmark({ size = 'md', className }: WordmarkProps) {
  const s = SIZES[size]
  return (
    <span className={cn('inline-flex items-baseline font-display font-semibold tracking-tight text-foreground leading-none', className)} style={{ fontSize: s.font }}>
      parell
      <span
        aria-hidden
        className="inline-block rounded-full bg-accent"
        style={{ width: s.dot, height: s.dot, marginLeft: s.gap, marginBottom: s.mb }}
      />
    </span>
  )
}
