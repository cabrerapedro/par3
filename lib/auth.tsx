'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from './supabase'
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
  updateStudent: (updates: StudentUpdates) => Promise<{ error?: string }>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [instructor, setInstructor] = useState<Instructor | null>(null)
  const [student, setStudent] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Load student from localStorage
    try {
      const stored = localStorage.getItem('par3_student')
      if (stored) setStudent(JSON.parse(stored))
    } catch {}

    // Load instructor from Supabase session
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (session?.user) {
          try { await loadInstructor(session.user.id) } catch {}
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await loadInstructor(session.user.id)
      } else {
        setInstructor(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadInstructor(userId: string) {
    try {
      const { data } = await supabase.from('instructors').select('*').eq('id', userId).single()
      if (data) { setInstructor(data); return data }

      // No record yet — create it using auth user metadata
      const { data: authData } = await supabase.auth.getUser()
      const user = authData?.user
      if (!user) return null

      const name = (user.user_metadata?.name as string) || user.email?.split('@')[0] || 'Instructor'
      const email = user.email || ''
      const { data: created } = await supabase
        .from('instructors')
        .insert({ id: userId, name, email })
        .select()
        .single()

      if (created) { setInstructor(created); return created }
    } catch (e) {
      console.error('loadInstructor:', e)
    }
    return null
  }

  async function instructorLogin(email: string, password: string): Promise<{ error?: string }> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: 'Correo o contraseña incorrectos.' }
    return {}
  }

  async function instructorSignup(email: string, password: string, name: string): Promise<{ error?: string }> {
    // Pass name as metadata — the DB trigger uses it to auto-create the instructor record
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    if (error) return { error: error.message }
    if (!data.user) return { error: 'Error al crear cuenta.' }

    // If Supabase requires email confirmation, session is null until confirmed
    if (!data.session) {
      return { error: 'Revisa tu correo para confirmar la cuenta. Después iniciá sesión normalmente.' }
    }

    // Trigger may have already created the record; try to load, otherwise insert manually
    const existing = await loadInstructor(data.user.id)
    if (!existing) {
      await supabase.from('instructors').insert({ id: data.user.id, name, email })
      setInstructor({ id: data.user.id, name, email, created_at: new Date().toISOString() })
    }
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
    if (data) setInstructor(data)
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

    localStorage.setItem('par3_student', JSON.stringify(data))
    setStudent(data)
    return {}
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
      localStorage.setItem('par3_student', JSON.stringify(updated))
      setStudent(updated)
    }
    return {}
  }

  function logout() {
    supabase.auth.signOut()
    localStorage.removeItem('par3_student')
    setInstructor(null)
    setStudent(null)
  }

  return (
    <AuthContext.Provider value={{ instructor, student, loading, instructorLogin, instructorSignup, updateInstructor, studentLogin, updateStudent, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
