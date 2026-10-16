# Operations

How the backend runs in production, and the decisions behind it.

## Configuration

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | Postgres URL. Without it votes live in memory and are lost on restart (local dev only). |
| `DATABASE_MAX_CONNS` | Pool size per instance, default 20. Instances × pool must stay under the database's connection limit (or go through a pooler such as PgBouncer in transaction mode). |
| `DEVICE_TOKEN_SECRET` | 32+ random bytes that sign device passes. Required with `DATABASE_URL`. Same value on every instance. Can be rotated without signing anyone out; see "Keys" below. |
| `DEVICE_TOKEN_SECRET_PREVIOUS` | Optional: the token secret before a rotation. Passes it signed keep working. |
| `DATA_KEY_SECRET` | 32+ random bytes, different from both token secrets. Keys every hash the server stores. Required with `DATABASE_URL`. Same value on every instance. Never rotated; see "Keys" below. |
| `TRUST_CF_CONNECTING_IP` | `1` only when every request reaches the API through Cloudflare. |
| `RUN_TALLY_WORKER` | `0` to stop an instance tallying. Safe to leave on everywhere. |
| `VOTE_RETENTION_DAYS` | Raw-vote retention after counting, default 7, minimum 7. Tallies are kept for good. |
| `PORT` | Listen port, default 8080. |

Migrations in `backend/migrations/` run at start, in file order, under an advisory lock, so instances starting together wait for each other. Each file runs once and is recorded in `schema_migrations`; the files are also written so that running one again changes nothing. A migration never edits a file that has shipped; a change is a new file.

Without `DATABASE_URL` the server keeps everything in memory and makes up random secrets if they are missing, which is for local development only.

What each table and phone key holds, and for how long, is in [data-map.md](data-map.md). Change that page with any change to retention or to what is stored.

## Keys

Two secrets, each with one job (`backend/devicetoken.go`):

- **`DEVICE_TOKEN_SECRET` signs device passes.** A pass is `v2.<kid>.<id>.<sig>`: 16 random bytes of device id, signed under the key whose id is `kid`. To rotate: set `DEVICE_TOKEN_SECRET_PREVIOUS` to the current value and `DEVICE_TOKEN_SECRET` to a new one, deploy every instance, and remove the previous secret once no phone has used it for a while (passes are kept on phones until deleted, so a few weeks). A rotation changes no stored hash, so nobody loses their mirror and nobody can vote twice. A pass signed by a key the server no longer has is refused with `invalid_device`, and the phone fetches a new pass and starts a new history.
- **`DATA_KEY_SECRET` keys every stored hash**: the per-question voter hash, the mirror key and the private question id, each with its own subkey derived by HKDF under its own label. Changing it orphans every phone's stored history and reopens every question still taking votes to every phone, so it is set once and kept in the secret store. If it leaks, the hashes can be linked to device ids only by someone who also holds the passes, which live on phones; rotate it only as a deliberate reset, during a quiet hour, accepting both effects.

The server refuses to start with either secret shorter than 32 bytes or the data secret equal to a token secret. Generate each with `openssl rand -base64 48`.

## Vote pipeline

1. `POST /api/device` mints a signed device token (rate limited per address).
2. `POST /api/votes` verifies the token, applies the per-device limit, and inserts the vote and the phone's mirror answer in one transaction, under the phone's advisory lock (`Accept` in `pgstore.go`): both are stored or neither is. The commit is the moment of acceptance; only then does the API answer 202.
3. Unique keys on `(voter_hash, idem_key)` and `dedupe_key` make retries return the original vote and make second votes a 409, with no locks in Go.
4. Each instance's tally worker claims untallied rows with `FOR UPDATE SKIP LOCKED`, marks them and adds them to `vote_tallies` in one statement. Any number of workers can run; each vote is counted exactly once, and a crash leaves a batch either fully counted or untouched.
5. Results read `vote_tallies` (cached 2 s per instance, 10 s at the edge).

**Decision (2026-10-14): Postgres is the queue.** No separate queue until a load test shows the insert rate or tally lag is the limit. Estimated peak at 1M daily players is ~200 votes/s, ~2,000/s in a 10× burst; to be confirmed at the 50k gate first.

