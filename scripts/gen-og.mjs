// Generates public/og.png — the social-share card (1200×630).
// Minimalist Cuaderno layout: a paper panel (wordmark + tagline) on the left,
// the hero swing photo on the right, a cognac seam between them. Static + sharp
// so there are no runtime font/Satori dependencies. Re-run if the photo or copy
// changes:  node scripts/gen-og.mjs
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const W = 1200
const H = 630
const PHOTO_W = 560
const PANEL_W = W - PHOTO_W // 640

const photo = await sharp(join(root, 'public/images/sistema-ia-photo-light.png'))
  .resize(PHOTO_W, H, { fit: 'cover', position: 'centre' })
  .toBuffer()

const overlay = Buffer.from(
  `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <text x="72" y="318" font-family="Helvetica, Arial, sans-serif" font-size="74" font-weight="700" letter-spacing="-2" fill="#1A1814">parell</text>
    <circle cx="316" cy="300" r="12" fill="#9B5B2A"/>
    <text x="74" y="372" font-family="Helvetica, Arial, sans-serif" font-size="29" font-weight="500" fill="#5C5347">Práctica de golf con tu instructor</text>
    <rect x="${PANEL_W - 4}" y="0" width="4" height="${H}" fill="#9B5B2A"/>
  </svg>`,
)

await sharp({ create: { width: W, height: H, channels: 4, background: { r: 239, g: 233, b: 220, alpha: 1 } } })
  .composite([
    { input: photo, left: PANEL_W, top: 0 },
    { input: overlay, left: 0, top: 0 },
  ])
  .png()
  .toFile(join(root, 'public/og.png'))

console.log('public/og.png written (1200×630)')
