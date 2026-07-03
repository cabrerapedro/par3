import { cn } from '@/lib/utils'

interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZES = { sm: 16, md: 22, lg: 44, xl: 76 }

export function Wordmark({ size = 'md', className }: WordmarkProps) {
  return (
    <span className={cn('font-display font-semibold tracking-tight text-foreground leading-none', className)} style={{ fontSize: SIZES[size] }}>
      forat
    </span>
  )
}
