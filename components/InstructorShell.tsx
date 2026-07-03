'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { UserMenu } from '@/components/UserMenu'
import { Wordmark } from '@/components/Wordmark'
import { cn } from '@/lib/utils'

// The instructor app shell: a two-mode responsive chrome.
//   - Desktop (office mode): fixed left sidebar with the sections.
//   - iPad/phone (class mode): top bar + a thumb-friendly bottom tab bar.
// Wraps only the top-level section routes (see app/instructor/layout.tsx);
// detail/capture pages render bare with their own back header.

type IconProps = { className?: string }

// Section = { href, label key, icon }. `sidebarOnly` sections show on the
// desktop sidebar (office mode) but not the mobile tab bar (class mode).
const SECTIONS: { key: string; href: string; sidebarOnly?: boolean; Icon: (p: IconProps) => React.ReactElement }[] = [
  {
    key: 'today', href: '/instructor/today',
    Icon: ({ className }) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    key: 'students', href: '/instructor/dashboard',
    Icon: ({ className }) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    key: 'messages', href: '/instructor/messages',
    Icon: ({ className }) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
  },
  {
    key: 'campaigns', href: '/instructor/campaigns',
    Icon: ({ className }) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" />
      </svg>
    ),
  },
  {
    key: 'stats', href: '/instructor/stats',
    Icon: ({ className }) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    key: 'library', href: '/instructor/library', sidebarOnly: true,
    Icon: ({ className }) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
]

export function InstructorShell({ children }: { children: React.ReactNode }) {
  const { instructor, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations('instructor.nav')

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const onLogout = () => { logout(); router.replace('/') }

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* ---------- Desktop sidebar ---------- */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-30 w-60 flex-col border-r border-rule bg-paper">
        <div className="h-14 flex items-center px-5 border-b border-rule">
          <Link href="/instructor/dashboard" aria-label="Forat — inicio"><Wordmark size="md" /></Link>
        </div>
        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
          {SECTIONS.map(({ key, href, Icon }) => (
            <Link
              key={key}
              href={href}
              className={cn(
                'group flex items-center gap-3 h-11 px-3 rounded-md transition-colors',
                isActive(href)
                  ? 'bg-ink/[0.06] text-ink font-medium'
                  : 'text-ink-mute hover:text-ink hover:bg-ink/[0.03]'
              )}
            >
              <Icon className={cn('shrink-0', isActive(href) ? 'text-accent' : 'text-ink-mute group-hover:text-ink')} />
              <span className="text-sm">{t(key)}</span>
            </Link>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-rule">
          {instructor && (
            <UserMenu
              name={instructor.name} email={instructor.email} role="instructor"
              profileHref="/instructor/profile" onLogout={onLogout} variant="bar"
            />
          )}
        </div>
      </aside>

      {/* ---------- Mobile/iPad top bar ---------- */}
      <header className="md:hidden sticky top-0 z-30 bg-paper/95 backdrop-blur border-b border-rule">
        <div className="h-14 flex items-center justify-between px-4">
          <Link href="/instructor/dashboard" aria-label="Forat — inicio"><Wordmark size="md" /></Link>
          {instructor && (
            <UserMenu
              name={instructor.name} email={instructor.email} role="instructor"
              profileHref="/instructor/profile" onLogout={onLogout}
            />
          )}
        </div>
      </header>

      {/* ---------- Content ---------- */}
      {/* pb-24 leaves room for the bottom tab bar on mobile. */}
      <main className="md:ml-60 min-h-screen pb-24 md:pb-0">{children}</main>

      {/* ---------- Mobile/iPad bottom tab bar ---------- */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-paper/95 backdrop-blur border-t border-rule">
        <div className="flex items-stretch">
          {SECTIONS.filter(s => !s.sidebarOnly).map(({ key, href, Icon }) => (
            <Link
              key={key}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] transition-colors',
                isActive(href) ? 'text-ink' : 'text-ink-mute'
              )}
            >
              <Icon className={cn(isActive(href) && 'text-accent')} />
              <span className="text-[10px] leading-none small-caps font-mono">{t(key)}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}
