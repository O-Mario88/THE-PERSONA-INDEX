import { describe, expect, it } from 'vitest'
import { entryFor, REGISTRY } from './registry'

// Every key the app writes on the phone is named in the registry, so the
// backup, Download and Delete cover it by construction (registry.ts). This
// reads the app's own source for every "pi." key it spells out.

const sources = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}', '!./fakeVault.ts', '!./setupTests.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('the key registry', () => {
  it('names every key the app spells out', () => {
    const found = new Set<string>()
    for (const text of Object.values(sources)) {
      for (const m of text.matchAll(/['"`](pi\.[A-Za-z0-9.-]+)/g)) found.add(m[1])
    }
    expect(found.size).toBeGreaterThan(15)
    const missing = [...found].filter((k) => !entryFor(k) && !REGISTRY.some((e) => e.key.startsWith(k)))
    expect(missing).toEqual([])
  })

  it('keeps the pass, the phrase and the lock out of the backup and the download', () => {
    for (const e of REGISTRY) {
      if (['pi.device.v1', 'pi.vault.v1', 'pi.lock.v1'].includes(e.key)) expect(e.download, e.key).toBe(false)
      if (e.key === 'pi.vault.v1' || e.key === 'pi.lock.v1') expect(e.backup, e.key).toBe('never')
    }
  })
})
