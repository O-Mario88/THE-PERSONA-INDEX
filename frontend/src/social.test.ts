import { describe, expect, it } from 'vitest'
import { AUDIENCES, audienceOf, TAG_NAMES, type FriendView } from './social'

const friend = (id: string, tag: FriendView['tag'], extra: Partial<FriendView> = {}): FriendView => ({ id, name: id, tag, since: '2026-10-01', active: false, connect: true, ...extra })

// Edwin, 2026-10-29: Connect is the one place where people share, "with their
// loved ones, workmates and close friends". Everywhere else is the anonymous
// Human Pulse only.
describe('sharing on Connect with the people you choose', () => {
  it('names the groups in Edwin’s words', () => {
    expect(AUDIENCES.map((a) => a.label)).toEqual(['Loved ones', 'Workmates', 'Close friends'])
    expect(TAG_NAMES).toEqual({ family: 'Loved ones', work: 'Workmates', friends: 'Close friends', school: 'Classmates' })
  })

  it('picks everyone in a group in one tap, never someone you muted', () => {
    const friends = [friend('a', 'family'), friend('b', 'work'), friend('c', 'family', { muted: true }), friend('d', 'friends'), friend('e', 'school')]
    expect(audienceOf(friends, 'loved')).toEqual(['a'])
    expect(audienceOf(friends, 'work')).toEqual(['b'])
    expect(audienceOf(friends, 'close')).toEqual(['d'])
  })
})
