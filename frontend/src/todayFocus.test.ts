import { beforeEach, describe, expect, it } from 'vitest'
import type { Move } from './moves'
import type { Reflection } from './notebook'
import { saveJSON } from './storage'
import { saveCheckIn } from './growthJourney'
import { journeyNote, lastMemory, linkLine, nextMirror, personalLine, quietStep } from './todayFocus'

beforeEach(() => localStorage.clear())

const answer = (date: string, questionId: string, extra: Record<string, unknown> = {}) => ({ date, questionId, theme: 'habits', depth: 2, traits: {}, ...extra })
const writing = (date: string, answerText: string, area: Reflection['area'] = 'self'): Reflection => ({
  kind: 'reflection',
  at: Date.parse(`${date}T09:00:00Z`),
  id: `r-${date}`,
  date,
  period: 'day',
  area,
  group: 'learnt',
  source: 'answers',
  about: '',
  question: '',
  answer: answerText,
  free: true,
})
const card = (date: string, questionId: string, theme = 'rest') =>
  saveJSON(`pi.insight.${questionId}`, { date, questionId, theme, prompt: 'P', label: 'Take the afternoon off', reveal: 'You protect your rest. More words.' })

describe('the remembered reflection', () => {
  it('brings back the most recent thing you wrote in the past week', () => {
    const m = lastMemory('2026-10-28', { answers: [], skips: [] }, [writing('2026-10-27', 'I want to stop feeling guilty for resting.')])
    expect(m).toEqual({ kind: 'writing', id: 'r-2026-10-27', date: '2026-10-27', when: 'Yesterday', text: 'I want to stop feeling guilty for resting.', area: 'self' })
  })

  it('falls back to your last card, with what I noticed, and the answer it came from for the Human Pulse', () => {
    card('2026-10-26', 'q1')
    const m = lastMemory('2026-10-28', { answers: [answer('2026-10-26', 'q1', { optionId: 'a' })], skips: [] }, [])
    expect(m).toEqual({ kind: 'answer', date: '2026-10-26', when: 'On Monday', label: 'Take the afternoon off', noticed: 'You protect your rest.', theme: 'rest', questionId: 'q1', optionId: 'a' })
  })

  it('takes whichever is newer, and writing when they are from the same day', () => {
    card('2026-10-27', 'q1')
    const h = { answers: [answer('2026-10-27', 'q1')], skips: [] }
    expect(lastMemory('2026-10-28', h, [writing('2026-10-25', 'Older words.')])?.kind).toBe('answer')
    expect(lastMemory('2026-10-28', h, [writing('2026-10-27', 'Same day.')])?.kind).toBe('writing')
  })

  it('never puts hard words or a heavy answer on the home screen', () => {
    expect(lastMemory('2026-10-28', { answers: [], skips: [] }, [writing('2026-10-27', 'I am worthless and I always ruin everything.')])).toBeNull()
    card('2026-10-27', 'q1')
    expect(lastMemory('2026-10-28', { answers: [answer('2026-10-27', 'q1', { heavy: true })], skips: [] }, [])).toBeNull()
  })

  it('stays quiet on the first day and after a week away', () => {
    expect(lastMemory('2026-10-27', { answers: [], skips: [] }, [writing('2026-10-27', 'Today.')])).toBeNull()
    expect(lastMemory('2026-11-10', { answers: [], skips: [] }, [writing('2026-10-27', 'Long ago.')])).toBeNull()
  })
})

describe('tying today’s questions to it', () => {
  it('says so when one of today’s questions comes back to the same part of life', () => {
    expect(linkLine({ kind: 'answer', date: '', when: '', label: '', noticed: '', theme: 'rest', questionId: 'q1' }, ['money', 'rest'])).toBe(
      'One of today’s questions comes back to rest and free time.',
    )
    expect(linkLine({ kind: 'writing', id: 'r', date: '', when: '', text: '', area: 'family' }, ['relatives'])).toBe('One of today’s questions comes back to relatives.')
  })

  it('never claims a link that is not there', () => {
    expect(linkLine({ kind: 'writing', id: 'r', date: '', when: '', text: '', area: 'money' }, ['family'])).toBe('Let’s see what today adds to it.')
  })
})

