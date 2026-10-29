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
