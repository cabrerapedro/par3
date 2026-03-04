import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

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
})

// Lightweight client for login/signup — no session persistence means
// no initializePromise blocking on stale token refresh.
export const authClient = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})
