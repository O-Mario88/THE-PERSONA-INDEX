import { describe, expect, it } from 'vitest'
import type { PeriodMirror } from './api'
import type { CardText, NotAloneQuestion } from './insights'
import { NEEDS } from './needs'
import type { Intention, Reflection } from './notebook'
import type { AnswerRecord, History } from './profile'
import {
  areaPatterns,
  chapterOf,
  CHAPTER_TITLE,
  firstSentence,
  helpedFor,
  helpedSentence,
  HELPED_NOTE,
  NEED_COST,
  NEED_DIRECTION,
  NEED_EXPLORE,
  NEED_PLAIN,
  NEED_REVEAL,
  NEED_SPAN_PHRASE,
  NEED_STRENGTH,
  NEED_THEME,
  notAlonePicks,
  observations,
  othersHelped,
  ownWordsPick,
  periodStory,
  weekDirection,
  weekStory,
  yearStory,
} from './mirrorStory'
import { voiceProblems } from './voice'

// The story Mirrors (Edwin, 2026-10-26): every line grounded in the
// person's own record, nothing invented to fill a page, hard weeks named as
// hard, no labels, no scores, and the voice rules on every word.

const from = '2026-10-12'
const to = '2026-10-18'
const today = '2026-10-18'

let n = 0
const answer = (date: string, more: Partial<AnswerRecord> = {}): AnswerRecord => ({
  date,
  questionId: `q${++n}`,
  theme: 'colleagues',
  depth: 2,
  traits: {},
  optionId: 'a',
  ...more,
})
const history = (...answers: AnswerRecord[]): History => ({ answers, skips: [] })
const texts = (h: History): ((id: string) => CardText | null) => {
  const by = new Map(h.answers.map((a) => [a.questionId, { date: a.date, questionId: a.questionId, prompt: `Prompt ${a.questionId}?`, label: `Label ${a.questionId}`, step: `Step for ${a.questionId}.` } as CardText]))
  return (id) => by.get(id) ?? null
}

describe('the week’s story', () => {
  it('names what the answers reached for, with the real counts, and what helped', () => {
    const h = history(
      answer('2026-10-12', { need: 'competence' }),
      answer('2026-10-13', { need: 'competence' }),
      answer('2026-10-14', { need: 'competence' }),
      answer('2026-10-14', { need: 'calm' }),
      answer('2026-10-15', { need: 'calm' }),
    )
    const helped = helpedFor(from, to, { steps: [{ step: 'Take a short pause before responding', started: '2026-10-13', status: 'helped' }] })
    const s = weekStory({ from, to, history: h, answers: 5, heavy: false, helped, connection: { nod: 0, share: 0, support: 1, celebrate: 0, days: 1 }, textOf: texts(h) })
    expect(s.headline).toBe('A week of wanting things to go well and looking for calm.')
    expect(s.paragraphs[0]).toBe('This week, three of your answers, on three days, reached for doing well. Two reached for feeling settled.')
    expect(s.paragraphs.at(-1)).toBe(
      'One thing worth noticing: you tried “Take a short pause before responding” and said it helped and you asked someone for support. A small move, and it was yours.',
    )
    expect(s.evidence).toHaveLength(5)
    expect(s.evidence[0].asked).toMatch(/^Prompt q/)
  })

  it('says a hard week was hard, and never invents a story for an empty one', () => {
    const h = history(answer('2026-10-12', { need: 'security' }), answer('2026-10-13', { need: 'security' }))
    const heavy = weekStory({ from, to, history: h, answers: 2, heavy: true, helped: [] })
    expect(heavy.headline).toBe('A heavier week, with looking for firm ground running through it.')
    expect(heavy.paragraphs.join(' ')).toContain('Some of your answers also sounded heavy.')
    const empty = weekStory({ from, to, history: history(), answers: 0, heavy: false, helped: [] })
    expect(empty.headline).toBe('A quiet week so far.')
    expect(empty.evidence).toEqual([])
  })

  it('leaves out intimate, heavy and "Not me" answers', () => {
    const h = history(
      answer('2026-10-12', { need: 'calm', theme: 'intimacy' }),
      answer('2026-10-13', { need: 'calm', heavy: true }),
      answer('2026-10-14', { need: 'calm', verdict: 'not_me' }),
      answer('2026-10-15', { need: 'calm' }),
    )
    const s = weekStory({ from, to, history: h, answers: 4, heavy: false, helped: [] })
    expect(s.headline).toBe('A week of answers still finding their shape.')
  })
})

