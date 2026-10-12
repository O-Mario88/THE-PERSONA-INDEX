# Project Rules & Verification

The Persona Index is a Next.js + TypeScript modular monolith. API logic lives in
`src/server/` as plain `Request -> Response` handlers; files under `src/app/api/`
only wire those handlers to routes.

## Commands
- **Install:** `npm ci`
- **Smoke tests (runner + page renders):** `npm run test:smoke`
- **Acceptance tests (API contracts):** `npm run test:acceptance`
- **Full suite:** `npm test`
- **Verify (typecheck + full suite, the one command to trust):** `npm run verify`
- **Production build:** `npm run build`

All commands are non-interactive and exit non-zero on failure. Tests use a fixed
clock and in-memory fixtures; they need no database, network, or env vars.

## Guidelines
1. Run `npm run verify` before and after any code change.
2. Every new API endpoint gets acceptance tests in `tests/acceptance/` that call
   the handler in `src/server/` directly. Write the failing test first.
3. Do not weaken, skip, or delete an acceptance test to make it pass. If a
   contract needs to change, change the test deliberately and say why.
4. Do not consider a task complete if `npm run verify` fails, unless the only
   failures are acceptance tests for features that task does not cover.
5. Never fabricate votes or results. Empty results are real zeros.

## Open decisions
- **Duplicate-vote rule** is a placeholder: one vote per question per `voterId`
  (`tests/acceptance/votes.test.ts`). Update the tests when the real rule is chosen.
- "Today" is the UTC calendar date for now.
