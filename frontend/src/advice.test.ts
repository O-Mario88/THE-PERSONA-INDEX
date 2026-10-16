import { adviceFor, levelLine } from './advice'
import type { AnswerRecord, History } from './profile'
import { honestLine, TRAITS } from './traits'

const answer = (date: string, n: number, traits: Record<string, number>, extra: Partial<AnswerRecord> = {}): AnswerRecord => ({
  date,
  questionId: `${date}-q${n}`,
  theme: 'habits',
  depth: 2,
  traits,
  ...extra,
})
const today = '2026-10-14'

describe('the close of a sitting', () => {
  it('speaks to the two clearest leanings, and calls one sitting a hint', () => {
    const sitting = [
      answer(today, 1, { conscientiousness: 1, rumination: 2 }),
      answer(today, 2, { conscientiousness: 1 }),
      answer(today, 3, { openness: -1 }),
    ]
    const a = adviceFor(sitting, { answers: sitting, skips: [] }, today, 'morning')
    expect(a.points.map((p) => p.trait)).toEqual(['conscientiousness', 'rumination'])
    expect(a.points[0].grow).toBe(TRAITS.conscientiousness.high.grow)
    expect(a.headline).toBe(
      "Today your answers leaned towards getting things done, and towards replaying hard moments. One day is only a hint, so here's what each could mean.",
    )
    expect(a.points[0].earned).toEqual({ level: 'hint', answers: 2, days: 1, weeks: 1 })
  })

  it('keeps the honest part back until the leaning is a pattern', () => {
    const sitting = [answer(today, 1, { conscientiousness: 1 })]
    const hint = adviceFor(sitting, { answers: sitting, skips: [] }, today, 'morning')
    expect(hint.points[0].honest).toBeNull()

    const earlier = [answer('2026-10-12', 1, { conscientiousness: 2 }), answer('2026-10-13', 1, { conscientiousness: 1 })]
    const h: History = { answers: [...earlier, ...sitting], skips: [] }
    const pattern = adviceFor(sitting, h, today, 'morning')
    expect(pattern.points[0].earned).toMatchObject({ level: 'pattern', answers: 3, days: 3 })
    expect(pattern.points[0].honest).toBe(honestLine(TRAITS.conscientiousness.high, today, 'morning').text)
    expect(pattern.headline).toBe(
      'Today your answers leaned towards getting things done. Getting things done has come up in 3 answers over 3 days, so a pattern is forming.',
    )
    // The evening close takes another of the three lines.
    expect(adviceFor(sitting, h, today, 'evening').points[0].honest).not.toBe(pattern.points[0].honest)
  })

  it('counts only answers leaning the same way, from the last three weeks', () => {
    const sitting = [answer(today, 1, { conscientiousness: 1 })]
    const h: History = {
      answers: [
        answer('2026-09-20', 1, { conscientiousness: 1 }), // too old
        answer('2026-10-12', 1, { conscientiousness: -1 }), // the other way
        answer('2026-10-13', 1, { conscientiousness: 1 }),
        ...sitting,
      ],
      skips: [],
    }
    expect(adviceFor(sitting, h, today, 'morning').points[0].earned).toMatchObject({ level: 'hint', answers: 2 })
  })

  it('leaves out a card the person said was not them, or reads the closer one', () => {
    const notMe = answer(today, 1, { conscientiousness: 1 }, { verdict: 'not_me' })
    expect(adviceFor([notMe], { answers: [notMe], skips: [] }, today, 'morning').points).toEqual([])
    const closer = { ...notMe, closer: { optionId: 'b', traits: { conscientiousness: -1 } } }
    const [p] = adviceFor([closer], { answers: [closer], skips: [] }, today, 'morning').points
    expect(p.lean).toBe(TRAITS.conscientiousness.low.lean)
  })

  it('uses the lower side when the weights point down', () => {
    const sitting = [answer(today, 1, { extraversion: -2 })]
    const [p] = adviceFor(sitting, { answers: sitting, skips: [] }, today, 'morning').points
    expect(p.strength).toBe(TRAITS.extraversion.low.strength)
    expect(p.lean).toBe('time on your own')
  })

  it('says the day was balanced rather than inventing a pattern', () => {
    const sitting = [answer(today, 1, { openness: 1 }), answer(today, 2, { openness: -1 }), answer(today, 3, {})]
    const a = adviceFor(sitting, { answers: sitting, skips: [] }, today, 'morning')
    expect(a.points).toEqual([])
    expect(a.headline).toContain('balanced')
  })

  it('says what each level rests on', () => {
    expect(levelLine({ level: 'hint', answers: 1, days: 1, weeks: 1 })).toBe('Only a hint so far, from 1 answer.')
    expect(levelLine({ level: 'pattern', answers: 4, days: 2, weeks: 1 })).toBe('A pattern is forming: 4 answers over 2 days.')
    expect(levelLine({ level: 'steady', answers: 8, days: 6, weeks: 3 })).toBe('This keeps showing up: 8 answers over 3 weeks.')
  })
})
