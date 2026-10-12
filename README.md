# THE-PERSONA-INDEX
Build The Persona Index as a simple, engaging, trustworthy daily behavioral discovery platform that can grow toward 1 million DAU without sacrificing performance, privacy, vote integrity, maintainability, or financial sustainability.

## Development

Requires Go 1.22+ and Node 22+.

```bash
cd backend && go test ./...                # backend acceptance tests
cd frontend && npm ci && npm test          # frontend smoke test
cd backend && go run .                     # API on :8080
cd frontend && npm run dev                 # UI on :5173 (proxies /api to :8080)
```

The acceptance tests in `backend/api_test.go` define the core API (today's
3 questions, idempotent voting, community results) and were written before the
implementation. See `CLAUDE.md` for the working rules.

## How voting works today

- `POST /api/votes` validates the vote and appends it to the vote store before
  answering 202. A retry with the same `Idempotency-Key` returns the same event.
- The duplicate-vote rule is in `backend/voterule.go`: one vote per question per
  anonymous device id (a random id the browser keeps in local storage).
- An aggregation worker (in-process, every second) folds new vote events into
  result snapshots from a cursor, so reruns never double count. Results are
  served from those snapshots, with real zeros before anyone votes.
- The vote store is in memory and questions come from a small rotating
  editorial list in `backend/questions.go`. Both move to Postgres later.
