'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import type { Locale } from '@/lib/types'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface UserMenuProps {
  name: string
  email?: string
  role: 'instructor' | 'student'
  avatarUrl?: string
  onLogout: () => void
  profileHref?: string
  // 'avatar' = compact circle (top bars). 'bar' = full-width row with the name
  // (desktop sidebar) so it clearly reads as "your account" for older users.
  variant?: 'avatar' | 'bar'
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export function UserMenu({ name, email, role, avatarUrl, onLogout, profileHref, variant = 'avatar' }: UserMenuProps) {
  const t = useTranslations('userMenu')
  const tLang = useTranslations('language')
  const tTheme = useTranslations('components.themeToggle')
  const locale = useLocale() as Locale
  const { setLocale } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const isInstructor = role === 'instructor'

  const avatarCn = isInstructor
    ? 'bg-ok/10 text-ok border-ok/20'
    : 'bg-blue/10 text-blue border-blue/20'

  const ringCn = isInstructor
    ? 'hover:ring-ok/30'
    : 'hover:ring-blue/30'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {variant === 'bar' ? (
            <button className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md border border-rule hover:bg-ink/[0.03] transition-colors text-left outline-none">
              <Avatar className="size-8 shrink-0">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={name} className="object-cover" />}
                <AvatarFallback className={cn('text-xs font-bold border', avatarCn)}>
                  {initials(name)}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">{name}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          ) : (
            <button className={cn(
              'rounded-full outline-none ring-offset-2 ring-offset-background transition-all hover:ring-2',
              ringCn
            )}>
              <Avatar className="size-8">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={name} className="object-cover" />}
                <AvatarFallback className={cn('text-xs font-bold border', avatarCn)}>
                  {initials(name)}
                </AvatarFallback>
              </Avatar>
            </button>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          {/* Identity header */}
          <DropdownMenuLabel className="font-normal p-0">
            <div className="flex items-center gap-3 px-3 py-3">
              <Avatar className="size-9 shrink-0">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={name} className="object-cover" />}
                <AvatarFallback className={cn('text-sm font-bold border', avatarCn)}>
                  {initials(name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-foreground truncate">{name}</span>
                <span className="text-xs text-muted-foreground truncate">
                  {email ?? (isInstructor ? t('instructorRole') : t('studentRole'))}
                </span>
              </div>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          {profileHref && (
            <>
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link href={profileHref} className="flex items-center gap-2 cursor-pointer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
                    </svg>
                    {t('profile')}
                  </Link>
                </DropdownMenuItem>
                {isInstructor && (
                  <DropdownMenuItem asChild>
                    <Link href="/instructor/library" className="flex items-center gap-2 cursor-pointer">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                      {t('library')}
                    </Link>
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}

          {/* Appearance — light/dark, labeled (clearer than a naked icon) */}
          <DropdownMenuItem
            onSelect={e => { e.preventDefault(); toggleTheme() }}
            className="flex items-center gap-2 cursor-pointer"
          >
            {theme === 'dark' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            )}
            {theme === 'dark' ? tTheme('switchToLight') : tTheme('switchToDark')}
          </DropdownMenuItem>

          {/* Language submenu */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              {tLang('label')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={locale}
                onValueChange={(value) => { void setLocale(value as Locale) }}
              >
                <DropdownMenuRadioItem value="es">{tLang('es')}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="en">{tLang('en')}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="flex items-center gap-2 text-muted-foreground focus:text-foreground cursor-pointer"
            onClick={() => setConfirmOpen(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {t('logout')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{t('logoutConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('logoutConfirmDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              className="flex-1 border-border"
            >
              {t('logoutConfirmCancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={onLogout}
              className="flex-1"
            >
              {t('logoutConfirmAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
