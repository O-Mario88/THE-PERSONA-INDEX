// Reminders in Settings, under "More settings" (the SwiftUI app's
// RemindersCard): a quiet nudge at a time the person picks, planned on this
// phone (platform/reminders.ts). Off until turned on.
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { clock } from '@shared/day'
import { CHECK_IN_AT, SUNDAY_AT, eveningMinutes, morningMinutes, type ReminderSettings } from '@shared/reminders'
import { reminderSettings, remindersAvailable, remindersDenied, updateReminders } from '../platform/reminders'
import { Chip, T, Toggle } from '../ui/kit'

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
