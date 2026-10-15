import type { StepStatus } from './api'
import { morningEnd } from './day'

// Moves: the small steps a person chooses to try, one per insight card at
// most ("I'll try it"). The evening asks how each morning move went; one
// picked in the evening is asked about in the mirror. Kept on this phone,
// and sent with the device's answers so the mirror can show them.
export type Move = {
  date: string
  questionId: string
  optionId: string
  step: string
  status: StepStatus
  at?: number // when it was started, in ms; missing on moves saved before times were kept
}

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
  const move: Move = {
    date: String(m.date),
    questionId: String(m.questionId ?? ''),
    optionId: typeof m.optionId === 'string' ? m.optionId : '',
    step: String(m.step),
    status,
  }
  if (typeof m.at === 'number') move.at = m.at
  return move
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

export function startMove(date: string, questionId: string, optionId: string, step: string, at = Date.now()) {
  const moves = loadMoves()
  if (moves.some((m) => m.questionId === questionId)) return
  saveMoves([...moves, { date, questionId, optionId, step, status: 'started', at }])
}

export function moveFor(questionId: string): Move | undefined {
  return loadMoves().find((m) => m.questionId === questionId)
}

export function movesOn(date: string): Move[] {
  return loadMoves().filter((m) => m.date === date)
}

// startedInEvening says whether a move was picked in the evening sitting, so
// it has had no day to try yet.
export function startedInEvening(m: Move): boolean {
  return m.at !== undefined && m.at >= morningEnd(m.date)
}

export function setMoveStatus(questionId: string, status: StepStatus) {
  const moves = loadMoves()
  const m = moves.find((x) => x.questionId === questionId)
  if (!m) return
  m.status = status
  saveMoves(moves)
}
