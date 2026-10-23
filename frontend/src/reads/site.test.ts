import { describe, expect, it } from 'vitest'
import { appOnly, READS, todaysRead } from './reads'
import { readSite } from './site'

// The public read pages (vite.config.ts writes them into the build): one per
// read except intimacy, no sources or research on the page, the helpline on
// the heavy ones, and the build stops if any read fails its gate.

describe('the public read pages', () => {
  const site = readSite()

  it('pass the gate', () => {
    expect(site.problems).toEqual([])
  })

  it('give every read but intimacy its own page, with a list and a sitemap', () => {
    const open = READS.filter((r) => !appOnly(r))
    expect(open).toHaveLength(READS.length - 1)
    for (const r of open) expect(site.files[`read/${r.slug}/index.html`], r.slug).toBeDefined()
    const intimacy = READS.find((r) => r.key === 'intimacy')!
    expect(site.files[`read/${intimacy.slug}/index.html`]).toBeUndefined()
    expect(JSON.stringify(site.files)).not.toContain(intimacy.title.replace(/'/g, '&#39;'))
    expect(Object.keys(site.files)).toHaveLength(open.length + 2)
    for (const r of open) expect(site.files['read/index.html']).toContain(`href="/read/${r.slug}/"`)
    expect(site.files['read/sitemap.txt'].trim().split('\n')).toHaveLength(open.length + 1)
  })

  it('show no sources, and nothing that runs', () => {
    for (const [name, html] of Object.entries(site.files)) {
      if (!name.endsWith('.html')) continue
      for (const r of READS) for (const s of r.sources) expect(html, `${name} cites ${s.url}`).not.toContain(s.url)
      expect(html).not.toMatch(/<script/i)
      expect(html).toContain('For self-reflection, not a diagnosis.')
    }
  })

  it('end the heavy reads with the helpline', () => {
    const page = (slug: string) => site.files[`read/${slug}/index.html`]
    const low = READS.find((r) => r.key === 'sadness-stress')!
    expect(page(low.slug)).toContain('findahelpline.com')
    const habits = READS.find((r) => r.key === 'habits')!
    expect(page(habits.slug)).not.toContain('findahelpline.com')
    expect(page(habits.slug)).toContain(`<link rel="canonical" href="https://personaindex.com/read/${habits.slug}/">`)
  })
})

describe("today's read", () => {
  const never = () => false
  it('is about one of the day’s life areas, the same all day, and never intimacy unless it is on', () => {
    const r = todaysRead('2026-10-12', ['money', 'habits'], never, false)!
    expect(['money', 'habits']).toContain(r.key)
    expect(todaysRead('2026-10-12', ['money', 'habits'], never, false)).toBe(r)
    for (let d = 10; d < 28; d++) {
      expect(todaysRead(`2026-10-${d}`, ['intimacy'], never, false)?.key).not.toBe('intimacy')
    }
    expect(todaysRead('2026-10-12', ['intimacy'], never, true)?.key).toBe('intimacy')
  })

  it('is never one already read on another day', () => {
    const r = todaysRead('2026-10-12', ['money'], never, false)!
    const next = todaysRead('2026-10-12', ['money'], (s) => s === r.slug, false)!
    expect(next.slug).not.toBe(r.slug)
    expect(todaysRead('2026-10-12', [], () => true, true)).toBeNull()
  })
})
