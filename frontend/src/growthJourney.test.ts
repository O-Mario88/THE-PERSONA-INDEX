import { beforeEach, describe, expect, it } from 'vitest'
import { checkInFor, dueStep, journeyHistory, lifeAreas, noteFor, outcomeLine, revisitFor, saveCheckIn, statusFor } from './growthJourney'
import type { Move } from './moves'
import type { Reflection } from './notebook'

beforeEach(() => localStorage.clear())

const move = (date: string, questionId: string, step: string, status: Move['status'] = 'started'): Move => ({ date, questionId, optionId: 'o', step, status })
const answer = (date: string, questionId: string, theme: string) => ({ date, questionId, theme, depth: 2, traits: {} })
const writing = (date: string, area: Reflection['area']): Reflection => ({
  kind: 'reflection',
  at: 1,
  id: `r-${date}`,
  date,
  period: 'day',
  area,
  group: 'learnt',
  source: 'answers',
  about: '',
  question: '',
  answer: 'Private words that never show here.',
})

describe('closing the loop on a step', () => {
  it('tells the server only what it already understands, never the feeling or the note', () => {
    expect(statusFor({ questionId: 'q', date: 'd', tried: 'yes', outcome: 'helped', feeling: 'lighter' })).toBe('helped')
    expect(statusFor({ questionId: 'q', date: 'd', tried: 'little', outcome: 'helped_little' })).toBe('helped')
    expect(statusFor({ questionId: 'q', date: 'd', tried: 'yes', outcome: 'harder' })).toBe('no_change')
    expect(statusFor({ questionId: 'q', date: 'd', tried: 'decided_not' })).toBe('not_tried')
    expect(statusFor({ questionId: 'q', date: 'd', tried: 'not_yet' })).toBe('not_tried')
    // Kept for later: the step stays open, nothing new to send.
    expect(statusFor({ questionId: 'q', date: 'd', tried: 'not_yet', later: '2026-10-31' })).toBeNull()
  })

  it('keeps the check-in, and the note apart from it in the person’s own words', () => {
    saveCheckIn({ questionId: 'q1', date: '2026-10-28', tried: 'yes', outcome: 'helped', feeling: 'lighter' }, '  Asked my sister, felt lighter.  ')
    expect(checkInFor('q1')).toMatchObject({ outcome: 'helped', feeling: 'lighter' })
    expect(noteFor('q1')).toBe('Asked my sister, felt lighter.')
    expect(JSON.stringify(checkInFor('q1'))).not.toContain('sister')
  })

  it('asks again about a step kept for later on the day chosen, not before', () => {
    const moves = [move('2026-10-20', 'q1', 'Ask for help')]
    saveCheckIn({ questionId: 'q1', date: '2026-10-25', tried: 'not_yet', later: '2026-10-28' })
    expect(dueStep('2026-10-26', moves)).toBeNull()
    expect(dueStep('2026-10-28', moves)?.step).toBe('Ask for help')
  })
})

describe('what the journey says back', () => {
  it('puts each outcome in plain words, including the ones that did not help', () => {
    expect(outcomeLine({ questionId: 'q', date: 'd', tried: 'yes', outcome: 'helped', feeling: 'lighter' }, 'helped')).toBe('You said it helped, and you felt a little lighter.')
    expect(outcomeLine({ questionId: 'q', date: 'd', tried: 'yes', outcome: 'no_difference' }, 'no_change')).toBe('You said it didn’t make a difference. That’s worth knowing too.')
    expect(outcomeLine({ questionId: 'q', date: 'd', tried: 'yes', outcome: 'harder' }, 'no_change')).toBe('You said it made things harder, so I won’t suggest it again without asking.')
    expect(outcomeLine(null, 'started')).toBe('An idea you’re still exploring.')
  })

  it('shows each part of life you’ve explored, and leaves the rest empty rather than guessing', () => {
    const h = { answers: [answer('2026-10-26', 'q1', 'work-career')], skips: [] }
    saveCheckIn({ questionId: 'q1', date: '2026-10-27', tried: 'yes', outcome: 'helped', feeling: 'lighter' })
    const areas = lifeAreas([move('2026-10-26', 'q1', 'Ask for help', 'helped')], h, [writing('2026-10-25', 'family')], '2026-10-28')
    expect(areas.find((a) => a.area === 'work')?.line).toBe('“Ask for help” helped you.')
    expect(areas.find((a) => a.area === 'family')?.line).toBe('You reflected on this recently.')
    expect(areas.find((a) => a.area === 'money')?.line).toBeNull()
    expect(areas).toHaveLength(8)
  })

  it('keeps a history, newest first, without ever showing what you wrote', () => {
    saveCheckIn({ questionId: 'q1', date: '2026-10-27', tried: 'yes', outcome: 'helped' })
    const items = journeyHistory([move('2026-10-26', 'q1', 'Ask for help', 'helped')], [writing('2026-10-25', 'family')])
    expect(items.map((i) => i.date)).toEqual(['2026-10-27', '2026-10-26', '2026-10-25'])
    expect(items[1].title).toBe('You chose to try “Ask for help”')
    expect(JSON.stringify(items)).not.toContain('Private words')
  })
})

describe('bringing back what helped', () => {
  it('offers a step that helped before when today touches the same part of life', () => {
    const h = { answers: [answer('2026-10-20', 'q1', 'work-career'), answer('2026-10-28', 'q2', 'colleagues')], skips: [] }
    saveCheckIn({ questionId: 'q1', date: '2026-10-21', tried: 'yes', outcome: 'helped', feeling: 'lighter' })
    const r = revisitFor('2026-10-28', h, [move('2026-10-20', 'q1', 'Ask for help with one small task', 'helped')])
    expect(r?.line).toBe('Last time you tried “Ask for help with one small task”, you said it helped and you felt a little lighter. Would you like to try it again?')
  })

  it('stays quiet when today is about something else, or the step did not help', () => {
    const h = { answers: [answer('2026-10-20', 'q1', 'work-career'), answer('2026-10-28', 'q2', 'family')], skips: [] }
    saveCheckIn({ questionId: 'q1', date: '2026-10-21', tried: 'yes', outcome: 'helped' })
    expect(revisitFor('2026-10-28', h, [move('2026-10-20', 'q1', 'Ask', 'helped')])).toBeNull()
    const h2 = { answers: [answer('2026-10-20', 'q1', 'work-career'), answer('2026-10-28', 'q2', 'colleagues')], skips: [] }
    saveCheckIn({ questionId: 'q1', date: '2026-10-21', tried: 'yes', outcome: 'harder' })
    expect(revisitFor('2026-10-28', h2, [move('2026-10-20', 'q1', 'Ask', 'no_change')])).toBeNull()
  })
})
