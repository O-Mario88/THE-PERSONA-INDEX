import type { AnswerRecord } from './profile'

// Common Ground suggestions, worked out on this phone from the themes the
// person has answered most (the new Connect). Only a suggestion: the person
// reviews them, unticks any and adds from the fixed list, and nothing leaves
// the phone until they confirm. Intimate themes and cards they called "Not
// me" never count.

const TAG_OF: Record<string, string> = {
  rest: 'peace-calm', 'sadness-stress': 'peace-calm', anger: 'peace-calm', happiness: 'peace-calm',
  'work-career': 'work-life', colleagues: 'work-life', plans: 'work-life', phone: 'work-life',
  confidence: 'growth', habits: 'growth', 'ambition-desire': 'growth',
  friendship: 'meaningful-time', celebrations: 'meaningful-time', 'quality-quantity': 'meaningful-time', partnership: 'meaningful-time', faith: 'meaningful-time',
  body: 'health', food: 'health', 'sleep-health': 'health', 'getting-around': 'health',
  family: 'family', relatives: 'family', parenting: 'family', home: 'family',
  learning: 'learning', school: 'learning',
  honesty: 'honesty',
  helping: 'kindness', neighbours: 'kindness',
  money: 'independence', 'wealth-luxury': 'independence',
}

const MIN_ANSWERS = 3
const MAX_SUGGESTED = 4

export function suggestCommonTags(answers: AnswerRecord[]): string[] {
  const counts = new Map<string, number>()
  for (const ans of answers) {
    const tag = TAG_OF[ans.theme]
    if (!tag || ans.verdict === 'not_me') continue
    counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= MIN_ANSWERS)
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .slice(0, MAX_SUGGESTED)
    .map(([tag]) => tag)
}
