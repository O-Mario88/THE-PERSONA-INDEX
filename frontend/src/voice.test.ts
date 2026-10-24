import type { Level, Mirror, Period, PeriodMirror, PeriodTrait, Question, TraitRead } from './api'
import { adviceFor, levelLine as closeLevelLine } from './advice'
import { AREA_NAMES, levelLine, levelMeta, PERIOD_CLOSE, periodSummary, summary, tagline, title } from './mirrorText'
import { changeWords, threadLine, type AnswerRecord } from './profile'
import { TRAITS } from './traits'
import { FIXED_WORDS } from './words'
import { voiceProblems } from './voice'

// Trait reads, and mirrors that lean on them: summary and periodSummary only
// read the stats and traits.
const read = (trait: string, score: number, level: Level = 'pattern') => ({ trait, score, level }) as TraitRead
const periodRead = (trait: string, score: number, level: Level = 'pattern') => ({ trait, score, level }) as PeriodTrait
const weekMirror = (answers: number, daysSoFar: number, weeksActive: number, traits: TraitRead[]) =>
  ({ weeksActive, stats: { daysActive: 1, answers, daysSoFar }, traits }) as Mirror
const periodMirror = (period: Period, answers: number, over: boolean, traits: PeriodTrait[]) =>
  ({
    period,
    weeksTotal: 1,
    weeks: [{ daysSoFar: over ? 6 : 2 }],
    stats: { answers, daysActive: 1, weeksActive: 1 },
    traits,
  }) as PeriodMirror
const today = '2026-10-14'
const record = (date: string, n: number, traits: Record<string, number>): AnswerRecord => ({
  date,
  questionId: `${date}-q${n}`,
  theme: 'habits',
  depth: 2,
  traits,
  optionId: 'a',
})

// shownWords is every sentence and phrase from traits.ts, mirrorText.ts,
// advice.ts, profile.ts and words.ts that reaches the screen, with where it
// came from. The research lines and sources are kept for accuracy but not
// shown, so they are left out.
function shownWords(): [string, string][] {
  const out: [string, string][] = [...FIXED_WORDS]
  const traits = Object.keys(TRAITS)
  for (const [trait, t] of Object.entries(TRAITS)) {
    out.push([`${trait}.name`, t.name])
    for (const [side, s] of [
      ['high', t.high],
      ['low', t.low],
    ] as const) {
      for (const key of ['lean', 'adj', 'noun', 'quality', 'with', 'headline', 'prediction', 'strength', 'grow', 'edge'] as const) {
        out.push([`${trait}.${side}.${key}`, s[key]])
      }
      s.honest.forEach((l, i) => out.push([`${trait}.${side}.honest[${i}]`, l.text]))
    }
  }
  for (const [area, name] of Object.entries(AREA_NAMES)) out.push([`area ${area}`, name])
  for (const [period, line] of Object.entries(PERIOD_CLOSE)) out.push([`close ${period}`, line])
  for (const level of ['hint', 'pattern', 'steady', 'changing'] as const) {
    for (const answers of [1, 5]) {
      const r = { level, answers, days: 2, weeks: 3 }
      out.push([`level ${level} ${answers}`, levelLine(r, 'week')], [`level meta ${level} ${answers}`, levelMeta(r)])
      if (level !== 'changing') out.push([`close level ${level} ${answers}`, closeLevelLine({ ...r, level })])
    }
  }

  // The sentences built from those words, for every leaning.
  out.push(
    ['summary, quiet week', summary(weekMirror(0, 3, 2, []))],
    ['summary, first week', summary(weekMirror(0, 3, 0, []))],
    ['summary, balanced', summary(weekMirror(5, 6, 1, [read(traits[0], 50)]))],
    ['summary, only hints', summary(weekMirror(5, 6, 1, [read(traits[0], 90, 'hint')]))],
  )
  for (const period of ['month', 'quarter', 'year'] as const) {
    out.push([`${period} summary, empty`, periodSummary(periodMirror(period, 0, false, []))])
  }
  for (const trait of traits) {
    for (const score of [80, 20]) {
      const w = score > 50 ? 2 : -2
      const traitsRead = [read(trait, score)]
      const other = traits.find((t) => t !== trait)!
      const sitting = [record(today, 1, { [trait]: w })]
      const pattern = [record('2026-10-12', 1, { [trait]: w }), record('2026-10-13', 1, { [trait]: w }), ...sitting]
      out.push(
        [`summary ${trait} ${score}`, summary(weekMirror(1, 6, 1, traitsRead))],
        [`summary so far ${trait} ${score}`, summary(weekMirror(4, 3, 1, traitsRead))],
        [`month summary ${trait} ${score}`, periodSummary(periodMirror('month', 9, true, [periodRead(trait, score)]))],
        [`quarter summary so far ${trait} ${score}`, periodSummary(periodMirror('quarter', 9, false, [periodRead(trait, score)]))],
        [`title ${trait} ${score}`, `This week, you were ${title([...traitsRead, read(other, 85)]) ?? ''}.`],
        [`tagline ${trait} ${score}`, tagline(traitsRead) ?? ''],
        [`day close hint ${trait} ${score}`, adviceFor(sitting, { answers: sitting, skips: [] }, today, 'morning').headline],
        [`day close pattern ${trait} ${score}`, adviceFor(sitting, { answers: pattern, skips: [] }, today, 'morning').headline],
        [`change ${trait} ${score}`, changeWords({ date: today, questionId: 'q', trait, high: score > 50, weeks: 3 })],
        [`change eight weeks ${trait} ${score}`, changeWords({ date: today, questionId: 'q', trait, high: score > 50, weeks: 8 })],
        [
          `thread ${trait} ${score}`,
          threadLine({ answers: pattern, skips: [] }, { id: `${today}-q1`, prompt: '', options: [] } as Question, 'a', today) ?? '',
        ],
      )
    }
  }
  return out
}

