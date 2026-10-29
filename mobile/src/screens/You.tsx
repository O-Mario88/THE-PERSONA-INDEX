// You and What I keep: the two
// things friends see, the person's choices, what is kept and the ways out.
// Signed out, it is "This phone", and everything stays here.
import { useEffect, useState } from 'react'
import { Alert, Platform, View } from 'react-native'
import { deleteBackup, vaultState } from '@shared/vault'
import { ApiError, deleteEverywhere, forgetLocal, getKept, insteadCount, wordsBetween, type Kept } from '@shared/api'
import { loadMoves } from '@shared/moves'
import { notebookCount } from '@shared/notebook'
import { followTime } from '@shared/depth'
import { countryOf, loadPrefs, pulseOn, whatHelpedOn, type Prefs, type ReflectionStyle, type ReflectionTime } from '@shared/prefs'
import { regionOf } from '@shared/regions'
import { REGIONAL_SWITCH } from '@shared/words'
import { ReminderSettingsView } from './Reminders'
import { loadHistory } from '@shared/profile'
import { forgetSession, patchAccount, signOut, type AccountView } from '@shared/social'
import { Back, Button, Card, Chip, Field, Page, RowGroup, RowLink, T, Tinted, Toggle } from '../ui/kit'
import { Avatar } from '../ui/parts'
import { DownloadButtons } from './BookDownloads'
import { PrivacyLockChoices } from './PrivacyChoices'
import { patronLine, patronStatus } from '@shared/patron'
import { openPatron } from '../ui/Patron'

const KEPT: [string, string][] = [
  ['Readings, plans, Notebook', 'Encrypted · until you delete'],
  ['Written reflections', 'End-to-end encrypted · only your 12 words open them'],
  ['Who’s in your circle', 'Until you disconnect'],
  ['Friend answers about you', 'The week only, no sender · 35 days'],
  ['That you answered a friend question', 'The date only, no question or option · 35 days'],
  ['Nods & Answer Together', 'Nods 35 days, Answer Together 3 days · never counted'],
  ['Human Pulse totals', 'Anonymous counts only'],
]

const STYLES: [ReflectionStyle, string][] = [
  ['think', 'Help me think things through'],
  ['practical', 'Give me small, practical ideas'],
  ['both', 'A little of both'],
]
const TIMES: [ReflectionTime, string][] = [
  ['minute', 'Just a minute'],
  ['few', 'A few minutes'],
  ['deep', 'I like to go deeper'],
]

