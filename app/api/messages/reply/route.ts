import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendMessage, isKapsoConfigured } from '@/lib/kapso'

// POST /api/messages/reply
//
// Sends a free-form reply to a student and logs it. Free-form (non-template)
// text is only allowed inside the 24h service window that opens when the student
// replies; outside it, WhatsApp requires an approved template. We enforce that
// here (unless Kapso is unwired — dry-run — where we allow it so the flow is
// testable locally, but still record it honestly as 'queued').
//
// Auth: instructor bearer token, verified server-side; the student must belong
// to that instructor.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export async function POST(req: Request) {
  try {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userData?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const instructorId = userData.user.id

    const { studentId, text } = await req.json().catch(() => ({}))
    const body = typeof text === 'string' ? text.trim() : ''
    if (!studentId || !body) return NextResponse.json({ error: 'missing studentId or text' }, { status: 400 })

    // The student must belong to this instructor.
    const { data: student } = await supabaseAdmin
      .from('students')
      .select('id, phone, preferred_locale, whatsapp_opt_in_at, whatsapp_window_expires_at')
      .eq('id', studentId)
      .eq('instructor_id', instructorId)
      .single()
    if (!student) return NextResponse.json({ error: 'student not found' }, { status: 404 })
    if (!student.phone || !student.whatsapp_opt_in_at) {
      return NextResponse.json({ error: 'no_consent' }, { status: 400 })
    }

    const locale = student.preferred_locale === 'en' ? 'en' : 'es'
    const windowOpen = !!student.whatsapp_window_expires_at &&
      Date.parse(student.whatsapp_window_expires_at) > Date.now()

    // Real free-form sends are only allowed inside the 24h service window (Meta
    // policy). Outside it, only an approved template may go out — reject here so
    // we never send free-form text and get the number flagged. Dry-run (Kapso
    // not wired) is allowed so the flow stays testable locally.
    if (!windowOpen && isKapsoConfigured()) {
      return NextResponse.json({ error: 'window_closed' }, { status: 409 })
    }

    const send = await sendMessage({
      to: student.phone,
      locale,
      body,
      category: 'service',
    })

    // Dry-run → 'queued' (nothing actually delivered). Real send → 'sent'.
    const status = send.simulated ? 'queued' : send.ok ? 'sent' : 'failed'
    const { data: row, error: logErr } = await supabaseAdmin
      .from('message_log')
      .insert({
        student_id: studentId,
        instructor_id: instructorId,
        channel: 'whatsapp',
        direction: 'outbound',
        category: 'service',
        body,
        locale,
        status,
        kapso_message_id: send.messageId,
        error: send.error ?? null,
      })
      .select()
      .single()
    if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 })

    return NextResponse.json({ message: row, simulated: send.simulated, windowOpen })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
