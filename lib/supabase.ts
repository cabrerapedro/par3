import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ---------------------------------------------------------------------------
// Student access-code header injection (B3 fix).
//
// Student auth lives in localStorage — there is no Supabase JWT for a student.
// To still get per-tenant isolation via RLS we send the student's
// `access_code` on every request as `x-student-access-code`. A Postgres
// function (`current_student_id()`, defined in schema.sql) reads that
// header, resolves it to a student row, and the anon-SELECT policies all
// filter `student_id = current_student_id()`.
//
// We mutate a module-level token and pass it through a custom `fetch`
// wrapper so the supabase client stays a singleton and existing
// `import { supabase }` callers don't need to change. The token is set on
// student login (lib/auth.tsx) and cleared on logout.
// ---------------------------------------------------------------------------

let studentAccessCode: string | null = null

export function setStudentAccessCode(code: string | null) {
  studentAccessCode = code
}

function withStudentHeader(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers ?? {})
  if (studentAccessCode) headers.set('x-student-access-code', studentAccessCode)
  return fetch(input, { ...init, headers })
}

export const supabase = createClient(url, key, {
  auth: {
    flowType: 'implicit',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    // Bypass Web Locks to prevent deadlocks in PWA/single-device context.
    // Trade-off: no cross-tab auth sync — acceptable for our use case.
    lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
      return await fn()
    },
  },
  global: { fetch: withStudentHeader },
})

// Lightweight client for login/signup — no session persistence means
// no initializePromise blocking on stale token refresh.
// (No student header on this one — instructors auth via Supabase JWT.)
export const authClient = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})
