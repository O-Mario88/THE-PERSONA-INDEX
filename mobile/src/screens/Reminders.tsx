// Reminders in Settings, under "More settings": a quiet nudge at a time the person picks, planned on this
// phone (platform/reminders.ts). Off until turned on.
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { clock } from '@shared/day'
import { CHECK_IN_AT, SUNDAY_AT, eveningMinutes, morningMinutes, type ReminderSettings } from '@shared/reminders'
import { reminderSettings, remindersAvailable, remindersDenied, updateReminders } from '../platform/reminders'
import { load, save } from '@shared/storage'
import { canPrompt, iosSafari, promptInstall } from '@shared/pwa/install'
import { Button, Card, Chip, T, Toggle } from '../ui/kit'

const MORNING_TIMES = [6 * 60, 7 * 60, 8 * 60, 9 * 60, 10 * 60, 12 * 60]
const EVENING_TIMES = [17 * 60 + 30, 18 * 60 + 30, 19 * 60, 20 * 60, 21 * 60, 22 * 60]

export function ReminderSettingsView() {
  const [s, setS] = useState<ReminderSettings>(reminderSettings)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    remindersDenied().then(setDenied, () => {})
  }, [])

  if (!remindersAvailable) return null

  async function change(next: ReminderSettings) {
    const prev = s
    setS(next)
    const ok = await updateReminders(next)
    if (!ok) setS(prev)
    setDenied(!ok)
  }

  const times = (which: 'morning' | 'evening') => {
    const list = which === 'morning' ? MORNING_TIMES : EVENING_TIMES
    const now = which === 'morning' ? morningMinutes(s) : eveningMinutes(s)
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityLabel={`Time for the ${which} three`}>
        {list.map((m) => (
          <Chip key={m} label={clock(m)} on={now === m} onPress={() => change(which === 'morning' ? { ...s, morningAt: m } : { ...s, eveningAt: m })} />
        ))}
      </View>
    )
  }

  return (
    <View style={{ gap: 10 }}>
      <T v="eyebrow">Reminders</T>
      <T v="small" tone="muted">
        A quiet nudge at a time you choose. They only ever say what is waiting, never a word of your answers or your writing, and they are set on this phone.
      </T>
      <Toggle label="Morning three" note={s.morning ? 'Every question day.' : 'Off.'} value={s.morning} onChange={(on) => change({ ...s, morning: on })} />
      {s.morning && times('morning')}
      <Toggle label="Evening three" note={s.evening ? 'Every question day.' : 'Off.'} value={s.evening} onChange={(on) => change({ ...s, evening: on })} />
      {s.evening && times('evening')}
      <Toggle label="Sunday Mirror" note={`Sunday at ${clock(SUNDAY_AT)}, when your week is ready.`} value={s.sunday} onChange={(on) => change({ ...s, sunday: on })} />
      <Toggle
        label="Check-ins on what you wanted to try"
        note={`On the day Reflect checks in, at ${clock(CHECK_IN_AT)}.`}
        value={s.intentions}
        onChange={(on) => change({ ...s, intentions: on })}
      />
      {denied && (
        <T v="small" tone="danger">
          Notifications are off for this app in your phone’s settings, so reminders can’t show.
        </T>
      )}
    </View>
  )
}

// Asked once, at the close of the very first sitting (Edwin, 2026-10-27:
// "would it bring you back tomorrow?"). Yes turns on the morning and evening
// nudges; Not now is remembered and the switches stay in Settings.
export const REMINDERS_ASKED = 'pi.reminders.asked'

export function ReminderAsk() {
  const [answer, setAnswer] = useState<string | null>(() => load(REMINDERS_ASKED))
  if (!remindersAvailable) return answer ? null : <ComeBackOnWeb onAnswer={(x) => (save(REMINDERS_ASKED, x), setAnswer(x))} />
  if (answer && answer !== 'yes-now') return null
  if (answer === 'yes-now')
    return (
      <Card>
        <T bold>Done. I'll let you know when your next questions open.</T>
        <T v="small" tone="muted">
          You can change the times in Settings.
        </T>
      </Card>
    )
  const s = reminderSettings()
  return (
    <Card style={{ gap: 12 }}>
      <T v="h3">Do you want me to let you know when your next three open?</T>
      <T tone="text2">
        Morning at {clock(s.morningAt)} and evening at {clock(s.eveningAt)}. Nothing else, and never a word of your answers.
      </T>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Button
          small
          label="Yes, remind me"
          onPress={async () => {
            await updateReminders({ ...s, morning: true, evening: true })
            save(REMINDERS_ASKED, 'yes')
            setAnswer('yes-now')
          }}
        />
        <Button
          small
          kind="secondary"
          label="Not now"
          onPress={() => {
            save(REMINDERS_ASKED, 'no')
            setAnswer('no')
          }}
        />
      </View>
    </Card>
  )
}

// On the website there are no reminders, so the next best thing: keep the
// app one tap away. On a phone, add it to the home screen (shared
// pwa/install.ts); on a computer, a bookmark.
function ComeBackOnWeb({ onAnswer }: { onAnswer: (answer: string) => void }) {
  const [done, setDone] = useState(false)
  const phone = typeof navigator !== 'undefined' && /iPhone|iPad|Android/i.test(navigator.userAgent)
  const ios = iosSafari()
  if (done) return <Card><T bold>Good. See you when your next three open.</T></Card>
  return (
    <Card style={{ gap: 12 }}>
      <T v="h3">Want to find me easily tomorrow?</T>
      <T tone="text2">
        Your next three open at {clock(5 * 60)} and {clock(17 * 60)}.{' '}
        {phone
          ? ios
            ? 'In Safari, tap Share, then “Add to Home Screen”, and I’ll be one tap away.'
            : 'Add me to your home screen and I’ll be one tap away, like an app.'
          : 'Bookmark this page and I’ll be one click away.'}
      </T>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {phone && !ios && canPrompt() ? (
          <Button small label="Add to home screen" onPress={async () => { const r = await promptInstall(); onAnswer(r === 'added' ? 'added' : 'later'); setDone(r === 'added') }} />
        ) : (
          <Button small label={phone ? "I've added it" : "I've bookmarked it"} onPress={() => { onAnswer('added'); setDone(true) }} />
        )}
        <Button small kind="secondary" label="Not now" onPress={() => onAnswer('no')} />
      </View>
    </Card>
  )
}
