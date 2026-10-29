import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { askPair, getPair, pairWeekWords } from './pair'
import { voiceProblems } from './voice'

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

// Edwin's brief, 2026-10-29: "Alongside [Name] this week… Where your weeks
// rhymed… Where your weeks differed… One question for the two of you." Built
// only from what both people's answers reached for, never the answers.
describe('Sunday, alongside one person', () => {
  it('says where the weeks rhymed and where they differed, then one question for the two of them', () => {
    expect(pairWeekWords({ with: 'Kofi', unlocked: true, rhymes: ['calm'], mine: 'competence', theirs: 'calm' })).toEqual({
      title: 'Alongside Kofi this week',
      lines: ['Where your weeks rhymed: you both reached for feeling settled.', 'Where they differed: your answers leaned towards doing well, and Kofi’s towards feeling settled.'],
      question: 'What would help each of us feel a little more settled this coming week?',
    })
  })

  it('names a week that only rhymed, with a question from what they shared', () => {
    expect(pairWeekWords({ with: 'Ama', unlocked: true, rhymes: ['belonging', 'calm'] })).toEqual({
      title: 'Alongside Ama this week',
      lines: ['Where your weeks rhymed: you both reached for being close to people and feeling settled.'],
      question: 'When did each of us feel closest to someone this week?',
    })
  })

  it('says nothing yet while the week is forming, or before either is a Patron', () => {
    expect(pairWeekWords({ with: 'Ama', unlocked: true, forming: true })).toBeNull()
    expect(pairWeekWords({ with: 'Ama', unlocked: false })).toBeNull()
  })

  it('speaks in the app’s own voice', () => {
    const all = (['calm', 'belonging', 'respect', 'competence', 'security', 'freedom', 'understood'] as const).flatMap((n) => {
      const w = pairWeekWords({ with: 'Esi', unlocked: true, rhymes: [n], mine: n, theirs: n === 'calm' ? 'belonging' : 'calm' })
      return w ? [w.title, ...w.lines, w.question] : []
    })
    for (const line of all) expect(voiceProblems(line), line).toEqual([])
  })
})

describe('asking the server', () => {
  it('asks with the account, and reads the answer it gives back', async () => {
    localStorage.setItem('pi.account.v1', 'acct-token')
    const fetch = vi.fn(async () => new Response(JSON.stringify({ state: 'asked', with: { id: 'k1', name: 'Kofi', handle: 'kofi' } }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    expect(await askPair('k1')).toEqual({ state: 'asked', with: { id: 'k1', name: 'Kofi', handle: 'kofi' } })
    expect(fetch).toHaveBeenCalledWith(
      '/api/pair',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ friendId: 'k1' }), headers: expect.objectContaining({ Authorization: 'Account acct-token' }) }),
    )
  })

  it('reads an unknown answer as nobody', async () => {
    localStorage.setItem('pi.account.v1', 'acct-token')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ state: 'dancing' }), { status: 200 })),
    )
    expect(await getPair()).toEqual({ state: 'none' })
  })
})
