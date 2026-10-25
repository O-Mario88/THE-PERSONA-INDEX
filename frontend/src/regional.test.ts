import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Question } from './api'
import { isCountry } from './country'
import { loadMoves, sendUnsent, setMoveStatus, startMove } from './moves'
import { loadPrefs, regionHere, savePrefs } from './prefs'
import { loadHistory, pickThree, recordAnswer, recordSkip, todaysPick, type AnswerRecord, type History } from './profile'
import {
  cachedPack,
  fetchPack,
  regionalFor,
  REGIONAL_GAP_DAYS,
  REGIONAL_PAUSE_DAYS,
  REGIONAL_REPEAT_DAYS,
  type RegionalQuestion,
} from './regional'
import { regionCountries, regionOf, REGIONS } from './regions'
import { addDays } from './storage'
import { mergeHistory } from './vault'

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

const TODAY = '2026-10-14'

const regional = (id: string, region: RegionalQuestion['region'], theme = 'relatives'): RegionalQuestion => ({
  id,
  theme,
  care: 'personal',
  prompt: `A moment called ${id}. You usually…`,
  region,
  options: [
    { id: 'give', label: 'Give it', depth: 1, need: 'belonging' },
    { id: 'part', label: 'Give part of it', depth: 2, need: 'security' },
    { id: 'no', label: 'Say not this time', depth: 3, need: 'freedom' },
  ],
})
const PACK = [
  regional('africa-relative-money', 'africa'),
  regional('africa-savings-turn', 'africa', 'money'),
  regional('africa-power-cut', 'africa', 'home'),
  regional('west-meal-alone', 'west', 'food'),
]

const answered = (date: string, id: string, more: Partial<AnswerRecord> = {}): AnswerRecord => ({
  date,
  questionId: `${date}-${id}`,
  theme: 'relatives',
  depth: 2,
  traits: {},
  regional: true,
  ...more,
})
const hist = (answers: AnswerRecord[], skips: History['skips'] = []): History => ({ answers, skips })

describe('regions', () => {
  it('puts every country in at most one region, and only countries the app knows', () => {
    const seen = new Set<string>()
    for (const r of REGIONS) {
      for (const cc of regionCountries(r)) {
        expect(isCountry(cc), cc).toBe(true)
        expect(seen.has(cc), cc).toBe(false)
        seen.add(cc)
      }
    }
  })

  it('follows the research: the country, then its region, or none where the research did not reach', () => {
    expect(regionOf('NG')).toBe('africa')
    expect(regionOf('KE')).toBe('africa')
    expect(regionOf('EG')).toBe('mena') // North Africa sits with the Middle East
    expect(regionOf('TR')).toBe('mena')
    expect(regionOf('IN')).toBe('south-asia')
    expect(regionOf('JP')).toBe('east-asia')
    expect(regionOf('ID')).toBe('east-asia')
    expect(regionOf('BR')).toBe('latin-america')
    expect(regionOf('JM')).toBe('latin-america')
    expect(regionOf('GB')).toBe('west')
    expect(regionOf('PL')).toBe('west')
    expect(regionOf('KZ')).toBeNull()
    expect(regionOf('FJ')).toBeNull()
    expect(regionOf(null)).toBeNull()
  })

  it('is offered for a given country unless switched off, and never for "Prefer not to say"', () => {
    savePrefs({ adult: null, mild: false, wordsDays: 35, country: 'GH' })
    expect(regionHere(loadPrefs())).toBe('africa')
    savePrefs({ ...loadPrefs(), regional: false })
    expect(loadPrefs().regional).toBe(false)
    expect(regionHere(loadPrefs())).toBeNull()
    savePrefs({ adult: null, mild: false, wordsDays: 35, country: 'none' })
    expect(regionHere(loadPrefs())).toBeNull()
  })
})

