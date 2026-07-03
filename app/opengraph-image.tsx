import { ImageResponse } from 'next/og'

// Dynamic Open Graph / social-share image, generated from code so it always
// reflects the brand (no static PNG to repaint on a rebrand). Design-system
// colors: paper #EFE9DC field, ink #1A1814 text, accent #9B5B2A ring. Spanish.
export const alt = 'forat — el camino hacia un mejor golf'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '96px',
          background: '#EFE9DC',
          color: '#1A1814',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Wordmark: forat + the ring (the hole) in accent cognac */}
        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 48 }}>
          <span style={{ fontSize: 168, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1 }}>forat</span>
          <span style={{ width: 36, height: 36, borderRadius: 9999, border: '7px solid #9B5B2A', marginLeft: 22, marginBottom: 30 }} />
        </div>
        <div style={{ display: 'flex', fontSize: 58, color: '#4A4438', maxWidth: 900, lineHeight: 1.2 }}>
          El camino hacia un mejor golf.
        </div>
      </div>
    ),
    { ...size },
  )
}