describe('one quiet next step', () => {
  const started = (date: string): Move => ({ date, questionId: `q-${date}`, optionId: 'o', step: `Step from ${date}`, status: 'started' })

  it('asks first about a step you said you would try', () => {
    expect(quietStep('2026-10-28', { answers: [], skips: [] }, [started('2026-10-26')])).toMatchObject({ kind: 'followUp', move: { step: 'Step from 2026-10-26' } })
  })

  it('brings back a step that helped before, when today touches the same part of life', () => {
    const h = { answers: [answer('2026-10-20', 'q1', { theme: 'work-career' }), answer('2026-10-28', 'q2', { theme: 'colleagues', need: 'calm' })], skips: [] }
    localStorage.setItem('pi.checkins.v1', JSON.stringify([{ questionId: 'q1', date: '2026-10-21', tried: 'yes', outcome: 'helped' }]))
    expect(quietStep('2026-10-28', h, [{ date: '2026-10-20', questionId: 'q1', optionId: 'o', step: 'Ask for help', status: 'helped' }])).toMatchObject({ kind: 'revisit' })
  })

  it('then gives one thing to carry from today’s answers', () => {
    const h = { answers: [answer('2026-10-28', 'a', { need: 'calm' })], skips: [] }
    expect(quietStep('2026-10-28', h, [])).toEqual({ kind: 'carry', text: 'Notice one moment today when your shoulders drop.' })
  })

  it('then a small idea from your own recent cards', () => {
    saveJSON('pi.insight.q1', { date: '2026-10-27', questionId: 'q1', prompt: 'P', label: 'Say no', reveal: 'R.', step: 'Say no to one small thing.' })
    const h = { answers: [answer('2026-10-27', 'q1', { optionId: 'o1' })], skips: [] }
    expect(quietStep('2026-10-28', h, [])).toMatchObject({ kind: 'idea', step: 'Say no to one small thing.', from: 'Say no' })
  })

  it('puts a small practical idea before something to notice, for someone who asked for practical ideas', () => {
    card('2026-10-27', 'q1')
    saveJSON('pi.insight.q1', { date: '2026-10-27', questionId: 'q1', prompt: 'P', label: 'L', reveal: 'R.', step: 'Take one short walk today.' })
    const h = {
      answers: [
        { ...answer('2026-10-27', 'q1'), optionId: 'o1' },
        { ...answer('2026-10-28', 'q2'), need: 'calm' as const },
      ],
      skips: [],
    }
    expect(quietStep('2026-10-28', h, [])?.kind).toBe('carry')
    expect(quietStep('2026-10-28', h, [], 'practical')?.kind).toBe('idea')
  })

  it('shows nothing when there is nothing of yours to go on', () => {
    expect(quietStep('2026-10-28', { answers: [], skips: [] }, [])).toBeNull()
  })

  // Edwin's brief, 2026-10-29: "remember what happened next". A step kept
  // from a hard moment (or from Reflect) comes back on Today on its check-in day.
  it('asks how a step you wanted to try went, on its check-in day, after a sitting’s own follow-up', () => {
    const due = [{ kind: 'intention' as const, id: 'sense-1-step', date: '2026-10-26', text: 'Ask for time before answering.', from: 'sense-1', checkOn: '2026-10-28', at: 1 }]
    expect(quietStep('2026-10-28', { answers: [], skips: [] }, [], undefined, due)).toMatchObject({ kind: 'checkIn', intention: { id: 'sense-1-step' } })
    expect(quietStep('2026-10-28', { answers: [], skips: [] }, [started('2026-10-26')], undefined, due)?.kind).toBe('followUp')
  })
})

