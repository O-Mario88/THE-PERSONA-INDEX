# Project Rules & Verification

## Commands
- **Backend Test:** `cd backend && go test ./...`
- **Frontend Test:** `cd frontend && npm test`
- **Full Suite:** `cd backend && go test ./... && cd ../frontend && npm test`

All commands are non-interactive and exit non-zero on failure. Backend tests use a
fixed clock and in-memory fixtures; no database, network, or env vars needed.
Run `npm ci` in `frontend/` once before the frontend tests.

## Guidelines
1. Execute the relevant test command before and after any code modification.
2. All new API endpoints in `backend/` must have companion tests in `*_test.go`.
3. Do not consider tasks complete if any test suite fails.

## Context
- `backend/api_test.go` holds acceptance tests written before the code (today's
  questions, idempotent votes, results). They fail until those features are built;
  rule 3 applies to the feature being worked on.
- The duplicate-vote rule (provisional): one vote per question per anonymous device id (`voterId`), defined only in `backend/voterule.go`.
  Update the tests when the real rule is chosen.
- Never fabricate votes or results. Empty results are real zeros.
