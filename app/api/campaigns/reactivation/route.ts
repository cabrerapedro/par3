import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isDormantAt, canMessageWhatsapp, daysSince } from '@/lib/contacts'
import { sendMessage } from '@/lib/kapso'

// POST /api/campaigns/reactivation
//
// Reactivation campaign engine. Given a segment (dormant/active/all) or an
// explicit list of student ids, for each messageable student it:
//   1. gathers context (days away, last topic worked),
//   2. asks Claude for a short, warm, per-student WhatsApp message in the
//      student's language,
//   3. (mode 'send') sends it via the Kapso adapter and logs it to message_log.
//
// Mode 'preview' stops after step 2 so the instructor can review before sending.
//
// Auth: the instructor's Supabase access token in the Authorization header is
// verified server-side; students are always scoped to that instructor. We never
// trust an instructor id from the client.
//
// While Kapso isn't wired, sends run in DRY-RUN (see lib/kapso.ts): nothing
// leaves the app, but the whole flow — including message_log — works locally.

const anthropic = new Anthropic()

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

type Mode = 'preview' | 'send'
type Segment = 'dormant' | 'active' | 'all'

interface StudentRow {
  id: string
  name: string
  phone: string | null
  whatsapp_opt_in_at: string | null
  preferred_locale: 'es' | 'en' | null
  lifecycle_stage: 'prospect' | 'active' | 'former' | null
  last_activity_at: string | null
  clips: { name: string; status: string; created_at: string }[] | null
}

function lastTopic(row: StudentRow): string | null {
  const live = (row.clips ?? []).filter(c => c.status !== 'archived')
  if (live.length === 0) return null
  live.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  return live[0].name ?? null
}

async function generateMessage(
  row: StudentRow,
  instructorName: string,
  daysAway: number | null,
): Promise<string> {
  const locale = row.preferred_locale === 'en' ? 'en' : 'es'
  const topic = lastTopic(row)
  const firstName = row.name.split(' ')[0]

  const ctx = [
    `Student first name: ${firstName}`,
    daysAway === null
      ? `Time since last activity: has never practiced or attended`
      : `Days since last lesson/practice: ${daysAway}`,
    topic ? `Last thing worked on: "${topic}"` : `Last thing worked on: unknown`,
    `Instructor/school signing the message: ${instructorName}`,
  ].join('\n')

  const prompt = locale === 'en'
    ? `You write short, warm WhatsApp reactivation messages for a golf instructor's school. Context:

${ctx}

Write ONE message to gently invite this student back to practice. Rules:
- Warm and personal, first name, never pushy or guilt-trippy.
- If a last topic is known, reference it naturally.
- 2-3 short sentences, under 300 characters. No emojis overload (0-1 max).
- End inviting them to come back / book a lesson.
- Plain text only. Return ONLY the message text, nothing else.`
    : `Escribís mensajes cortos y cálidos de reactivación por WhatsApp para la escuela de un instructor de golf. Contexto:

${ctx}

Escribí UN mensaje para invitar con cariño a este alumno a volver a practicar. Reglas:
- Cálido y personal, por su nombre, nunca insistente ni culposo.
- Si se conoce el último tema trabajado, mencionalo con naturalidad.
- 2-3 frases cortas, menos de 300 caracteres. Sin exceso de emojis (0-1 máximo).
- Cerrá invitándolo a volver / reservar una clase.
- Solo texto plano. Devolvé SOLO el texto del mensaje, nada más.`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })
  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  return raw.trim()
}