describe('the coming Mirror', () => {
  it('counts down to the first Sunday Mirror with a dot for each day since you started', () => {
    localStorage.setItem('pi.started', '2026-10-27')
    const h = { answers: [answer('2026-10-27', 'a')], skips: [] }
    expect(nextMirror('2026-10-29', h)).toEqual({ days: 3, answered: [true, false, false], first: true, lean: null })
  })

  it('counts this week only, from Monday, once the first Mirror has been', () => {
    localStorage.setItem('pi.started', '2026-10-01')
    const h = { answers: [answer('2026-10-26', 'a'), answer('2026-10-28', 'b')], skips: [] }
    expect(nextMirror('2026-10-28', h)).toMatchObject({ days: 4, answered: [true, false, true], first: false })
  })

  it('steps aside on Sunday, when the Mirror itself is ready', () => {
    expect(nextMirror('2026-11-01', { answers: [], skips: [] })).toBeNull()
  })
})

describe('from your journey', () => {
  const h = { answers: [answer('2026-10-27', 'q1', { theme: 'helping', need: 'calm' }), answer('2026-10-28', 'q2', { theme: 'friendship' })], skips: [] }
  const step = (date: string, status: Move['status'] = 'started'): Move => ({ date, questionId: 'q1', optionId: 'o', step: 'Ask for help with one small task.', status })

  it('says what you have been exploring and what you said about it, and whether today comes back to it', () => {
    saveCheckIn({ questionId: 'q1', date: '2026-10-27', tried: 'yes', outcome: 'helped', feeling: 'lighter' })
    expect(journeyNote('2026-10-28', h, ['neighbours'], [step('2026-10-26', 'helped')])?.lines).toEqual([
      'You’ve been exploring feeling settled.',
      'Yesterday you said “Ask for help with one small task” helped.',
      'Today, there’s something related you could explore.',
    ])
  })

  it('names the step you chose, unless the card below is already asking about it', () => {
    expect(journeyNote('2026-10-28', h, [], [step('2026-10-28')])?.lines).toEqual(['You’ve been exploring feeling settled.', 'Today you chose to try “Ask for help with one small task”.'])
    // Started yesterday and not asked about yet: the quiet step card asks, so this only names the topic.
    expect(journeyNote('2026-10-28', h, [], [step('2026-10-27')])?.lines).toEqual(['You’ve been exploring feeling settled.'])
  })

  it('stays quiet with no step from the past week, or one from a heavy or intimate answer', () => {
    expect(journeyNote('2026-10-28', h, [], [])).toBeNull()
    expect(journeyNote('2026-11-10', h, [], [step('2026-10-26')])).toBeNull()
    const intimate = { answers: [answer('2026-10-27', 'q1', { theme: 'intimacy' })], skips: [] }
    expect(journeyNote('2026-10-28', intimate, [], [step('2026-10-28')])).toBeNull()
  })
})

describe('the line under the greeting', () => {
  it('names the day and what you were thinking about, never your words themselves', () => {
    expect(personalLine(3, { kind: 'writing', id: 'r', date: '', when: 'Yesterday', text: 'Private words.', area: 'self' })).toBe('Day 3 with you. Yesterday, you wrote about yourself.')
    expect(personalLine(5, { kind: 'answer', date: '', when: 'On Monday', label: 'L', noticed: 'N', theme: 'rest', questionId: 'q1' })).toBe(
      'Day 5 with you. On Monday, your answers touched on rest and free time.',
    )
  })

  it('keeps to the day alone when there is nothing to bring back, and says nothing on the first day', () => {
    expect(personalLine(4, null)).toBe('Day 4 with you.')
    expect(personalLine(1, null)).toBeNull()
    expect(personalLine(null, { kind: 'writing', id: 'r', date: '', when: 'Yesterday', text: 'x', area: 'work' })).toBe('Yesterday, you wrote about work.')
  })
})
