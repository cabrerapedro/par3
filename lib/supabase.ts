import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(url, key, {
  auth: {
    flowType: 'implicit',   // Avoids PKCE Web Lock contention in Next.js dev mode
    persistSession: true,
    autoRefreshToken: true,
  },
})
