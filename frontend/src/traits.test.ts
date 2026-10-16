import { an, honestLine, SOURCES, TRAITS, type Slot } from './traits'

// Edwin, 2026-10-15: the app need not cite its sources, "as long as the
// source is accurate". Each claim keeps its source here, unseen.
describe('the one trait vocabulary', () => {
  it('keeps a linked source for every trait claim, though the app does not show it', () => {
    for (const [trait, t] of Object.entries(TRAITS)) {
      expect(t.research, trait).toMatch(/\S/)
      expect(SOURCES[t.source]?.url, trait).toMatch(/^https:\/\//)
    }
  })

  it('has one warm name per trait, used on every screen', () => {
    const names = Object.values(TRAITS).map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    expect(TRAITS.neuroticism.name).toBe('Worry and tension')
    expect(TRAITS.conscientiousness.name).toBe('Getting things done')
  })

  // Edwin, 2026-10-15: "The app should not be afraid of telling them the
  // negative things about them based on their answers in a polite human language."
  it('gives every leaning three honest lines, each kind, specific and from a linked source', () => {
    const seen = new Set<string>()
    for (const [trait, t] of Object.entries(TRAITS)) {
      for (const side of [t.high, t.low]) {
        expect(side.honest, trait).toHaveLength(3)
        for (const line of side.honest) {
          const where = `${trait}: ${line.text}`
          expect(seen.has(line.text), where).toBe(false)
          seen.add(line.text)
          expect(line.text.length, where).toBeGreaterThanOrEqual(80)
          expect(line.text.length, where).toBeLessThanOrEqual(220)
          expect(SOURCES[line.source]?.url, where).toMatch(/^https:\/\//)
          // Never a label, a diagnosis or a ranking against other people.
          expect(line.text, where).not.toMatch(/therap|psycholog|diagnos|disorder|patholog|neurotic|psychosis|trauma|toxic/i)
          expect(line.text, where).not.toMatch(/than most|than others|than anyone|other people|\d+ ?%|percent/i)
          // Never names its source on screen, and never claims there is no cost.
          expect(line.text, where).not.toMatch(/stud(y|ies)|research|scientists|proven|et al|\d{4}/i)
          expect(line.text, where).not.toMatch(/no proven downside/i)
        }
      }
    }
  })

  it('names the cost of each leaning in a short edge for the weekly title', () => {
    for (const [trait, t] of Object.entries(TRAITS)) {
      for (const side of [t.high, t.low]) {
        expect(side.edge, trait).toMatch(/^[a-z]/)
        expect(side.edge.length, trait).toBeGreaterThanOrEqual(15)
        expect(side.edge.length, trait).toBeLessThanOrEqual(45)
        expect(side.edge, trait).not.toMatch(/[.!?]$/)
        expect(side.lean, trait).toMatch(/^[a-z]/)
      }
    }
  })

  it('never sets the reader against other people in what a leaning predicts', () => {
    for (const [trait, t] of Object.entries(TRAITS)) {
      for (const side of [t.high, t.low]) {
        expect(side.prediction, trait).not.toMatch(/than most|than others|before anyone|before others|other people/i)
      }
    }
  })

  it('never repeats an honest line within a day, and moves them on each day', () => {
    const side = TRAITS.rumination.high
    const slots: Slot[] = ['morning', 'evening', 'mirror']
    for (const date of ['2026-10-12', '2026-10-13', '2026-10-14', '2026-12-31', '2027-01-01']) {
      const lines = slots.map((s) => honestLine(side, date, s).text)
      expect(new Set(lines).size, date).toBe(3)
    }
    expect(honestLine(side, '2026-10-12', 'morning')).not.toEqual(honestLine(side, '2026-10-13', 'morning'))
    expect(honestLine(side, '2026-10-12', 'morning')).toEqual(honestLine(side, '2026-10-15', 'morning'))
  })

  it('puts the right article before a word', () => {
    expect(an('steady')).toBe('a steady')
    expect(an('easygoing')).toBe('an easygoing')
    expect(an('open-hearted')).toBe('an open-hearted')
  })
})
