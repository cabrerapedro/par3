import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Passwordless instructor login by access code — same UX as the student code.
//
// Flow: the client posts the code → we look up the instructor SERVER-SIDE
// with the service role (instructors has no anon SELECT, so codes can't be
// enumerated from the client) → we mint a one-time magic-link token for that
// instructor's email via the admin API → the client exchanges its hash with
// supabase.auth.verifyOtp() for a REAL authenticated session. Every RLS
// policy keyed on auth.uid() keeps working; no password involved, and no
// email is actually sent.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

export async function POST(req: Request) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'not_configured' }, { status: 500 })
    }

    const { code } = (await req.json()) as { code?: string }
    const normalized = (code ?? '').trim().toUpperCase()
    // 8 chars from the unambiguous alphabet (see generateInstructorCode).
    if (!/^[A-Z2-9]{8}$/.test(normalized)) {
      return NextResponse.json({ error: 'invalid_code' }, { status: 401 })
    }

    // Constant small delay: keeps a brute-force loop slow without punishing
    // the one legitimate try. The 32^8 code space does the real work.
    await new Promise((r) => setTimeout(r, 300))

    const { data: instructor } = await supabaseAdmin
      .from('instructors')
      .select('id, email')
      .eq('access_code', normalized)
      .single()

    if (!instructor?.email) {
      return NextResponse.json({ error: 'invalid_code' }, { status: 401 })
    }

    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: instructor.email,
    })
    if (linkErr || !link?.properties?.hashed_token) {
      console.error('code-login generateLink failed:', linkErr)
      return NextResponse.json({ error: 'login_failed' }, { status: 500 })
    }

    return NextResponse.json({ token_hash: link.properties.hashed_token })
  } catch (err) {
    console.error('code-login error:', err)
    return NextResponse.json({ error: 'login_failed' }, { status: 500 })
  }
}
