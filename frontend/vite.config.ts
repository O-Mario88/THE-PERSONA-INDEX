/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

// frontend/ holds the code every platform shares (the React Native app in
// mobile/ imports it as @shared/...) and its tests. Vite is here for Vitest,
// and mobile/scripts/build-web.mjs uses it to load the read pages and the
// offline worker when it builds the website.
export default defineConfig({
  // Tests read the app's own files too (mobile/: its page, its storage keys).
  server: { fs: { allow: ['..'] } },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    // The phone's time zone fills in "Where you live", so tests run in UTC
    // everywhere, as they do in CI, not in the developer's own zone.
    env: { TZ: 'UTC' },
  },
})
