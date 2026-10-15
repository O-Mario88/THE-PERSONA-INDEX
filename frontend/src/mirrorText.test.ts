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
})
