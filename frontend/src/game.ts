// Points and levels, kept on this phone only. They reward discovering things
// about yourself, never being right or playing every day: nothing here is lost
// by missing a day.

export const POINTS_PER_INSIGHT = 10
export const POINTS_PER_EDITION = 20
export const POINTS_PER_STEP = 5

export type GameState = {
  points: number
  insights: number
  themes: string[]
  editions: string[] // dates of completed editions, newest last
  awarded: string[] // recent question ids and step keys already counted
}

const key = 'pi.game.v1'

export function loadGame(): GameState {
  try {
    const g = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (g && typeof g.points === 'number' && Array.isArray(g.awarded)) return g
  } catch {
    // unreadable or blocked storage: start fresh
  }
  return { points: 0, insights: 0, themes: [], editions: [], awarded: [] }
}

function saveGame(g: GameState) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...g, awarded: g.awarded.slice(-120), editions: g.editions.slice(-60) }))
  } catch {
    // private mode: points last for this visit only
  }
}

function award(id: string, points: number, change?: (g: GameState) => void): number {
  const g = loadGame()
  if (g.awarded.includes(id)) return 0
  g.awarded.push(id)
  g.points += points
  change?.(g)
  saveGame(g)
  return points
}

// Each insight counts once, however often the card is seen again.
export function awardInsight(questionId: string, theme: string | undefined): number {
  return award(`i:${questionId}`, POINTS_PER_INSIGHT, (g) => {
    g.insights++
    if (theme && !g.themes.includes(theme)) g.themes.push(theme)
  })
}

export function awardEdition(date: string): number {
  return award(`e:${date}`, POINTS_PER_EDITION, (g) => g.editions.push(date))
}

export function awardStep(questionId: string): number {
  return award(`s:${questionId}`, POINTS_PER_STEP)
}

export function stepDone(questionId: string): boolean {
  return loadGame().awarded.includes(`s:${questionId}`)
}

// Levels by insights collected: about one level a week early on, slower later.
export const LEVELS = [
  { at: 0, name: 'Curious', icon: '🌱' },
  { at: 9, name: 'Explorer', icon: '🧭' },
  { at: 30, name: 'Pathfinder', icon: '🗺️' },
  { at: 75, name: 'Insightful', icon: '🔭' },
  { at: 150, name: 'Sage', icon: '🦉' },
  { at: 300, name: 'Luminary', icon: '✨' },
]

export function levelFor(insights: number) {
  let i = 0
  while (i + 1 < LEVELS.length && insights >= LEVELS[i + 1].at) i++
  const next = LEVELS[i + 1]
  const progress = next ? (insights - LEVELS[i].at) / (next.at - LEVELS[i].at) : 1
  return { ...LEVELS[i], next, progress, toNext: next ? next.at - insights : 0 }
}
