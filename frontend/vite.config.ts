/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import { defineConfig, runnerImport, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

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

export default defineConfig({
  plugins: [react(), readPages()],
  server: {
    proxy: { '/api': 'http://localhost:8080' },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  },
})
