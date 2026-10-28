// Connect's first section, the home of the Human Pulse (Edwin, 2026-10-28):
// your own answers that others shared, with real anonymous counts. It works
// with no friends at all. Opened from an insight or a question, the question
// you were reading comes first.
import { View } from 'react-native'
import { pulseWords, sharedMoments, type PulseCounts } from '@shared/humanPulse'
import { cardTextOf } from '@shared/insights'
import { loadHistory } from '@shared/profile'
import { Button, Card, Hairline, T } from '../ui/kit'
import { CardHead } from '../ui/parts'

const SHOWN = 3

export function NotAloneSection({ pulse, focus, onPulseOn }: { pulse: PulseCounts | null | false; focus: string | null; onPulseOn: () => void }) {
  if (pulse === false) {
    return (
      <Card style={{ gap: 10 }}>
        <CardHead icon="people" tone="blue" v="h2" title="You’re not alone" />
        <T tone="text2">See how many people chose the same answers as you. Anonymous totals only: nobody sees who chose what.</T>
        <Button label="Show me" iconAfter="chevron" onPress={onPulseOn} style={{ alignSelf: 'flex-start' }} />
      </Card>
    )
  }
  const moments = pulse ? sharedMoments(pulse.questions, loadHistory()) : []
  const ordered = [...moments.filter((m) => m.questionId === focus), ...moments.filter((m) => m.questionId !== focus)].slice(0, SHOWN)
  return (
    <Card style={{ gap: 14 }}>
      <CardHead icon="people" tone="blue" v="h2" title="You’re not alone" />
      {ordered.length === 0 ? (
        <T tone="text2">Once 20 people have answered a question you answered, you’ll see here how many chose the same as you.</T>
      ) : (
        ordered.map((m, i) => {
          const card = cardTextOf(m.questionId)
          return (
            <View key={m.questionId} style={{ gap: 4 }}>
              {i > 0 && <Hairline style={{ marginBottom: 10 }} />}
              {m.questionId === focus && <T v="label" tone="accent">The question you were reading</T>}
              {card && (
                <T v="small" tone="muted">
                  {card.prompt}
                </T>
              )}
              {card && <T bold>You chose “{card.label}”.</T>}
              <T tone="text2">{pulseWords(m.line)}</T>
            </View>
          )
        })
      )}
      <T v="tiny">
        {pulse && pulse.stale ? 'From the last time you were online. ' : ''}People who chose the same answer, not necessarily people who feel the same.
      </T>
    </Card>
  )
}
