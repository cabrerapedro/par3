// Kapso adapter — the ONE place that talks to WhatsApp.
//
// Right now it runs in DRY-RUN mode: no real WhatsApp is sent. The campaign
// flow (segment → personalize with Claude → send → log) works end-to-end
// locally so it can be tested without a Kapso account. Wiring the real Kapso
// SDK / Broadcasts API is the final step (see docs/CRM/CLAUDE-CODE-BRIEF-whatsapp.md
// and the deferred "Fase C" task) and should only need to fill in `sendReal`
// below — the campaign route already logs results through this interface.
//
// SERVER-SIDE ONLY. Never import from a client component: it reads secrets.

export interface SendMessageInput {
  to: string                 // student phone, E.164-ish
  locale: 'es' | 'en'
  templateName?: string      // approved template (marketing/utility) once wired
  body: string               // rendered message (variables already filled)
  category: 'marketing' | 'utility' | 'service'
}

export interface SendMessageResult {
  ok: boolean
  simulated: boolean         // true while in dry-run (no real Kapso call)
  messageId: string | null   // kapso_message_id once real; synthetic in dry-run
  error?: string
}

/** True once real Kapso credentials are present in the environment. */
export function isKapsoConfigured(): boolean {
  return !!(process.env.KAPSO_API_KEY && process.env.KAPSO_PHONE_NUMBER_ID)
}

/**
 * Send one WhatsApp message. In dry-run it just returns a synthetic id so the
 * caller can log the attempt; the message_log row is marked simulated via the
 * `simulated` flag the caller persists in status/notes.
 */
export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  if (!isKapsoConfigured()) return dryRun(input)
  try {
    return await sendReal()
  } catch (err) {
    return {
      ok: false,
      simulated: false,
      messageId: null,
      error: err instanceof Error ? err.message : 'kapso send failed',
    }
  }
}

// Deterministic synthetic id (no Math.random — keeps logs readable/testable).
let dryRunCounter = 0
function dryRun(input: SendMessageInput): SendMessageResult {
  dryRunCounter += 1
  const stamp = `${input.to.replace(/[^\d]/g, '')}-${dryRunCounter}`
  return { ok: true, simulated: true, messageId: `dryrun-${stamp}` }
}

// TODO (Fase C — connect Kapso): implement with @kapso/whatsapp-cloud-api in
// proxy mode, or the Platform Broadcasts API for bulk sends. Reference:
//   const client = new WhatsAppClient({
//     baseUrl: 'https://app.kapso.ai/api/meta/',
//     kapsoApiKey: process.env.KAPSO_API_KEY!,
//   })
//   await client.messages.sendTemplate({ phoneNumberId, to, template, components })
// For the first business-initiated touch this MUST send an approved template
// (input.templateName) with variables — never free-form. Add the SendMessageInput
// parameter back when implementing.
async function sendReal(): Promise<SendMessageResult> {
  throw new Error('Kapso not wired yet — running in dry-run mode')
}
