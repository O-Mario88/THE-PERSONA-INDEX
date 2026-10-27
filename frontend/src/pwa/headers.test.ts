// The site's response headers (public/_headers) against what the site does:
// the app may run only its own files, so nothing in the page may need inline
// script; the read pages run no script, so none may carry one. If either
// side changes, this fails before the policy breaks the live site.
// backend/static_test.go checks the same file from the server's side.

import headers from '../../public/_headers?raw'
import indexHtml from '../../index.html?raw'
import { readSite } from '../reads/site'

// policyFor gives the Content-Security-Policy the rules set for a path,
// following the file's own rules: every matching rule applies in order, and
// "! Name" removes what an earlier rule set.
function policyFor(path: string): string {
  let policy = ''
  let applies = false
  for (const raw of headers.split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim() || line.trim().startsWith('#')) continue
    if (!/^\s/.test(line)) {
      const re = new RegExp('^' + line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
      applies = re.test(path)
      continue
    }
    if (!applies) continue
    const t = line.trim()
    if (t === '! Content-Security-Policy') policy = ''
    else if (t.startsWith('Content-Security-Policy:')) policy = t.slice('Content-Security-Policy:'.length).trim()
  }
  return policy
}

const directive = (policy: string, name: string) =>
  policy
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.split(/\s+/)[0] === name)

describe('site headers', () => {
  it('lets the app run only its own scripts', () => {
    const app = policyFor('/')
    expect(directive(app, 'script-src')).toBe("script-src 'self'")
    // React Native for Web writes the app's styles into <style> tags as it
    // draws, so inline styles are allowed; nothing else unsafe is.
    expect(directive(app, 'style-src')).toBe("style-src 'self' 'unsafe-inline'")
    expect(app.replace("style-src 'self' 'unsafe-inline'", '')).not.toContain('unsafe')
    expect(directive(app, 'frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(directive(app, 'connect-src')).toBe("connect-src 'self'")
  })

  it('gives the app page nothing the policy would block', () => {
    // Every script is a file of the site's own; no inline script or handler.
    for (const tag of indexHtml.match(/<script[^>]*>/g) ?? []) expect(tag).toMatch(/\ssrc="\//)
    expect(indexHtml).not.toMatch(/\son[a-z]+=/i)
    expect(indexHtml).not.toMatch(/<style/i)
    expect(indexHtml).not.toMatch(/\sstyle=/i)
    expect(indexHtml).not.toMatch(/https?:\/\//)
  })

  it('lets the read pages run no script at all', () => {
    const read = policyFor('/read/sleep/')
    expect(directive(read, 'default-src')).toBe("default-src 'none'")
    expect(directive(read, 'script-src')).toBeUndefined()
    const { files } = readSite()
    const pages = Object.entries(files).filter(([name]) => name.endsWith('.html'))
    expect(pages.length).toBeGreaterThan(50)
    for (const [name, html] of pages) {
      expect(html, name).not.toMatch(/<script/i)
      expect(html, name).not.toMatch(/\son[a-z]+=/i)
      // Only the site's own icon and manifest load; links out are just links.
      for (const m of html.matchAll(/<link[^>]*href="([^"]+)"/g)) {
        if (!/rel="canonical"/.test(m[0])) expect(m[1], name).toMatch(/^\//)
      }
    }
  })

  it('keeps the service worker and pages fresh and caches built files for good', () => {
    const cache = (path: string) => {
      let value = ''
      let applies = false
      for (const raw of headers.split('\n')) {
        const line = raw.trimEnd()
        if (!line.trim() || line.trim().startsWith('#')) continue
        if (!/^\s/.test(line)) {
          applies = new RegExp('^' + line.trim().replace(/\*/g, '.*') + '$').test(path)
          continue
        }
        if (!applies) continue
        if (line.trim() === '! Cache-Control') value = ''
        else if (line.trim().startsWith('Cache-Control:')) value = line.trim().slice(14).trim()
      }
      return value
    }
    expect(cache('/sw.js')).toBe('no-cache')
    expect(cache('/')).toBe('no-cache')
    expect(cache('/assets/index-abc.js')).toContain('immutable')
  })
})
