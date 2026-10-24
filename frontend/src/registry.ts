// Every key the app keeps on the phone, in one registry (the review of
// 2026-10-15: "Delete and Download then cover everything by construction,
// because they read the same registry"). Each entry says what the key holds,
// whether the encrypted backup carries it and how two copies of it are
// merged. storage.ts does the reading and writing; registry.test.ts checks
// that nothing the app writes is missing here.

import { keys, PREFIX } from './storage'

// always: in every backup. words: only when the person switches own words
// on for the backup. never: stays on this phone (a pass to the browser's own
// lock, a key to resend something, a copy of what the server sends anyway).
export type Backup = 'always' | 'words' | 'never'

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
  { key: 'pi.nb.', what: 'Your notebook: cards you kept, good things, Sunday sentences, plans and names', backup: 'always', merge: 'newest', download: true },
  { key: 'pi.read.', what: 'Which reads you opened, so they are not offered twice', backup: 'always', merge: 'local', download: false },
  { key: 'pi.words.', what: 'Answers in your own words', backup: 'words', merge: 'local', download: true },
  { key: 'pi.instead.', what: 'What you wrote after "Not me"', backup: 'words', merge: 'local', download: true },
  { key: 'pi.people', what: 'Your people: who you would want to hear from on a hard day, and what helps', backup: 'words', merge: 'newest', download: true },
  { key: 'pi.unrated.', what: 'A card tap waiting to be sent', backup: 'never', merge: 'local', download: false },
  { key: 'pi.pending.', what: 'An answer waiting to be sent', backup: 'never', merge: 'local', download: false },
  { key: 'pi.draft.', what: 'A half-written answer, for a day', backup: 'never', merge: 'local', download: false },
  { key: 'pi.edition.', what: "Today's questions, for opening without a connection", backup: 'never', merge: 'local', download: false },
  { key: 'pi.midday.', what: 'That you said "not yet" to the midday step check, for the day', backup: 'never', merge: 'local', download: false },
  { key: 'pi.vault.v1', what: 'Your 12-word phrase and the state of your backup', backup: 'never', merge: 'local', download: false },
  { key: 'pi.lock.v1', what: "The phone's fingerprint or face check for the app", backup: 'never', merge: 'local', download: false },
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
