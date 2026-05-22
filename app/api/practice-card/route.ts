import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// POST /api/practice-card
//
// Layer 2 of the guided practice plan (docs/GUIDED-PRACTICE-PLAN.md). Takes what
// the COACH already said for an annotation (the transcript of the voice note +
// the optional text note) and reformulates it into a short student-facing card:
// a 1-line focus + 2-3 "things to feel/check".
//
// Hard guardrail: it ONLY rephrases the coach's own words — it never invents
// technique. If there's nothing actionable, it returns { card: null } and the
// UI falls back to the raw drawing + audio.
//
// Generated on first student view and persisted (best-effort, like
// baseline_summary) so it's a one-time cost per annotation.

const anthropic = new Anthropic()

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export interface PracticeCard {
  focus: string
  checklist: string[]
}

export async function POST(req: Request) {
  try {
    const { transcript, textNote, clipName, cameraAngle, clipType, annotationId } = await req.json()

    const coachText = [transcript, textNote]
      .filter((s) => typeof s === 'string' && s.trim())
      .join('\n')
      .trim()

    // Nothing the coach said → no card. Never invent.
    if (!coachText) return NextResponse.json({ card: null })

    const angleLabel = cameraAngle === 'face_on' ? 'de frente' : 'de perfil'
    const prompt = `Sos el copiloto de práctica de Parell Golf. El instructor marcó un momento de un ejercicio${clipName ? ` ("${clipName}")` : ''} (vista ${angleLabel}${clipType === 'swing' ? ', swing' : ''}) y dejó esta explicación (voz/nota):

"""
${coachText}
"""

Tu ÚNICA tarea es REFORMULAR lo que dijo el instructor en una guía corta para el alumno. Reglas estrictas:
- NO inventes técnica ni agregues nada que el instructor no haya dicho.
- Español claro y en positivo, sin jerga, sin grados ni números.
- Si la explicación no tiene una indicación accionable, devolvé "focus" como cadena vacía.

Devolvé SOLO un JSON válido, sin texto extra, con esta forma exacta:
{"focus": "una frase corta con la corrección principal, en positivo", "checklist": ["2 o 3 cosas concretas para sentir o chequear, derivadas SOLO de lo que dijo el instructor"]}`

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : ''
    let card: PracticeCard | null = null
    try {
      const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
      const parsed = JSON.parse(json)
      const focus = typeof parsed.focus === 'string' ? parsed.focus.trim() : ''
      const checklist = Array.isArray(parsed.checklist)
        ? parsed.checklist
            .filter((s: unknown) => typeof s === 'string' && (s as string).trim())
            .map((s: string) => s.trim())
            .slice(0, 3)
        : []
      card = focus ? { focus, checklist } : null
    } catch {
      card = null
    }

    // Persist (bypasses RLS; student can't UPDATE clip_annotations). Best-effort:
    // if the `practice_card` column isn't there yet, this no-ops and the card is
    // simply regenerated next time.
    if (card && annotationId) {
      supabaseAdmin
        .from('clip_annotations')
        .update({ practice_card: card })
        .eq('id', annotationId)
        .then(({ error }) => { if (error) console.error('Failed to persist practice_card:', error) })
    }

    return NextResponse.json({ card })
  } catch (err: unknown) {
    console.error('practice-card error:', err)
    const msg = err instanceof Error ? err.message : 'failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
