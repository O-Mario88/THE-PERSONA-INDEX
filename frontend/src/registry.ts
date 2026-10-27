// Every key the app keeps on the phone, in one registry (the review of
// 2026-10-15: "Delete and Download then cover everything by construction,
// because they read the same registry"). Each entry says what the key holds,
// whether the encrypted backup carries it and how two copies of it are
// merged. storage.ts does the reading and writing; registry.test.ts checks
// that nothing the app writes is missing here.

import { keys, PREFIX } from './storage'

// always: in every backup. words: only when the person switches own words
// on for the backup. journal: the person's writing in Reflect, only in the
// journal copy, sealed under keys from the phrase that never leave their
// phones, so never in what easy sync can open (vault.ts). never: stays on
// this phone (a pass to the browser's own lock, a key to resend something,
// a copy of what the server sends anyway).
export type Backup = 'always' | 'words' | 'journal' | 'never'

// How a key is merged when a backup written on another phone comes back:
// newest keeps the copy changed last (notebook entries carry their own time),
// local keeps this phone's copy when it has one, and history and moves merge
// their lists answer by answer.
export type Merge = 'newest' | 'local' | 'history' | 'moves'

export type Entry = {
  key: string // a whole key, or a prefix ending in "." or "-"
  what: string
  backup: Backup
  merge: Merge
  download: boolean // in "Download my book"'s data file
}

