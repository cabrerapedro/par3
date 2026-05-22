import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/siteUrl'

// Only the public landing is indexable — the rest of the app is behind auth.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl()
  return [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
  ]
}
