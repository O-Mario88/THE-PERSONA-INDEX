import { beforeEach, describe, expect, it } from 'vitest'
import {
  checkPlan,
  focusPlan,
  keepCard,
  keepSentence,
  keptCard,
  lookBack,
  lookBackDue,
  makePlan,
  noteRevisit,
  openPlans,
  plan,
  reviseWords,
  sentence,
  timesDone,
  wordsBackDue,
  type KeptCard,
} from './notebook'

// The proposal of 2026-10-24, "The app remembers you": what Sunday brings
// back ("Is that still true?") and the one thing a person is working on.

const card = (questionId: string, date: string, extra: Partial<KeptCard> = {}) =>
  keepCard({ date, questionId, theme: 'money', prompt: 'Payday?', answer: 'Savings', headline: 'You pay yourself first.', ...extra })

beforeEach(() => localStorage.clear())

describe('words back', () => {
  it('brings back the oldest card or Sunday sentence kept four weeks or more ago', () => {
    card('2026-09-20-money-001', '2026-09-20')
    keepSentence('2026-09-07', 'This week I learned that I say yes too fast.') // written 13 September
    card('2026-10-05-money-002', '2026-10-05') // not four weeks yet
    expect(wordsBackDue('2026-10-18')).toMatchObject({ kind: 'sentence', sentence: { week: '2026-09-07' } })
    keepSentence('2026-09-07', '')
    expect(wordsBackDue('2026-10-18')).toMatchObject({ kind: 'card', card: { questionId: '2026-09-20-money-001' } })
  })

  it('never brings back a private card, or one the person said was not them', () => {
    card('2026-09-14-intimacy-001', '2026-09-14', { theme: 'intimacy', private: true })
    card('2026-09-15-money-001', '2026-09-15', { verdict: 'not_me' })
    expect(wordsBackDue('2026-10-18')).toBeNull()
  })

  it('asks once a month, closes an item that changed, and asks again after half a year when it still held', () => {
    card('2026-09-01-money-001', '2026-09-01')
    card('2026-09-02-money-002', '2026-09-02')
    const first = wordsBackDue('2026-10-04')!
    reviseWords(first, { date: '2026-10-04', verdict: 'still' })
    expect(wordsBackDue('2026-10-18')).toBeNull() // one a month
    const second = wordsBackDue('2026-11-01')!
    expect(second).toMatchObject({ card: { questionId: '2026-09-02-money-002' } })
    reviseWords(second, { date: '2026-11-01', verdict: 'changing' })
    noteRevisit(second, '  I put money aside every week now.  ')
    expect(keptCard('2026-09-02-money-002')?.revisits).toEqual([
      { date: '2026-11-01', verdict: 'changing', note: 'I put money aside every week now.' },
    ])
    // The changed card is done with; the one that held waits half a year.
    expect(wordsBackDue('2026-12-06')).toBeNull()
    expect(wordsBackDue('2027-04-04')).toMatchObject({ card: { questionId: '2026-09-01-money-001' } })
  })

  it('keeps the answer and the note with a Sunday sentence', () => {
    keepSentence('2026-09-07', 'This week I learned that I say yes too fast.')
    const item = wordsBackDue('2026-10-18')!
    reviseWords(item, { date: '2026-10-18', verdict: 'not_anymore' })
    noteRevisit(item, 'I ask for a day to think.')
    expect(sentence('2026-09-07')?.revisits).toEqual([{ date: '2026-10-18', verdict: 'not_anymore', note: 'I ask for a day to think.' }])
    // Changing the sentence later keeps what was said about it.
    keepSentence('2026-09-07', 'This week I learned that I said yes too fast.')
    expect(sentence('2026-09-07')?.revisits).toHaveLength(1)
  })
})

describe('one thing you are working on', () => {
  it('is the newest plan, and making a new one closes the others', () => {
    const a = makePlan({ made: '2026-10-01', trait: 'agreeableness', high: true, when: 'someone asks a favour', will: 'pause first' })
    expect(focusPlan()?.id).toBe(a.id)
    const b = makePlan({ made: '2026-10-12', trait: 'conscientiousness', high: true, when: 'I sit down', will: 'leave one job' })
    expect(focusPlan()?.id).toBe(b.id)
    expect(openPlans().map((p) => p.id)).toEqual([b.id])
    expect(plan(a.id)?.closed).toBe(true)
  })

  it('counts only the times it was done, and looks back every eight weeks', () => {
    const p = makePlan({ made: '2026-08-20', trait: 'conscientiousness', high: true, when: 'I sit down', will: 'leave one job' })
    checkPlan(p.id, 'did', '2026-08-21')
    checkPlan(p.id, 'not_yet', '2026-08-22')
    checkPlan(p.id, 'did', '2026-08-23')
    expect(timesDone(plan(p.id)!)).toBe(2)
    expect(lookBackDue(plan(p.id)!, '2026-10-14')).toBe(false)
    expect(lookBackDue(plan(p.id)!, '2026-10-15')).toBe(true)
    lookBack(p.id, '2026-10-18')
    expect(lookBackDue(plan(p.id)!, '2026-12-12')).toBe(false)
    expect(lookBackDue(plan(p.id)!, '2026-12-13')).toBe(true)
  })
})
