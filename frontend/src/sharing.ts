// Sharing a part of what you wrote (Edwin, 2026-10-29). Ordinary reflections
// stay private; after saving, a person may share a part of one with people
// they trust, saying what would feel helpful, and see exactly what will be
// sent before it goes (mobile/src/screens/ShareSheet.tsx).
import type { FriendView, RTQuestion, ShareAudience, ShareMode } from './social'

// "What would feel helpful?", in the words of the brief.
export const HELPFUL: { id: ShareMode; label: string }[] = [
  { id: 'share', label: 'Just let me share' },
  { id: 'encourage', label: 'Encouragement' },
  { id: 'celebrate', label: 'Celebrate with me' },
  { id: 'experience', label: 'Your experience' },
  { id: 'talk', label: 'Let’s talk' },
]

// The text, one sentence at a time, so the person can share only a part.
export function sentencesOf(text: string): string[] {
  return (
    text
      .replace(/\s+/g, ' ')
      .trim()
      .match(/[^.!?]+[.!?]+["”’)]*|[^.!?]+$/g) ?? []
  )
    .map((s) => s.trim())
    .filter(Boolean)
}

// The sentences picked, in the order they were written.
export const excerptOf = (sentences: string[], picked: number[]): string =>
  [...picked]
    .sort((a, b) => a - b)
    .map((i) => sentences[i])
    .filter(Boolean)
    .join(' ')

// Who an item goes to: the Inner Circle (as this phone knows it) or the
// people picked, and never someone muted or with Connect off.
export function audienceOf(audience: ShareAudience, inner: string[], picked: string[], friends: FriendView[]): string[] {
  const open = friends.filter((f) => !f.muted && f.connect)
  const ids = audience === 'inner' ? inner : picked
  return open.filter((f) => ids.includes(f.id)).map((f) => f.id)
}

// What reflecting together shows once both revealed (Edwin, 2026-10-29): a
// matching answer is named as exactly that, a different one is as welcome,
// and one question to ask each other. Never "more alike", never a score.
export function togetherResult(q: RTQuestion, mine: string, theirs: string): { same: boolean; line: string; prompt: string } {
  const same = mine === theirs
  return same ? { same, line: 'You chose the same response to this question.', prompt: q.same } : { same, line: 'You chose different responses, and both are welcome.', prompt: q.differ }
}
