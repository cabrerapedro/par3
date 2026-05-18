import { NextRequest, NextResponse } from 'next/server'

// POST /api/transcribe
//
// Receives multipart FormData with an `audio` field (a Blob, typically a
// short voice memo recorded during an annotation), forwards it to OpenAI
// Whisper, and returns { transcript }.
//
// Failure modes are non-fatal for the caller: the annotation flow saves
// the audio file regardless and can retry transcription later. Errors are
// returned as stable error codes so the client can localize them.
//
// We deliberately don't pin a `language` param — instructors mix Spanish
// and English (technical vocabulary, brand names, etc.) and Whisper's
// auto-detect handles that better than forcing a single language.

export const runtime = 'nodejs' // need full FormData/Blob support, not Edge
// Whisper can take a few seconds on a short clip; give the function room
// before the platform kills it.
export const maxDuration = 60

const OPENAI_TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions'

// Practical cap: Vercel Serverless Functions on the hobby tier limit
// request payloads to 4.5 MB; pro is 5 MB. Whisper itself accepts up to
// 25 MB but we'll never get there on Vercel. 4 MB leaves a small buffer
// for the multipart envelope. For instructor voice notes (a few seconds
// of opus/webm) this is ~10x the typical size.
const MAX_AUDIO_BYTES = 4 * 1024 * 1024

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'transcriptionUnavailable' },
      { status: 503 },
    )
  }

  let audio: Blob | null = null
  try {
    const form = await req.formData()
    const value = form.get('audio')
    if (value instanceof Blob) audio = value
  } catch {
    return NextResponse.json({ error: 'audioRequired' }, { status: 400 })
  }

  if (!audio || audio.size === 0) {
    return NextResponse.json({ error: 'audioRequired' }, { status: 400 })
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'audioTooLarge' }, { status: 413 })
  }

  const upstream = new FormData()
  // Whisper expects a filename; the extension is just a hint, the actual
  // codec is sniffed from the blob bytes.
  upstream.append('file', audio, audioFilename(audio.type))
  upstream.append('model', 'whisper-1')
  upstream.append('response_format', 'json')
  upstream.append('temperature', '0')

  let res: Response
  try {
    res = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    })
  } catch {
    return NextResponse.json({ error: 'transcriptionFailed' }, { status: 502 })
  }

  if (!res.ok) {
    // Log the upstream body for server-side debugging without leaking it
    // to the client (it may contain auth-adjacent info).
    const upstreamBody = await res.text().catch(() => '')
    console.error('[/api/transcribe] OpenAI error', res.status, upstreamBody)
    return NextResponse.json({ error: 'transcriptionFailed' }, { status: 502 })
  }

  const data = (await res.json().catch(() => null)) as { text?: string } | null
  return NextResponse.json({ transcript: data?.text ?? '' })
}

function audioFilename(mimeType: string): string {
  // Map common browser MediaRecorder mime types to sensible filenames.
  if (mimeType.includes('webm')) return 'audio.webm'
  if (mimeType.includes('ogg')) return 'audio.ogg'
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'audio.m4a'
  if (mimeType.includes('wav')) return 'audio.wav'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'audio.mp3'
  return 'audio.webm'
}
