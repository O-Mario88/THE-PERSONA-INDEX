import { describe, expect, it } from 'vitest'

// The light-mode review (Edwin, 2026-10-29: "keep fixing until everything is
// at least 90%") set bars the app keeps from now on. These read the app's own
// files (mobile/src), so a colour, a size or a button style that slips fails
// here before anyone sees it.

const files = import.meta.glob('../../mobile/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const source = (name: string): string => {
  const hit = Object.entries(files).find(([path]) => path.endsWith(`/${name}`))
  if (!hit) throw new Error(`no ${name}`)
  return hit[1]
}

// The palettes, read from theme.tsx: dark starts from light and changes some keys.
function palette(which: 'light' | 'dark'): Record<string, string> {
  const theme = source('theme.tsx')
  const block = (name: string) => {
    const start = theme.indexOf(`export const ${name}: Palette = {`)
    return theme.slice(start, theme.indexOf('\n}', start))
  }
  const read = (text: string) => Object.fromEntries([...text.matchAll(/^\s+(\w+): '(#[0-9a-f]{6})'/gim)].map((m) => [m[1], m[2].toLowerCase()]))
  const light = read(block('light'))
  return which === 'light' ? light : { ...light, ...read(block('dark')) }
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('contrast, in light and dark', () => {
  for (const mode of ['light', 'dark'] as const) {
    const p = palette(mode)

    it(`keeps every kind of words at 4.5:1 or more on the page, a card and a chip (${mode})`, () => {
      for (const words of ['text', 'text2', 'muted', 'accentInk', 'danger', 'amberInk']) {
        for (const behind of ['bg', 'surface', 'surface2']) {
          expect(contrast(p[words], p[behind]), `${words} on ${behind}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    })

    it(`keeps green and terracotta words at 4.5:1 or more on the page and a card (${mode})`, () => {
      for (const words of ['leaf', 'rose']) {
        for (const behind of ['bg', 'surface']) expect(contrast(p[words], p[behind]), `${words} on ${behind}`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it(`keeps a button's words and a control's edge clear (${mode})`, () => {
      expect(contrast(p.onBtn, p.btn), 'button words').toBeGreaterThanOrEqual(4.5)
      expect(contrast(p.onLime, p.lime), 'chosen chip words').toBeGreaterThanOrEqual(4.5)
      for (const behind of ['bg', 'surface']) expect(contrast(p.control, p[behind]), `control edge on ${behind}`).toBeGreaterThanOrEqual(3)
    })
  }
})

describe('one type scale', () => {
  // Pictures of the brand keep their own sizes: the logo, the launch, the
  // sunrise and the Welcome's serif heading.
  const ownSizes = ['theme.tsx', 'Logo.tsx', 'Launch.tsx', 'Dawn.tsx', 'Welcome.tsx']

  it('sets no font size by hand outside the scale', () => {
    const loose = Object.entries(files)
      .filter(([path]) => !ownSizes.some((f) => path.endsWith(`/${f}`)))
      .flatMap(([path, text]) => [...text.matchAll(/fontSize[:=]\s*\{?\s*'?(\d+)/g)].map((m) => `${path.split('/mobile/src/')[1]}: ${m[1]}`))
    expect(loose).toEqual([])
  })

  it('reads body text at 16 on 24 and nothing below 13 but tab labels', () => {
    const theme = source('theme.tsx')
    expect(theme).toMatch(/body: \{ fontSize: 16, lineHeight: 24 \}/)
    const sizes = [...theme.matchAll(/(\w+): \{ fontSize: (\d+), lineHeight: \d+ \}/g)].map((m) => ({ step: m[1], size: Number(m[2]) }))
    expect(sizes.length).toBeGreaterThanOrEqual(8)
    for (const { step, size } of sizes) if (step !== 'tab') expect(size, step).toBeGreaterThanOrEqual(13)
  })
})

describe('one button system', () => {
  it('has primary, secondary, text, danger, marigold on midnight, and the Welcome sprout, nothing else', () => {
    const kinds = source('kit.tsx').match(/type Kind = ([^\n]+)/)?.[1]
    expect(kinds).toBe("'primary' | 'secondary' | 'text' | 'danger' | 'sprout' | 'warm'")
  })

  it('keeps the sprout button for the Welcome alone', () => {
    const users = Object.entries(files)
      .filter(([, text]) => /kind="sprout"/.test(text))
      .map(([path]) => path.split('/').pop())
    expect(users).toEqual(['Welcome.tsx'])
  })
})
