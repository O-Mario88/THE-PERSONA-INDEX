import type { DailySet } from './contracts'

/** Source of editorial question sets, keyed by `YYYY-MM-DD`. */
export interface QuestionBank {
  getSet(date: string): Promise<DailySet | null>
}

export interface AppDeps {
  clock: () => Date
  questionBank: QuestionBank
}

/**
 * The HTTP surface of the modular monolith. Each handler takes a standard
 * Request and returns a standard Response, so Next.js route files stay thin
 * and the acceptance tests can call handlers directly without a server.
 */
export interface PersonaApp {
  health(req: Request): Promise<Response>
  todayQuestions(req: Request): Promise<Response>
  castVote(req: Request): Promise<Response>
  results(req: Request, questionId: string): Promise<Response>
  /** Worker step: fold accepted vote events into the published result snapshots. */
  runAggregation(): Promise<void>
}

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented yet`)
    this.name = 'NotImplementedError'
  }
}

export function createApp(_deps: AppDeps): PersonaApp {
  return {
    async health() {
      return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
    },
    async todayQuestions() {
      throw new NotImplementedError('GET /api/questions/today')
    },
    async castVote() {
      throw new NotImplementedError('POST /api/votes')
    },
    async results() {
      throw new NotImplementedError('GET /api/questions/:questionId/results')
    },
    async runAggregation() {
      throw new NotImplementedError('vote aggregation worker')
    },
  }
}
