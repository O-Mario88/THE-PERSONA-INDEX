import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServerExport } from './api'
import { bookHTML, dataFile, downloadBook, fullDate, gatherBook } from './book'
import { checkPlan, keepCard, keepGoodThings, keepSentence, makePlan, notePractice, rename, reviseSentence, unkeepCard } from './notebook'
import { REGISTRY } from './registry'
import { save, saveJSON } from './storage'

// "Download my book" (Phase 3): the page holds what the person kept, wrote
// and answered, escaped, with private entries left out under "Keep it mild";
// the data file holds every key the registry offers for download.

const server: ServerExport = {
  made: '2026-10-23',
  about: 'Everything the server keeps for this phone.',
  keptFor: { answersDays: 35, weeklyNotesDays: 400, votesDays: 7, backupDays: 400 },
  answers: [
    { date: '2026-10-20', sitting: 'morning', theme: 'money', question: 'Payday: what goes first?', answer: 'Savings', verdict: 'me' },
    { date: '2026-10-20', sitting: 'evening', theme: 'intimacy', question: 'A private question', answer: 'A private answer', private: true },
  ],
  steps: [{ started: '2026-10-20', question: 'Payday: what goes first?', step: 'Move £10 on payday.', status: 'helped' }],
  planChecks: [{ date: '2026-10-21', status: 'did' }],
  weeklyNotes: [],
  votes: [],
}

function fillNotebook() {
  keepCard({
    date: '2026-10-20',
    questionId: '2026-10-20-money-001',
    theme: 'money',
    prompt: 'Payday: what goes first?',
    answer: 'Savings',
    words: 'Savings <b>always</b> & then rent',
    headline: 'You pay yourself first.',
    body: 'People who save first tend to keep saving.',
    otherSide: 'Saving everything can leave no room for joy.',
    step: 'Move £10 on payday.',
    verdict: 'me',
  })
  keepCard({
    date: '2026-10-21',
    questionId: '2026-10-21-intimacy-001',
    theme: 'intimacy',
    private: true,
    prompt: 'What makes you feel close?',
    answer: 'Talking late',
    headline: 'Closeness starts with words for you.',
  })
  keepGoodThings('2026-10-21', ['A long walk', 'Tea with Mum', ''])
  keepSentence('2026-10-19', 'This week I learned that I rush the last step.')
  const p = makePlan({ made: '2026-10-19', trait: 'conscientiousness', high: true, when: 'I sit down', will: 'leave one job for tomorrow' })
  checkPlan(p.id, 'did', '2026-10-20')
  rename('2026-10-19', 'The Steady Noticer', 'The Quiet Starter')
  notePractice('2026-10-20', 'savour')
  notePractice('2026-10-21', 'savour')
  saveJSON('pi.words.2026-10-21-intimacy-002', {
    questionId: '2026-10-21-intimacy-002',
    date: '2026-10-21',
    prompt: 'Something private',
    private: true,
    words: 'only mine',
  })
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the book', () => {
  it('holds the notebook, own words and the server copy, escaped', () => {
    fillNotebook()
    const html = bookHTML(gatherBook('2026-10-23', false, server))
    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain('Made on 23 October 2026')
    expect(html).toContain('Savings &lt;b&gt;always&lt;/b&gt; &amp; then rent')
    expect(html).not.toContain('<b>always</b>')
    expect(html).toContain('You pay yourself first.')
    expect(html).toContain('The other side')
    expect(html).toContain('You said: that&#39;s me.')
    expect(html).toContain('Closeness starts with words for you.')
    expect(html).toContain('A long walk')
    expect(html).toContain('This week I learned that I rush the last step.')
    expect(html).not.toContain("What's different now")
    expect(html).toContain('When I sit down, I will leave one job for tomorrow.')
    expect(html).toContain('Did it 1 time, not yet 0 times.')
    expect(html).toContain('The Quiet Starter')
    expect(html).toContain('2 times, last on 21 October 2026')
    expect(html).toContain('only mine')
    expect(html).toContain('Payday: what goes first?')
    expect(html).toContain('Move £10 on payday.')
    expect(html).toContain('Helped')
    expect(html).toContain('Something to think about, never a diagnosis.')
    expect(html).toContain('findahelpline.com')
    // A page that stands on its own: nothing fetched, nothing run.
    expect(html).not.toMatch(/<script|<link|src=|@import|url\(/i)
  })

  it('keeps what Sunday brought back, and what is different now', () => {
    fillNotebook()
    reviseSentence('2026-10-19', { date: '2026-11-22', verdict: 'changing', note: 'I slow down <now>' })
    const html = bookHTML(gatherBook('2026-11-23', false, server))
    expect(html).toContain("22 November 2026: changing · What's different now: “I slow down &lt;now&gt;”")
  })

  it('leaves private entries out while "Keep it mild" is on, and says how many', () => {
    fillNotebook()
    const html = bookHTML(gatherBook('2026-10-23', true, server))
    expect(html).not.toContain('Closeness starts with words for you.')
    expect(html).not.toContain('only mine')
    expect(html).not.toContain('A private answer')
    expect(html).toContain('3 private entries left out while &quot;Keep it mild&quot; is on.')
    expect(html).toContain('You pay yourself first.')
  })

  it('says so when the server could not be reached, or keeps nothing', () => {
    fillNotebook()
    expect(bookHTML(gatherBook('2026-10-23', false, 'unreachable'))).toContain("I couldn&#39;t reach the server")
    expect(bookHTML(gatherBook('2026-10-23', false, null))).toContain('The server keeps no answers for this phone')
  })

  it('leaves out what was removed', () => {
    fillNotebook()
    unkeepCard('2026-10-20-money-001')
    expect(bookHTML(gatherBook('2026-10-23', false, null))).not.toContain('You pay yourself first.')
  })

  it('writes dates with their year', () => {
    expect(fullDate('2026-01-05')).toBe('5 January 2026')
  })
})

