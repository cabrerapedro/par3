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

// Single Supabase client for both auth and data.
//
// History: an earlier version used `flowType: 'implicit'`, a no-op Web Locks
// override, and a second `authClient` for login (transferring the session to
// this client via a fire-and-forget `setSession`). That combination broke
// token auto-refresh on iOS WebKit (Safari, and Chrome-on-iOS which is also
// WebKit): the access token would expire after ~1h and never refresh, so every
// request went out with an invalid JWT → 401 → no reads, no writes on the
// phone while the desktop kept working.
//
// The fix is the standard, boring setup:
// - flowType 'pkce' (robust refresh-token handling; the modern default)
// - default Web Locks (serializes concurrent refreshes so two tabs/calls don't
//   race and invalidate each other's refresh token — the actual iOS bug)
// - one client, used for login AND queries, so the session is set + persisted
//   atomically with no cross-client transfer race.
export const supabase = createClient(url, key, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  global: { fetch: withStudentHeader },
})