export const REGISTRY: Entry[] = [
  { key: 'pi.device.v1', what: 'Your pass: the anonymous id the server signs, so you are counted once', backup: 'always', merge: 'local', download: false },
  { key: 'pi.prefs.v1', what: 'Your settings, including the country you said you live in', backup: 'always', merge: 'local', download: true },
  { key: 'pi.seed', what: 'The order your answers are shown in', backup: 'always', merge: 'local', download: false },
  { key: 'pi.history.v1', what: 'Your answers of the last 60 days: theme, depth and whether the card was you', backup: 'always', merge: 'history', download: true },
  { key: 'pi.moves.v1', what: 'Your small steps and how they went', backup: 'always', merge: 'moves', download: true },
  { key: 'pi.choice.', what: 'Which answer you chose, for a week', backup: 'always', merge: 'local', download: true },
  { key: 'pi.at.', what: 'When you answered, for a week', backup: 'always', merge: 'local', download: false },
  { key: 'pi.rated.', what: 'Whether a card was you, for a week', backup: 'always', merge: 'local', download: true },
  { key: 'pi.pick.', what: 'Which three questions each sitting showed, for the day', backup: 'always', merge: 'local', download: false },
  { key: 'pi.leaning.', what: 'Whether a leaning in your mirror was you, for five weeks', backup: 'always', merge: 'local', download: true },
  { key: 'pi.safety.', what: 'What you said felt uncertain, when your mirror asked, for five weeks', backup: 'always', merge: 'local', download: true },
  { key: 'pi.nb.reflection.', what: 'Your written reflections, in your own words, and which thread each belongs to', backup: 'journal', merge: 'newest', download: true },
  { key: 'pi.nb.intention.', what: 'What you said you would like to try, and how it went when you checked in', backup: 'journal', merge: 'newest', download: true },
  { key: 'pi.reflect.', what: 'A half-written reflection, the memories you put away, and your Reflect choices', backup: 'journal', merge: 'local', download: true },
  { key: 'pi.nb.', what: 'Your notebook: cards you kept, good things, Sunday sentences, plans and names', backup: 'always', merge: 'newest', download: true },
  { key: 'pi.pattern.', what: 'Whether a pattern in your longer Mirrors still feels true: yes, partly or no, and when you said so', backup: 'always', merge: 'local', download: true },
  { key: 'pi.nudge.', what: 'Whether you put away the suggestion to encourage someone in your Circle, for a day or for good', backup: 'always', merge: 'local', download: false },
  { key: 'pi.mirror.', what: 'Your choices in the Mirrors: the direction you took up or put away, and whether a line of yours still feels important', backup: 'always', merge: 'local', download: true },
  { key: 'pi.read.', what: 'Which reads you opened, so they are not offered twice', backup: 'always', merge: 'local', download: false },
  { key: 'pi.words.', what: 'Answers in your own words', backup: 'words', merge: 'local', download: true },
  { key: 'pi.instead.', what: 'What you wrote after "Not me"', backup: 'words', merge: 'local', download: true },
  { key: 'pi.people', what: 'Your people: who you would want to hear from on a hard day, and what helps', backup: 'words', merge: 'newest', download: true },
  { key: 'pi.account.', what: 'Your sign-in on this phone and the name and handle friends see', backup: 'never', merge: 'local', download: false },
  { key: 'pi.signin.asked', what: 'That you were offered signing in after your first sitting', backup: 'never', merge: 'local', download: false },
  { key: 'pi.invite', what: 'An invite link you followed, until you join or say not now', backup: 'never', merge: 'local', download: false },
  { key: 'pi.unrated.', what: 'A card tap waiting to be sent', backup: 'never', merge: 'local', download: false },
  { key: 'pi.pending.', what: 'An answer waiting to be sent', backup: 'never', merge: 'local', download: false },
  { key: 'pi.draft.', what: 'A half-written answer, for a day', backup: 'never', merge: 'local', download: false },
  { key: 'pi.insight.', what: 'The card each answer showed, for Insights, for 30 days', backup: 'never', merge: 'local', download: false },
  { key: 'pi.edition.', what: "Today's questions, for opening without a connection", backup: 'never', merge: 'local', download: false },
  { key: 'pi.regional.v1', what: 'The questions about everyday life in each part of the world, the same for everyone, for opening without a connection', backup: 'never', merge: 'local', download: false },
  { key: 'pi.midday.', what: 'That you said "not yet" to the midday step check, for the day', backup: 'never', merge: 'local', download: false },
  { key: 'pi.vault.v1', what: 'Your 12-word phrase and the state of your backup', backup: 'never', merge: 'local', download: false },
  { key: 'pi.lock.v1', what: "The phone's fingerprint or face check for the app", backup: 'never', merge: 'local', download: false },
  { key: 'pi.tapestry.v1', what: 'Your season tapestry: for each day of the last ninety, how many answers reached for each need', backup: 'always', merge: 'local', download: true },
  { key: 'pi.pulse.', what: 'How many people had answered a question when you last looked, for the day', backup: 'never', merge: 'local', download: false },
  { key: 'pi.windows.', what: 'Which of the day’s five windows you opened, and when, for the day', backup: 'never', merge: 'local', download: false },
  { key: 'pi.seen.v1', what: 'When you last looked at Today, for its “since” line', backup: 'never', merge: 'local', download: false },
  { key: 'pi.connection.v1', what: 'Your own moves towards friends for a year: the day and the kind (a nod, a share, asking for support, a win), never who', backup: 'always', merge: 'local', download: true },
  { key: 'pi.rings', what: 'Which of your three circles you placed each friend in', backup: 'always', merge: 'local', download: true },
  { key: 'pi.name', what: 'What you asked to be called, for the greeting', backup: 'always', merge: 'local', download: true },
  { key: 'pi.welcomed', what: 'That you saw the welcome before your first sitting', backup: 'never', merge: 'local', download: false },
  { key: 'pi.started', what: 'The day you began, for your first week', backup: 'always', merge: 'local', download: true },
  { key: 'pi.showall', what: 'That you asked to see every section before your first week was up', backup: 'never', merge: 'local', download: false },
  { key: 'pi.connect.open', what: 'That you asked for Connect from your first glimpse', backup: 'never', merge: 'local', download: false },
  { key: 'pi.glimpse', what: 'Which sitting showed your first glimpse', backup: 'always', merge: 'local', download: false },
  { key: 'pi.reminders.v1', what: 'Which reminders you turned on in the phone app, and at what time', backup: 'never', merge: 'local', download: false },
  { key: 'pi.journey.v1', what: 'The one area of your life you chose to look at after your first Mirror, and since when', backup: 'always', merge: 'local', download: true },
  { key: 'pi.reminders.asked', what: 'Whether you were asked about reminders after your first questions, and what you said', backup: 'never', merge: 'local', download: false },
  { key: 'pi.install.v1', what: 'Whether you were invited to add the app to your home screen', backup: 'never', merge: 'local', download: false },
]

// entryFor finds the registry entry a key belongs to, or null.
export function entryFor(key: string): Entry | null {
  return REGISTRY.find((e) => (/[.-]$/.test(e.key) ? key.startsWith(e.key) : key === e.key)) ?? null
}

// unregistered lists every app key on the phone that the registry does not name.
export function unregistered(): string[] {
  return keys(PREFIX).filter((k) => !entryFor(k))
}
