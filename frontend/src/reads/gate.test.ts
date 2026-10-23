/// <reference types="node" />
import { readFileSync } from 'node:fs'
import library from '../../../backend/content/sources.json'
import { readProblems, readsProblems } from './gate'
import shipped from './reads.json'
import type { Read } from './types'

// READS_FILE=<path> checks a batch of reads on its own, without the coverage
// rule: `READS_FILE=/path/batch.json npx vitest run src/reads/gate.test.ts`.
const batch = process.env.READS_FILE

const good: Read = {
  slug: 'why-you-replay-a-row',
  title: 'Why a row keeps playing in your head',
  kind: 'trait',
  key: 'rumination.high',
  summary: 'Going over an argument feels like solving it. Here is what is really happening, and how to let the replay end.',
  paragraphs: Array.from(
    { length: 8 },
    (_, i) =>
      `Paragraph ${i + 1} speaks to you about the replay in plain words, one thought at a time, and it never names a source or sets you against anyone else. It stays with what you can notice in your own day, and it ends on something you can do about it tonight.`,
  ),
  try: 'Tonight, give the replay ten minutes on paper, then close the notebook and say out loud that it can wait until morning.',
  sources: [
    { key: 'ayduk2010', title: 'Ayduk & Kross, 2010', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2881638/', strength: 'moderate', supports: 'Stepping back from a hurt and looking at it from a distance makes it sting less when it is replayed.' },
    { key: 'newsource2001', title: 'Someone, 2001', url: 'https://example.org/paper', strength: 'strong', supports: 'Setting the worry aside for a set time later in the day cuts how much of the day it takes up.' },
  ],
}

describe('the reads gate', () => {
  it('passes a good read', () => {
    expect(readProblems(good, library)).toEqual([])
  })

  it('catches what the rules are for', () => {
    const cases: [Partial<Read>, RegExp][] = [
      [{ title: 'Why a row keeps playing in your head.' }, /no full stop/],
      [{ key: 'rumination.middle' }, /not a trait side/],
      [{ kind: 'theme', key: 'gardening' }, /not a life area/],
      [{ summary: 'Too short.' }, /summary is/],
      [{ paragraphs: good.paragraphs.slice(0, 2) }, /2 paragraphs/],
      [{ paragraphs: [...good.paragraphs.slice(1), 'A 2009 study found replaying hurts, and that is what this paragraph has to say about it in a sentence long enough to count.'] }, /shows research/],
      [{ paragraphs: [...good.paragraphs.slice(1), 'You replay a row more than most people do, and that is the whole of this paragraph, said in a sentence long enough to count here.'] }, /compares you/],
      [{ try: 'Write it down tonight, okay, and then let it rest until the morning comes round.' }, /says "okay"/],
      [{ try: 'Write it down tonight! Then let it rest until the morning comes round again.' }, /exclamation/],
      [{ sources: [good.sources[0]] }, /1 sources/],
      [{ sources: [{ ...good.sources[0], url: 'https://elsewhere.org' }, good.sources[1]] }, /use the same title and link/],
    ]
    for (const [change, want] of cases) {
      expect(readProblems({ ...good, ...change } as Read, library).join('\n'), JSON.stringify(change)).toMatch(want)
    }
  })

  it('asks for one read per life area and trait side', () => {
    const problems = readsProblems([good, { ...good }], library)
    expect(problems).toContain('why-you-replay-a-row: slug used 2 times')
    expect(problems).toContain('trait:rumination.high: 2 reads, needs one')
    expect(problems).toContain('life area anger has no read')
  })

  it.skipIf(!batch)('passes the batch in READS_FILE', () => {
    const reads = JSON.parse(readFileSync(batch!, 'utf8')) as Read[]
    expect(readsProblems(reads, library, true)).toEqual([])
  })

  it.skipIf(!!batch)('passes every shipped read', () => {
    expect(readsProblems(shipped as Read[], library)).toEqual([])
  })
})
