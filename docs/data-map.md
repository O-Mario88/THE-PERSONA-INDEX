# Data map

Everything The Persona Index keeps about a person: where it is, what it holds, how long it stays and how it is deleted. There are no accounts, so there is no name, email, phone number or address anywhere. The app's "What I keep" screen shows the live counts behind this page (`GET /api/device/data`), and "Delete everywhere" removes every row below that belongs to the phone.

Keep this page in step with the code. The retention numbers come from the constants named in each row; a change to one of them, or a new table or storage key, changes this page in the same pull request.

## On the phone

Local storage in the browser, every key starting with `pi.` (`frontend/src/storage.ts`). When local storage is blocked or full a value lives in memory for the visit instead. The app clears what has outlived its use each time it opens (`pruneLocal` in `frontend/src/api.ts`, `pruneNotebook` in `frontend/src/notebook.ts`).

Every key is named in one registry, `frontend/src/registry.ts`, which also says whether the encrypted backup carries it and whether "Download my book" includes it; `registry.test.ts` fails if the app spells out a key the registry does not name. The "Backup" column below is that registry's: *always*, *with own words* (only when the person switches own words on for the backup) or *never*.

| What | Key | Kept | Leaves the phone? |
| --- | --- | --- | --- |
| My notebook: cards kept with "Keep this" (with own words if the answer was typed), three good things, Sunday sentences, plans ("When ___, I will ___") and their checks, the names given to weeks, practices done. Each entry carries the moment it last changed | `pi.nb.<kind>.<id>` | Until the person removes it. A removal leaves a mark (no content) for 400 days, so an older backup cannot bring the entry back | Only sealed in the backup. A plan's check sends "did" or "not yet" and the date to the mirror (below), never the plan's words |
| Which reads were opened, and on which day | `pi.read.<slug>` | Until deleted | Only sealed in the backup |
| The backup's 12-word phrase, its version, whether own words go in it, when it last saved | `pi.vault.v1` | Until backup is turned off or the phone is cleared | Never. Only a key derived from the phrase is sent, as the backup's address |
| The lock: the id of the passkey the phone made for the app | `pi.lock.v1` | Until the lock is turned off or the phone is cleared | Never. The fingerprint, face or PIN check happens on the phone; nothing goes to the server |
| Whether the home screen invite was answered | `pi.install.v1` | Until deleted | Never |
| "Not yet" on the midday step check | `pi.midday.<date>` | The day | Never |
| Device pass: a server-signed random id, no personal data | `pi.device.v1` | Until "Delete everywhere" | Sent with every vote, step and mirror request |
| Answers in the person's own words | `pi.words.<questionId>` | 7, 35 (default) or 90 days, chosen in Settings | Never. Only the option the person says comes closest is sent, as their vote |
| A half-written answer | `pi.draft.<questionId>` | Until it is kept, or one day past its question's day | Never |
| Answer history: each answer's theme, depth, option and trait leanings, the need it reached for, the card's "That's me", "Partly" or "Not me", the reading picked as closer after "Not me", the evening's word on whether the morning's route usually gets the person there (with that answer's label), and skips | `pi.history.v1` | 60 days (`KEEP_DAYS`, `profile.ts`) | Never. The tap under a card is also sent once as a rating (below); the closer reading, the need and the route never are |
| After "Not me", a line in the person's own words on what is closer | `pi.instead.<questionId>` | As long as own words, chosen in Settings | Never |
| What the person said felt uncertain, when the mirror asked after feeling safe came first three weeks running | `pi.safety.<monday>` | 35 days (`pruneLocal`, `api.ts`) | Never |
| "That's me", "Partly" or "Not me" on a leaning in the mirror | `pi.leaning.<trait>.<high\|low>` | 35 days (`LEANING_KEEP_DAYS`, `profile.ts`) | Never. A leaning marked "Not me" stays out of the mirror's title, summary and one line on this phone |
| The order answers are shown in: a random seed, so the healthiest answer is not always first | `pi.seed` | Until "Delete from this phone" | Never |
| Small steps and how they went, and whether the step was the card's own or the one serving the answer's need | `pi.moves.v1` | The latest 60 | Each step's status, and which of the two steps it is, is sent to the mirror; a step on a private answer cannot be started |
| Per-question notes: the option tapped, a vote waiting to send, when it was answered, the card's "That's me", "Partly" or "Not me" and that tap while it waits to send | `pi.choice.`, `pi.pending.`, `pi.at.`, `pi.rated.`, `pi.unrated.` + question id | Eight days past the question's day (`NOTES_KEPT_DAYS`), longer than any question takes votes | A waiting vote or card tap is sent again with its original key; the rest never |
| The three questions each sitting showed | `pi.pick.<date>` and `pi.pick.<date>.pm` | Yesterday and today | Never |
| The day's questions, for opening offline | `pi.edition.<date>` | Yesterday, today and tomorrow | Public content, nothing personal |
| Settings: 18+ answer, keep it mild, how long own words stay, and the country the person said they live in (or "Prefer not to say"), guessed only from the phone's own time zone, on the phone | `pi.prefs.v1` | Until deleted | Only sealed in the backup. The country is never sent; tapping "Find a helpline" opens that country's page on Find A Helpline, so that site sees it only then |

Everything marked *always* in the registry, and own words when switched on, also leaves the phone sealed, in the backup (below), if the person turns the backup on. Nothing else in this table is sent as it is.

"Delete from this phone" clears every `pi.` key except the device pass, the notebook and the backup's phrase included, and leaves a closed mark (`x`, no option) on questions answered today or yesterday, because the server still counts that vote and the question must not be answered twice. A backup stays on the server, and the 12 words bring it back. "Delete everywhere" first deletes the backup from the server, then does the same and drops the pass too, so the phone starts again with a new one. "Can't unlock?" on the lock screen clears the phone the same way, pass included, and leaves the backup.

### Download my book

"Download my book" (My notebook, and What I keep) makes two files on the phone and sends them nowhere: a page to read or print, with the notebook, own words and the server's copy of the person's answers and steps (`GET /api/device/export`), private cards left out while "Keep it mild" is on; and a data file with every key the registry marks for download plus the server's copy. The pass, the phrase, the lock and anything waiting to be sent are never in either (`frontend/src/book.ts`).

## On the server

Postgres, schema in `backend/migrations/`. Every key below is an HMAC made from the device id with a subkey of `DATA_KEY_SECRET`; the device id itself, the token, IP addresses and user agents are never stored.

| Table | One row is | Holds | Kept | Deleted by "Delete everywhere" |
| --- | --- | --- | --- | --- |
| `votes` | A vote or a card rating, waiting to be counted or kept for the one-vote rule | Question, option, a voter hash that is different for every question, the idempotency key, the time to the hour, when it was counted | `VOTE_RETENTION_DAYS` after it is counted: default 7, never less than 7 (`main.go`) | Yes, found through the phone's voter hashes for every edition still kept (`deviceVoteHashes`) |
| `vote_tallies` | One option's count | Question, option, count. No device key of any kind | For good | No: with nothing to link a count to a phone, it is a real total, not personal data |
| `mirror_answers` | One answer, for the phone's mirror | Mirror key, question, date, morning or evening, theme, option, depth, the tap under the card (`verdict`: me, partly or not_me) | 35 days (`mirrorRetention`, `mirrorstore.go`) | Yes |
| `mirror_steps` | One small step | Mirror key, question, option, the day it started, its status, whether it was the need step (`007_need_steps.sql`), the hour it last changed | 35 days | Yes |
| `mirror_weeks` | One finished week, for the monthly, quarterly and yearly mirrors | Mirror key, counts, theme depths, trait sums and on how many days each trait came up, steps that helped, the three answers that said the most. Never a private answer's question or option, never own words | 400 days (`weekSummaryRetention`, `period.go`) | Yes |
| `mirror_plan_checks` | One check of a plan | Mirror key, a random key for the check (so a resend counts once and two checks of one plan cannot be tied together), the date, "did" or "not_yet". Never the plan's words | 35 days, with the rest of the mirror | Yes |
| `vaults` | One encrypted backup | The SHA-256 of a key derived from the 12-word phrase, a version number, the sealed bytes (AES-GCM on the phone; the server cannot open them), the last day a phone wrote or read it. No mirror key, no pass: nothing ties it to a phone | 400 days after a phone last wrote or read it (`vaultRetention`, `vault.go`) | Yes: the app deletes it first, with `DELETE /api/vault`, while the phone still holds the phrase |
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
- Device ids, for the limit of 30 votes, ratings, steps, plan checks and data requests per device a minute, for a minute.
- Backup addresses (the SHA-256 above), for the limit of 120 backup reads and writes each an hour, and network addresses, for the limit of 30 requests for a backup that does not exist an hour (`vault.go`), for at most an hour.

Nothing in memory is written to disk or logs.

### Logs and backups

- **Logs** hold, for a failed or slow request (or every request if `ACCESS_LOG=all`), its request id, method, route pattern, status, duration and size; and the background jobs' row counts and errors. Never a path, query string, address, user agent, pass or answer (`observe`, `backend/middleware.go`). Kept by the host for 30 days or less ([monitoring.md](monitoring.md#logs)).
- **The host's database backups** are whole copies of the tables above, kept **7 days or less**, so a phone's rows leave every backup within 7 days of "Delete everywhere". A restore to a moment before a deletion brings that phone's rows back, unreadable without its pass, until normal retention removes them ([backups.md](backups.md)).

## Deleting everything

`DELETE /api/device/data` (header `Authorization: Device <pass>`; `DELETE /api/mirror` is the older name and does the same):

1. Accepts any well-formed pass, even one signed by a retired key, because holding the 16 random bytes inside it is proof of owning that phone's rows, and a made-up id matches nothing (`Holder`, `devicetoken.go`).
2. In one transaction, under the phone's advisory lock: deletes its mirror answers, steps, plan checks and weekly notes, deletes every raw vote and rating under its voter hashes, and marks the phone forgotten for 35 days.
3. Answers `200` with what was deleted: answers, steps, plan checks, weekly notes and votes.

The backup is not tied to the pass, so the server cannot find it from here. The app deletes it first, with `DELETE /api/vault` and the key from the phrase, and stops without deleting anything if that fails.

While the mark stands, the old pass takes no more votes, steps or ratings (`410 device_forgotten`), so a vote retried after the delete cannot bring an answer back. The phone fetches a new pass and starts again. Counts already tallied stay, because nothing links them to the phone.
