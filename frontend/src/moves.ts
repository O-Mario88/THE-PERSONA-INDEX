import { ApiError, saveStep, type StepStatus } from './api'
import { morningEnd } from './day'
import { addDays, loadJSON, saveJSON } from './storage'

// Small steps: the ones a person chooses to try, one per insight card at
// most ("I'll try it"). The evening asks how each morning step went, Sunday
// asks about the week's, and one picked in the evening is asked about in the
// mirror. This is the one place a step is saved: on this phone first, then
// sent so the server's mirror can show it. A step that could not be sent is
// sent again the next time the app opens.
export type Move = {
  date: string
  questionId: string
  optionId: string
  step: string
  status: StepStatus
  at?: number // when it was started, in ms; missing on steps saved before times were kept
  unsent?: true // the server has not got the latest status yet
  needStep?: true // the card's second step, serving what the answer reached for (since 2026-10-24)
}

const movesKey = 'pi.moves.v1'
const STATUSES: StepStatus[] = ['started', 'helped', 'no_change', 'not_tried']

// Before several steps a day, a step was one per day with tried true/false.
// A tried step of that time counts as tried, never as helped.
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
  if (m.unsent === true) move.unsent = true
  if (m.needStep === true) move.needStep = true
  return move
}

export function loadMoves(): Move[] {
  const v = loadJSON(movesKey)
  return Array.isArray(v) ? v.filter((m) => m && typeof m.date === 'string' && typeof m.step === 'string').map(migrate) : []
}

function saveMoves(moves: Move[]) {
  saveJSON(movesKey, moves.slice(-60))
}

function update(questionId: string, change: (m: Move) => void) {
  const moves = loadMoves()
  const m = moves.find((x) => x.questionId === questionId)
  if (!m) return
  change(m)
  saveMoves(moves)
}

// send gives the server a step's status. A step it cannot place (an answer
// it never had, or one deleted since) is not sent again; anything else that
// fails is kept to send later. It rejects when the step did not get there.
async function send(m: Move, today: string): Promise<void> {
  if (!m.optionId) return
  try {
    await saveStep(m.questionId, m.optionId, m.status, today, !!m.needStep)
    update(m.questionId, (x) => delete x.unsent)
  } catch (e) {
    const gone = e instanceof ApiError && (e.code === 'unknown_answer' || e.code === 'invalid_request')
    update(m.questionId, (x) => (gone ? delete x.unsent : (x.unsent = true)))
    throw e
  }
}

// startMove keeps a new step on this phone and sends it. Starting the same
// card's step again changes nothing. needStep: the card's second step was
// picked, the one serving what the answer reached for.
export function startMove(
  date: string,
  questionId: string,
  optionId: string,
  step: string,
  at = Date.now(),
  needStep = false,
): Promise<void> {
  const moves = loadMoves()
  if (moves.some((m) => m.questionId === questionId)) return Promise.resolve()
  const m: Move = { date, questionId, optionId, step, status: 'started', at, unsent: true, ...(needStep ? { needStep: true as const } : {}) }
  saveMoves([...moves, m])
  return send(m, date)
}

// setMoveStatus says how a step went, here and on the server. A step started
// from the mirror, which this phone never kept, is kept from now on.
export function setMoveStatus(
  questionId: string,
  status: StepStatus,
  today: string,
  from?: { optionId: string; step: string; date: string },
): Promise<void> {
  let m = moveFor(questionId)
  if (!m && from) {
    m = { ...from, questionId, status }
    saveMoves([...loadMoves(), m])
  }
  if (!m) return Promise.resolve()
  update(questionId, (x) => {
    x.status = status
    x.unsent = true
  })
  return send({ ...m, status }, today)
}

// sendUnsent sends again every step the server did not get, once.
export async function sendUnsent(today: string) {
  for (const m of loadMoves().filter((x) => x.unsent)) {
    await send(m, today).catch(() => {
      // still offline: next time
    })
  }
}

export function moveFor(questionId: string): Move | undefined {
  return loadMoves().find((m) => m.questionId === questionId)
}

export function movesOn(date: string): Move[] {
  return loadMoves().filter((m) => m.date === date)
}

// movesBetween lists the steps started from one date to another (YYYY-MM-DD), oldest first.
export function movesBetween(from: string, to: string): Move[] {
  return loadMoves().filter((m) => m.date >= from && m.date <= to)
}

// openThisWeek lists the small steps of the week ending on sunday that still
// wait for an answer, for Sunday's review.
export function openThisWeek(sunday: string): Move[] {
  const monday = addDays(sunday, -6)
  return loadMoves().filter((m) => m.date >= monday && m.date < sunday && m.status === 'started')
}

// startedInEvening says whether a step was picked in the evening sitting, so
// it has had no day to try yet.
export function startedInEvening(m: Move): boolean {
  return m.at !== undefined && m.at >= morningEnd(m.date)
}
