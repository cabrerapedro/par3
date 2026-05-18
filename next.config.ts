import type { NextConfig } from 'next'
import path from 'node:path'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack doesn't get confused when the worktree
  // and the main repo each have their own package-lock.json.
  turbopack: {
    root: path.resolve(__dirname),
  },
}

export default withNextIntl(nextConfig)
