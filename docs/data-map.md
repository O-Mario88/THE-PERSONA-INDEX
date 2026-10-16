# Data map

Everything The Persona Index keeps about a person: where it is, what it holds, how long it stays and how it is deleted. There are no accounts, so there is no name, email, phone number or address anywhere. The app's "What I keep" screen shows the live counts behind this page (`GET /api/device/data`), and "Delete everywhere" removes every row below that belongs to the phone.

Keep this page in step with the code. The retention numbers come from the constants named in each row; a change to one of them, or a new table or storage key, changes this page in the same pull request.

## On the phone

Local storage in the browser, every key starting with `pi.` (`frontend/src/storage.ts`). When local storage is blocked or full a value lives in memory for the visit instead. The app clears what has outlived its use each time it opens (`pruneLocal` in `frontend/src/api.ts`).

| What | Key | Kept | Leaves the phone? |
| --- | --- | --- | --- |
| Device pass: a server-signed random id, no personal data | `pi.device.v1` | Until "Delete everywhere" | Sent with every vote, step and mirror request |
| Answers in the person's own words | `pi.words.<questionId>` | 7, 35 (default) or 90 days, chosen in Settings | Never. Only the option the person says comes closest is sent, as their vote |
| A half-written answer | `pi.draft.<questionId>` | Until it is kept, or one day past its question's day | Never |
| Answer history: each answer's theme, depth and trait leanings, and skips | `pi.history.v1` | 60 days (`KEEP_DAYS`, `profile.ts`) | Never |
| Small steps and how they went | `pi.moves.v1` | The latest 60 | Each step's status is sent to the mirror; a step on a private answer cannot be started |
| Per-question notes: the option tapped, a vote waiting to send, when it was answered, whether the card was rated | `pi.choice.`, `pi.pending.`, `pi.at.`, `pi.rated.` + question id | Eight days past the question's day (`NOTES_KEPT_DAYS`), longer than any question takes votes | A waiting vote is sent again with its original key; the rest never |
| The three questions each sitting showed | `pi.pick.<date>` and `pi.pick.<date>.pm` | Yesterday and today | Never |
| The day's questions, for opening offline | `pi.edition.<date>` | Yesterday, today and tomorrow | Public content, nothing personal |
| Settings: 18+ answer, keep it mild, how long own words stay | `pi.prefs.v1` | Until deleted | Never |

"Delete from this phone" clears every `pi.` key except the device pass, and leaves a closed mark (`x`, no option) on questions answered today or yesterday, because the server still counts that vote and the question must not be answered twice. "Delete everywhere" does the same and drops the pass too, so the phone starts again with a new one.

## On the server

Postgres, schema in `backend/migrations/`. Every key below is an HMAC made from the device id with a subkey of `DATA_KEY_SECRET`; the device id itself, the token, IP addresses and user agents are never stored.

| Table | One row is | Holds | Kept | Deleted by "Delete everywhere" |
| --- | --- | --- | --- | --- |
| `votes` | A vote or a card rating, waiting to be counted or kept for the one-vote rule | Question, option, a voter hash that is different for every question, the idempotency key, the time to the hour, when it was counted | `VOTE_RETENTION_DAYS` after it is counted: default 7, never less than 7 (`main.go`) | Yes, found through the phone's voter hashes for every edition still kept (`deviceVoteHashes`) |
| `vote_tallies` | One option's count | Question, option, count. No device key of any kind | For good | No: with nothing to link a count to a phone, it is a real total, not personal data |
| `mirror_answers` | One answer, for the phone's mirror | Mirror key, question, date, morning or evening, theme, option, depth, the tap under the card (`verdict`: me, partly or not_me) | 35 days (`mirrorRetention`, `mirrorstore.go`) | Yes |
| `mirror_steps` | One small step | Mirror key, question, option, the day it started, its status, the hour it last changed | 35 days | Yes |
| `mirror_weeks` | One finished week, for the monthly, quarterly and yearly mirrors | Mirror key, counts, theme depths, trait sums, steps that helped, the three answers that said the most. Never a private answer's question or option, never own words | 400 days (`weekSummaryRetention`, `period.go`) | Yes |
| `mirror_folds` | A week that has been folded for everyone | The Monday and when it was folded. Nothing about any phone | For good | No |
| `forgotten_devices` | A phone that deleted everything | Mirror key and the date | 35 days, with the rest of the mirror | It is what the delete writes |
| `schema_migrations` | A migration that has run | File name and time | For good | No |

### Intimate questions

The choice on an intimacy question is never stored on the server, in any table:

- The phone sends `~private` as its option, and the server stores `~private` whatever arrives (`CastVote`, `api.go`). The count for the question is how many answered, not what.
- `GET /api/questions/{id}/results` refuses an intimate question with `403 private_question`.
- The mirror row says only that a private answer was given: an HMAC in place of the question id, no option, depth 0. Private answers never shape a trait read and never appear in a weekly note.
- A card rating on one is stored as `~private/me`, `~private/partly` or `~private/not`.
- A small step cannot be started on one.

### What cannot be joined

- Votes cannot be put together into one person's answers: each vote's voter hash is made per question, so one phone's votes share no key.
- Votes cannot be matched to the mirror: the mirror key is made with a different subkey from every voter hash, a vote keeps only its hour, and a mirror answer keeps only its date and sitting, never its moment.
- The mirror is a profile of one phone by design; that is what the mirror reads. Only a request carrying that phone's pass can read it, and it never reads another phone's rows or any tally.

### Held in memory only

- Network addresses, for the limits on new device passes and on deletes (20 of each per address an hour), for at most an hour (`ratelimit.go`).
- Device ids, for the limit of 30 votes, ratings, steps and data requests per device a minute, for a minute.

Nothing in memory is written to disk or logs.

## Deleting everything

`DELETE /api/device/data` (header `Authorization: Device <pass>`; `DELETE /api/mirror` is the older name and does the same):

1. Accepts any well-formed pass, even one signed by a retired key, because holding the 16 random bytes inside it is proof of owning that phone's rows, and a made-up id matches nothing (`Holder`, `devicetoken.go`).
2. In one transaction, under the phone's advisory lock: deletes its mirror answers, steps and weekly notes, deletes every raw vote and rating under its voter hashes, and marks the phone forgotten for 35 days.
3. Answers `200` with what was deleted: answers, steps, weekly notes and votes.

While the mark stands, the old pass takes no more votes, steps or ratings (`410 device_forgotten`), so a vote retried after the delete cannot bring an answer back. The phone fetches a new pass and starts again. Counts already tallied stay, because nothing links them to the phone.
