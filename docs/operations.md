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

Stored per vote: question, option, an HMAC of the device id keyed by the server secret, the idempotency key and the time. No IP address, no token, no raw device id. Addresses are held only in memory for the device-issue limit, for at most an hour. Each phone's own answers are also kept for its mirror; see the next section.

## The weekly mirror

Edwin asked (2026-10-15) for the weekly mirror to be built from the database, so each phone's answers are kept on the server as well as counted anonymously:

- `mirror_answers` and `mirror_steps` (`backend/migrations/002_mirror.sql`) hold one row per answer and per small step, keyed by an HMAC of the device id under its own label (`mirror:`). It is the same for all of one phone's rows, so its week can be read back, and differs from every per-question vote key, so the `votes` table on its own still cannot be joined into a profile.
- An intimate answer is stored only as "a private answer": no option, and an HMAC in place of its question id. Private answers never shape a trait read.
- Rows are deleted after five weeks (the mirror reads three weeks of answers for each of the last three weeks) and at once on `DELETE /api/mirror`, which the app's "Delete everything" calls. Anonymous vote counts stay.
- `GET /api/mirror?date=` (header `Authorization: Device <token>`, `private, no-store`) builds the week: days, crowd verdicts from the real tallies (none below 100 votes on a question), trait reads (scoring version 1 in `backend/mirror.go`, ranked among players only once 30 have a read), themes, steps and strengths against the median player.
- Crowd figures are recomputed at most every 10 minutes per instance by reading three weeks of every phone's answers. That is fine at the 50k gate; before 1M daily players it becomes a table of weekly figures updated as votes arrive.

## Daily rollover

Each phone plays the edition for its own local date, from `GET /api/editions/{date}`, so the morning questions arrive in the person's morning. The evening check-in opens at 5 pm on the phone's clock; its follow-up answers stay on the phone and are never sent.

Time zones run from UTC-12 to UTC+14, so a date is today somewhere for about 50 hours: from 10:00 UTC the day before until 12:00 UTC the day after. The server serves a date, and accepts votes on its questions, only in that window, plus 10 minutes of grace for votes. A set is cached at most 5 minutes at the edge and 1 minute in the browser, shorter than the grace. Results stay readable for a day after the window closes. Edition numbers and question ids are the same everywhere for a date.

`GET /api/questions/today` still serves the UTC date's set; the app falls back to it when its own date is not open (a phone clock far off).

## Edge rules (Cloudflare)

The API has its own per-instance limits (30 votes per device per minute, 20 new devices per address per hour). At the edge, add:

- Rate limit `POST /api/device`: 20 requests per IP per hour, block for 1 hour.
- Rate limit `POST /api/votes`: 60 requests per IP per minute, managed challenge.
- Cache `GET /api/editions/*`, `GET /api/questions/today` and `GET /api/questions/*/results` by respecting origin `Cache-Control` (`s-maxage`). Never cache `POST` routes or `/api/mirror`; they send `no-store`.
- Bot Fight Mode on for `/api/*`.

## Insight card ratings

`POST /api/ratings` counts the one-tap "I learned something" / "Not really" on each card, anonymously and once per device per question, in the same vote store under `rating/<questionId>/<optionId>`. Learned rate per card across all days:

```sql
SELECT split_part(question_id, '/', 3) AS option_id,
       substring(split_part(question_id, '/', 2) from 12) AS bank_question,
       sum(count) FILTER (WHERE option_id = 'learned')::float / sum(count) AS learned_rate,
       sum(count) AS ratings
FROM vote_tallies WHERE question_id LIKE 'rating/%'
GROUP BY 1, 2 HAVING sum(count) >= 100 ORDER BY learned_rate;
```

Cards at the bottom with enough ratings are the ones to rewrite. (Automatic retirement from these numbers is the next step.)

## Compare with someone

Handled entirely on the phones: the link carries the edition number and the sender's chosen answers (never intimate ones) in the URL fragment, which browsers do not send to the server.
