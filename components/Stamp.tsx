import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type StampKind = 'default' | 'fill' | 'ink' | 'outline'

interface StampProps {
  children: React.ReactNode
  kind?: StampKind
  className?: string
}

const KIND_TO_VARIANT = {
  default: 'stamp',
  fill:    'stamp-fill',
  ink:     'stamp-ink',
  outline: 'stamp-outline',
} as const

export function Stamp({ children, kind = 'default', className }: StampProps) {
  return (
    <Badge variant={KIND_TO_VARIANT[kind]} className={cn(className)}>
      {children}
    </Badge>
  )
}
