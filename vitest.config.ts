import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Minimal Vitest setup focused on pure-function unit tests under lib/.
// We're not testing React components or Supabase integration here — those
// have their own concerns (jsdom, mocks, fixtures) that don't pay off for
// the small surface we have today. If we add those later we'll extend
// this config rather than building a parallel one.

export default defineConfig({
  test: {
    include: ['lib/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
