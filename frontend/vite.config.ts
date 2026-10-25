/// <reference types="vitest/config" />
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, runnerImport, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { precacheList, serviceWorker } from './src/pwa/serviceWorker.ts'

const root = fileURLToPath(new URL('.', import.meta.url))

type ReadSite = { readSite: () => { problems: string[]; files: Record<string, string> } }

// The public read pages (src/reads/site.ts): written into the build as
// plain HTML at /read/ and /read/<slug>/, and served the same way by the dev
// server. A read that fails the gate stops the build, the way a card that
// fails the bank's gate stops the server.
function readPages(): Plugin {
  const load = async () => {
    const { module } = await runnerImport<ReadSite>(`${root}src/reads/site.ts`, { configFile: false, root, logLevel: 'error' })
    return module.readSite()
  }
  let files: Record<string, string> = {}
  return {
    name: 'persona-read-pages',
    async buildStart() {
      if (process.env.VITEST) return
      const site = await load()
      if (site.problems.length > 0) this.error(`The reads failed their gate:\n${site.problems.join('\n')}`)
      files = site.files
    },
    generateBundle() {
      for (const [fileName, source] of Object.entries(files)) this.emitFile({ type: 'asset', fileName, source })
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0]
        if (!path.startsWith('/read')) return next()
        const name = path === '/read' || path === '/read/' ? 'read/index.html' : `${path.replace(/^\/|\/$/g, '')}${path.endsWith('.txt') ? '' : '/index.html'}`
        const site = await load()
        const body = site.files[name]
        if (!body) return next()
        res.setHeader('Content-Type', name.endsWith('.txt') ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8')
        res.end(body)
      })
    },
  }
}

// The service worker (src/pwa/serviceWorker.ts), written as /sw.js with this
// build's files, so each deploy is a new version and the old one is dropped.
function offlineWorker(): Plugin {
  return {
    name: 'persona-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const publicDir = `${root}public/`
      const publicFiles = readdirSync(publicDir)
      const files = [...Object.keys(bundle), ...publicFiles]
      const hash = createHash('sha256')
      for (const name of Object.keys(bundle).sort()) hash.update(name)
      for (const name of publicFiles.sort()) hash.update(name).update(readFileSync(publicDir + name))
      const version = hash.digest('hex').slice(0, 12)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorker(version, precacheList(files)) })
    },
  }
}

// Figtree's Latin face is preloaded from the page head, so the first screen
// draws in it without waiting for the stylesheet to ask, and without a flash
// of the fallback font.
function preloadFigtree(): Plugin {
  return {
    name: 'persona-preload-figtree',
    apply: 'build',
    transformIndexHtml(html, ctx) {
      const font = Object.keys(ctx.bundle ?? {}).find((f) => /figtree-latin-wght-normal-.*\.woff2$/.test(f))
      if (!font) return html
      return { html, tags: [{ tag: 'link', attrs: { rel: 'preload', href: `/${font}`, as: 'font', type: 'font/woff2', crossorigin: '' }, injectTo: 'head-prepend' }] }
    },
  }
}

export default defineConfig({
  plugins: [react(), readPages(), offlineWorker(), preloadFigtree()],
  server: {
    proxy: { '/api': 'http://localhost:8080' },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    // The phone's time zone fills in "Where you live", so tests run in UTC
    // everywhere, as they do in CI, not in the developer's own zone.
    env: { TZ: 'UTC' },
  },
})
