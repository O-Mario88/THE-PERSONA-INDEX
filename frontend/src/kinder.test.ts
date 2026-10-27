import { describe, expect, it } from 'vitest'
import { kinderLook, readWriting } from './kinder'
import { voiceProblems } from './voice'

describe('reading what someone wrote, on this phone', () => {
  it('hears a crisis first, and never answers it with a kinder look', () => {
    for (const t of ["I don't want to be here anymore", 'Sometimes I think everyone would be better off without me', 'I keep wanting to hurt myself', 'thinking about suicide again']) {
      expect(readWriting(t), t).toEqual({ kind: 'crisis' })
    }
  })

  it('notices a harsh word about the whole self, and the traps around it', () => {
    expect(readWriting("I'm such a failure. I always mess everything up at work.")).toEqual({ kind: 'hard', traps: ['label', 'always', 'blame'], area: 'work' })
    expect(readWriting('Nobody likes me. My friends must think I am annoying.')).toEqual({ kind: 'hard', traps: ['label', 'always', 'mind'], area: 'friends' })
    expect(readWriting('Things will never get better with my family.')).toEqual({ kind: 'hard', traps: ['always', 'future'], area: 'family' })
    expect(readWriting('I hate myself')).toEqual({ kind: 'hard', traps: ['label'], area: null })
  })

  it('leaves ordinary writing alone, even with "never" in it', () => {
    expect(readWriting('Had a lovely walk. I never knew the park had a pond.')).toBeNull()
    expect(readWriting('Work was busy but fine.')).toBeNull()
    expect(readWriting('')).toBeNull()
  })
})

describe('a kinder look', () => {
  const record = { goodThings: [{ date: '2026-10-20', text: 'Made my sister laugh' }], kept: [] }

  it('takes the feeling seriously, then asks rather than tells, and brings back their own words', () => {
    const look = kinderLook({ kind: 'hard', traps: ['label', 'always'], area: 'work' }, record)
    expect(look.lines[0]).toMatch(/heavy/)
    expect(look.lines).toHaveLength(4) // the feeling, one trap, the area, a friend's eyes
    expect(look.evidence).toEqual({ lead: 'Something you wrote down on 20 October', text: 'Made my sister laugh' })
    expect(look.lines.at(-1)).toMatch(/good friend/)
  })

  it('still has something kind to say with nothing kept yet', () => {
    const look = kinderLook({ kind: 'hard', traps: ['future'], area: null }, { goodThings: [], kept: [] })
    expect(look.evidence).toBeNull()
    expect(look.lines.length).toBeGreaterThanOrEqual(3)
  })

  it('keeps to the writing guide: no forced cheer, no promises, no labels', () => {
    for (const traps of [['label'], ['always'], ['blame'], ['future'], ['mind']] as const) {
      for (const area of ['work', 'friends', 'family', 'world', null] as const) {
        for (const line of kinderLook({ kind: 'hard', traps: [...traps], area }, record).lines) expect(voiceProblems(line), line).toEqual([])
      }
    }
  })
})
