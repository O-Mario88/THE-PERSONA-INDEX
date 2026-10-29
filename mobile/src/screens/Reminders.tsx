// Reminders on You: the morning three, the evening three, the Sunday Mirror
// and the check-ins, always on with nothing to switch (Edwin, 2026-10-29),
// planned on this phone (platform/reminders.ts). The person can pick the
// morning and evening times; the phone's own settings can silence them.
import { useEffect, useState } from 'react'
import { Linking, View } from 'react-native'
import { clock } from '@shared/day'
import { CHECK_IN_AT, SUNDAY_AT, eveningMinutes, morningMinutes, type ReminderSettings } from '@shared/reminders'
import { askForReminders, changeReminderTimes, reminderPermission, reminderSettings, remindersAvailable, type ReminderPermission } from '../platform/reminders'
import { load, save } from '@shared/storage'
import { canPrompt, iosSafari, promptInstall } from '@shared/pwa/install'
import { Button, Card, Chip, T } from '../ui/kit'

const MORNING_TIMES = [6 * 60, 7 * 60, 8 * 60, 9 * 60, 10 * 60, 12 * 60]
const EVENING_TIMES = [17 * 60 + 30, 18 * 60 + 30, 19 * 60, 20 * 60, 21 * 60, 22 * 60]

// What the phone allows, kept fresh while the page is open.
function usePermission(): [ReminderPermission | null, (p: ReminderPermission) => void] {
  const [perm, setPerm] = useState<ReminderPermission | null>(null)
  useEffect(() => {
    let live = true
    reminderPermission().then((p) => live && setPerm(p), () => {})
    return () => {
      live = false
    }
  }, [])
  return [perm, setPerm]
}

// When the phone says no, the way back is its own settings.
function PhoneSaysNo() {
  return (
    <View style={{ gap: 8 }}>
      <T v="small" tone="muted">
        Notifications are off for The Persona Index in your phone’s settings, so reminders can’t show yet.
      </T>
      <Button small kind="secondary" label="Open phone settings" onPress={() => Linking.openSettings().catch(() => {})} />
    </View>
  )
}

export function ReminderSettingsView() {
  const [s, setS] = useState<ReminderSettings>(reminderSettings)
  const [perm, setPerm] = usePermission()
  if (!remindersAvailable) return null

  async function pick(which: 'morning' | 'evening', m: number) {
    const next = which === 'morning' ? { ...s, morningAt: m } : { ...s, eveningAt: m }
    setS(next)
    await changeReminderTimes(which === 'morning' ? { morningAt: m } : { eveningAt: m })
  }

  const times = (which: 'morning' | 'evening') => {
    const list = which === 'morning' ? MORNING_TIMES : EVENING_TIMES
    const now = which === 'morning' ? morningMinutes(s) : eveningMinutes(s)
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityLabel={`Time for the ${which} three`}>
        {list.map((m) => (
          <Chip key={m} label={clock(m)} on={now === m} onPress={() => pick(which, m)} />
        ))}
      </View>
    )
  }

  return (
    <View style={{ gap: 12 }}>
      <T v="eyebrow">Reminders</T>
      <T v="small" tone="muted">
        {`Your morning three, your evening three, your Sunday Mirror at ${clock(SUNDAY_AT)}, and a check-in at ${clock(CHECK_IN_AT)} on the day something you tried comes up. They only ever say what is waiting, never a word of your answers or your writing.`}
      </T>
      <T v="h3">Morning three</T>
      {times('morning')}
      <T v="h3">Evening three</T>
      {times('evening')}
      {perm === 'off' && <PhoneSaysNo />}
      {perm === 'unasked' && <Button small kind="secondary" label="Allow reminders on this phone" onPress={async () => setPerm(await askForReminders())} />}
    </View>
  )
}

// At the close of the first sitting: the phone is asked once, by itself, and
// the person sees when they'll hear from the app. On the website, where
// there are no reminders, the next best thing.
export function RemindersOn() {
  const [perm, setPerm] = useState<ReminderPermission | null>(null)
  const [web, setWeb] = useState<string | null>(() => load(REMINDERS_ASKED))
  useEffect(() => {
    if (!remindersAvailable) return
    let live = true
    askForReminders().then((p) => live && setPerm(p), () => {})
    return () => {
      live = false
    }
  }, [])
  if (!remindersAvailable) return web ? null : <ComeBackOnWeb onAnswer={(x) => (save(REMINDERS_ASKED, x), setWeb(x))} />
  if (perm === null || perm === 'none') return null
  if (perm === 'off') return <Card><PhoneSaysNo /></Card>
  const s = reminderSettings()
  return (
    <Card style={{ gap: 6 }}>
      <T v="h3">I’ll let you know when your next three open</T>
      <T v="small" tone="muted">
        {`Morning at ${clock(morningMinutes(s))} and evening at ${clock(eveningMinutes(s))}, with your Sunday Mirror and a check-in on what you try. Change the times on You.`}
      </T>
    </Card>
  )
}

// At any later close, for someone whose phone was never asked (people who
// said "Not now" before reminders were automatic): the phone asks once, by
// itself. Nothing is shown here.
export function AskRemindersQuietly() {
  useEffect(() => {
    if (remindersAvailable) askForReminders().catch(() => {})
  }, [])
  return null
}

// Remembers the website's bookmark ask, so it is asked once.
export const REMINDERS_ASKED = 'pi.reminders.asked'

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
