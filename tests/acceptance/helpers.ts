import { createApp } from '@/server/app'
import { FIXED_NOW, fixtureBank } from '../fixtures/questions'

/** A fresh app per test: fixed clock, fixture questions, in-memory state. No live database. */
export function makeApp() {
  return createApp({ clock: () => FIXED_NOW, questionBank: fixtureBank })
}

export const BASE = 'http://localhost'

export function get(path: string) {
  return new Request(`${BASE}${path}`, { method: 'GET' })
}

export function postVote(body: unknown, idempotencyKey?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  return new Request(`${BASE}/api/votes`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}
