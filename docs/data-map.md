# Data map

Everything The Persona Index keeps about a person: where it is, what it holds, how long it stays and how it is deleted. Signing in is optional (Stage 5, 2026-10-24). Signed out, there is no name, email, phone number or address anywhere. Signed in, the account holds a display name and a handle, and no email address or phone number: only a keyed hash of how the person signs in and a hint such as `a•••@gmail.com` (see "Accounts and the circle" below). The app's "What I keep" screen shows the live counts behind this page (`GET /api/device/data`), and "Delete everywhere" removes every row below that belongs to the phone.

Keep this page in step with the code. The retention numbers come from the constants named in each row; a change to one of them, or a new table or storage key, changes this page in the same pull request.

## On the phone

Local storage in the browser, every key starting with `pi.` (`frontend/src/storage.ts`). When local storage is blocked or full a value lives in memory for the visit instead. The app clears what has outlived its use each time it opens (`pruneLocal` in `frontend/src/api.ts`, `pruneNotebook` in `frontend/src/notebook.ts`).

Every key is named in one registry, `frontend/src/registry.ts`, which also says whether the encrypted backup carries it and whether "Download my book" includes it; `registry.test.ts` fails if the app spells out a key the registry does not name. The "Backup" column below is that registry's: *always*, *with own words* (only when the person switches own words on for the backup) or *never*.

