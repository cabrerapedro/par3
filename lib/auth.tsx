'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase, authClient } from './supabase'
import type { Instructor, Student } from './types'

type StudentUpdates = Partial<Pick<Student, 'name' | 'email' | 'avatar_url' | 'handicap' | 'dominant_hand' | 'years_playing' | 'home_course' | 'bio'>>

interface AuthState {
  instructor: Instructor | null
  student: Student | null
  loading: boolean
  instructorLogin: (email: string, password: string) => Promise<{ error?: string }>
  instructorSignup: (email: string, password: string, name: string) => Promise<{ error?: string }>
  updateInstructor: (name: string) => Promise<{ error?: string }>
  studentLogin: (code: string) => Promise<{ error?: string }>
  studentOtpRequest: (email: string) => Promise<{ error?: string }>
  studentOtpVerify: (email: string, code: string) => Promise<{ error?: string }>
  updateStudent: (updates: StudentUpdates) => Promise<{ error?: string }>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [instructor, setInstructor] = useState<Instructor | null>(null)
  const [student, setStudent] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. Instant hydration from localStorage — no network.
    try {
      const s = localStorage.getItem('sweep_student')
      if (s) setStudent(JSON.parse(s))
    } catch {}
    try {
      const i = localStorage.getItem('sweep_instructor')
      if (i) setInstructor(JSON.parse(i))
    } catch {}
    setLoading(false)

    // 2. Background sync — onAuthStateChange fires after Supabase init.
    let mounted = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (event === 'SIGNED_OUT') {
        setInstructor(null)
        localStorage.removeItem('sweep_instructor')
        return
      }
      if (session?.user && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        // Must use setTimeout — awaiting Supabase calls inside this callback deadlocks.
        // See: https://supabase.com/docs/reference/javascript/auth-onauthstatechange
        const userId = session.user.id
        setTimeout(async () => {
          if (!mounted) return
          try {
            const { data } = await supabase.from('instructors').select('*').eq('id', userId).single()
            if (data && mounted) cacheInstructor(data)
          } catch {}
        }, 0)
      }
    })

    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  function cacheInstructor(data: Instructor) {
    setInstructor(data)
    localStorage.setItem('sweep_instructor', JSON.stringify(data))
  }

  async function instructorLogin(email: string, password: string): Promise<{ error?: string }> {
    // authClient has no persisted session → no blocking on stale token refresh.
    const { data, error } = await authClient.auth.signInWithPassword({ email, password })
    if (error) return { error: 'Correo o contraseña incorrectos.' }

    // Fetch instructor using authClient (it has the fresh session in memory).
    if (data.user) {
      try {
        const { data: inst } = await authClient.from('instructors').select('*').eq('id', data.user.id).single()
        if (inst) cacheInstructor(inst)
      } catch {}
    }

    // Transfer session to main client in background (for RLS on subsequent pages).
    if (data.session) {
      supabase.auth.setSession(data.session).catch(() => {})
    }

    return {}
  }

  async function instructorSignup(email: string, password: string, name: string): Promise<{ error?: string }> {
    const { data, error } = await authClient.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    if (error) return { error: error.message }
    if (!data.user) return { error: 'Error al crear cuenta.' }
    if (!data.session) {
      return { error: 'Revisa tu correo para confirmar la cuenta. Después iniciá sesión normalmente.' }
    }

    // Fetch or create instructor record using authClient.
    const userId = data.user.id
    let inst = null
    try {
      const { data: found } = await authClient.from('instructors').select('*').eq('id', userId).single()
      inst = found
    } catch {}

    if (!inst) {
      try {
        await authClient.from('instructors').insert({ id: userId, name, email })
      } catch {}
      inst = { id: userId, name, email, created_at: new Date().toISOString() }
    }
    cacheInstructor(inst as Instructor)

    // Transfer session to main client in background.
    supabase.auth.setSession(data.session).catch(() => {})

    return {}
  }

  async function updateInstructor(name: string): Promise<{ error?: string }> {
    if (!instructor) return { error: 'No hay sesión activa.' }
    const { data, error } = await supabase
      .from('instructors')
      .update({ name })
      .eq('id', instructor.id)
      .select()
      .single()
    if (error) return { error: 'Error al actualizar el perfil.' }
    if (data) cacheInstructor(data)
    return {}
  }

  async function studentLogin(code: string): Promise<{ error?: string }> {
    const clean = code.trim().toUpperCase()
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('access_code', clean)
      .single()

    if (error || !data) return { error: 'Código incorrecto. Verifica con tu instructor.' }

    localStorage.setItem('sweep_student', JSON.stringify(data))
    setStudent(data)
    return {}
  }

  async function studentOtpRequest(email: string): Promise<{ error?: string }> {
    try {
      const res = await fetch('/api/student/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      if (!res.ok) return { error: 'Error al enviar el código.' }
      return {}
    } catch {
      return { error: 'Error de conexión.' }
    }
  }

  async function studentOtpVerify(email: string, code: string): Promise<{ error?: string }> {
    try {
      const res = await fetch('/api/student/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
      })
      const data = await res.json()
      if (!res.ok || data.error) return { error: data.error || 'Código incorrecto o expirado.' }
      if (data.student) {
        localStorage.setItem('sweep_student', JSON.stringify(data.student))
        setStudent(data.student)
      }
      return {}
    } catch {
      return { error: 'Error de conexión.' }
    }
  }

  async function updateStudent(updates: StudentUpdates): Promise<{ error?: string }> {
    if (!student) return { error: 'No hay sesión activa.' }
    const { data, error } = await supabase
      .from('students')
      .update(updates)
      .eq('id', student.id)
      .select()
      .single()
    if (error) return { error: 'Error al actualizar el perfil.' }
    if (data) {
      const updated = { ...student, ...data }
      localStorage.setItem('sweep_student', JSON.stringify(updated))
      setStudent(updated)
    }
    return {}
  }

  function logout() {
    localStorage.removeItem('sweep_student')
    localStorage.removeItem('sweep_instructor')
    setInstructor(null)
    setStudent(null)
    supabase.auth.signOut().catch(() => {})
  }

  return (
    <AuthContext.Provider value={{ instructor, student, loading, instructorLogin, instructorSignup, updateInstructor, studentLogin, studentOtpRequest, studentOtpVerify, updateStudent, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