## Privacy in the vote table

Stored per vote: question, option, an HMAC of the device id and the question, the idempotency key and the hour it came in. No IP address, no pass, no raw device id. For an intimate question the option stored is always `~private`, so the choice is kept nowhere, and its results are refused with `403 private_question`. Addresses are held only in memory for the device-issue and delete limits, for at most an hour. Each phone's own answers are also kept for its mirror; see the next section.

## The weekly mirror

Edwin asked (2026-10-15) for the weekly mirror to be built from the database, so each phone's answers are kept on the server as well as counted anonymously:

- `mirror_answers` and `mirror_steps` (`backend/migrations/002_mirror.sql`) hold one row per answer and per small step, keyed by an HMAC of the device id under its own label (`mirror:`). It is the same for all of one phone's rows, so its week can be read back, and differs from every per-question vote key, so the `votes` table on its own still cannot be joined into a profile.
- An answer keeps its date and whether it came in the morning or evening sitting, never the moment it was given, so a mirror row cannot be matched to a vote by time.
- An intimate answer is stored only as "a private answer": no option, and an HMAC in place of its question id. Private answers never shape a trait read.
- Rows are deleted after five weeks (the mirror reads three weeks of answers for each of the last three weeks) and at once on "Delete everywhere"; see "Deleting a phone's data" below. Anonymous vote counts stay.
- `GET /api/mirror?date=` (header `Authorization: Device <token>`, `private, no-store`) builds the week from that phone's rows alone: days (each answer shown by how deep it went), trait reads (scoring version 1 in `backend/mirror.go`), themes and steps, set only against the phone's own earlier weeks. Edwin (2026-10-15): it speaks to people "about who they are and how they can change, not comparing them with other people", so it reads no other phone's answers and no vote tallies, and costs one device's rows per request.

## The monthly, quarterly and yearly mirrors

Answers go after five weeks, so the longer mirrors (`GET /api/mirror/{month|quarter|year}?date=`, same header and `no-store`) are built from a small note of each finished week:

- Every hour the worker folds each week that ended at least a week ago and still has all its answers kept (`FoldWeeks` in `backend/period.go`): one row per phone in `mirror_weeks` (`backend/migrations/003_mirror_weeks.sql`) under the same mirror key, plus a mark in `mirror_folds` that the week is done for everyone. Folding again changes nothing, so several instances may run it.
- A note holds counts (days, answers, private answers, deepest answers, steps), each theme's answers and depth, each trait's sum of positions, the steps that helped in their own words, and the three answers that said the most: the deepest answers whose option leans clearly on a trait, with their question, answer and the first sentence of their card. Never a private answer's question or option, and nothing about other phones.
- Notes are deleted after 400 days (a whole ISO year, readable through the January after), and at once on "Delete everywhere".
- A week belongs to the month, quarter and year that hold its Thursday. Weeks not folded yet are read from the kept answers the same way, so a week looks the same before and after it folds. A week with neither (before notes began) is shown as "nothing on record", never as a week off. The month or quarter before is shown for comparison only when every one of its weeks is on record.

## Deleting a phone's data

- `GET /api/device/data` (header `Authorization: Device <pass>`, `private, no-store`) returns what the server keeps for the phone, counted live, and how many days each kind is kept. The app's "What I keep" screen shows it.
- `DELETE /api/device/data` (same header; `DELETE /api/mirror` is the older name) deletes, in one transaction under the phone's advisory lock, its mirror answers, steps and weekly notes and every raw vote and rating under its voter hashes, then marks the phone forgotten for 35 days. It answers `200` with the counts deleted. It accepts any well-formed pass, even one whose signing key has been retired, because holding the random id is proof of owning its rows. Limited to 20 an hour per address.
- While the mark stands, the old pass gets `410 device_forgotten` on votes, ratings and steps, so a retry cannot bring an answer back; the phone fetches a new pass. Weekly notes are not folded for a forgotten phone.

Tallies already counted stay, because nothing links them to the phone.

## The frozen schedule

Which questions each date shows is decided once and committed in `backend/content/schedule.json`, one line per day, so adding, rewording or reordering questions in the bank never changes a date someone may already have seen. The server deals the days after the file the same way in memory, so it never runs out, but those days are not frozen.

