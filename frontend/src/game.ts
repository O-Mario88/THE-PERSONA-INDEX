import type { StepStatus } from './api'

// Points and levels, kept on this phone only. They reward discovering things
// about yourself, never being right or playing every day: nothing here is lost
// by missing a day.

export const POINTS_PER_INSIGHT = 10
export const POINTS_PER_EDITION = 20
export const POINTS_PER_STEP = 5
export const POINTS_PER_REFLECTION = 10
export const POINTS_PER_EVENING = 20

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

// Evening reflections earn points but do not count towards levels, which
// follow the morning insights.
export function awardReflection(questionId: string): number {
  return award(`r:${questionId}`, POINTS_PER_REFLECTION)
}

export function awardEvening(date: string): number {
  return award(`n:${date}`, POINTS_PER_EVENING)
}

// Moves: the small steps a person chooses to try, one per insight card at
// most ("I'll try it"). The evening asks how each went. Kept on this phone,
// and sent with the device's answers so the mirror can show them.
export type Move = { date: string; questionId: string; optionId: string; step: string; status: StepStatus }

const movesKey = 'pi.moves.v1'
const STATUSES: StepStatus[] = ['started', 'helped', 'no_change', 'not_tried']

// Before several moves a day, a move was one per day with tried true/false.
// A tried move of that time counts as tried, never as helped.
function migrate(m: Record<string, unknown>): Move {
  const status: StepStatus =
    typeof m.status === 'string' && STATUSES.includes(m.status as StepStatus)
      ? (m.status as StepStatus)
      : m.tried === true
        ? 'no_change'
        : m.tried === false
          ? 'not_tried'
          : 'started'
  return {
    date: String(m.date),
    questionId: String(m.questionId ?? ''),
    optionId: typeof m.optionId === 'string' ? m.optionId : '',
    step: String(m.step),
    status,
  }
}


export function loadMoves(): Move[] {
  try {
    const v = JSON.parse(localStorage.getItem(movesKey) ?? '[]')
    return Array.isArray(v)
      ? v.filter((m) => m && typeof m.date === 'string' && typeof m.step === 'string').map(migrate)
      : []
  } catch {
    return []
  }
}

function saveMoves(moves: Move[]) {
  try {
    localStorage.setItem(movesKey, JSON.stringify(moves.slice(-60)))
  } catch {
    // private mode: this visit only
  }
}

export function startMove(date: string, questionId: string, optionId: string, step: string) {
  const moves = loadMoves()
  if (moves.some((m) => m.questionId === questionId)) return
  saveMoves([...moves, { date, questionId, optionId, step, status: 'started' }])
}

export function moveFor(questionId: string): Move | undefined {
  return loadMoves().find((m) => m.questionId === questionId)
}

export function movesOn(date: string): Move[] {
  return loadMoves().filter((m) => m.date === date)
}

export const tried = (s: StepStatus) => s === 'helped' || s === 'no_change'

// setMoveStatus records how a move went; trying it earns points once.
export function setMoveStatus(questionId: string, status: StepStatus): number {
  const moves = loadMoves()
  const m = moves.find((x) => x.questionId === questionId)
  if (!m) return 0
  m.status = status
  saveMoves(moves)
  return tried(status) ? award(`m:${questionId}`, POINTS_PER_STEP) : 0
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
