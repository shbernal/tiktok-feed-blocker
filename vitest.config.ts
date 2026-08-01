import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    environmentOptions: {
      jsdom: {
        url: 'https://www.tiktok.com/',
      },
    },
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      // A ratchet, not a target: set a couple of points below the measured
      // numbers so an unrelated change cannot quietly erode coverage, while
      // leaving room for small refactors. Raise these when coverage rises.
      // The text reporter omits fully covered files; that is `skipFull`
      // behaviour, not a gap in the report.
      thresholds: {
        statements: 88,
        branches: 75,
        functions: 88,
        lines: 88,
      },
    },
  },
})
