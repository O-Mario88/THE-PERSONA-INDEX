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
- `GET /api/mirror?date=` (header `Authorization: Device <token>`, `private, no-store`) builds the week from that phone's rows alone: days (each answer shown by how deep it went), trait reads (scoring version 1 in `backend/mirror.go`), themes and steps, set only against the phone's own earlier weeks. Edwin (2026-10-15): it speaks to people "about who they are and how they can change, not comparing them with other people", so it reads no other phone's answers and no vote tallies, and costs one device's rows per request.

## The monthly, quarterly and yearly mirrors

Answers go after five weeks, so the longer mirrors (`GET /api/mirror/{month|quarter|year}?date=`, same header and `no-store`) are built from a small note of each finished week:

- Every hour the worker folds each week that ended at least a week ago and still has all its answers kept (`FoldWeeks` in `backend/period.go`): one row per phone in `mirror_weeks` (`backend/migrations/003_mirror_weeks.sql`) under the same mirror key, plus a mark in `mirror_folds` that the week is done for everyone. Folding again changes nothing, so several instances may run it.
- A note holds counts (days, answers, private answers, deepest answers, steps), each theme's answers and depth, each trait's sum of positions, the steps that helped in their own words, and the three answers that said the most: the deepest answers whose option leans clearly on a trait, with their question, answer and the first sentence of their card. Never a private answer's question or option, and nothing about other phones.
- Notes are deleted after 400 days (a whole ISO year, readable through the January after), and at once on `DELETE /api/mirror`.
- A week belongs to the month, quarter and year that hold its Thursday. Weeks not folded yet are read from the kept answers the same way, so a week looks the same before and after it folds. A week with neither (before notes began) is shown as "nothing on record", never as a week off. The month or quarter before is shown for comparison only when every one of its weeks is on record.

## Daily rollover

Each phone plays the edition for its own local date, from `GET /api/editions/{date}`, in two sittings on the phone's clock (Edwin, 2026-10-15): the morning three from 5 am to 4:30 pm, then the evening three from 5 pm to midnight. Between them, and from midnight to 5 am, the app shows what opens next and asks nothing. Questions not answered by 4:30 pm or midnight close quietly. The evening's follow-up questions that `followUp` still carries are no longer asked, so each sitting is exactly three. Words a person types instead of tapping stay on the phone; only the option they say comes closest is sent as their vote. The day turns over at the phone's midnight.

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
