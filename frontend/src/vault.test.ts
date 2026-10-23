import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { keepCard, keptCard, keptCards, makePlan, plans } from './notebook'
import { REGISTRY } from './registry'
import { keys, load, save, saveJSON } from './storage'
import {
  backUp,
  deleteBackup,
  keysFor,
  mergeHistory,
  newPhrase,
  phraseProblem,
  restore,
  seal,
  setWords,
  snapshot,
  startBackups,
  turnOn,
  unseal,
  vaultState,
} from './vault'

// The gate for the encrypted backup (Phase 3 of the review of 2026-10-15):
// "a phone restored from the 12-word phrase gets everything back". The
// server here behaves as backend/vault.go does: it keeps sealed bytes under
// the SHA-256 of the vault key, version by version.

type Held = { version: number; sealed: Uint8Array }

function fakeServer() {
  const held = new Map<string, Held>()
  const seen: { method: string; body?: Uint8Array; auth: string }[] = []
  const hash = async (k: string) => {
    const raw = Uint8Array.from(atob(k.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', raw))].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe('/api/vault')
    const h = new Headers(init.headers)
    const auth = (h.get('Authorization') ?? '').replace(/^Vault /, '')
    const body = init.body ? new Uint8Array(init.body as ArrayBuffer) : undefined
    seen.push({ method: init.method ?? 'GET', body, auth })
    const id = await hash(auth)
    const cur = held.get(id)
    switch (init.method) {
      case 'GET':
        if (!cur) return json(404, { error: 'no_backup' })
        return new Response(cur.sealed.slice(), { status: 200, headers: { ETag: `"${cur.version}"` } })
      case 'PUT': {
        const match = h.get('If-Match')
        const replaces = match ? Number(match.replace(/"/g, '')) : h.get('If-None-Match') === '*' ? 0 : -1
        if (replaces < 0) return json(428, { error: 'precondition_required' })
        if (!cur && replaces > 0) return json(404, { error: 'no_backup' })
        if (cur && cur.version !== replaces) return json(412, { error: 'version_conflict', version: cur.version }, { ETag: `"${cur.version}"` })
        held.set(id, { version: replaces + 1, sealed: body! })
        return json(200, { version: replaces + 1 }, { ETag: `"${replaces + 1}"` })
      }
      case 'DELETE':
        return json(200, { deleted: held.delete(id) })
    }
    return json(405, { error: 'method' })
  })
  return { held, seen, fetch }
}

// A phone with something in every kind of key a backup carries.
function fillPhone() {
  save('pi.device.v1', 'v1.pass-of-this-phone')
  saveJSON('pi.prefs.v1', { adult: true, mild: false, wordsDays: 35 })
  save('pi.seed', '12345')
  saveJSON('pi.history.v1', {
    answers: [{ date: '2026-10-12', questionId: '2026-10-12-habits-001', theme: 'habits', depth: 2, traits: { conscientiousness: 1 }, optionId: 'a', verdict: 'me' }],
    skips: [],
  })
  saveJSON('pi.moves.v1', [{ date: '2026-10-12', questionId: '2026-10-12-habits-001', optionId: 'a', step: 'Wash one cup.', status: 'started' }])
  save('pi.choice.2026-10-12-habits-001', 'a')
  save('pi.rated.2026-10-12-habits-001', 'me')
  saveJSON('pi.leaning.conscientiousness', { date: '2026-10-12', verdict: 'me' })
  keepCard({
    date: '2026-10-12',
    questionId: '2026-10-12-habits-001',
    theme: 'habits',
    prompt: 'Dishes after dinner?',
    answer: 'Right away',
    words: 'I do them before I sit down, always',
    headline: 'You clear the decks before you rest.',
  })
  makePlan({ made: '2026-10-12', trait: 'conscientiousness', high: true, when: 'I sit down for the evening', will: 'leave one job for tomorrow' })
  saveJSON('pi.words.2026-10-12-habits-001', { questionId: '2026-10-12-habits-001', date: '2026-10-12', words: 'I do them before I sit down, always' })
  // Never in a backup:
  save('pi.pending.2026-10-12-habits-002', '{"key":"k","option":"b"}')
  save('pi.draft.2026-10-12-habits-003', 'half a thought')
}

function phoneContents(): Record<string, string> {
  return Object.fromEntries(keys().filter((k) => k !== 'pi.vault.v1').map((k) => [k, load(k)!]))
}

const never = (k: string) => REGISTRY.some((e) => e.backup === 'never' && (/[.-]$/.test(e.key) ? k.startsWith(e.key) : k === e.key))

describe('the encrypted backup', () => {
  let server: ReturnType<typeof fakeServer>
  let stop = () => {}

  beforeEach(() => {
    localStorage.clear()
    server = fakeServer()
    vi.stubGlobal('fetch', server.fetch)
    stop = startBackups() // as the app does: changes mark the backup as due
  })
  afterEach(() => {
    stop()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('makes a sound phrase and catches a mistyped one', () => {
    const p = newPhrase()
    expect(p.split(' ')).toHaveLength(12)
    expect(phraseProblem(p)).toBeNull()
    expect(phraseProblem(`  ${p.toUpperCase().replace(/ /g, '\n')} `)).toBeNull()
    expect(phraseProblem(p.split(' ').slice(0, 11).join(' '))).toEqual({ kind: 'count', words: 11 })
    const words = p.split(' ')
    expect(phraseProblem([...words.slice(0, 4), 'notaword', ...words.slice(5)].join(' '))).toEqual({ kind: 'word', word: 'notaword', at: 5 })
    const swapped = [words[1], words[0], ...words.slice(2)].join(' ')
    if (words[0] !== words[1]) expect(phraseProblem(swapped) === null || phraseProblem(swapped)?.kind === 'checksum').toBe(true)
    expect(phraseProblem('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon')).toEqual({ kind: 'checksum' })
  })

  it('a phone restored from the 12-word phrase gets everything back', async () => {
    fillPhone()
    const phrase = newPhrase()
    expect(await turnOn(phrase, true)).toBe('saved')
    const before = phoneContents()

    localStorage.clear() // a new phone
    expect(await restore(phrase)).toBe('restored')
    const after = phoneContents()
    for (const [k, v] of Object.entries(before)) {
      if (never(k)) expect(after[k], k).toBeUndefined()
      else expect(after[k], k).toBe(v)
    }
    expect(keptCard('2026-10-12-habits-001')?.words).toBe('I do them before I sit down, always')
    expect(plans()).toHaveLength(1)
    expect(vaultState()).toMatchObject({ phrase, version: 1, words: true })
  })

  it('own words stay out of the backup unless switched on, kept cards included', async () => {
    fillPhone()
    const phrase = newPhrase()
    await turnOn(phrase, false)
    localStorage.clear()
    await restore(phrase)
    expect(keys('pi.words.')).toHaveLength(0)
    expect(keptCard('2026-10-12-habits-001')).toMatchObject({ headline: 'You clear the decks before you rest.' })
    expect(keptCard('2026-10-12-habits-001')?.words).toBeUndefined()
    expect(load('pi.device.v1')).toBe('v1.pass-of-this-phone')

    setWords(true)
    expect(vaultState()).toMatchObject({ words: true, dirty: true })
  })

  it('the server sees only sealed bytes, under a key it cannot open them with', async () => {
    fillPhone()
    const phrase = newPhrase()
    await turnOn(phrase, true)
    const put = server.seen.find((r) => r.method === 'PUT')!
    const text = new TextDecoder('latin1').decode(put.body)
    for (const secret of ['Dishes after dinner', 'before I sit down', 'pass-of-this-phone', 'leave one job', phrase.split(' ')[0] + ' ']) {
      expect(text).not.toContain(secret)
    }
    expect(put.auth).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const k = await keysFor(phrase)
    expect(put.auth).toBe(k.vaultKey)
    // The vault key cannot unseal it: a different key opens nothing.
    const other = await keysFor(newPhrase())
    await expect(unseal(other.seal, put.body!)).rejects.toThrow()
    await keysFor(phrase)
  })

  it('a tampered backup is refused, never half-read', async () => {
    const k = await keysFor(newPhrase())
    const sealed = await seal(k.seal, snapshot(false))
    const bent = sealed.slice()
    bent[bent.length - 1] ^= 1
    await expect(unseal(k.seal, bent)).rejects.toThrow()
    const reformat = sealed.slice()
    reformat[0] = reformat[0] === 1 ? 2 : 1
    await expect(unseal(k.seal, reformat)).rejects.toThrow()
  })

  it('two phones on one phrase merge, and neither loses what it kept', async () => {
    fillPhone()
    const phrase = newPhrase()
    await turnOn(phrase, true)
    const phoneA = phoneContents()

    localStorage.clear() // phone B restores, then keeps a card of its own
    await restore(phrase)
    keepCard({ date: '2026-10-13', questionId: '2026-10-13-friendship-002', theme: 'friendship', prompt: 'A friend goes quiet?', answer: 'Call them', headline: 'You reach out first.' })
    saveJSON('pi.history.v1', mergeHistory(JSON.parse(load('pi.history.v1')!), {
      answers: [{ date: '2026-10-13', questionId: '2026-10-13-friendship-002', theme: 'friendship', depth: 1, traits: {} }],
      skips: [],
    }))
    expect(await backUp()).toBe('saved')
    expect(vaultState()?.version).toBe(2)

    // Phone A, still at version 1, keeps another card and backs up: it is
    // told phone B wrote first, takes B's backup in and writes again.
    localStorage.clear()
    for (const [k, v] of Object.entries(phoneA)) save(k, v)
    saveJSON('pi.vault.v1', { phrase, version: 1, words: true })
    keepCard({ date: '2026-10-14', questionId: '2026-10-14-money-003', theme: 'money', prompt: 'Payday?', answer: 'Save first', headline: 'You pay yourself first.' })
    saveJSON('pi.vault.v1', { ...vaultState()!, dirty: true })
    expect(await backUp()).toBe('saved')
    expect(vaultState()?.version).toBe(3)
    expect(keptCards().map((c) => c.questionId).sort()).toEqual(['2026-10-12-habits-001', '2026-10-13-friendship-002', '2026-10-14-money-003'])
    const answers = (JSON.parse(load('pi.history.v1')!) as { answers: { questionId: string }[] }).answers.map((a) => a.questionId)
    expect(answers).toEqual(['2026-10-12-habits-001', '2026-10-13-friendship-002'])

    localStorage.clear() // a third phone gets all three
    await restore(phrase)
    expect(keptCards()).toHaveLength(3)
  })

  it('restoring onto a phone that already answered keeps those answers closed', async () => {
    fillPhone()
    const phrase = newPhrase()
    await turnOn(phrase, false)
    localStorage.clear()
    save('pi.device.v1', 'v1.pass-of-the-new-phone')
    save('pi.choice.2026-10-12-habits-001', 'b') // answered here before restoring
    save('pi.pending.2026-10-12-habits-004', '{"key":"k2","option":"a"}')
    await restore(phrase)
    expect(load('pi.choice.2026-10-12-habits-001')).toBe('b')
    expect(load('pi.device.v1')).toBe('v1.pass-of-this-phone')
    expect(keys('pi.pending.')).toHaveLength(0) // it belonged to the other pass
  })

  it('a phrase with no backup restores nothing, and deleting the backup stops it everywhere', async () => {
    expect(await restore(newPhrase())).toBe('none')
    expect(vaultState()).toBeNull()

    fillPhone()
    const phrase = newPhrase()
    await turnOn(phrase, true)
    const copy = vaultState()!
    await deleteBackup()
    expect(server.held.size).toBe(0)
    expect(vaultState()).toBeNull()

    // The other phone, still backing up, is told the backup is gone and stops.
    saveJSON('pi.vault.v1', { ...copy, dirty: true })
    expect(await backUp()).toBe('gone')
    expect(vaultState()).toBeNull()
  })

  it('offline, a backup waits and goes when it can', async () => {
    fillPhone()
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))))
    const phrase = newPhrase()
    expect(await turnOn(phrase, true)).toBe('later')
    expect(vaultState()).toMatchObject({ version: 0, dirty: true })
    vi.stubGlobal('fetch', server.fetch)
    expect(await backUp()).toBe('saved')
    expect(vaultState()?.dirty).toBeUndefined()
    expect(await backUp()).toBe('saved') // nothing new: nothing sent
    expect(server.seen.filter((r) => r.method === 'PUT')).toHaveLength(1)
  })
})