describe('the voice of the mirror and the day close', () => {
  it('catches what the rules are for', () => {
    expect(voiceProblems('You finish what you start, more than most.')).toEqual(['compares you with other people ("than most")'])
    expect(voiceProblems('Few people keep the peace like you.')).toEqual(['compares you with other people ("Few people")'])
    expect(voiceProblems('A loose end bugs you more than it bugs anyone else.')).toEqual([
      'compares you with other people ("than it bugs anyone else")',
    ])
    expect(voiceProblems('Peacekeepers like you sense tension early.')).toEqual([
      'compares you with other people ("Peacekeepers like you")',
    ])
    expect(voiceProblems('You probably plan ahead, and you likely enjoy it.')).toEqual(['hedges 2 times (probably, likely)'])
    expect(voiceProblems('Chances are you plan ahead.')[0]).toMatch(/hedges|guesses/)
    expect(voiceProblems('Odds are you plan ahead.')).toContain('guesses with "Odds are"')
    expect(voiceProblems("A plan helps, doesn't it?")).toEqual([`ends on a tag question (", doesn't it?")`])
    expect(voiceProblems("That's okay.")).toEqual(['says "okay"'])
    expect(voiceProblems('A pull toward people.')).toEqual(['uses the US spelling "toward"'])
    expect(voiceProblems('You realize it later.')).toEqual(['uses the US spelling "realize"'])
    expect(voiceProblems("You're a people-pleaser at heart.")).toEqual(['labels you ("people-pleaser")'])
    expect(voiceProblems('Introverts need this.')).toEqual(['labels you ("Introverts")'])
  })

  it('lets their look-alikes through', () => {
    for (const s of [
      'A few people know you well, and you probably like it that way.',
      "After a row you ask 'are we all right?' and mean it.",
      'You judge yourself before anyone else can.',
      'Ask the quietest person in the room what they think.',
      'You realise a prize is worth less than its size suggests, and you lean towards colour.',
      'What would actually help?',
      'You avoided the row and kept the peace, and pleasing people you love matters to you.',
    ]) {
      expect(voiceProblems(s), s).toEqual([])
    }
  })

  it('keeps every word it shows in the voice', () => {
    const words = shownWords()
    expect(words.length).toBeGreaterThan(300)
    for (const [where, s] of words) {
      expect(voiceProblems(s), `${where}: ${s}`).toEqual([])
    }
  })
})