describe('the pack', () => {
  it('is fetched with nothing about the phone, kept for offline, and anything malformed is dropped', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ regions: REGIONS, questions: [...PACK, { id: 'broken' }] })))
    vi.stubGlobal('fetch', fetchMock)
    expect(cachedPack()).toEqual([])
    expect(await fetchPack()).toEqual(PACK)
    expect(fetchMock).toHaveBeenCalledWith('/api/regional')
    expect(cachedPack()).toEqual(PACK)
  })

  it('keeps the old copy when the server cannot be reached', async () => {
    localStorage.setItem('pi.regional.v1', JSON.stringify({ questions: PACK }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    await expect(fetchPack()).rejects.toThrow()
    expect(cachedPack()).toEqual(PACK)
  })
})

describe('which regional question is offered', () => {
  it('offers one from the phone’s own region, as today’s question, asked on this phone only', () => {
    const q = regionalFor(PACK, 'africa', TODAY, hist([]))
    expect(q).toMatchObject({ local: true, theme: expect.any(String) })
    expect(q!.id.startsWith(`${TODAY}-africa-`)).toBe(true)
    expect(regionalFor(PACK, 'west', TODAY, hist([]))!.id).toBe(`${TODAY}-west-meal-alone`)
    expect(regionalFor(PACK, 'mena', TODAY, hist([]))).toBeNull() // none written for it in this pack
    expect(regionalFor(PACK, null, TODAY, hist([]))).toBeNull()
  })

  it('leaves a gap of a few days after one, and never repeats one within three weeks', () => {
    const recent = addDays(TODAY, -(REGIONAL_GAP_DAYS - 1))
    expect(regionalFor(PACK, 'africa', TODAY, hist([answered(recent, 'africa-relative-money')]))).toBeNull()
    const gapDone = addDays(TODAY, -REGIONAL_GAP_DAYS)
    const after = regionalFor(PACK, 'africa', TODAY, hist([answered(gapDone, 'africa-relative-money')]))
    expect(after!.id).not.toContain('africa-relative-money')
    // all three seen within the repeat window: none left
    const three = hist([
      answered(addDays(TODAY, -15), 'africa-relative-money'),
      answered(addDays(TODAY, -10), 'africa-savings-turn'),
      answered(addDays(TODAY, -5), 'africa-power-cut'),
    ])
    expect(regionalFor(PACK, 'africa', TODAY, three)).toBeNull()
    // the oldest comes back once the window has passed, before the others
    const later = addDays(TODAY, REGIONAL_REPEAT_DAYS - 15)
    expect(regionalFor(PACK, 'africa', later, three)!.id).toBe(`${later}-africa-relative-money`)
  })

  it('stops for four weeks after two in a row were skipped or "Not me"', () => {
    const more = [...PACK, regional('africa-long-wait', 'africa', 'home')]
    const skippedSavings = { date: addDays(TODAY, -4), theme: 'money', regional: true as const, questionId: `${addDays(TODAY, -4)}-africa-savings-turn` }
    const declined = hist([answered(addDays(TODAY, -8), 'africa-relative-money', { verdict: 'not_me' })], [skippedSavings])
    expect(regionalFor(more, 'africa', TODAY, declined)).toBeNull()
    expect(regionalFor(more, 'africa', addDays(TODAY, REGIONAL_PAUSE_DAYS - 5), declined)).toBeNull()
    expect(regionalFor(more, 'africa', addDays(TODAY, REGIONAL_PAUSE_DAYS - 4), declined)).not.toBeNull()
    // a "That's me" between the two declines and they carry on
    const liked = hist(
      [
        answered(addDays(TODAY, -12), 'africa-relative-money', { verdict: 'not_me' }),
        answered(addDays(TODAY, -8), 'africa-power-cut', { verdict: 'me' }),
      ],
      [skippedSavings],
    )
    expect(regionalFor(more, 'africa', TODAY, liked)!.id).toBe(`${TODAY}-africa-long-wait`)
  })

  it('holds all day: answering it today does not change the offer', () => {
    const before = regionalFor(PACK, 'africa', TODAY, hist([]))!
    recordAnswer(before, 'give', TODAY)
    expect(loadHistory().answers[0]).toMatchObject({ questionId: before.id, regional: true, need: 'belonging' })
    expect(regionalFor(PACK, 'africa', TODAY, loadHistory())).toEqual(before)
  })

  it('records a skipped one with its id, and a backup merge keeps it apart from other skips', () => {
    const q = regionalFor(PACK, 'africa', TODAY, hist([]))!
    recordSkip(q, TODAY)
    recordSkip({ id: 'q-other', theme: q.theme, prompt: 'p', options: [] }, TODAY)
    const skips = loadHistory().skips
    expect(skips).toEqual([
      { date: TODAY, theme: q.theme, regional: true, questionId: q.id },
      { date: TODAY, theme: q.theme },
    ])
    expect(mergeHistory(loadHistory(), { answers: [], skips: [skips[0]] }).skips).toHaveLength(2)
  })
})