describe('three things your answers revealed', () => {
  it('takes turns between needs and leanings, at most three, each with its answers', () => {
    const h = history(
      ...['2026-10-12', '2026-10-13', '2026-10-14'].map((d) => answer(d, { need: 'competence' })),
      ...['2026-10-13', '2026-10-15'].map((d) => answer(d, { need: 'calm' })),
      ...['2026-10-14', '2026-10-16'].map((d) => answer(d, { need: 'belonging' })),
    )
    const lean = {
      read: { trait: 'conscientiousness', score: 80, answers: 6, behind: [{ date: '2026-10-14', question: 'Dishes?', answer: 'Right away', leans: 'high' as const }] },
      text: { name: 'Getting things done' },
      side: { headline: 'You finish what you start.', strength: 'S.', grow: 'G.' },
      high: true,
    } as never
    const out = observations({ from, to, today, history: h, leans: [lean] })
    // A tie goes to the need reached for most recently (reaching.ts).
    expect(out.map((o) => o.key)).toEqual(['need.competence', 'trait.conscientiousness', 'need.belonging'])
    expect(out[0]).toMatchObject({ title: NEED_REVEAL.competence, strength: NEED_STRENGTH.competence, explore: NEED_EXPLORE.competence, seen: 3 })
    expect(out[1]).toMatchObject({ title: 'You finish what you start', evidence: [{ asked: 'Dishes?', said: 'Right away' }] })
  })
})

describe('what helped', () => {
  it('keeps one row per thing, with the most telling outcome, and never a score', () => {
    const intentions = [
      { kind: 'intention', id: 'i1', date: '2026-10-12', text: 'Ask for help', from: 'r', checkOn: '2026-10-19', at: 0 },
      { kind: 'intention', id: 'i2', date: '2026-10-05', text: 'Go for a walk', from: 'r', checkOn: '2026-10-12', check: 'let_go', checkedOn: '2026-10-13', at: 0 },
    ] as Intention[]
    const items = helpedFor(from, to, {
      steps: [
        { step: 'Take a short pause', started: '2026-10-12', status: 'helped' },
        { step: 'take a short pause ', started: '2026-10-15', status: 'helped' },
        { step: 'Set a clearer boundary', started: '2026-10-14', status: 'no_change' },
        { step: 'Last month', started: '2026-09-01', status: 'helped' },
      ],
      intentions,
    })
    expect(items.map((i) => [i.text, i.outcome, i.times])).toEqual([
      ['Take a short pause', 'helped', 2],
      ['Set a clearer boundary', 'no_change', 1],
      ['Ask for help', 'testing', 1],
    ])
    expect(helpedSentence(items)).toBe('“Take a short pause” helped you twice, by your own account. “Ask for help” is something you are still exploring.')
    expect(helpedSentence([])).toBeNull()
  })
})

