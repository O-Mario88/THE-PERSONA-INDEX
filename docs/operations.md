# Operations

How the backend runs in production, and the decisions behind it.

## Configuration

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | Postgres URL. Without it votes live in memory and are lost on restart (local dev only). |
| `DATABASE_MAX_CONNS` | Pool size per instance, default 20. Instances × pool must stay under the database's connection limit (or go through a pooler such as PgBouncer in transaction mode). |
| `DEVICE_TOKEN_SECRET` | 32+ random bytes that sign device tokens. Required with `DATABASE_URL`. Same value on every instance. Rotating it signs every device out; phones fetch a new token automatically and retry the vote. |
| `TRUST_CF_CONNECTING_IP` | `1` only when every request reaches the API through Cloudflare. |
| `RUN_TALLY_WORKER` | `0` to stop an instance tallying. Safe to leave on everywhere. |
| `VOTE_RETENTION_DAYS` | Raw-vote retention, default 30, minimum 7. Tallies are kept forever. |
| `PORT` | Listen port, default 8080. |

Migrations in `backend/migrations/` run at start under an advisory lock and are safe to re-run.

## Vote pipeline

1. `POST /api/device` mints a signed device token (rate limited per address).
2. `POST /api/votes` verifies the token, applies the per-device limit, and inserts one row. The insert committing is the moment of acceptance; only then does the API answer 202.
3. Unique keys on `(voter_hash, idem_key)` and `dedupe_key` make retries return the original vote and make second votes a 409, with no locks in Go.
4. Each instance's tally worker claims untallied rows with `FOR UPDATE SKIP LOCKED`, marks them and adds them to `vote_tallies` in one statement. Any number of workers can run; each vote is counted exactly once, and a crash leaves a batch either fully counted or untouched.
5. Results read `vote_tallies` (cached 2 s per instance, 10 s at the edge).

**Decision (2026-10-14): Postgres is the queue.** No separate queue until a load test shows the insert rate or tally lag is the limit. Estimated peak at 1M daily players is ~200 votes/s, ~2,000/s in a 10× burst; to be confirmed at the 50k gate first.

## Privacy in the vote table

Stored per vote: question, option, an HMAC of the device id keyed by the server secret, the idempotency key and the time. No IP address, no token, no raw device id. Addresses are held only in memory for the device-issue limit, for at most an hour.

## Daily rollover

One global edition, rolling over at 00:00 UTC. Today's set is cached at most 5 minutes at the edge and 1 minute in the browser, and never past midnight. Votes on yesterday's questions are accepted for 10 minutes after midnight, longer than any cached copy can live. Yesterday's results stay readable all of the next day.

## Edge rules (Cloudflare)

The API has its own per-instance limits (30 votes per device per minute, 20 new devices per address per hour). At the edge, add:

- Rate limit `POST /api/device`: 20 requests per IP per hour, block for 1 hour.
- Rate limit `POST /api/votes`: 60 requests per IP per minute, managed challenge.
- Cache `GET /api/questions/today` and `GET /api/questions/*/results` by respecting origin `Cache-Control` (`s-maxage`). Never cache `POST` routes; they send `no-store`.
- Bot Fight Mode on for `/api/*`.
