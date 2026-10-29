import { describe, expect, it } from 'vitest'
import { audienceOf, excerptOf, HELPFUL, sentencesOf } from './sharing'
import type { FriendView } from './social'

// Edwin, 2026-10-29: ordinary reflections stay private; after saving, the
// person may share a part of one, with the people they pick, saying what
// would feel helpful, and see exactly what will be sent.

const friend = (id: string, extra: Partial<FriendView> = {}): FriendView => ({ id, name: id, tag: 'friends', since: '2026-10-01', active: false, connect: true, ...extra })

describe('sharing a part of a reflection', () => {
  it('offers the reflection one sentence at a time, so only a part need be shared', () => {
    expect(sentencesOf('I said no to an extra shift. But I still feel guilty!  Is that normal?')).toEqual(['I said no to an extra shift.', 'But I still feel guilty!', 'Is that normal?'])
    expect(sentencesOf('   ')).toEqual([])
  })

  it('joins the sentences chosen, in the order they were written', () => {
    const s = sentencesOf('One. Two. Three.')
    expect(excerptOf(s, [2, 0])).toBe('One. Three.')
    expect(excerptOf(s, [])).toBe('')
  })

  it('asks what would feel helpful in the words of the brief', () => {
    expect(HELPFUL.map((h) => h.label)).toEqual(['Just let me share', 'Encouragement', 'Celebrate with me', 'Your experience', 'Let’s talk'])
  })

  it('sends to the Inner Circle or to the people picked, never to someone muted or with Connect off', () => {
    const friends = [friend('ama'), friend('kofi', { muted: true }), friend('joel', { connect: false }), friend('nia')]
    expect(audienceOf('inner', ['ama', 'kofi', 'joel'], [], friends)).toEqual(['ama'])
    expect(audienceOf('people', ['ama'], ['nia', 'kofi'], friends)).toEqual(['nia'])
  })
})