describe('the data file', () => {
  it('holds every key the registry offers for download, and the server copy', () => {
    fillNotebook()
    save('pi.device.v1', 'v1.pass')
    saveJSON('pi.vault.v1', { phrase: 'secret words', version: 1, words: false })
    saveJSON('pi.prefs.v1', { adult: true, mild: false, wordsDays: 35 })
    save('pi.choice.2026-10-20-money-001', 'savings')
    save('pi.pending.2026-10-20-money-001', '{}')
    unkeepCard('2026-10-21-intimacy-001')
    const file = JSON.parse(dataFile('2026-10-23', server))
    expect(file.made).toBe('2026-10-23')
    expect(file.server.answers).toHaveLength(2)
    const keys = Object.keys(file.phone)
    expect(keys).toContain('pi.prefs.v1')
    expect(keys).toContain('pi.choice.2026-10-20-money-001')
    expect(keys).toContain('pi.nb.card.2026-10-20-money-001')
    expect(keys).toContain('pi.words.2026-10-21-intimacy-002')
    expect(file.phone['pi.prefs.v1']).toEqual({ adult: true, mild: false, wordsDays: 35 })
    // The pass, the phrase and what waits to be sent are not the person's record.
    expect(keys).not.toContain('pi.device.v1')
    expect(keys).not.toContain('pi.vault.v1')
    expect(keys).not.toContain('pi.pending.2026-10-20-money-001')
    expect(JSON.stringify(file)).not.toContain('secret words')
    // A removed card leaves only its mark, which is not worth a line.
    expect(keys).not.toContain('pi.nb.card.2026-10-21-intimacy-001')
    for (const k of keys) {
      const e = REGISTRY.find((r) => k === r.key || (/[.-]$/.test(r.key) && k.startsWith(r.key)))
      expect(e?.download, k).toBe(true)
    }
  })
})

describe('downloading', () => {
  it('saves the book with the server copy, or with what the phone has', async () => {
    fillNotebook()
    save('pi.device.v1', 'v1.pass')
    const blobs: Blob[] = []
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => (blobs.push(b), 'blob:x'), revokeObjectURL: () => {} }))
    const names: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download)
    })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(server), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await downloadBook('2026-10-23', false)).toBe('saved')
    expect(fetchMock).toHaveBeenCalledWith('/api/device/export', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Device v1.pass' }) }))
    expect(blobs).toHaveLength(1)
    expect(blobs[0].type).toBe('text/html')
    expect(names).toEqual(['my-notebook-2026-10-23.html'])

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))))
    expect(await downloadBook('2026-10-23', false)).toBe('phone-only')
    expect(blobs).toHaveLength(2)
  })
})
