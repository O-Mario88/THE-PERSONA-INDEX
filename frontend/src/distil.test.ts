import { describe, expect, it } from 'vitest'
import { distil } from './distil'

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'’\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)

// Edwin's brief, 2026-10-29: "When people speak out loud, they ramble…
// Distill into a clear thought… in the user's own first-person voice."
// Done on the phone with no model: the person's own words, fewer of them.
describe('distilling what someone said into a clear thought', () => {
  it('takes out the ums, the you-knows and the doubled words', () => {
    expect(distil('Um, so today at work I I kind of felt, like, stretched thin, you know.')).toBe('Today at work I felt stretched thin.')
  })

  it('keeps the one or two sentences that say the most about what happened and how it felt, in the order they were said', () => {
    const said =
      "So I got to work late. The bus was full again. My manager asked me to take on a colleague's task without asking. I said yes and felt stretched thin all afternoon. Then I had lunch. Anyway, that's it."
    expect(distil(said)).toBe("My manager asked me to take on a colleague's task without asking. I said yes and felt stretched thin all afternoon.")
  })

  it('never keeps two sentences that say the same thing', () => {
    const said =
      "Um, so today at work I I kind of felt, like, stretched thin, you know. My manager asked me to take on a colleague's task without asking. I said yes and felt stretched thin all afternoon. Anyway, that's it."
    expect(distil(said)).toBe("My manager asked me to take on a colleague's task without asking. I said yes and felt stretched thin all afternoon.")
  })

  it('leaves a short, clear thought as it is', () => {
    expect(distil('I felt calm today.')).toBe('I felt calm today.')
    expect(distil('i felt calm today')).toBe('I felt calm today.')
  })

  it('shortens a long stretch said without any full stops at a natural break', () => {
    const said =
      'so I was thinking about the weekend and how I never really rest because there is always something to do for the family and then on Sunday I just felt tired and a bit annoyed with myself for not saying no to anything at all this week'
    const out = distil(said)
    expect(out.endsWith('…')).toBe(true)
    expect(words(out).length).toBeLessThanOrEqual(36)
    expect(out.startsWith('I was thinking about the weekend')).toBe(true)
  })

  it('never adds a word the person didn’t say', () => {
    const said = 'Um, honestly I was, like, really really nervous before the call. But it went fine, and I felt proud after.'
    const heard = new Set(words(said))
    for (const w of words(distil(said))) expect(heard.has(w), w).toBe(true)
  })

  it('gives nothing back for nothing said', () => {
    expect(distil('   ')).toBe('')
    expect(distil('um uh, you know')).toBe('')
  })
})
