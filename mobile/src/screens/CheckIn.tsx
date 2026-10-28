// The Growth Journey check-in (Edwin, 2026-10-28): three quick questions about
// a step you said you'd try (did you get a chance, how did it go, how do you
// feel now), then an optional note that stays on this phone. "Not yet" and
// "I decided not to" are answers like any other, never a failure.
import { useState } from 'react'
import { View } from 'react-native'
import { saveCheckIn, type CheckIn as Check, type Feeling, type Outcome, type Tried } from '@shared/growthJourney'
import { setMoveStatus, type Move } from '@shared/moves'
import { addDays } from '@shared/storage'
import { Button, Chip, Field, Private, T } from '../ui/kit'

const TRIED: [Tried, string][] = [
  ['yes', 'Yes, I tried it'],
  ['little', 'A little'],
  ['not_yet', 'Not yet'],
  ['decided_not', 'I decided not to'],
]
const OUTCOMES: [Outcome, string][] = [
  ['helped', 'It helped'],
  ['helped_little', 'It helped a little'],
  ['no_difference', 'It didn’t make a difference'],
  ['harder', 'It made things harder'],
]
const FEELINGS: [Feeling, string][] = [
  ['lighter', 'A little lighter'],
  ['same', 'About the same'],
  ['unsettled', 'More unsettled'],
  ['unsure', 'I’m not sure yet'],
]
const REPLIES: Record<Outcome, string> = {
  helped: 'That’s worth knowing. I’ll remember it helped, and bring it back when something similar comes up.',
  helped_little: 'A little counts. I’ll remember it, and bring it back when something similar comes up.',
  no_difference: 'Thanks for telling me. Not every step lands, and trying still taught you something.',
  harder: 'Thank you for telling me. I won’t suggest it again without asking, and trying it still taught you something.',
}
const LATER_DAYS = 3

const labelOf = <K extends string>(list: [K, string][], k: K | null) => list.find(([id]) => id === k)?.[1] ?? ''

function Choices<K extends string>({ list, onPick }: { list: [K, string][]; onPick: (k: K) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {list.map(([id, label]) => (
        <Chip key={id} label={label} onPress={() => onPick(id)} />
      ))}
    </View>
  )
}

// from: the step as the Mirror knows it, for one saved on another device.
export function CheckIn({ move, today, onDone, from }: { move: Pick<Move, 'questionId' | 'step'>; today: string; onDone: (reply: string) => void; from?: { optionId: string; step: string; date: string } }) {
  const [tried, setTried] = useState<Tried | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [feeling, setFeeling] = useState<Feeling | null>(null)
  const [note, setNote] = useState('')

  const finish = (c: Omit<Check, 'questionId' | 'date'>, reply: string) => {
    const status = saveCheckIn({ questionId: move.questionId, date: today, ...c }, note)
    if (status) setMoveStatus(move.questionId, status, today, from).catch(() => {})
    onDone(reply)
  }
  const recap = [labelOf(TRIED, tried), labelOf(OUTCOMES, outcome), labelOf(FEELINGS, feeling)].filter(Boolean).join(' · ')

  return (
    <View style={{ gap: 10 }}>
      <T v="h3">“{move.step}”</T>
      {recap ? (
        <T v="small" tone="muted">
          {recap}
        </T>
      ) : null}
      {!tried && (
        <>
          <T tone="text2">You said you’d try this. Did you get a chance?</T>
          <Choices list={TRIED} onPick={(t) => (t === 'decided_not' ? finish({ tried: t }, 'That’s fine. You know what fits your life.') : setTried(t))} />
        </>
      )}
      {tried === 'not_yet' && (
        <>
          <T tone="text2">That’s okay. Would you like to keep it for later, or let it go?</T>
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button small label="Keep it for later" onPress={() => finish({ tried: 'not_yet', later: addDays(today, LATER_DAYS) }, 'Kept. I’ll ask again in a few days.')} />
            <Button small kind="text" label="Let it go" onPress={() => finish({ tried: 'not_yet' }, 'Let go. You can always come back to it.')} />
          </View>
        </>
      )}
      {(tried === 'yes' || tried === 'little') && !outcome && (
        <>
          <T tone="text2">How did it go?</T>
          <Choices list={OUTCOMES} onPick={setOutcome} />
        </>
      )}
      {outcome && !feeling && (
        <>
          <T tone="text2">How do you feel about it now?</T>
          <Choices list={FEELINGS} onPick={setFeeling} />
        </>
      )}
      {tried && outcome && feeling && (
        <>
          <Field label="Anything you’d like to remember? (optional)" placeholder="What happened, or what did you notice?" value={note} onChangeText={setNote} maxLength={280} multiline />
          <Private>Only on this phone. Never shared.</Private>
          <Button label="Save" onPress={() => finish({ tried, outcome, feeling }, REPLIES[outcome])} style={{ alignSelf: 'flex-start' }} />
        </>
      )}
    </View>
  )
}
