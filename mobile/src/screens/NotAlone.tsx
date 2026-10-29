// Connect's first section, the home of the Human Pulse (Edwin, 2026-10-28):
// your own answers that others shared, with real anonymous counts. It works
// with no friends at all. Opened from an insight or a question, the question
// you were reading comes first.
import { Text, View } from 'react-native'
import { pulseShort, pulseWords, sharedMoments, type PulseCounts } from '@shared/humanPulse'
import { trf } from '@shared/i18n'
import { cardTextOf } from '@shared/insights'
import { loadHistory } from '@shared/profile'
import { count } from '@shared/pulse'
import { brand, font } from '../theme'
import { Icon } from '../ui/Icon'
import { Button, Card, RowGroup, T } from '../ui/kit'
import { Spotlight } from '../ui/Layout'
import { CardHead } from '../ui/parts'
import { PulseNote } from '../ui/Pulse'

const SHOWN = 3

// onReflect: the second of the three equal paths (just understand, reflect on
// it, reach out), so seeing a count can lead somewhere private.
export function NotAloneSection({ pulse, focus, onReflect }: { pulse: PulseCounts | null | false; focus: string | null; onReflect?: () => void }) {
  if (pulse === false) {
    return (
      <Card style={{ gap: 10 }}>
        <CardHead icon="people" tone="blue" v="h2" title="You’re not alone" />
        <T tone="text2">The Human Pulse is switched off. You can turn it back on in You, under Privacy and choices.</T>
      </Card>
    )
  }
  const moments = pulse ? sharedMoments(pulse.questions, loadHistory()) : []
  const ordered = [...moments.filter((m) => m.questionId === focus), ...moments.filter((m) => m.questionId !== focus)].slice(0, SHOWN)
  const [lead, ...rest] = ordered
  const leadCard = lead ? cardTextOf(lead.questionId) : null
  return (
    <View style={{ gap: 14 }}>
      {/* The home of the Human Pulse: one big, honest number first (review, 2026-10-28). */}
      <Spotlight>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="people" size={18} color={brand.marigold} />
          <T v="label" tone="onNavy2">
            {lead?.questionId === focus ? 'The question you were reading' : 'For you today'}
          </T>
        </View>
        {lead && leadCard ? (
          <View style={{ gap: 6 }}>
            {lead.line.kind === 'count' ? (
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ fontFamily: font.bold, fontSize: 44, lineHeight: 50, letterSpacing: -1, color: brand.marigold }}>{count(lead.line.same)}</Text>
                <T tone="onNavy" bold style={{ fontSize: 16, lineHeight: 21, flexShrink: 1 }}>
                  {trf('of {total} people chose the same answer as you', { total: count(lead.line.total) })}
                </T>
              </View>
            ) : (
              <T v="h2" tone="onNavy">
                {pulseWords(lead.line)}
              </T>
            )}
            <T tone="onNavy2">
              {leadCard.prompt} You chose “{leadCard.label}”.
            </T>
          </View>
        ) : (
          <View style={{ gap: 6 }}>
            <T v="h2" tone="onNavy">
              You’re not alone in figuring things out
            </T>
            <T tone="onNavy2">Once 20 people have answered a question you answered, you’ll see here how many chose the same as you.</T>
          </View>
        )}
        {lead && onReflect && <Button small kind="warm" icon="pencil" label="Reflect on this, privately" onPress={onReflect} style={{ alignSelf: 'flex-start' }} />}
      </Spotlight>
      {rest.length > 0 && (
        <RowGroup>
          {rest.map((m) => {
            const card = cardTextOf(m.questionId)
            return (
              <View key={m.questionId} style={{ gap: 4, paddingVertical: 14, paddingHorizontal: 16 }}>
                {card && (
                  <T v="small" tone="muted">
                    {card.prompt}
                  </T>
                )}
                {card && <T bold>You chose “{card.label}”.</T>}
                <PulseNote text={pulseShort(m.line, (t, v = {}) => trf(t, v))} />
              </View>
            )
          })}
        </RowGroup>
      )}
      <T v="tiny">{pulse && pulse.stale ? 'From the last time you were online. ' : ''}People who chose the same answer, not necessarily people who feel the same.</T>
    </View>
  )
}
