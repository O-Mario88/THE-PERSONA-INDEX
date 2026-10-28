// The website, built from this app with React Native for Web: `npm run build:web`
// writes dist/, which the Go server serves (STATIC_DIR) and the Dockerfile copies.
//
// 1. `expo export --platform web` draws the app (public/index.html is the page).
// 2. The site's icons, manifest and headers come from frontend/public.
// 3. The public read pages and the offline worker are made by the same shared
//    code the old web build used (frontend/src/reads/site.ts and
//    frontend/src/pwa/serviceWorker.ts), loaded through the frontend's Vite.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const app = join(dirname(fileURLToPath(import.meta.url)), '..')
const frontend = join(app, '..', 'frontend')
const dist = join(app, 'dist')

function filesUnder(dir) {
  return readdirSync(dir, { recursive: true })
    .map((f) => join(dir, f))
    .filter((f) => statSync(f).isFile())
    .map((f) => relative(dir, f).split('\\').join('/'))
}

function exportApp() {
  rmSync(dist, { recursive: true, force: true })
  execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist'], { cwd: app, stdio: 'inherit', env: { ...process.env, CI: '1' } })
  // Expo's own extras: the site has its own icon, and nothing reads the metadata.
  for (const f of ['favicon.ico', 'metadata.json']) rmSync(join(dist, f), { force: true })
}

function copySiteFiles() {
  cpSync(join(frontend, 'public'), dist, { recursive: true })
  // Geist at stable addresses, for the read pages (reads/site.ts).
  mkdirSync(join(dist, 'fonts'), { recursive: true })
  const faces = { 400: '400Regular', 600: '600SemiBold', 700: '700Bold' }
  for (const [weight, name] of Object.entries(faces)) {
    cpSync(join(app, 'node_modules/@expo-google-fonts/geist', name, `Geist_${name}.ttf`), join(dist, 'fonts', `geist-${weight}.ttf`))
  }
}

async function loadShared() {
  const vite = await import(pathToFileURL(createRequire(join(frontend, 'package.json')).resolve('vite')).href)
  const load = async (file) => (await vite.runnerImport(join(frontend, file), { configFile: false, root: frontend, logLevel: 'error' })).module
  return { site: await load('src/reads/site.ts'), worker: await load('src/pwa/serviceWorker.ts') }
}

function writeReadPages(site) {
  const { problems, files } = site.readSite()
  if (problems.length > 0) throw new Error(`The reads failed their gate:\n${problems.join('\n')}`)
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dist, name)), { recursive: true })
    writeFileSync(join(dist, name), body)
  }
}

// Each build's files make its version, so a new deploy drops the old cache.
function writeWorker(worker) {
  const files = filesUnder(dist).filter((f) => !f.startsWith('read/'))
  const hash = createHash('sha256')
  for (const f of [...files].sort()) hash.update(f).update(readFileSync(join(dist, f)))
  const version = hash.digest('hex').slice(0, 12)
  writeFileSync(join(dist, 'sw.js'), worker.serviceWorker(version, worker.precacheList(files)))
}

exportApp()
copySiteFiles()
const shared = await loadShared()
writeReadPages(shared.site)
writeWorker(shared.worker)
console.log(`Website written to ${relative(process.cwd(), dist) || 'dist'}`)