- **After any change to `backend/content/questions.json`**, run `cd backend && go run . schedule` and commit the result with the bank change. It keeps every day up to 14 days ahead exactly as it was, deals the rest again so new questions come up within about two weeks, and fills the file 18 months ahead. The tests fail until the file matches the bank.
- A scheduled question can be reworded, never removed: the server refuses to start if the file names a question the bank no longer has. Retiring questions is not built yet, so a weak question or card is rewritten in place (its prompt, options' `reveal` and `step`), which changes no date.
- CI runs `go run . schedule -check base.json` against the file on `main`: no day up to a week ahead may change, and the file must reach at least 90 days ahead. The server also logs a warning at start when the file ends within 90 days.
- The dealer, in `backend/schedule.go`: in each area, the question drawn least recently, never one sharing the area's last theme, and never one shown in the six question days before; each area's extra pool questions are spread the same way.

## Daily rollover

Each phone plays the edition for its own local date, from `GET /api/editions/{date}`, in two sittings on the phone's clock (Edwin, 2026-10-15): the morning three from 5 am to 4:30 pm, then the evening three from 5 pm to midnight. Between them, and from midnight to 5 am, the app shows what opens next and asks nothing. Questions not answered by 4:30 pm or midnight close quietly. Each sitting is exactly three; the evening follow-up questions the bank used to carry were removed on 2026-10-15. Words a person types instead of tapping stay on the phone; only the option they say comes closest is sent as their vote. The day turns over at the phone's midnight.

Time zones run from UTC-12 to UTC+14, so a date is today somewhere for about 50 hours: from 10:00 UTC the day before until 12:00 UTC the day after. The server serves a date, and accepts votes on its questions, only in that window, plus 10 minutes of grace for votes. A set is cached at most 5 minutes at the edge and 1 minute in the browser, shorter than the grace. Results stay readable for a day after the window closes. Edition numbers and question ids are the same everywhere for a date.

`GET /api/questions/today` still serves the UTC date's set; the app falls back to it when its own date is not open (a phone clock far off).

## Edge rules (Cloudflare)

The API has its own per-instance limits (30 votes per device per minute, 20 new devices per address per hour). At the edge, add:

- Rate limit `POST /api/device`: 20 requests per IP per hour, block for 1 hour.
- Rate limit `POST /api/votes`: 60 requests per IP per minute, managed challenge.
- Cache `GET /api/editions/*`, `GET /api/questions/today` and `GET /api/questions/*/results` by respecting origin `Cache-Control` (`s-maxage`). Never cache `POST` or `DELETE` routes, `/api/mirror*` or `/api/device/data`; they send `no-store`.
- Bot Fight Mode on for `/api/*`.

## Insight card ratings

`POST /api/ratings` counts the one tap under each card, "That's me", "Partly" or "Not me" (`verdict`: `me`, `partly` or `not_me`), anonymously and once per device per question, in the same vote store: question `rating/<questionId>` (the question id is `<date>-<bank id>`), option `<optionId>/me`, `<optionId>/partly` or `<optionId>/not`. On an intimate question the option is always `~private/me`, `~private/partly` or `~private/not`. An app from before 2026-10-16 still sends `learned: true|false`; the server reads it as `me` or `not_me`, and migration 005 renamed the old `/learned` counts to `/me` the same way. Fit per card across all days:

```sql
SELECT substring(question_id from 19) AS bank_question,
       split_part(option_id, '/', 1) AS option_id,
       sum(count) FILTER (WHERE option_id LIKE '%/me')::float / sum(count) AS me_rate,
       sum(count) FILTER (WHERE option_id LIKE '%/not')::float / sum(count) AS not_me_rate,
       sum(count) AS ratings
FROM vote_tallies WHERE question_id LIKE 'rating/%'
GROUP BY 1, 2 HAVING sum(count) >= 100 ORDER BY not_me_rate DESC;
```

Cards at the top with enough ratings are the ones to rewrite: most people who chose that answer said the card was not them. (Automatic retirement from these numbers is the next step.) An answer whose card a phone tapped "Not me" still counts as an answer in that phone's mirror, but never towards a trait read, an example or a moment.
