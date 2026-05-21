'use client'

// Re-encode a recorded audio blob to WAV using only native Web Audio APIs.
// This is the most robust fix for the voice notes: the webm/opus a browser
// records can stutter on playback and report a broken duration; decoding it to
// PCM and writing a clean WAV (which carries an exact duration in its header)
// sidesteps every container/codec quirk. Returns null if decoding isn't
// possible, so the caller can fall back to the original blob.
export async function reencodeAudioToWav(blob: Blob): Promise<Blob | null> {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    const ctx = new Ctx()
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    const wav = audioBufferToMonoWav(decoded)
    void ctx.close()
    return wav
  } catch {
    return null
  }
}

// Encode an AudioBuffer to a 16-bit mono WAV. Mono keeps voice notes small;
// the exact sample count gives the player a correct duration.
function audioBufferToMonoWav(buffer: AudioBuffer): Blob {
  const sampleRate = buffer.sampleRate
  const length = buffer.length
  const channels = buffer.numberOfChannels

  // Downmix to mono.
  const mono = new Float32Array(length)
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) mono[i] += data[i] / channels
  }

  const bytesPerSample = 2
  const dataSize = length * bytesPerSample
  const ab = new ArrayBuffer(44 + dataSize)
  const view = new DataView(ab)

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * bytesPerSample, true) // byte rate
  view.setUint16(32, bytesPerSample, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }

  return new Blob([ab], { type: 'audio/wav' })
}