describe('you’re not alone, and what helped others', () => {
  const h = history(answer('2026-10-13', { need: 'calm' }), answer('2026-10-14', { need: 'competence' }), answer('2026-10-14', { theme: 'intimacy' }))
  const [calm, comp, intimate] = h.answers
  it('uses real counts only, past the threshold, never for intimate answers', () => {
    const counts: NotAloneQuestion[] = [
      { questionId: calm.questionId, total: 9850, options: [{ optionId: 'a', count: 3420 }] },
      { questionId: comp.questionId, total: 60, options: [{ optionId: 'a', count: 0, few: true }] },
      { questionId: intimate.questionId, total: 100, options: [{ optionId: 'a', count: 50 }] },
    ]
    expect(notAlonePicks(h, from, to, counts, texts(h))).toEqual([{ questionId: calm.questionId, prompt: `Prompt ${calm.questionId}?`, label: `Label ${calm.questionId}`, same: 3420, total: 9850 }])
    expect(notAlonePicks(h, from, to, null, texts(h))).toEqual([])
  })

  it('shows what others reported for a step one of your answers offered, in counts', () => {
    const steps = [
      {
        questionId: calm.questionId,
        optionId: 'a',
        total: 2480,
        outcomes: [
          { outcome: 'helped_lot' as const, count: 940 },
          { outcome: 'helped_little' as const, count: 840 },
          { outcome: 'no_change' as const, count: 450 },
          { outcome: 'not_tried' as const, count: 0, few: true },
        ],
      },
      { questionId: 'someone-else', optionId: 'a', total: 9999, outcomes: [] },
    ]
    const [pick] = othersHelped(h, from, to, steps, texts(h))
    expect(pick.step).toBe(`Step for ${calm.questionId}.`)
    expect(pick.rows).toEqual([
      { label: 'Helped a lot', count: 940 },
      { label: 'Helped a little', count: 840 },
      { label: 'No change', count: 450 },
      { label: 'Didn’t try', count: null },
    ])
    expect(pick.line).toBe('Of the 2,480 who tried this and chose to report back, 1,780 said it helped.')
    expect(othersHelped(h, from, to, null)).toEqual([])
  })
})

describe('your own words and one direction', () => {
  const r = (id: string, date: string, answer: string) => ({ kind: 'reflection', at: 0, id, date, period: 'day', area: 'self', group: 'learnt', source: 'answers', about: '', question: '', answer }) as Reflection
  it('brings back a wish first, as its first sentence', () => {
    const pick = ownWordsPick([r('a', '2026-10-13', 'A long day at work with many meetings and noise.'), r('b', '2026-10-14', 'I want to stop feeling guilty for taking time for myself. It is fine to rest.')], from, to)
    expect(pick).toEqual({ id: 'b', date: '2026-10-14', sentence: 'I want to stop feeling guilty for taking time for myself.' })
    expect(ownWordsPick([], from, to)).toBeNull()
    expect(firstSentence('x'.repeat(300)).length).toBe(180)
  })

  it('offers one direction: what helped, else the main need, else a card’s step', () => {
    const helped = helpedFor(from, to, { steps: [{ step: 'Pause first', started: '2026-10-13', status: 'helped' }] })
    expect(weekDirection({ from, history: history(), helped })?.text).toBe('Keep “Pause first” going, once or twice this week.')
    const h = history(answer('2026-10-12', { need: 'calm' }), answer('2026-10-13', { need: 'calm' }))
    expect(weekDirection({ from, history: h, helped: [] })).toMatchObject({ text: NEED_DIRECTION.calm, why: 'Because feeling settled came up in two of your answers.' })
    expect(weekDirection({ from, history: history(), helped: [], nextStep: 'Call a friend.' })?.text).toBe('Call a friend.')
    expect(weekDirection({ from, history: history(), helped: [] })).toBeNull()
  })
})

const period = (more: Partial<PeriodMirror> = {}): PeriodMirror =>
  ({
    period: 'month',
    label: '2026-10',
    date: today,
    from: '2026-09-28',
    to: '2026-11-01',
    weeksTotal: 5,
    weeks: [],
    stats: { answers: 10, weeksActive: 3, weeksSoFar: 3, daysActive: 6 },
    traits: [],
    themes: [],
    moments: [],
    helped: [],
    ...more,
  }) as PeriodMirror

const week = (monday: string, needs: Record<string, number>) => ({ monday, week: 1, kept: true, daysActive: 2, daysSoFar: 6, answers: 4, deepest: 0, stepsTried: 0, needs, needsOnRecord: true })

