import { beforeEach, describe, expect, it } from 'vitest'
import type { Question } from './api'
import {
  cardTextOf,
  evidenceFor,
  evidenceLabel,
  forYou,
  keepCardText,
  notAloneFor,
  pruneCardTexts,
  type NotAloneQuestion,
} from './insights'
import type { Need } from './needs'
import type { AnswerRecord, History } from './profile'
import { voiceProblems } from './voice'

beforeEach(() => localStorage.clear())

const today = '2026-10-25'
let n = 0
const rec = (date: string, need: Need | undefined, more: Partial<AnswerRecord> = {}): AnswerRecord => ({
  date,
  questionId: `${date}-q${++n}`,
  theme: 'habits',
  depth: 2,
  traits: {},
  optionId: 'a',
  ...(need ? { need } : {}),
  ...more,
})
const hist = (...answers: AnswerRecord[]): History => ({ answers, skips: [] })

const question = (id: string, more: Partial<Question> = {}): Question => ({
  id,
  theme: 'habits',
  prompt: 'When do you wash the dishes?',
  options: [
    {
      id: 'a',
      label: 'Right after eating',
      need: 'calm',
      insight: { reveal: 'You like a clear surface.', otherSide: 'It can cost you rest.', step: 'Leave one cup tonight.' },
    },
    { id: 'b', label: 'When the sink is full', heavy: true },
  ],
  ...more,
})

describe('the card text kept for Insights', () => {
  it('keeps what the card said, so an older answer still has its reading', () => {
    keepCardText(question('2026-10-20-q'), 'a', '2026-10-20')
    expect(cardTextOf('2026-10-20-q')).toMatchObject({
      date: '2026-10-20',
      prompt: 'When do you wash the dishes?',
      label: 'Right after eating',
      reveal: 'You like a clear surface.',
      otherSide: 'It can cost you rest.',
      step: 'Leave one cup tonight.',
      need: 'calm',
    })
  })

  it('keeps nothing for an intimate question', () => {
    keepCardText(question('2026-10-20-x', { care: 'intimate' }), 'a', '2026-10-20')
    expect(cardTextOf('2026-10-20-x')).toBeNull()
  })

  it('marks a heavy answer, with no reading or step', () => {
    keepCardText(question('2026-10-20-h'), 'b', '2026-10-20')
    const t = cardTextOf('2026-10-20-h')
    expect(t?.heavy).toBe(true)
    expect(t?.reveal).toBeUndefined()
    expect(t?.step).toBeUndefined()
  })

  it('lets go of cards older than thirty days', () => {
    keepCardText(question('2026-09-20-q'), 'a', '2026-09-20')
    keepCardText(question('2026-10-20-q'), 'a', '2026-10-20')
    pruneCardTexts(today)
    expect(cardTextOf('2026-09-20-q')).toBeNull()
    expect(cardTextOf('2026-10-20-q')).not.toBeNull()
  })
})

describe('how sure a card can be', () => {
  it('is a thought from one answer', () => {
    const h = hist(rec(today, 'calm'))
    expect(evidenceFor(h, 'calm', today)).toBe('thought')
  })

  it('is something you have been noticing when the same need comes up across answers and days', () => {
    const h = hist(rec('2026-10-23', 'calm'), rec('2026-10-24', 'calm'), rec(today, 'calm'))
    expect(evidenceFor(h, 'calm', today)).toBe('noticing')
  })

  it('is a pattern worth exploring when it recurs over weeks', () => {
    const h = hist(rec('2026-10-08', 'calm'), rec('2026-10-14', 'calm'), rec('2026-10-21', 'calm'), rec(today, 'calm'))
    expect(evidenceFor(h, 'calm', today)).toBe('pattern')
  })

  it('stops calling it a pattern once the person says "Not me"', () => {
    const h = hist(
      rec('2026-10-08', 'calm'),
      rec('2026-10-14', 'calm'),
      rec('2026-10-21', 'calm', { verdict: 'not_me' }),
      rec(today, 'calm'),
      rec(today, 'calm'),
    )
    expect(evidenceFor(h, 'calm', today)).toBe('thought')
  })

  it('names each level as a label, never a rank or a score', () => {
    const labels = [evidenceLabel('thought', today, today), evidenceLabel('thought', '2026-10-21', today), evidenceLabel('noticing', today, today), evidenceLabel('pattern', today, today)]
    expect(labels).toEqual(['A thought from today', 'A thought from 21 October', 'Something you’ve been noticing', 'A pattern worth exploring'])
    for (const l of labels) {
      expect(l).not.toMatch(/%|\d+\s*(points|score)|level/i)
      expect(voiceProblems(l)).toEqual([])
    }
  })
})

describe('For You', () => {
  it('shows the newest answers first, each with its reading, within the days chosen', () => {
    const h = hist(rec('2026-10-10', 'calm'), rec('2026-10-21', 'calm'), rec(today, 'calm'))
    for (const a of h.answers) keepCardText(question(a.questionId), 'a', a.date)
    expect(forYou(h, today, 7).map((c) => c.date)).toEqual([today, '2026-10-21'])
    expect(forYou(h, today, 30).map((c) => c.date)).toEqual([today, '2026-10-21', '2026-10-10'])
    expect(forYou(h, today, 7)[0]).toMatchObject({ reveal: 'You like a clear surface.', evidence: 'pattern' })
  })

  it('leaves out a card the person said is not them, and answers with no kept card', () => {
    const shown = rec(today, 'calm')
    const notMe = rec(today, 'calm', { verdict: 'not_me' })
    const noText = rec(today, 'calm')
    keepCardText(question(shown.questionId), 'a', today)
    keepCardText(question(notMe.questionId), 'a', today)
    expect(forYou(hist(shown, notMe, noText), today, 7).map((c) => c.questionId)).toEqual([shown.questionId])
  })

  it("uses today's questions for an answer from before cards were kept", () => {
    const a = rec(today, 'calm')
    expect(forYou(hist(a), today, 7, [question(a.questionId)])[0]?.reveal).toBe('You like a clear surface.')
  })
})

describe("You're not alone", () => {
  const counts: NotAloneQuestion[] = [
    { questionId: 'q1', total: 140, options: [{ optionId: 'a', count: 37 }, { optionId: 'b', count: 103 }] },
    { questionId: 'q2', total: 22, options: [{ optionId: 'a', count: 22 }, { optionId: 'b', count: 0, few: true }] },
  ]

  it('gives the real count and the total, never a percentage', () => {
    expect(notAloneFor(counts, 'q1', 'a')).toEqual({ kind: 'count', same: 37, total: 140 })
  })

  it('says only "a few" for an answer a few chose', () => {
    expect(notAloneFor(counts, 'q2', 'b')).toEqual({ kind: 'few' })
  })

  it('says the picture is still forming below the minimum', () => {
    expect(notAloneFor(counts, 'q3', 'a')).toEqual({ kind: 'forming' })
  })

  it('says nothing when the counts could not be fetched', () => {
    expect(notAloneFor(null, 'q1', 'a')).toBeNull()
  })
})
