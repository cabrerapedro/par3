'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, setStudentAccessCode } from './supabase'
import type { Instructor, Locale, Student } from './types'

type StudentUpdates = Partial<Pick<Student, 'name' | 'email' | 'avatar_url' | 'handicap' | 'dominant_hand' | 'years_playing' | 'home_course' | 'bio'>>

const LOCALE_COOKIE = 'NEXT_LOCALE'
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year
const SUPPORTED_LOCALES: Locale[] = ['es', 'en']

function readLocaleCookie(): Locale | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/)
  const value = match?.[1]
  return SUPPORTED_LOCALES.includes(value as Locale) ? (value as Locale) : null
}

function writeLocaleCookie(locale: Locale) {
  if (typeof document === 'undefined') return
  document.cookie = `${LOCALE_COOKIE}=${locale}; max-age=${LOCALE_COOKIE_MAX_AGE}; path=/; samesite=lax`
}

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
  setLocale: (locale: Locale) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [instructor, setInstructor] = useState<Instructor | null>(null)
  const [student, setStudent] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // One-time migration of pre-Forat keys (sweep_*, parell_*) so existing
    // logged-in users don't get force-logged-out by the rebrand. Drop later.
    try {
      const migrate = (target: string, legacyKeys: string[]) => {
        if (localStorage.getItem(target)) return
        for (const k of legacyKeys) {
          const v = localStorage.getItem(k)
          if (v) { localStorage.setItem(target, v); localStorage.removeItem(k); break }
        }
      }
      migrate('forat_student', ['parell_student', 'sweep_student'])
      migrate('forat_instructor', ['parell_instructor', 'sweep_instructor'])
    } catch {}

    // 1. Instant hydration from localStorage — no network.
    try {
      const s = localStorage.getItem('forat_student')
      if (s) {
        const parsed = JSON.parse(s) as Student
        setStudent(parsed)
        // Sync the supabase client header so post-hydration queries hit
        // RLS as the right student (B3 fix).
        setStudentAccessCode(parsed.access_code ?? null)
      }
    } catch {}
    try {
      const i = localStorage.getItem('forat_instructor')
      if (i) setInstructor(JSON.parse(i))
    } catch {}
    setLoading(false)

    // 2. Background sync — onAuthStateChange fires after Supabase init.
    let mounted = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (event === 'SIGNED_OUT') {
        setInstructor(null)
        localStorage.removeItem('forat_instructor')
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
            if (data && mounted) {
              cacheInstructor(data)
              syncLocaleFromDb(data.preferred_locale)
            }
          } catch {}
        }, 0)
      }
    })

    return () => { mounted = false; subscription.unsubscribe() }
    // Mount-once: hydrate from localStorage and subscribe to auth changes.
    // syncLocaleFromDb is intentionally not a dep (would re-subscribe per render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function cacheInstructor(data: Instructor) {
    setInstructor(data)
    localStorage.setItem('forat_instructor', JSON.stringify(data))
  }

  // After fetching the user from DB, if their preferred_locale doesn't match the
  // cookie (e.g. they logged in from a new browser with a different language),
  // overwrite the cookie and refresh server components so the UI flips immediately.
  function syncLocaleFromDb(dbLocale?: Locale | null) {
    if (!dbLocale || !SUPPORTED_LOCALES.includes(dbLocale)) return
    if (readLocaleCookie() === dbLocale) return
    writeLocaleCookie(dbLocale)
    router.refresh()
  }

  async function instructorLogin(email: string, password: string): Promise<{ error?: string }> {
    // Single client: signInWithPassword sets AND persists the session here, so
    // every later query/CRUD runs authenticated with a refreshable token. No
    // second client, no fire-and-forget setSession, no race (the iOS bug).
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: 'invalidCredentials' }

    if (data.user) {
      try {
        const { data: inst } = await supabase.from('instructors').select('*').eq('id', data.user.id).single()
        if (inst) {
          cacheInstructor(inst)
          syncLocaleFromDb(inst.preferred_locale)
        }
      } catch {}
    }

    return {}
  }

  async function instructorSignup(email: string, password: string, name: string): Promise<{ error?: string }> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    if (error) return { error: error.message }
    if (!data.user) return { error: 'signupGeneric' }
    if (!data.session) {
      return { error: 'confirmEmail' }
    }

    // Capture the auto-detected locale of the user at signup time and persist
    // it on the new instructor row, so subsequent logins from any device pick
    // up the same preference.
    const cookieLocale = readLocaleCookie() ?? 'es'
    const userId = data.user.id
    let inst: Instructor | null = null
    try {
      const { data: found } = await supabase.from('instructors').select('*').eq('id', userId).single()
      inst = found
    } catch {}

    if (!inst) {
      try {
        await supabase.from('instructors').insert({
          id: userId,
          name,
          email,
          preferred_locale: cookieLocale,
        })
      } catch {}
      inst = {
        id: userId,
        name,
        email,
        preferred_locale: cookieLocale,
        created_at: new Date().toISOString(),
      }
    } else if (!inst.preferred_locale) {
      // Existing row without a locale set (legacy data) — backfill it.
      try {
        await supabase
          .from('instructors')
          .update({ preferred_locale: cookieLocale })
          .eq('id', userId)
        inst = { ...inst, preferred_locale: cookieLocale }
      } catch {}
    }
    cacheInstructor(inst)
    syncLocaleFromDb(inst.preferred_locale)

    return {}
  }

  async function updateInstructor(name: string): Promise<{ error?: string }> {
    if (!instructor) return { error: 'noSession' }
    const { data, error } = await supabase
      .from('instructors')
      .update({ name })
      .eq('id', instructor.id)
      .select()
      .single()
    if (error) return { error: 'profileUpdate' }
    if (data) cacheInstructor(data)
    return {}
  }

  async function studentLogin(code: string): Promise<{ error?: string }> {
    const clean = code.trim().toUpperCase()
    // Login goes through an RPC (security definer) so the anon
    // students-select policy can be tightened to "id = current_student_id()"
    // and the access_code can't be enumerated by scanning UUIDs (B3 fix).
    const { data, error } = await supabase.rpc('login_student', { code: clean })

    const row = Array.isArray(data) ? data[0] : data
    if (error || !row) return { error: 'wrongCode' }

    localStorage.setItem('forat_student', JSON.stringify(row))
    setStudent(row)
    setStudentAccessCode(row.access_code ?? null)
    syncLocaleFromDb(row.preferred_locale)
    return {}
  }

  async function studentOtpRequest(email: string): Promise<{ error?: string }> {
    try {
      const res = await fetch('/api/student/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      if (!res.ok) return { error: 'otpSendFailed' }
      return {}
    } catch {
      return { error: 'connection' }
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
      if (!res.ok || data.error) return { error: data.error || 'otpInvalid' }
      if (data.student) {
        localStorage.setItem('forat_student', JSON.stringify(data.student))
        setStudent(data.student)
        setStudentAccessCode(data.student.access_code ?? null)
        syncLocaleFromDb(data.student.preferred_locale)
      }
      return {}
    } catch {
      return { error: 'connection' }
    }
  }

  async function updateStudent(updates: StudentUpdates): Promise<{ error?: string }> {
    if (!student) return { error: 'noSession' }
    const { data, error } = await supabase
      .from('students')
      .update(updates)
      .eq('id', student.id)
      .select()
      .single()
    if (error) return { error: 'profileUpdate' }
    if (data) {
      const updated = { ...student, ...data }
      localStorage.setItem('forat_student', JSON.stringify(updated))
      setStudent(updated)
    }
    return {}
  }

  // Switch the UI language. Writes the cookie so the next render picks it up,
  // persists to the logged-in user's DB row (best-effort), and refreshes server
  // components so the whole tree re-renders in the new locale.
  async function setLocale(locale: Locale): Promise<void> {
    if (!SUPPORTED_LOCALES.includes(locale)) return
    writeLocaleCookie(locale)

    if (instructor) {
      try {
        const { data } = await supabase
          .from('instructors')
          .update({ preferred_locale: locale })
          .eq('id', instructor.id)
          .select()
          .single()
        if (data) cacheInstructor(data)
      } catch {}
    } else if (student) {
      try {
        const { data } = await supabase
          .from('students')
          .update({ preferred_locale: locale })
          .eq('id', student.id)
          .select()
          .single()
        if (data) {
          const updated = { ...student, ...data }
          localStorage.setItem('forat_student', JSON.stringify(updated))
          setStudent(updated)
        }
      } catch {}
    }

    router.refresh()
  }

  function logout() {
    localStorage.removeItem('forat_student')
    localStorage.removeItem('forat_instructor')
    setStudentAccessCode(null)
    setInstructor(null)
    setStudent(null)
    supabase.auth.signOut().catch(() => {})
  }

  return (
    <AuthContext.Provider value={{ instructor, student, loading, instructorLogin, instructorSignup, updateInstructor, studentLogin, studentOtpRequest, studentOtpVerify, updateStudent, setLocale, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
