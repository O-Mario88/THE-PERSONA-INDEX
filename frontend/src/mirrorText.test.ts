import { SOURCES, TRAITS } from './mirrorText'

// Edwin, 2026-10-15: the app need not cite its sources, "as long as the
// source is accurate". Each claim keeps its source here, unseen.
describe('the words behind the mirror', () => {
  it('keeps a linked source for every trait claim, though the mirror does not show it', () => {
    for (const [trait, t] of Object.entries(TRAITS)) {
      expect(t.research, trait).toMatch(/\S/)
      expect(SOURCES[t.source]?.url, trait).toMatch(/^https:\/\//)
    }
  })

  // Edwin, 2026-10-15: "The app should not be afraid of telling them the
  // negative things about them based on their answers in a polite human language."
  it('tells each leaning its honest cost, kindly, with a linked source for it', () => {
    for (const [trait, t] of Object.entries(TRAITS)) {
      for (const side of [t.high, t.low]) {
        const where = `${trait}: ${side.headline}`
        expect(side.cost.length, where).toBeGreaterThanOrEqual(80)
        expect(side.cost.length, where).toBeLessThanOrEqual(200)
        expect(SOURCES[side.costSource]?.url, where).toMatch(/^https:\/\//)
        // Never a label, a diagnosis or a ranking against other people.
        expect(side.cost, where).not.toMatch(/therap|psycholog|diagnos|disorder|patholog|neurotic|psychosis/i)
        expect(side.cost, where).not.toMatch(/than most|than others|than anyone|other people|\d+ ?%|percent/i)
        // The honest part never names its source on screen.
        expect(side.cost, where).not.toMatch(/stud(y|ies)|research|et al|\d{4}/i)
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
})
