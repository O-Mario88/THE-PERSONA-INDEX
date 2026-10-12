// Public API contracts. The acceptance tests in tests/acceptance pin these shapes.

export interface QuestionOption {
  id: string
  label: string
}

export interface Question {
  id: string
  prompt: string
  options: QuestionOption[]
}

export interface DailySet {
  /** Calendar date the set belongs to, `YYYY-MM-DD` (UTC for now). */
  date: string
  questions: Question[]
}

/** GET /api/questions/today */
export type TodayQuestionsResponse = DailySet

/** POST /api/votes request body. The `Idempotency-Key` header is required. */
export interface VoteRequest {
  questionId: string
  optionId: string
  /**
   * PLACEHOLDER voter identity. The duplicate-vote rule is not decided yet
   * (browser/day, account, or privacy-preserving token). Until it is, the
   * tests assume one vote per question per voterId.
   */
  voterId: string
}

/** 202 response from POST /api/votes. Returned only once the vote is durably accepted. */
export interface VoteAccepted {
  status: 'accepted'
  eventId: string
}

/** GET /api/questions/:questionId/results */
export interface QuestionResults {
  questionId: string
  totalVotes: number
  options: Array<{ optionId: string; count: number; percent: number }>
}

export interface ApiError {
  error:
    | 'invalid_request'
    | 'missing_idempotency_key'
    | 'unknown_question'
    | 'unknown_option'
    | 'duplicate_vote'
}
