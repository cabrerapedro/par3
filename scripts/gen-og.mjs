// Generates public/og.png (1200×630) from the uploaded artwork public/og-dark.png.
//
// The source is 3:2 but social previews want ~1.91:1, so a center-crop would
// cut the club and the shoes. Instead we fit the full image (no crop) over a
// blurred, slightly-dimmed cover of itself — the side margins extend the dark
// gradient seamlessly. Re-run if og-dark.png changes:  node scripts/gen-og.mjs
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'public/og-dark.png')
const W = 1200
const H = 630

const background = await sharp(SRC)
  .resize(W, H, { fit: 'cover' })
  .blur(28)
  .modulate({ brightness: 0.82 })
  .toBuffer()

const foreground = await sharp(SRC)
  .resize({ height: H }) // keep aspect; height 630 → width ~945
  .toBuffer()

await sharp(background)
  .composite([{ input: foreground, gravity: 'centre' }])
  .png()
  .toFile(join(root, 'public/og.png'))

console.log('public/og.png written (1200×630) from og-dark.png')
