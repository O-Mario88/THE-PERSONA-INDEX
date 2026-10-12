# THE-PERSONA-INDEX
Build The Persona Index as a simple, engaging, trustworthy daily behavioral discovery platform that can grow toward 1 million DAU without sacrificing performance, privacy, vote integrity, maintainability, or financial sustainability.

## Development

Requires Node 22+.

```bash
npm ci
npm run verify   # typecheck + smoke + acceptance tests
npm run dev      # http://localhost:3000
```

The acceptance tests in `tests/acceptance/` define the core API (health, today's
3 questions, idempotent voting, community results) and were written before the
implementation. Until each feature lands, its tests fail on purpose and
`npm run verify` exits non-zero. See `CLAUDE.md` for the working rules.
