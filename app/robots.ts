import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/siteUrl'

// Allow every crawler (including AI/search bots like GPTBot, OAI-SearchBot,
// ClaudeBot, PerplexityBot — covered by '*') on the public marketing pages, and
// keep the private, auth-gated app + API out of the index.
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl()
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/instructor/', '/student/', '/api/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
