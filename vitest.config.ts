import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) }

// Two suites, one runner. `npm test` runs both and exits non-zero if either fails.
export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'smoke',
          environment: 'jsdom',
          setupFiles: ['./tests/setupTests.ts'],
          include: ['tests/smoke/**/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'acceptance',
          environment: 'node',
          include: ['tests/acceptance/**/*.test.ts'],
        },
      },
    ],
  },
})
