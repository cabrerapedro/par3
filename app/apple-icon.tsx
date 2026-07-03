import { ImageResponse } from 'next/og'

// iOS home-screen icon — the isologo: a golf hole seen from above (a large, thin
// light ring on a dark field). Uses design-system colors: ink #1A1814 field,
// paper #EFE9DC ring. Generated from code so it always matches the brand.
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1A1814',
        }}
      >
        <div style={{ width: 122, height: 122, borderRadius: '50%', border: '5px solid #EFE9DC' }} />
      </div>
    ),
    { ...size },
  )
}
