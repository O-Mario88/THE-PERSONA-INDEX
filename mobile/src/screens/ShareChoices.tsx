// What a person adds to totals other people see is their choice (Edwin,
// 2026-10-29: "Private reflection can be ready immediately; contributions to
// shared totals and interpersonal sharing should involve clear choices").
// Asked once, at the end of an early sitting, with nothing ticked; nothing is
// added until the person says yes. The same rows sit on You, under Privacy
// and choices, to change at any time (prefs.ts countAnswers, whatHelped,
// countUse; docs/data-map.md "Choices").
import { useState } from 'react'
import { View } from 'react-native'
import { withSharing, type Prefs } from '@shared/prefs'
import { markPushAsked, PUSH_ASK, PUSH_NOTE, PUSH_ROW, pushState } from '@shared/push'
import { turnOffPush, turnOnPush, type PushResult } from '../platform/push'
import { Button, Card, T, Toggle } from '../ui/kit'

export type ShareKey = 'answers' | 'helped' | 'use'

export const SHARE_ROWS: { key: ShareKey; label: string; note: string }[] = [
  {
    key: 'answers',
    label: 'Count my answers in the anonymous totals',
    note: 'Each answer adds one to the totals in the Human Pulse, never who. Off, your answers still shape your own Mirror.',
  },
  {
    key: 'helped',
    label: 'Count my steps in What helped',
    note: 'When you say how a step went, only the outcome is added to totals that show others what helped, never who.',
  },
  {
    key: 'use',
    label: 'Count how I use the app',
    note: 'Anonymous counts, such as a brief being shared, with the day only. Never your words, answers or who you are.',
  },
]

export function ShareChoices({ prefs, onSave }: { prefs: Prefs; onSave: (p: Prefs) => void }) {
  const [c, setC] = useState({ answers: false, helped: false, use: false })
  return (
    <Card style={{ gap: 6 }}>
      <View style={{ gap: 6, paddingBottom: 4 }}>
        <T v="h2">What you add is your choice</T>
        <T tone="text2">Everything private already works. These add to what other people see, anonymously, and nothing is added until you say so.</T>
      </View>
      {SHARE_ROWS.map((r) => (
        <Toggle key={r.key} label={r.label} note={r.note} value={c[r.key]} onChange={(on) => setC({ ...c, [r.key]: on })} />
      ))}
      <Button wide label="Save my choices" onPress={() => onSave(withSharing(prefs, c))} style={{ marginTop: 8 }} />
      <T v="small" tone="muted" center>
        You can change these any time on You, under Privacy and choices.
      </T>
    </Card>
  )
}

// Notices when someone you trust reaches out (Edwin, 2026-10-29): offered once,
// where it makes sense, and kept as a switch on You. platform/push.ts decides
// whether this phone can have them at all (pushAvailable).
const PUSH_RESULT: Record<Exclude<PushResult, 'on'>, string> = {
  denied: 'Notices are off for this app in your phone’s settings. You can turn them on there, then here on You.',
  failed: 'That didn’t work just now. You can try again on You, under Privacy and choices.',
}

export function PushAsk({ today, onDone }: { today: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState('')
  async function on() {
    setBusy(true)
    const r = await turnOnPush()
    setBusy(false)
    if (r === 'on') return onDone()
    markPushAsked(today)
    setSaid(PUSH_RESULT[r])
  }
  if (said) {
    return (
      <Card>
        <T v="small" tone="text2">
          {said}
        </T>
        <Button small kind="text" label="Close" onPress={onDone} style={{ alignSelf: 'flex-start' }} />
      </Card>
    )
  }
  return (
    <Card style={{ gap: 10 }}>
      <T>{PUSH_ASK}</T>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Button small label="Turn on" busy={busy} onPress={on} />
        <Button small kind="text" label="Not now" onPress={() => (markPushAsked(today), onDone())} />
      </View>
    </Card>
  )
}

export function PushRow() {
  const [value, setValue] = useState(pushState().on === true)
  const [said, setSaid] = useState('')
  async function change(next: boolean) {
    setSaid('')
    if (!next) {
      setValue(false)
      await turnOffPush()
      return
    }
    const r = await turnOnPush()
    setValue(r === 'on')
    if (r !== 'on') setSaid(PUSH_RESULT[r])
  }
  return (
    <View>
      <Toggle label={PUSH_ROW} note={PUSH_NOTE} value={value} onChange={change} />
      {said ? (
        <T v="small" tone="muted">
          {said}
        </T>
      ) : null}
    </View>
  )
}
