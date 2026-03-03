'use client'

import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface UserMenuProps {
  name: string
  email?: string
  role: 'instructor' | 'student'
  avatarUrl?: string
  onLogout: () => void
  profileHref?: string
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export function UserMenu({ name, email, role, avatarUrl, onLogout, profileHref }: UserMenuProps) {
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
                  {email ?? (isInstructor ? 'Instructor' : 'Alumno')}
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
                    Mi perfil
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuItem
            className="flex items-center gap-2 text-muted-foreground focus:text-foreground cursor-pointer"
            onClick={() => setConfirmOpen(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>¿Cerrar sesión?</DialogTitle>
            <DialogDescription>
              Podés volver a entrar en cualquier momento.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              className="flex-1 border-border"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={onLogout}
              className="flex-1"
            >
              Salir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