export function You({
  me,
  localName,
  prefs,
  onChange,
  onSignIn,
  onOpenSettings,
  onOpenKept,
}: {
  me: AccountView | null
  localName: string
  prefs: Prefs
  onChange: (p: Prefs) => void
  onSignIn: () => void
  onOpenSettings: () => void
  onOpenKept: () => void
}) {
  const [name, setName] = useState(me?.name ?? '')
  const [handle, setHandle] = useState(me?.handle ? `@${me.handle}` : '')
  const [note, setNote] = useState('')
  useEffect(() => {
    setName(me?.name ?? '')
    setHandle(me?.handle ? `@${me.handle}` : '')
  }, [me?.name, me?.handle])

  async function saveProfile() {
    if (!me) return
    const n = name.trim()
    const h = handle.trim().replace(/^@/, '').toLowerCase()
    if (n === me.name && h === me.handle) return
    try {
      await patchAccount({ ...(n !== me.name ? { name: n } : {}), ...(h && h !== me.handle ? { handle: h } : {}) })
      setNote('Saved.')
    } catch (e) {
      setNote(
        e instanceof ApiError && e.code === 'handle_taken'
          ? 'That handle is taken.'
          : e instanceof ApiError && e.code === 'invalid_handle'
            ? 'A handle is 3 to 20 letters, numbers or underscores.'
            : e instanceof ApiError && e.code === 'invalid_name'
              ? 'A name of 1 to 40 letters, please.'
              : 'That didn’t save. Try again.',
      )
    }
  }

  const without = <K extends keyof Prefs>(k: K): Prefs => {
    const next = { ...prefs }
    delete next[k]
    return next
  }
  const shown = me?.name || localName || 'You'

  return (
    <Page>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Avatar name={shown} size={64} />
        <View style={{ flex: 1 }}>
          <T v="title">{shown}</T>
          <T tone="muted">{me ? (me.handle ? `@${me.handle}` : 'Signed in') : 'This phone · no account'}</T>
        </View>
      </View>

      {!me ? (
        <Tinted>
          <T v="eyebrow">Sign in, or come back</T>
          <T v="h2">Your Notebook is waiting.</T>
          <T tone="text2">No password to remember. A 6-digit code to your email, phone or WhatsApp.</T>
          <Button label="Sign in" onPress={onSignIn} />
        </Tinted>
      ) : (
        <View style={{ gap: 12 }}>
          <T v="eyebrow">What friends see</T>
          <Field label="Display name" value={name} onChangeText={setName} maxLength={40} onBlur={saveProfile} />
          <Field label="Handle" value={handle} onChangeText={setHandle} maxLength={21} autoCapitalize="none" onBlur={saveProfile} />
          {note ? (
            <T v="small" tone="muted">
              {note}
            </T>
          ) : null}
          <Button
            small
            kind="secondary"
            label="Sign out of this phone"
            onPress={() => {
              signOut('current').catch(() => {})
              forgetSession()
            }}
          />
        </View>
      )}

      {/* My Reflection Style (Edwin's brief, 2026-10-28): optional. What feels
          most useful decides what comes first; the time sets how much each page
          shows at first (Essential or Explore deeper). */}
      <Card style={{ gap: 12 }}>
        <View style={{ gap: 4 }}>
          <T v="h2">Make this space yours</T>
          <T v="small" tone="muted">
            How would you like The Persona Index to help you? Change it any time.
          </T>
        </View>
        <T v="h3">What feels most useful?</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {STYLES.map(([id, label]) => (
            <Chip key={id} label={label} on={(prefs.style ?? 'both') === id} onPress={() => onChange({ ...prefs, style: id })} />
          ))}
        </View>
        <T v="h3">How much time do you usually have?</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TIMES.map(([id, label]) => (
            <Chip
              key={id}
              label={label}
              on={(prefs.time ?? 'few') === id}
              onPress={() => {
                followTime()
                onChange({ ...prefs, time: id })
              }}
            />
          ))}
        </View>
      </Card>

      {/* Patron (Edwin's brief, 2026-10-29), right above Privacy and choices. */}
      <Card style={{ gap: 8 }}>
        <T v="h2">The Persona Index Patron</T>
        <T v="small" tone="muted">
          {patronLine(patronStatus()) ?? 'Keep the app independent and free of ads, and open the longer view of your own story.'}
        </T>
        <Button small kind="secondary" label="See Patron" onPress={openPatron} />
      </Card>

      {/* Every on/off choice in the app lives here, and all start on (Edwin,
          2026-10-28). No other page asks you to switch anything. */}
      <Card style={{ gap: 4 }}>
        <T v="h2">Privacy and choices</T>
        <T v="small" tone="muted">
          Everything starts on. Switch off anything you’d rather not have.
        </T>
        <Toggle
          label="The Human Pulse"
          note="See how many people chose the same answers as you: anonymous totals only, never who. Off hides every number, everywhere."
          value={pulseOn(prefs)}
          onChange={(on) => onChange(on ? without('pulse') : { ...prefs, pulse: false })}
        />
        <Toggle
          label="Count my steps in What helped"
          note="When you say how a step went, only the outcome is added to anonymous totals that show others what helped, never who. Off sends no more; Delete everything removes what was sent."
          value={whatHelpedOn(prefs)}
          onChange={(on) => onChange(on ? without('whatHelped') : { ...prefs, whatHelped: false })}
        />
        {regionOf(countryOf(prefs)) && (
          <Toggle
            label={REGIONAL_SWITCH}
            note="Asked and kept on this phone only. Nothing about them is ever sent."
            value={prefs.regional !== false}
            onChange={(on) => onChange(on ? without('regional') : { ...prefs, regional: false })}
          />
        )}
        {prefs.adult === true && (
          <Toggle
            label="Keep it mild (no intimacy questions)"
            note="Leaves intimacy questions out of every sitting not yet started."
            value={prefs.mild}
            onChange={(on) => onChange({ ...prefs, mild: on })}
          />
        )}
        {/* The privacy curtain (Edwin's brief, 2026-10-29): lock, cover, quiet icon, guest PIN. */}
        <PrivacyLockChoices />
        <ReminderSettingsView />
      </Card>

      <RowGroup>
        <RowLink inGroup label="Settings" sub="Your name, language, light or dark, text size and where you live" onPress={onOpenSettings} />
        <RowLink inGroup label="What I keep, and how to delete it" onPress={onOpenKept} />
      </RowGroup>

      {me && (
        <View style={{ gap: 10 }}>
          <T v="eyebrow">What your account keeps</T>
          {KEPT.map(([what, how]) => (
            <View key={what} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <T v="small" bold style={{ flex: 1 }}>
                {what}
              </T>
              <T v="small" tone="muted" style={{ flex: 1, textAlign: 'right' }}>
                {how}
              </T>
            </View>
          ))}
        </View>
      )}
    </Page>
  )
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const weeks = (days: number) => (days % 7 === 0 ? plural(days / 7, 'week') : plural(days, 'day'))

