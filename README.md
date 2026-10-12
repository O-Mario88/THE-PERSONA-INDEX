# THE-PERSONA-INDEX
Build The Persona Index as a simple, engaging, trustworthy daily behavioral discovery platform that can grow toward 1 million DAU without sacrificing performance, privacy, vote integrity, maintainability, or financial sustainability.

## Development

Requires Go 1.22+ and Node 22+.

```bash
cd backend && go test ./...                # backend acceptance tests
cd frontend && npm ci && npm test          # frontend smoke test
cd backend && go run .                     # API on :8080
cd frontend && npm run dev                 # UI on :5173
```

The acceptance tests in `backend/api_test.go` define the core API (today's
3 questions, idempotent voting, community results) and were written before the
implementation. Until each feature lands, its tests fail on purpose. See
`CLAUDE.md` for the working rules.