| What | Key | Kept | Leaves the phone? |
| --- | --- | --- | --- |
| My notebook: cards kept with "Keep this" (with own words if the answer was typed), three good things, Sunday sentences, plans ("When ___, I will ___") and their checks, the names given to weeks, practices done. Each entry carries the moment it last changed | `pi.nb.<kind>.<id>` | Until the person removes it. A removal leaves a mark (no content) for 400 days, so an older backup cannot bring the entry back | Only sealed in the backup. A plan's check sends "did" or "not yet" and the date to the mirror (below), never the plan's words |
| Which reads were opened, and on which day | `pi.read.<slug>` | Until deleted | Only sealed in the backup |
| Written reflections in Reflect (since the October 2026 Reflect): the person's words, the question they answered and why it appeared, the area, and the thread it belongs to | `pi.nb.reflection.<id>` | Until the person removes it (a mark as above), or deletes their reflections in You | Never. Only in the backup's journal copy, end to end (below) |
| "Something I'd like to try": the words, the reflection it came from, the day of the gentle check-in and how it went | `pi.nb.intention.<id>` | As above | Never. Journal copy only |
| A half-written reflection for each space (today, this week, this month, writing freely) and the memories put away. Since 2026-10-27 the app always uses the person's reflections, on this phone only, in What you've noticed, Your Growth and the Mirrors; the old on/off switches (`pi.reflect.settings`) are no longer read or written, and an old one is removed with the rest | `pi.reflect.*` | Until saved, removed or deleted in You | Never. Journal copy only |
| The backup's 12-word phrase (absent on a phone restored through sync until the person types it), the main copy's keys from sync, each copy's version, whether own words go in it, when it last saved | `pi.vault.v1` | Until backup is turned off or the phone is cleared | Never. Only a key derived from the phrase is sent, as the backup's address |
| The lock: the id of the passkey the phone made for the app | `pi.lock.v1` | Until the lock is turned off or the phone is cleared | Never. The fingerprint, face or PIN check happens on the phone; nothing goes to the server |
| Whether the home screen invite was answered | `pi.install.v1` | Until deleted | Never |
| What the person asked to be called, for the greeting | `pi.name` | Until deleted | Only sealed in the backup |
| Your own moves towards friends, for "Your week in connection" in the Mirrors: the day and the kind (a quiet nod, a shared insight, asking for support, a win), never who | `pi.connection.v1` | A year | Only sealed in the backup. Never sent: the server counts none of these |
| Which of the three circles (inner, close, friends) each friend was placed in | `pi.rings` | Until deleted | Only sealed in the backup. Never sent: no friend and not the server learns which circle they are in |
| That the welcome was shown before the first sitting | `pi.welcomed` | Until deleted | Never |
| "Not yet" on the midday step check | `pi.midday.<date>` | The day | Never |
| Device pass: a server-signed random id, no personal data | `pi.device.v1` | Until "Delete everywhere" | Sent with every vote, step and mirror request |
| Answers in the person's own words | `pi.words.<questionId>` | 7, 35 (default) or 90 days, chosen in Settings | Never. Only the option the person says comes closest is sent, as their vote |
| A half-written answer | `pi.draft.<questionId>` | Until it is kept, or one day past its question's day | Never |
| Answer history: each answer's theme, depth, option and trait leanings, the need it reached for, the card's "That's me", "Partly" or "Not me", the reading picked as closer after "Not me", the evening's word on whether the morning's route usually gets the person there (with that answer's label), skips, and a `regional` mark on answers and skips of questions about where the person lives | `pi.history.v1` | 60 days (`KEEP_DAYS`, `profile.ts`) | Never. The tap under a card is also sent once as a rating (below); the closer reading, the need and the route never are. Nothing about a regional question is ever sent: no vote, no tap, no step |
| After "Not me", a line in the person's own words on what is closer | `pi.instead.<questionId>` | As long as own words, chosen in Settings | Never |
| What the person said felt uncertain, when the mirror asked after feeling safe came first three weeks running | `pi.safety.<monday>` | 35 days (`pruneLocal`, `api.ts`) | Never |
| "That's me", "Partly" or "Not me" on a leaning in the mirror | `pi.leaning.<trait>.<high\|low>` | 35 days (`LEANING_KEEP_DAYS`, `profile.ts`) | Never. A leaning marked "Not me" stays out of the mirror's title, summary and one line on this phone |
| The order answers are shown in: a random seed, so the healthiest answer is not always first | `pi.seed` | Until "Delete from this phone" | Never |
| Small steps and how they went, and whether the step was the card's own or the one serving the answer's need | `pi.moves.v1` | The latest 60 | Each step's status, and which of the two steps it is, is sent to the mirror; a step on a private answer cannot be started; a step from a regional question is marked `local` and never sent |
| How a step went (My Growth Journey check-in): whether you tried it, how it went, how you felt, and a date to ask again if you kept it for later | `pi.checkins.v1` | The latest 60 | Never sent as such: only the step's existing status (helped, no change, not tried) goes to the mirror, as before, and, while "Count my steps in What helped" is on (You), the outcome alone goes to `what_helped`. The feeling, the date to ask again and the note never leave the phone. In the backup |
| Your note about how a step went, in your own words | `pi.stepnote.<question>` | Until you delete it | Never sent. Journal class: only in the backup's journal copy, sealed under keys from your 12 words, so easy sync cannot open it |
| Per-question notes: the option tapped, a vote waiting to send, when it was answered, the card's "That's me", "Partly" or "Not me" and that tap while it waits to send | `pi.choice.`, `pi.pending.`, `pi.at.`, `pi.rated.`, `pi.unrated.` + question id | Eight days past the question's day (`NOTES_KEPT_DAYS`), longer than any question takes votes | A waiting vote or card tap is sent again with its original key; the rest never |
| The three questions each sitting showed | `pi.pick.<date>` and `pi.pick.<date>.pm` | Yesterday and today | Never |
| The day's questions, for opening offline | `pi.edition.<date>` | Yesterday, today and tomorrow | Public content, nothing personal |
| The card each answer showed (the question, the option's label, its reading, other side, step and need), for Insights; never for an intimacy question | `pi.insight.` + question id | 30 days | Never, and never in a backup |
| Settings: 18+ answer, keep it mild, how long own words stay, the country the person said they live in (or "Prefer not to say"), guessed only from the phone's own time zone, on the phone, and whether questions about everyday life there are switched off | `pi.prefs.v1` | Until deleted | Only sealed in the backup. The country is never sent; tapping "Find a helpline" opens that country's page on Find A Helpline, so that site sees it only then. The phone maps the country to a region itself |
| Signed in: the session token and the name, handle and choices the account shows | `pi.account.v1`, `pi.account.me` | Until signing out, deleting the account or "Delete from this phone" ("Delete everywhere" keeps the person signed in and moves the account to a fresh pass) | The token is sent with account and circle requests. Never in a backup |
| An invite link the person followed (`/c/<code>`) | `pi.invite` | Until they join or say not now | Sent once to accept the invite |
| That the sign-in sheet was offered after the first sitting | `pi.signin.asked` | Until deleted | Never |
| The questions about everyday life in each part of the world, for opening without a connection | `pi.regional.v1` | Until the next copy arrives | Public content, the same for everyone. `GET /api/regional` sends nothing about the phone: no pass, no country, no region |

Everything marked *always* in the registry, and own words when switched on, also leaves the phone sealed, in the backup (below), if the person turns the backup on. Nothing else in this table is sent as it is.

"Delete from this phone" clears every `pi.` key except the device pass, the notebook and the backup's phrase included, and leaves a closed mark (`x`, no option) on questions answered today or yesterday, because the server still counts that vote and the question must not be answered twice. A backup stays on the server, and the 12 words bring it back. "Delete everywhere" first deletes the backup from the server, then does the same and drops the pass too, so the phone starts again with a new one. "Can't unlock?" on the lock screen clears the phone the same way, pass included, and leaves the backup.

### Download my book

"Download my book" (My notebook, and What I keep) makes two files on the phone and sends them nowhere: a page to read or print, with the notebook, own words and the server's copy of the person's answers and steps (`GET /api/device/export`), private cards left out while "Keep it mild" is on; and a data file with every key the registry marks for download plus the server's copy. The pass, the phrase, the lock and anything waiting to be sent are never in either (`frontend/src/book.ts`).

## On the server

Postgres, schema in `backend/migrations/`. Every key below is an HMAC made from the device id with a subkey of `DATA_KEY_SECRET`; the device id itself, the token, IP addresses and user agents are never stored.

| Table | One row is | Holds | Kept | Deleted by "Delete everywhere" |
| --- | --- | --- | --- | --- |
| `votes` | A vote or a card rating, waiting to be counted or kept for the one-vote rule. `counted` is false when the phone has not chosen to add to the totals: the tally then skips it (`012_uncounted_votes.sql`) | Question, option, a voter hash that is different for every question, the idempotency key, the time to the hour, when it was counted | `VOTE_RETENTION_DAYS` after it is counted: default 7, never less than 7 (`main.go`) | Yes, found through the phone's voter hashes for every edition still kept (`deviceVoteHashes`) |
| `vote_tallies` | One option's count | Question, option, count. No device key of any kind | For good | No: with nothing to link a count to a phone, it is a real total, not personal data |
| `mirror_answers` | One answer, for the phone's mirror | Mirror key, question, date, morning or evening, theme, option, depth, the tap under the card (`verdict`: me, partly or not_me) | 35 days (`mirrorRetention`, `mirrorstore.go`) | Yes |
| `mirror_steps` | One small step | Mirror key, question, option, the day it started, its status, whether it was the need step (`007_need_steps.sql`), the hour it last changed | 35 days | Yes |
| `mirror_weeks` | One finished week, for the monthly, quarterly and yearly mirrors | Mirror key, counts, theme depths, trait sums and on how many days each trait came up, steps that helped, the three answers that said the most. Never a private answer's question or option, never own words | 400 days (`weekSummaryRetention`, `period.go`) | Yes |
| `mirror_plan_checks` | One check of a plan | Mirror key, a random key for the check (so a resend counts once and two checks of one plan cannot be tied together), the date, "did" or "not_yet". Never the plan's words | 35 days, with the rest of the mirror | Yes |
| `vaults` | One encrypted backup copy: each backup is two, a main copy (everything but the writing) and a journal copy (written reflections, intentions and Reflect's drafts and choices), under keys from separate branches of the phrase | The SHA-256 of a key derived from the 12-word phrase, a version number, the sealed bytes (AES-GCM on the phone; the server cannot open them), the last day a phone wrote or read it. No mirror key, no pass: nothing ties it to a phone | 400 days after a phone last wrote or read it (`vaultRetention`, `vault.go`) | Yes: the app deletes it first, with `DELETE /api/vault`, while the phone still holds the phrase |
| `what_helped` | One phone's report on one step, sent from a check-in while "Count my steps in What helped" is on (`010_what_helped.sql`, `whathelped.go`) | A keyed hash of its own (never the mirror key or a voter hash), question, option, the outcome (helped, helped a little, no change, didn't try) and the Monday of the week. Never the day, the feeling or the note | Until the phone deletes everything | Yes |
| `entitlements` | One Patron purchase (`011_patron.sql`, `patron.go`) | The owner (an account, or a keyed hash of a phone's pass that no other table uses), the plan, its first and last day, and where it came from. No name, address or card | As a purchase record, for good | No. After the delete the phone has a new pass, so nothing links the row to it any more |
| `pairs` | One ask, or two accounts walking alongside each other (`pair.go`) | The two account ids, whether the ask was accepted, the day | Until either ends it | With either account |
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
- What helped reports cannot be matched to votes or the mirror: they are kept under a key made with a subkey of their own, with only the week. Totals show once 50 reports stand, with any outcome fewer than 10 gave folded.
- The mirror is a profile of one phone by design; that is what the mirror reads. Only a request carrying that phone's pass can read it, and it never reads another phone's rows or any tally.

### Held in memory only

- Network addresses, for the limits on new device passes and on deletes (20 of each per address an hour), for at most an hour (`ratelimit.go`).
- Device ids, for the limit of 30 votes, ratings, steps, plan checks and data requests per device a minute, for a minute.
- Backup addresses (the SHA-256 above), for the limit of 120 backup reads and writes each an hour, and network addresses, for the limit of 30 requests for a backup that does not exist an hour (`vault.go`), for at most an hour.

Nothing in memory is written to disk or logs.

### Logs and backups

- **Logs** hold, for a failed or slow request (or every request if `ACCESS_LOG=all`), its request id, method, route pattern, status, duration and size; and the background jobs' row counts and errors. Never a path, query string, address, user agent, pass or answer (`observe`, `backend/middleware.go`). Kept by the host for 30 days or less ([monitoring.md](monitoring.md#logs)).
- **The host's database backups** are whole copies of the tables above, kept **7 days or less**, so a phone's rows leave every backup within 7 days of "Delete everywhere". A restore to a moment before a deletion brings that phone's rows back, unreadable without its pass, until normal retention removes them ([backups.md](backups.md)).

## Accounts and the circle (only when signed in)

Migration `backend/migrations/008_accounts_circle.sql`; rules in `backend/social.go`. None of these tables holds an answer, a vote, an email address or a phone number. Deleting the account (`DELETE /api/account`) removes every row that names it (`ON DELETE CASCADE`) and the answers kept under its pass.

| What | Table | Kept |
| --- | --- | --- |
| Display name, handle, whether to be suggested to friends of friends, whether nods and Answer Together are on, whether sync is on, the day last seen (a date, never a moment) | `accounts` | Until the account is deleted |
| Each way of signing in: a keyed hash of `kind:subject` and a hint (`a•••@gmail.com`, `+256 ••• 418`) | `account_logins` | Until the account is deleted |
| Signed-in devices: a label ("iPhone · Safari") and the day last seen | `account_sessions` | Until signed out |
| A 6-digit code waiting to be typed, as a keyed hash; ten minutes, five tries | `login_codes` | Deleted when used or expired |
| With sync on, the keys to the backup's main copy (`sk2.…`), sealed with a server key. The server could open the main copy; this is the person's choice and the Account screen says so. Never the 12 words, and nothing that opens the journal copy, so written reflections stay end to end. Accounts that kept the 12 words before the October 2026 Reflect swap them for the keys on their next sign-in | `account_sync` | Until sync is turned off |
| Friendships, both ways: the tag each side gave, the day, and a mute the muted person is never told about | `friendships` | Until either side disconnects |
| Invite links (30 days), room codes (24 hours) and who joined, connect requests and dismissed suggestions | `circle_invites`, `circle_rooms`, `circle_room_members`, `circle_asks`, `circle_dismissed` | Until expired (`social_retention`) or the account is deleted |
| That the person answered a friend question on a day: no subject, question or option | `friend_prompt_log` | 35 days (`friendRetention`) |
| A friend answer about a person: the subject, the week, the question and option, and a keyed mark of the sender and subject pair that counts distinct friends without naming them. No sender, and no link to the prompt log | `friend_mirror_inputs` | 35 days (`friendRetention`). The Outside Mirror opens a trait only when three different friends spoke to it in the last three weeks |
| Quiet nods: sender, receiver, day and one of 24 fixed cards. Never counted | `nods` | 35 days; shown for 7 |
| Shared insights (the new Connect), shown to friends as "a perspective from your circle" with no name (the server keeps the sender only to apply muting and Connect off): the words a person approved, the kind (what helped, or a win), one theme from a fixed list, an optional "why it helped" and "try it for yourself", the time, and the friends chosen to see it. Nothing else from the person's answers | `shares`, `share_recipients` | Until the sender withdraws it, or the friendship or account ends (a share left with no recipients goes) |
| Common Ground: up to six broad tags from a fixed list, suggested on the phone from the themes answered most (never the answers) and confirmed by the person before anything is sent, and which friends the person opted in to. Overlapping tags are shown only to two friends who each opted in to the other, and new tags can be added once a week so the overlap cannot be used to read someone's whole list | `common_tags`, `common_consent` | Until changed, the person opts out, or the friendship or account ends |
| Reach-outs (Support & Celebrate): sender, receiver, day, kind and one fixed phrase. The sender is never told whether it was seen; putting it away deletes it | `reach_outs` | 35 days; shown for 7 |
| Answer Together: the two people, the question and each choice. Never fed to a mirror or a count; the asker's choice is shown to the other only after they answer | `together` | 48 hours, then gone a day later |

Signed in, every phone on the account votes and keeps its mirror under one pass, derived from the account (`accountDeviceID`), so the duplicate-vote rule holds per account. Answers are still stored under a keyed hash of that pass, never with a name or handle, but the server can tell which account they belong to.

## Patron never changes what is kept

Patron (`patron.go`, `frontend/src/patron.ts`) changes what the app makes for the person, never what is kept, where, or for how long. Every row on this page holds with or without a plan; the server's only Patron record is the purchase itself (`entitlements`, above).

**Long comparisons run on the phone.** The server keeps answers and steps for 35 days (`mirrorRetention`) whatever the plan, and no feature, free or paid, reads further back on the server than that.

- Seasonal Echoes compare today's answer with the same question from one, three, six or twelve months ago. They read the phone's own echo log (`pi.echoes.v1`, about 400 days, `echoes.ts`), which leaves the phone only sealed in the encrypted backup. A new phone gets it back only by restoring that backup with the 12-word phrase, and the comparison then runs on the new phone.
- The monthly, quarterly and yearly Mirrors read the server's weekly notes (`mirror_weeks`, 400 days): counts, theme depths, trait sums and steps that helped, never words. They are free and the same for everyone.
- The rule for anything new: a comparison that needs more than 35 days of answers runs on the phone, over history kept on the phone or restored from the encrypted backup. It never lengthens what the server keeps, and a plan never switches longer keeping on.

**Cancelling stops new premium outputs and takes nothing away.** When a plan ends, the app stops making what Patron covers: another brief after the free one, Echoes older than a month, Speak instead after the free tries, and bringing back what helped after the first time. Everything already made stays readable and in "Download my book": the notebook, kept briefs (`pi.briefs.v1`), the echoes in My journey, and the Mirrors.

**Trust is never behind the paywall.** The lock, the cover in the app switcher, the quiet icon, the guest PIN, "Download my book" and both deletes are free for everyone.

## Choices: private by default, shared by choice

Private reflection works from the first moment with nothing to switch on: answering, writing, the first experience, the Mirror and the lock.

Adding to anything other people see is a choice the person makes, asked once in plain words at the end of an early sitting, with nothing ticked (`mobile/src/screens/ShareChoices.tsx`), and changeable on You. Until they choose, nothing is added:

- **Count my answers in the anonymous totals** (the Human Pulse, Growing together, You're not alone). Until they say yes, an answer still reaches their own Mirror (`mirror_answers`) but adds nothing to `votes` or `vote_tallies` (`count: false` on `POST /api/votes`).
- **Count my steps in What helped** (`what_helped`).
- **Count how I use the app** (the anonymous product counts, `product_counts`).

Seeing the totals is a separate switch from adding to them. Sharing with a person (a circle, a brief, a shared insight, walking alongside) only ever happens when the person does it, each time.

## What the voice promise covers

Speak instead (`mobile/src/ui/Speak.tsx`, `mobile/src/platform/voice.ts`, `frontend/src/speech.ts`) turns speech into words on the phone: on iPhone and Android with on-device recognition only, and on the website only where the browser recognises speech on the device (otherwise the button does not show). No audio is kept, and the clearer version is made on the phone from the person's own words (`distil.ts`), with no server and no AI service.

That promise covers the speech becoming words, and nothing after it. From there the words are treated exactly like typed words and go where the person puts them: an answer in their own words stays on the phone (`pi.words.<questionId>`), Reflect writing goes only into the encrypted backup, and a brief goes only where the person shares it. If the app ever makes a summary or interpretation away from the phone, it will be its own named choice, asked for separately, and never covered by "on the phone".

## Deleting everything

`DELETE /api/device/data` (header `Authorization: Device <pass>`; `DELETE /api/mirror` is the older name and does the same):

1. Accepts any well-formed pass, even one signed by a retired key, because holding the 16 random bytes inside it is proof of owning that phone's rows, and a made-up id matches nothing (`Holder`, `devicetoken.go`).
2. In one transaction, under the phone's advisory lock: deletes its mirror answers, steps, plan checks and weekly notes, deletes every raw vote and rating under its voter hashes, and marks the phone forgotten for 35 days.
3. Answers `200` with what was deleted: answers, steps, plan checks, weekly notes and votes.

The backup is not tied to the pass, so the server cannot find it from here. The app deletes it first, with `DELETE /api/vault` and the key from the phrase, and stops without deleting anything if that fails.

While the mark stands, the old pass takes no more votes, steps or ratings (`410 device_forgotten`), so a vote retried after the delete cannot bring an answer back. The phone fetches a new pass and starts again. Counts already tallied stay, because nothing links them to the phone.

## Reflections are end to end

Written reflections never reach the server in a form it can open. On the phone they sit under `pi.nb.reflection.`, `pi.nb.intention.` and `pi.reflect.`, which the registry marks `journal`. The backup carries them only in its journal copy, sealed with a key derived from the 12 words through its own branch ("journal vault key", "journal seal key"). Easy sync gives the server the main copy's two keys, never the 12 words, so even with sync on the server cannot open the writing. On a new phone with sync, everything else comes back, and Reflect asks for the 12 words once to bring the writing back. No journal text goes to analytics, logs, crash reports, notification previews or Connect. `reflectSync.test.ts` proves the copy sync can open holds no reflection text, and fails if any Reflect store is not `journal`. Reflections can be downloaded or deleted in You.
