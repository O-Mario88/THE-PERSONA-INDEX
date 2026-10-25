import { beforeEach, describe, expect, it } from 'vitest'
import type { Question } from './api'
import type { Need } from './needs'
import { loadHistory, recordAnswer, recordRoute, type AnswerRecord, type History } from './profile'
import { needsBetween, reachedFor, rememberSafety, routeToAsk, safetyAnswer, safetyLed } from './reaching'
import { saveJSON } from './storage'
import { mergeHistory } from './vault'

beforeEach(() => localStorage.clear())

let n = 0
const rec = (date: string, need: Need | undefined, more: Partial<AnswerRecord> = {}): AnswerRecord => ({
  date,
  questionId: `${date}-q${++n}`,
  theme: 'habits',
  depth: 2,
  traits: {},
  ...(need ? { need } : {}),
  ...more,
})
const hist = (...answers: AnswerRecord[]): History => ({ answers, skips: [] })

describe('what a week reached for', () => {
  it('counts only answers that carry a need, are not intimate or heavy, and were not "Not me"', () => {
    const h = hist(
      rec('2026-10-12', 'belonging'),
      rec('2026-10-12', 'belonging', { theme: 'intimacy' }),
      rec('2026-10-13', 'belonging', { heavy: true }),
      rec('2026-10-13', 'belonging', { verdict: 'not_me' }),
      rec('2026-10-13', undefined),
      rec('2026-10-19', 'belonging'), // the week after
    )
    expect(needsBetween(h, '2026-10-12', '2026-10-18')).toEqual([{ need: 'belonging', answers: 1, days: 1, routes: [] }])
  })

  it('shows a need once it is a pattern: three answers on two days, the top two only', () => {
    const h = hist(
      rec('2026-10-12', 'calm'),
      rec('2026-10-12', 'calm'),
      rec('2026-10-12', 'calm'), // three, but one day
      rec('2026-10-12', 'security'),
      rec('2026-10-13', 'security'),
      rec('2026-10-14', 'security'),
      rec('2026-10-14', 'security'),
      rec('2026-10-13', 'respect'),
      rec('2026-10-14', 'respect'),
      rec('2026-10-15', 'respect'),
      rec('2026-10-13', 'freedom'),
      rec('2026-10-14', 'freedom'),
      rec('2026-10-16', 'freedom'), // ties respect on three, reached for later
    )
    expect(reachedFor(h, '2026-10-12', '2026-10-18').map((r) => r.need)).toEqual(['security', 'freedom'])
  })

  it('keeps the routes the person tapped, with their words', () => {
    const h = hist(rec('2026-10-12', 'calm', { route: 'yes', label: 'A slow walk' }), rec('2026-10-13', 'calm'), rec('2026-10-13', 'calm'))
    const [calm] = reachedFor(h, '2026-10-12', '2026-10-18')
    expect(calm.routes).toEqual([{ questionId: h.answers[0].questionId, date: '2026-10-12', label: 'A slow walk', route: 'yes' }])
  })
})

describe('the safety question', () => {
  const securityWeek = (monday: string) => {
    const [y, m, d] = monday.split('-').map(Number)
    const day = (k: number) => new Date(Date.UTC(y, m - 1, d + k)).toISOString().slice(0, 10)
    return [rec(day(0), 'security'), rec(day(1), 'security'), rec(day(2), 'security'), rec(day(2), 'calm')]
  }

  it('is asked once feeling safe has led three weeks running', () => {
    const h = hist(...securityWeek('2026-09-28'), ...securityWeek('2026-10-05'), ...securityWeek('2026-10-12'))
    expect(safetyLed(h, '2026-10-12', '2026-10-18')).toBe(true)
  })

  it('waits when it has led only two weeks, or another need came first', () => {
    expect(safetyLed(hist(...securityWeek('2026-10-05'), ...securityWeek('2026-10-12')), '2026-10-12', '2026-10-18')).toBe(false)
    const calmWeek = [rec('2026-10-05', 'calm'), rec('2026-10-06', 'calm'), rec('2026-10-07', 'calm'), rec('2026-10-08', 'calm')]
    const h = hist(...securityWeek('2026-09-28'), ...securityWeek('2026-10-05'), ...calmWeek, ...securityWeek('2026-10-12'))
    expect(safetyLed(h, '2026-10-12', '2026-10-18')).toBe(false)
  })

  it('keeps the answer on the phone by the week it was asked', () => {
    rememberSafety('2026-10-14', 'money')
    expect(safetyAnswer('2026-10-12')).toBe('money')
    expect(safetyAnswer('2026-10-18')).toBe('money')
    expect(safetyAnswer('2026-10-19')).toBeNull()
    saveJSON('pi.safety.2026-10-19', 'everything')
    expect(safetyAnswer('2026-10-19')).toBeNull()
  })
})

