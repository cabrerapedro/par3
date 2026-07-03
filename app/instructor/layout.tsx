'use client'

import { usePathname } from 'next/navigation'
import { InstructorShell } from '@/components/InstructorShell'

// Only the top-level sections get the nav shell. Detail pages (student profile,
// edit, import, clip capture/annotate) and login render bare — they keep their
// own focused back-header. Keep this list in sync with SECTIONS in
// InstructorShell (plus any section sub-routes that should show the chrome).
const SHELL_PATHS = [
  '/instructor/today',
  '/instructor/dashboard',
  '/instructor/messages',
  '/instructor/campaigns',
  '/instructor/stats',
  '/instructor/library',
]

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const useShell = SHELL_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))

  if (!useShell) return <>{children}</>
  return <InstructorShell>{children}</InstructorShell>
}