function onPhone() {
  return {
    words: wordsBetween('0000-01-01', '9999-12-31').length,
    instead: insteadCount(),
    answers: loadHistory().answers.length,
    steps: loadMoves().length,
    notebook: notebookCount(),
    wordsDays: loadPrefs().wordsDays,
  }
}

// Asks before anything is deleted; on the web build, the browser's confirm.
function confirm(title: string, body: string, yes: string, run: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${body}`)) run()
    return
  }
  Alert.alert(title, body, [
    { text: 'Cancel', style: 'cancel' },
    { text: yes, style: 'destructive', onPress: run },
  ])
}

export function KeptScreen({ today, mild, signedIn, onBack, onDeleted }: { today: string; mild: boolean; signedIn: boolean; onBack: () => void; onDeleted: () => void }) {
  const [phone, setPhone] = useState(onPhone)
  const [server, setServer] = useState<Kept | null | 'error' | 'loading'>('loading')
  const [done, setDone] = useState('')
  useEffect(() => {
    let live = true
    getKept().then(
      (k) => live && setServer(k),
      () => live && setServer('error'),
    )
    return () => {
      live = false
    }
  }, [])

  return (
    <Page>
      <Back onPress={onBack} />
      <T v="display">What I keep</T>
      <T tone="text2">
        {signedIn
          ? 'You’re signed in: your account keeps a name, a handle and how you sign in. Here is everything else I hold about you, where it is, and how long it stays.'
          : 'No name, no email, no account. Here is everything I hold about you, where it is, and how long it stays.'}
      </T>
      <View style={{ gap: 10 }}>
        <T v="eyebrow">On this phone</T>
        <T>
          <T bold>{plural(phone.words, 'answer')} in your own words.</T> Never sent. Kept {weeks(phone.wordsDays)}; you can change that in Settings.
        </T>
        {phone.instead > 0 && (
          <T>
            <T bold>{plural(phone.instead, 'line')} on cards that weren't you.</T> Kept like your own words.
          </T>
        )}
        <T>
          <T bold>{plural(phone.notebook, 'entry', 'entries')} in your notebook.</T> The cards you kept, your good things, reflections and plans, until you remove them.
        </T>
        <T>
          <T bold>{plural(phone.answers, 'answer')} in your history.</T> Which answer you chose, its theme and depth, and whether its card was you. Kept 60 days.
        </T>
        <T>
          <T bold>{plural(phone.steps, 'small step')}.</T> The ones you said you'd try, and how they went.
        </T>
      </View>
      <View style={{ gap: 10 }}>
        <T v="eyebrow">On the server</T>
        {server === 'loading' ? (
          <T tone="muted">Just a moment…</T>
        ) : server === 'error' ? (
          <T tone="muted">I couldn't get that just now. Try again in a moment.</T>
        ) : !server ? (
          <T tone="muted">Nothing from this phone yet.</T>
        ) : (
          <ServerList k={server} />
        )}
      </View>
      <View style={{ gap: 10 }}>
        <T v="eyebrow">Take a copy</T>
        <T tone="muted">Your book is {Platform.OS === 'web' ? 'a page' : 'a PDF'} with your notebook, answers and steps, to read or print. The data file holds everything above, as it is kept.</T>
        <DownloadButtons today={today} mild={mild} data />
      </View>
      {done ? (
        <T tone="leaf" bold>
          {done}
        </T>
      ) : null}
      <Button
        wide
        kind="secondary"
        label="Delete everything on this phone"
        onPress={() =>
          confirm('Delete everything on this phone?', 'Your answers, words, notebook and steps on this phone go. The server keeps its anonymous counts.', 'Delete', () => {
            forgetLocal(today)
            setPhone(onPhone())
            setDone('Deleted from this phone.')
            onDeleted()
          })
        }
      />
      <Button
        wide
        kind="danger"
        label="Delete everywhere"
        onPress={() =>
          confirm('Delete everywhere?', 'Everything on this phone and everything the server holds from it goes, for good.', 'Delete everywhere', () => {
            // The backup goes first: once this phone's pass is gone, only the
            // 12 words could find it again. If it can't go, nothing goes.
            ;(vaultState() ? deleteBackup() : Promise.resolve())
              .then(() => deleteEverywhere(today))
              .then(
                () => {
                  setPhone(onPhone())
                  setServer(null)
                  setDone('Deleted everywhere.')
                  onDeleted()
                },
                () => setDone('I couldn’t reach the server, so nothing was deleted. Try again soon.'),
              )
          })
        }
      />
    </Page>
  )
}

function ServerList({ k }: { k: Kept }) {
  const { kept, keptFor } = k
  if (kept.answers + kept.steps + (kept.planChecks ?? 0) + kept.weeklyNotes + kept.votes + (kept.reports ?? 0) === 0) return <T>Nothing. This phone has no answers on the server.</T>
  return (
    <>
      <T>
        <T bold>{plural(kept.answers, 'answer')}</T>
        {kept.privateAnswers > 0 ? `, ${kept.privateAnswers} of them private` : ''}, under an anonymous key, for your mirror. For a private one I keep only that you answered. Kept{' '}
        {weeks(keptFor.answersDays)}.
      </T>
      <T>
        <T bold>{plural(kept.steps, 'small step')}</T> you started. Kept {weeks(keptFor.answersDays)}.
      </T>
      {(kept.planChecks ?? 0) > 0 && (
        <T>
          <T bold>{plural(kept.planChecks ?? 0, 'plan check')}</T>: the day, and whether you did it or not yet. Never the plan's words. Kept {weeks(keptFor.answersDays)}.
        </T>
      )}
      <T>
        <T bold>{plural(kept.weeklyNotes, 'weekly note')}</T> for your month, quarter and year: counts and your clearest answers, never your words. Kept{' '}
        {plural(Math.round(keptFor.weeklyNotesDays / 30), 'month')}.
      </T>
      {(kept.reports ?? 0) > 0 && (
        <T>
          <T bold>{plural(kept.reports ?? 0, 'What helped report')}</T>: how a step went, under a key of its own, with only the week. Kept until you delete everything.
        </T>
      )}
      <T>
        <T bold>{plural(kept.votes, 'vote')}</T> with no key that links them to each other, only there so you can't be counted twice. Kept {weeks(keptFor.votesDays)}, to the hour they came in.
      </T>
    </>
  )
}
