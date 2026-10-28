// The service worker (Phase 3 of the review of 2026-10-15, "install and
// offline"), written into the build as /sw.js by vite.config.ts with the
// build's own file list, so each deploy gets a new cache and drops the old.
//
// What it does, and no more:
// - keeps the app's page, script, styles, fonts and icons, so the app opens
//   without a connection (the app keeps the day's questions itself);
// - pages: the network first, the kept copy when offline;
// - files under /assets/ and /_expo/: the kept copy first, since their names
//   change whenever their content does;
// - never touches /api/: answers, votes, the mirror and the backup always
//   go to the server, and nothing the server says is kept by the worker.

export function serviceWorker(version: string, precache: string[]): string {
  return `// The Persona Index: opens the app without a connection. Made by the build.
const VERSION = ${JSON.stringify(version)}
const PRECACHE = ${JSON.stringify(precache)}
const APP = 'app-' + VERSION
const PAGES = 'pages-' + VERSION

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function networkFirst(request) {
  try {
    const res = await fetch(request)
    if (res.ok && res.type === 'basic') {
      const copy = res.clone()
      caches.open(PAGES).then((c) => c.put(request, copy))
    }
    return res
  } catch (err) {
    const kept = (await caches.match(request)) || (request.mode === 'navigate' && !new URL(request.url).pathname.startsWith('/read/') ? await caches.match('/') : undefined)
    if (kept) return kept
    throw err
  }
}

async function keptFirst(request) {
  const kept = await caches.match(request)
  if (kept) return kept
  const res = await fetch(request)
  if (res.ok && res.type === 'basic') {
    const copy = res.clone()
    caches.open(APP).then((c) => c.put(request, copy))
  }
  return res
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/_expo/')) return event.respondWith(keptFirst(request))
  event.respondWith(networkFirst(request))
})
`
}

// precacheList picks what the worker keeps from a build's files: the page,
// its script and styles, the Latin fonts and the icons. Other alphabets'
// fonts, the reads chunk and the read pages are kept once they are used.
// It reads both the React Native web build (mobile/scripts/build-web.mjs:
// /_expo/ script, app.css, the Geist weights the app draws with) and the
// older Vite build.
export function precacheList(files: string[]): string[] {
  const keep = files.filter(
    (f) =>
      f === 'index.html' ||
      /^assets\/index-[\w-]+\.(js|css)$/.test(f) ||
      /^assets\/[\w-]*-latin-wght-normal-[\w-]+\.woff2$/.test(f) ||
      f === 'app.css' ||
      /^_expo\/static\/js\/web\/index-[\w-]+\.js$/.test(f) ||
      /^assets\/node_modules\/@expo-google-fonts\/geist\/[4567]00[A-Za-z]+\/Geist_[4567]00[A-Za-z]+\.[\w]+\.ttf$/.test(f) ||
      /^(manifest\.webmanifest|favicon\.svg|icon-192\.png|apple-touch-icon\.png)$/.test(f),
  )
  return ['/', ...keep.filter((f) => f !== 'index.html').map((f) => `/${f}`)].sort()
}
