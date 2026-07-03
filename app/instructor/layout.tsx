'use client'

import { usePathname } from 'next/navigation'
import { InstructorShell } from '@/components/InstructorShell'

// Top-level sections get the nav shell. The student detail page (/students/{id})
// also gets it so the sidebar stays put — but NOT the new/import forms or the
// deeper clip capture/annotate flows, which stay bare (own focused back-header),
// nor login. Keep SHELL_PATHS in sync with SECTIONS in InstructorShell.
const SHELL_PATHS = [
  '/instructor/today',
  '/instructor/dashboard',
  '/instructor/messages',
  '/instructor/campaigns',
  '/instructor/stats',
  '/instructor/library',
]

// /instructor/students/{id} exactly — a single segment that isn't a named form.
function isStudentDetail(pathname: string): boolean {
  const m = pathname.match(/^\/instructor\/students\/([^/]+)$/)
  return !!m && m[1] !== 'new' && m[1] !== 'import'
}

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const useShell = isStudentDetail(pathname) || SHELL_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))

  if (!useShell) return <>{children}</>
  return <InstructorShell>{children}</InstructorShell>
}
