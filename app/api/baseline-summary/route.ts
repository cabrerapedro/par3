import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { METRIC_INFO, PHASE_LABELS } from '@/lib/baseline'
import type { SwingPhaseName } from '@/lib/types'

const anthropic = new Anthropic()

// Server-side supabase client that bypasses RLS for persisting summaries
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

function formatMetricLine(key: string, val: any): string {
  const info = METRIC_INFO[key]
  const label = info?.label ?? key
  const unit = info?.unit === 'grados' ? '°' : ''
  const mean = typeof val.mean === 'number' ? val.mean.toFixed(1) : val.mean
  const std = typeof val.std === 'number' ? val.std.toFixed(1) : '?'
  return `- ${label}: ${mean}${unit} (±${std}${unit})`
}

export async function POST(req: Request) {
  try {
    const { baseline, cameraAngle, checkpointName, instructorNote, selectedMetrics, marksCount, checkpointType, checkpointId } = await req.json()

    if (!baseline || !cameraAngle) {
      return NextResponse.json({ error: 'Missing baseline or cameraAngle' }, { status: 400 })
    }

    const isSwing = checkpointType === 'swing' && baseline._type === 'swing' && baseline.phases

    // Build metric description
    let metricLines: string
    if (isSwing) {
      metricLines = Object.entries(baseline.phases as Record<string, Record<string, any>>)
        .map(([phase, metrics]) => {
          const phaseLabel = PHASE_LABELS[phase as SwingPhaseName] ?? phase
          const lines = Object.entries(metrics)
            .filter(([key]) => !selectedMetrics?.length || selectedMetrics.includes(key))
            .map(([key, val]) => formatMetricLine(key, val))
            .join('\n')
          return `${phaseLabel}:\n${lines}`
        })
        .join('\n\n')
    } else {
      metricLines = Object.entries(baseline)
        .filter(([key]) => !selectedMetrics?.length || selectedMetrics.includes(key))
        .map(([key, val]: [string, any]) => formatMetricLine(key, val))
        .join('\n')
    }

    const angleLabel = cameraAngle === 'face_on' ? 'de frente' : 'de perfil'

    const contextParts = [
      `Ejercicio: "${checkpointName}" (vista ${angleLabel}${isSwing ? ', tipo swing' : ''})`,
      marksCount ? `Calibrado con ${marksCount} ${isSwing ? 'swings' : 'posiciones'} marcados por el instructor.` : '',
      instructorNote ? `Nota del instructor: "${instructorNote}"` : '',
    ].filter(Boolean).join('\n')

    const swingExtra = isSwing
      ? '\n4. Describe brevemente qué buscar en cada fase del swing (address, top, impacto, finish) según los datos'
      : ''

    const prompt = `Eres el copiloto de práctica de golf de un estudiante. Tu instructor calibró ${isSwing ? 'su swing ideal' : 'su postura ideal'}.

${contextParts}

Métricas de referencia personal (promedio ± variación):
${metricLines}

Genera un resumen breve en español para el estudiante explicando:
1. Cómo es ${isSwing ? 'su swing ideal calibrado' : 'su postura ideal calibrada'}, en lenguaje simple y concreto
2. Qué puntos clave debe recordar antes de cada swing
3. Integra la nota del instructor si existe, dándole prioridad — es lo más importante${swingExtra}

Reglas:
- Tono positivo y directo, como un coach
- NO uses números, grados ni valores técnicos — traducí todo a lenguaje corporal ("inclinado desde las caderas", "rodillas apenas flexionadas", etc.)
- NO uses bullet points, listas, títulos, negritas ni formato markdown — solo texto corrido plano
- NO empieces con "Tu postura ideal es..." ni fórmulas repetitivas
- Sé específico para ESTE ejercicio, no genérico
- Máximo ${isSwing ? '120' : '80'} palabras`

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    })

    const summary = message.content[0].type === 'text' ? message.content[0].text : ''

    // Persist summary server-side (bypasses RLS since student can't UPDATE checkpoints)
    if (checkpointId && summary) {
      supabaseAdmin.from('checkpoints').update({ baseline_summary: summary }).eq('id', checkpointId)
        .then(({ error }) => { if (error) console.error('Failed to persist baseline_summary:', error) })
    }

    return NextResponse.json({ summary })
  } catch (err: any) {
    console.error('Baseline summary error:', err)
    return NextResponse.json({ error: err.message ?? 'Failed to generate summary' }, { status: 500 })
  }
}
