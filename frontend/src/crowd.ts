// Guess the crowd: before seeing the split, the player guesses how many people
// chose what they chose. The gap between guess and truth is the false
// consensus effect made personal (Ross, Greene & House, 1977).

export type GuessId = 'nobody' | 'some' | 'half' | 'most'

export const GUESSES: { id: GuessId; label: string; max: number }[] = [
  { id: 'nobody', label: 'Almost nobody', max: 15 },
  { id: 'some', label: 'Some people', max: 40 },
  { id: 'half', label: 'About half', max: 60 },
  { id: 'most', label: 'Most people', max: 100 },
]

// Below this many votes the split is too noisy to tell anyone they were wrong.
export const MIN_VOTES_TO_JUDGE = 20

export function bucketFor(percent: number): GuessId {
  return (GUESSES.find((g) => percent < g.max) ?? GUESSES[GUESSES.length - 1]).id
}

export function guessFeedback(guess: string, percent: number, totalVotes: number): string | null {
  const g = GUESSES.find((x) => x.id === guess)
  if (!g) return null
  if (totalVotes < MIN_VOTES_TO_JUDGE) {
    return 'Too few votes yet to check your guess. Look again later today.'
  }
  const pct = `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`
  if (bucketFor(percent) === g.id) return `You guessed right: ${pct} chose this too.`
  return `You guessed ${g.label.toLowerCase()}. It is ${pct}.`
}

// Edition share squares: with the crowd (the answer is the most chosen),
// against it, or skipped. Answers themselves are never shared.
export type Outcome = 'with' | 'against' | 'skipped'

export const SQUARE: Record<Outcome, string> = { with: '🟩', against: '🟧', skipped: '⬜' }

export function outcomeFor(choice: string, options: { optionId: string; percent: number }[]): Outcome {
  const mine = options.find((o) => o.optionId === choice)?.percent ?? 0
  const top = Math.max(0, ...options.map((o) => o.percent))
  return mine > 0 && mine >= top ? 'with' : 'against'
}

// Days played among the seven ending on today (inclusive), from dates YYYY-MM-DD.
export function daysPlayedThisWeek(days: string[], today: string): number {
  const end = Date.parse(`${today}T00:00:00Z`)
  const start = end - 6 * 86400_000
  return new Set(days.filter((d) => {
    const t = Date.parse(`${d}T00:00:00Z`)
    return t >= start && t <= end
  })).size
}

const THEME_NAMES: Record<string, string> = {
  habits: 'Daily habits',
  'sleep-health': 'Sleep and health',
  money: 'Money',
  'work-career': 'Work and career',
  learning: 'Learning',
  friendship: 'Friendship',
  family: 'Family',
  partnership: 'Partnership',
  dating: 'Dating',
  helping: 'Helping others',
  happiness: 'Happiness',
  'sadness-stress': 'Sadness and stress',
  anger: 'Anger',
  honesty: 'Honesty',
  'quality-quantity': 'Quality or quantity',
  'wealth-luxury': 'Wealth and luxury',
  'ambition-desire': "Ambition and heart's desire",
  intimacy: 'Intimacy',
}

export function themeName(slug: string): string {
  return THEME_NAMES[slug] ?? slug
}
