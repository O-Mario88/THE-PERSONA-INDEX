# The Persona Index

A private daily companion: three questions in the morning and three in the
evening, an insight with every answer, and weekly, monthly, quarterly and
yearly mirrors built from a person's own answers. No accounts, no comparing
with other people, and what the server keeps about a phone is shown on one
screen and deleted with one tap.

## Development

Requires Go 1.24+ and Node 22+.

```bash
cd backend && go test ./...                # backend tests (in memory)
cd frontend && npm ci && npm test          # tests of the shared code
cd backend && go run .                     # API on :8080
cd mobile && npm ci && npx expo start      # the app: i = iPhone, a = Android, w = browser
cd mobile && npm run build:web             # the website, into mobile/dist
docker compose up --build                  # the production image with Postgres, on :8080
```

One React Native app (Expo) runs everywhere: iPhone, Android, the Mac (the
iPad build on Apple Silicon) and the web (React Native for Web). It lives in
`mobile/`; the rules it runs on, shared by every platform, live in
`frontend/src` and are imported as `@shared/...`.

Set `PERSONA_TEST_DATABASE_URL` to run the backend tests against Postgres.
See `CLAUDE.md` for the working rules.

## Documentation

- [docs/operations.md](docs/operations.md): settings, keys, the vote
  pipeline, the mirrors, deleting data, the static site, the frozen schedule
  and the edge rules.
- [docs/data-map.md](docs/data-map.md): everything kept about a person,
  where, for how long, and how it is deleted; why Patron never changes
  that; the clear choices for sharing; and what the voice promise covers.
- [docs/first-release.md](docs/first-release.md): who the first release is
  for, what it puts first and holds back, the growth ideas as hypotheses,
  and the five signals counted without anyone's writing.
- [docs/deploy.md](docs/deploy.md): the image, Cloudflare, and the
  checklist for every deploy.
- [docs/monitoring.md](docs/monitoring.md): health checks, metrics, alerts
  and logs.
- [docs/backups.md](docs/backups.md): backup retention, restoring and the
  restore drill.
- [docs/load-test.md](docs/load-test.md): the load gate and its results.
- [mobile/DESIGN.md](mobile/DESIGN.md): the design system: colours,
  type, spacing and the shared parts.
