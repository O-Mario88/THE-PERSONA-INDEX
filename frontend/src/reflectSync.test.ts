import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeServer } from './fakeVault'
import { keepReflection, reflections } from './notebook'
import { keys, load, saveJSON } from './storage'
import { syncOn } from './sync'
import { keysFor, keysFromSync, newPhrase, restoreFromSync, restoreWriting, startBackups, syncSecret, turnOn, unseal, vaultState, writingWaits } from './vault'

// Reflect (Edwin, 2026-10-25: "Reflections always end-to-end"): written
// reflections travel only in the journal copy, sealed under keys from the 12
// words. Easy sync holds the main copy's keys and nothing that opens the
// writing.

const WRITING = 'I felt most like myself at the market with my sister'

function fillPhone() {
  saveJSON('pi.history.v1', { answers: [{ date: '2026-10-12', questionId: 'q1', theme: 'habits', depth: 2, traits: {} }], skips: [] })
  keepReflection({
    id: '2026-10-25-day-free',
    date: '2026-10-25',
    period: 'day',
    area: 'self',
    group: 'learnt',
    source: 'answers',
    about: '',
    question: 'Where did you feel most like yourself today?',
    answer: WRITING,
  })
}

describe('reflections, end to end', () => {
  let server: ReturnType<typeof fakeServer>
  let synced: string | null
  let stop = () => {}

  beforeEach(() => {
    localStorage.clear()
    synced = null
    server = fakeServer((url, init) => {
      if (url === '/api/account/sync' && init.method === 'PUT') {
        synced = JSON.parse(String(init.body)).phrase
        return new Response(null, { status: 204 })
      }
      if (url === '/api/account/sync') return new Response(JSON.stringify({ phrase: synced }), { status: 200 })
      if (url === '/api/account') return new Response(JSON.stringify({ account: {}, logins: [], sessions: [] }), { status: 200 })
      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', server.fetch)
    stop = startBackups()
  })
  afterEach(() => {
    stop()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('easy sync holds keys, never the 12 words, and what it opens holds no writing', async () => {
    fillPhone()
    const phrase = newPhrase()
    await turnOn(phrase, true)
    await syncOn()

    expect(synced).toMatch(/^sk2\./)
    for (const word of phrase.split(' ')) expect(synced).not.toContain(` ${word} `)
    const withSync = await keysFromSync(synced!)
    // Every copy on the server: the one sync opens has no writing; the other it cannot open.
    const puts = server.seen.filter((r) => r.method === 'PUT')
    expect(new Set(puts.map((p) => p.auth)).size).toBe(2)
    for (const put of puts) {
      if (put.auth === withSync.vaultKey) {
        const opened = await unseal(withSync.seal, put.body!)
        expect(JSON.stringify(opened)).not.toContain(WRITING)
        expect(Object.keys(opened.entries).some((k) => k.startsWith('pi.nb.reflection.'))).toBe(false)
      } else {
        await expect(unseal(withSync.seal, put.body!)).rejects.toThrow()
        const journal = (await keysFor(phrase)).journal
        expect(put.auth).toBe(journal.vaultKey)
        expect(JSON.stringify(await unseal(journal.seal, put.body!))).toContain(WRITING)
      }
    }
  })

  it('a new phone restored through sync gets all but the writing, then the 12 words bring it back', async () => {
    fillPhone()
    const phrase = newPhrase()
    await turnOn(phrase, true)
    const secret = await syncSecret(phrase)

    localStorage.clear() // a new phone, signed in
    expect(await restoreFromSync(secret)).toBe('restored')
    expect(load('pi.history.v1')).toContain('q1')
    expect(keys('pi.nb.reflection.')).toHaveLength(0)
    expect(writingWaits()).toBe(true)

    expect(await restoreWriting(newPhrase())).toBe('mismatch')
    expect(await restoreWriting(phrase)).toBe('restored')
    expect(reflections()[0]?.answer).toBe(WRITING)
    expect(writingWaits()).toBe(false)
    expect(vaultState()).toMatchObject({ phrase, sync: secret })
  })
})