describe('where an offered question goes in a sitting', () => {
  const q = (id: string, theme: string, depth = 2): Question => ({
    id,
    theme,
    care: 'everyday',
    prompt: `Question ${id}?`,
    options: [
      { id: 'a', label: 'A', depth: 1 },
      { id: 'b', label: 'B', depth },
    ],
  })
  const pool = [q('q-habits', 'habits'), q('q-money', 'money'), q('q-food', 'food'), q('q-rest', 'rest')]
  const seen: History = {
    answers: [
      { date: '2026-10-12', questionId: 'x1', theme: 'habits', depth: 4, traits: {} },
      { date: '2026-10-12', questionId: 'x2', theme: 'money', depth: 3, traits: {} },
    ],
    skips: [],
  }

  // the offer's own theme may clash with the pool's, so these give it a free one
  const freeOffer = () => ({ ...regionalFor(PACK, 'africa', TODAY, hist([]))!, theme: 'relatives' })

  it('takes the third place when its theme is free', () => {
    const offer = freeOffer()
    const picked = pickThree(pool, pool.slice(0, 3), seen, TODAY, false, [], offer)
    expect(picked.map((x) => x.id)).toEqual(['q-habits', 'q-money', offer.id])
  })

  it('waits when a higher-interest question already has its theme, or the morning took it', () => {
    const offer = { ...regionalFor(PACK, 'africa', TODAY, hist([]))!, theme: 'money' }
    expect(pickThree(pool, pool.slice(0, 3), seen, TODAY, false, [], offer).map((x) => x.id)).not.toContain(offer.id)
    const morning = pickThree(pool, pool.slice(0, 3), seen, TODAY, false, [], { ...offer, theme: 'relatives' })
    const evening = pickThree(pool, pool.slice(0, 3), seen, TODAY, false, morning, { ...offer, theme: 'relatives' })
    expect(evening.map((x) => x.id)).not.toContain(offer.id)
  })

  it('never shows to a phone with no answers yet: the shared three come first', () => {
    const offer = regionalFor(PACK, 'africa', TODAY, hist([]))!
    expect(pickThree(pool, pool.slice(0, 3), hist([]), TODAY, false, [], offer)).toEqual(pool.slice(0, 3))
  })

  it('stays picked for the day once shown', () => {
    localStorage.setItem('pi.history.v1', JSON.stringify(seen))
    const offer = freeOffer()
    const first = todaysPick(pool, pool.slice(0, 3), TODAY, false, 'morning', [], offer)
    expect(first.map((x) => x.id)).toContain(offer.id)
    expect(todaysPick(pool, pool.slice(0, 3), TODAY, false, 'morning', [], offer)).toEqual(first)
  })
})

describe("a regional question's step", () => {
  it('is kept on this phone and never sent, when started or later', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const id = `${TODAY}-africa-relative-money`
    await startMove(TODAY, id, 'give', 'Ask them what it is for.', Date.now(), false, true)
    await setMoveStatus(id, 'helped', TODAY)
    await sendUnsent(TODAY)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(loadMoves()).toEqual([expect.objectContaining({ questionId: id, status: 'helped', local: true })])
    expect(loadMoves()[0].unsent).toBeUndefined()
  })
})
