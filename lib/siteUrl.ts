// Canonical production URL, used by metadata, sitemap, robots and JSON-LD.
// On Vercel this resolves to the project's production domain (the custom domain
// once forat.golf is connected, otherwise the *.vercel.app). Falls back to
// forat.golf for local dev. Server-only (reads a Vercel env var).
export function siteUrl(): string {
  const domain = process.env.VERCEL_PROJECT_PRODUCTION_URL
  return domain ? `https://${domain}` : 'https://forat.golf'
}