export async function POST(req: Request) {
  try {
    // --- Auth: verify the instructor from their bearer token ---
    const authHeader = req.headers.get('authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const instructorId = userData.user.id

    const body = await req.json().catch(() => ({}))
    const mode: Mode = body.mode === 'send' ? 'send' : 'preview'
    const segment: Segment = ['dormant', 'active', 'all'].includes(body.segment) ? body.segment : 'dormant'
    const studentIds: string[] | null = Array.isArray(body.studentIds) ? body.studentIds : null
    // Optional per-student message overrides (from the edited preview). When
    // present for a student we use that text verbatim and skip Claude.
    const overrides = new Map<string, string>()
    if (Array.isArray(body.messages)) {
      for (const m of body.messages) {
        if (m && typeof m.studentId === 'string' && typeof m.body === 'string' && m.body.trim()) {
          overrides.set(m.studentId, m.body.trim())
        }
      }
    }

    // --- Load the instructor's students (lifecycle + activity + clips) ---
    const { data: rows, error: loadErr } = await supabaseAdmin
      .from('students')
      .select('id, name, phone, whatsapp_opt_in_at, preferred_locale, lifecycle_stage, last_activity_at, clips(name, status, created_at)')
      .eq('instructor_id', instructorId)
    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })

    const now = Date.now()
    let candidates = (rows as StudentRow[] ?? [])
      // Reactivation targets people who took lessons and drifted — never
      // prospects (signed up, never came → wrong "come back to practice"). So the
      // pool is active + former only. Uses the SAME lifecycle_stage +
      // last_activity_at as the dashboard/stats (no divergent "dormant").
      .filter(r => {
        const stage = r.lifecycle_stage ?? 'active'
        if (segment === 'dormant') return stage === 'active' && isDormantAt(r.last_activity_at, now)
        if (segment === 'active') return stage === 'active'
        return stage === 'active' || stage === 'former' // 'all'
      })
      // Hard gate: phone + recorded consent.
      .filter(r => canMessageWhatsapp(r))

    if (studentIds) {
      const set = new Set(studentIds)
      candidates = candidates.filter(r => set.has(r.id))
    }

    const { data: instructor } = await supabaseAdmin
      .from('instructors').select('name').eq('id', instructorId).single()
    const instructorName = instructor?.name ?? 'Forat'

    // Generate per-student messages (concurrently). Skip Claude when an edited
    // override was supplied for that student.
    const results = await Promise.all(candidates.map(async row => {
      const daysAway = daysSince(row.last_activity_at ? Date.parse(row.last_activity_at) : null, now)
      const override = overrides.get(row.id)
      let message = override ?? ''
      let genError: string | null = null
      if (!override) {
        try {
          message = await generateMessage(row, instructorName, daysAway)
        } catch (e) {
          genError = e instanceof Error ? e.message : 'generation failed'
        }
      }
      return { row, daysAway, topic: lastTopic(row), message, genError }
    }))

    // --- Preview: return without sending ---
    if (mode === 'preview') {
      return NextResponse.json({
        mode,
        segment,
        previews: results.map(r => ({
          studentId: r.row.id,
          name: r.row.name,
          locale: r.row.preferred_locale === 'en' ? 'en' : 'es',
          daysAway: r.daysAway,
          topic: r.topic,
          message: r.message,
          error: r.genError,
        })),
      })
    }

    // --- Send: dry-run through the Kapso adapter + log each attempt ---
    const sent = await Promise.all(results.map(async r => {
      if (r.genError || !r.message) {
        return { studentId: r.row.id, name: r.row.name, status: 'failed' as const, error: r.genError ?? 'empty message' }
      }
      const locale = r.row.preferred_locale === 'en' ? 'en' : 'es'
      const send = await sendMessage({
        to: r.row.phone!, locale, body: r.message, category: 'marketing',
        templateName: process.env[`KAPSO_TEMPLATE_REACTIVATION_${locale.toUpperCase()}`],
      })
      // Dry-run → 'queued' (nothing was really delivered yet). Real send → 'sent'.
      const status = send.simulated ? 'queued' : send.ok ? 'sent' : 'failed'
      const { error: logErr } = await supabaseAdmin.from('message_log').insert({
        student_id: r.row.id,
        instructor_id: instructorId,
        channel: 'whatsapp',
        direction: 'outbound',
        category: 'marketing',
        template_name: send.simulated ? null : (process.env[`KAPSO_TEMPLATE_REACTIVATION_${locale.toUpperCase()}`] ?? null),
        body: r.message,
        locale,
        status,
        kapso_message_id: send.messageId,
        error: send.error ?? null,
      })
      return {
        studentId: r.row.id,
        name: r.row.name,
        status,
        simulated: send.simulated,
        error: send.error ?? (logErr ? logErr.message : null),
      }
    }))

    return NextResponse.json({
      mode,
      segment,
      simulated: sent.some(s => 'simulated' in s && s.simulated),
      sent,
      counts: {
        total: sent.length,
        queued: sent.filter(s => s.status === 'queued').length,
        sentReal: sent.filter(s => s.status === 'sent').length,
        failed: sent.filter(s => s.status === 'failed').length,
      },
    })
  } catch (err: unknown) {
    console.error('reactivation campaign error:', err)
    const msg = err instanceof Error ? err.message : 'failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