describe('the month', () => {
  it('tells a shift from the earlier weeks to the later ones, without calling it better', () => {
    const p = period({ weeks: [week('2026-09-28', { competence: 3 }), week('2026-10-05', { competence: 1 }), week('2026-10-12', { belonging: 3 }), week('2026-10-19', { belonging: 2 })] })
    const s = periodStory(p, history(), [])
    expect(s.headline).toBe('A month of moving from wanting things to go well towards keeping people close.')
    expect(s.paragraphs[1]).toBe('This does not erase what mattered earlier. It may simply be another side of the same month.')
  })

  it('names an area uncertain when its answers point several ways', () => {
    const h = history(
      answer('2026-10-12', { need: 'calm', theme: 'colleagues' }),
      answer('2026-10-13', { need: 'calm', theme: 'colleagues' }),
      answer('2026-10-14', { need: 'respect', theme: 'colleagues' }),
      answer('2026-10-12', { need: 'calm', theme: 'money' }),
      answer('2026-10-13', { need: 'security', theme: 'money' }),
      answer('2026-10-14', { need: 'freedom', theme: 'money' }),
    )
    const [work, money] = areaPatterns(h, '2026-09-28', '2026-11-01', texts(h))
    expect(work).toMatchObject({ area: 'work', need: 'calm', uncertain: false, description: 'In two of your three answers about work, what you chose reached for feeling settled.' })
    expect(money).toMatchObject({ area: 'money', uncertain: true })
  })
})

describe('the year', () => {
  it('tells chapters from their own record and leaves a stretch with none blank', () => {
    const q1 = period({ period: 'quarter', label: '2026-Q1', needs: [{ need: 'competence', answers: 12, days: 9, weeks: 6 }] })
    const q3 = period({ period: 'quarter', label: '2026-Q3', needs: [{ need: 'belonging', answers: 8, days: 6, weeks: 4 }], helped: [{ theme: 'x', step: 'Ask one person for help', started: '2026-08-01' }] })
    const chapters = [chapterOf(1, q1), chapterOf(2, null), chapterOf(3, q3), chapterOf(4, 'later')]
    expect(chapters.map((c) => [c.title, c.state])).toEqual([
      [CHAPTER_TITLE.competence, 'told'],
      ['Nothing on record', 'none'],
      [CHAPTER_TITLE.belonging, 'told'],
      ['Still to come', 'later'],
    ])
    const s = yearStory(chapters, null)
    expect(s.headline).toBe('The year you moved from wanting things to go well towards keeping people close.')
    expect(s.paragraphs.join(' ')).toContain('One chapter of this year has nothing on record, so it is left blank rather than guessed.')
    expect(yearStory([chapterOf(1, null), chapterOf(2, null), chapterOf(3, null), chapterOf(4, 'later')], null).headline).toBe('Your year is still being written.')
  })
})

describe('the voice of the Mirrors', () => {
  it('keeps every fixed line to the voice rules', () => {
    const lines: [string, string][] = []
    for (const [name, table] of Object.entries({ NEED_REVEAL, NEED_STRENGTH, NEED_EXPLORE, NEED_COST, NEED_SPAN_PHRASE, NEED_DIRECTION, NEED_THEME, NEED_PLAIN, CHAPTER_TITLE, HELPED_NOTE })) {
      for (const [k, v] of Object.entries(table)) lines.push([`${name}.${k}`, v])
    }
    for (const need of NEEDS) expect(NEED_REVEAL[need]).toBeTruthy()
    const problems = lines.flatMap(([where, line]) => voiceProblems(line).map((p) => `${where}: ${p}`))
    expect(problems).toEqual([])
  })

  it('keeps the generated stories to the voice rules too', () => {
    const h = history(...NEEDS.flatMap((need, i) => [answer(`2026-10-1${i % 6}`, { need }), answer(`2026-10-1${(i + 1) % 6}`, { need })]))
    const stories = NEEDS.map((need) => weekStory({ from, to, history: history(answer('2026-10-12', { need }), answer('2026-10-13', { need })), answers: 2, heavy: false, helped: [] }))
    stories.push(weekStory({ from, to, history: h, answers: 14, heavy: true, helped: [] }))
    const problems = stories.flatMap((s) => [s.headline, ...s.paragraphs]).flatMap((line) => voiceProblems(line).map((p) => `${line}: ${p}`))
    expect(problems).toEqual([])
  })
})
