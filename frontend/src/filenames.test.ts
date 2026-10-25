import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Tests run from frontend/ (npm test), under jsdom, so import.meta.url is not a file URL.
const src = resolve(process.cwd(), 'src')

// Every file under a folder, as "folder/name" without its extension.
function moduleNames(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) moduleNames(path, out)
    else out.push(path.replace(/\.[^./]+$/, ''))
  }
  return out
}

describe('file names', () => {
  // macOS and Windows treat People.tsx and people.ts as one import path, so
  // './People' can load the wrong file there while Linux CI stays green.
  it('has no two modules whose names differ only by case', () => {
    const seen = new Map<string, string>()
    const clashes: string[] = []
    for (const name of moduleNames(src)) {
      const key = name.toLowerCase()
      const other = seen.get(key)
      if (other && other !== name) clashes.push(`${other} / ${name}`)
      seen.set(key, name)
    }
    expect(clashes).toEqual([])
  })
})