describe("the evening's question about the morning", () => {
  const q = (id: string, theme = 'habits'): Question => ({
    id,
    theme,
    care: theme === 'intimacy' ? 'intimate' : 'everyday',
    prompt: id,
    options: [
      { id: 'a', label: 'Light one', depth: 1, need: 'calm' },
      { id: 'b', label: 'Deep one', depth: 3, need: 'belonging' },
    ],
  })

  it("asks about the morning's deepest answer that counts", () => {
    const morning = [q('m1'), q('m2'), q('m3', 'intimacy')]
    const h = hist(
      { date: '2026-10-12', questionId: 'm1', theme: 'habits', depth: 1, traits: {}, optionId: 'a', need: 'calm' },
      { date: '2026-10-12', questionId: 'm2', theme: 'habits', depth: 3, traits: {}, optionId: 'b', need: 'belonging' },
      { date: '2026-10-12', questionId: 'm3', theme: 'intimacy', depth: 3, traits: {}, optionId: 'b', need: 'belonging' },
    )
    const ask = routeToAsk(h, morning, '2026-10-12')
    expect(ask?.question.id).toBe('m2')
    expect(ask?.label).toBe('Deep one')
  })

  it('asks nothing on a day with no such answer', () => {
    const h = hist({ date: '2026-10-11', questionId: 'm1', theme: 'habits', depth: 3, traits: {}, optionId: 'b', need: 'belonging' })
    expect(routeToAsk(h, [q('m1')], '2026-10-12')).toBeNull()
    const marked = hist({ date: '2026-10-12', questionId: 'm1', theme: 'habits', depth: 3, traits: {}, optionId: 'b', need: 'belonging', verdict: 'not_me' })
    expect(routeToAsk(marked, [q('m1')], '2026-10-12')).toBeNull()
  })
})

describe('keeping needs and routes with the answers', () => {
  const card: Question = {
    id: '2026-10-12-habits-001',
    theme: 'habits',
    care: 'everyday',
    prompt: 'First thing you do?',
    options: [
      { id: 'water', label: 'Drink some water', depth: 1, need: 'calm' },
      { id: 'odd', label: 'Something else', depth: 2, need: 'status' as Need },
    ],
  }

  it('records the need of the answer chosen, and only a known one', () => {
    recordAnswer(card, 'water', '2026-10-12')
    recordAnswer({ ...card, id: '2026-10-13-habits-001' }, 'odd', '2026-10-13')
    expect(loadHistory().answers.map((a) => a.need)).toEqual(['calm', undefined])
  })

  it("keeps the evening's word on the route with the answer's words", () => {
    recordAnswer(card, 'water', '2026-10-12')
    recordRoute(card.id, 'bit', 'Drink some water')
    expect(loadHistory().answers[0]).toMatchObject({ route: 'bit', label: 'Drink some water' })
  })

  it('merges a route tapped on another phone', () => {
    const mine = hist(rec('2026-10-12', 'calm'))
    const theirs = hist({ ...mine.answers[0], route: 'no', label: 'Scroll for a while' })
    expect(mergeHistory(mine, theirs).answers[0]).toMatchObject({ route: 'no', label: 'Scroll for a while' })
    expect(mergeHistory(theirs, mine).answers[0]).toMatchObject({ route: 'no', label: 'Scroll for a while' })
  })
})
