// The three short windows between the sittings: a check on the morning's step, the
// afternoon's anonymous totals for those who asked for them, and three good
// things before bed.
import { useEffect, useState } from 'react'
import { TextInput, View } from 'react-native'
import { recalledChoice, SKIPPED, type Question } from '@shared/api'
import { isSaturday, opensAt } from '@shared/day'
import { movesOn } from '@shared/moves'
import { goodThings, keepGoodThings } from '@shared/notebook'
import { inOrder } from '@shared/order'
import { count, getPulse, PULSE_MIN, sameAs, shareOf, showsSplit, type Pulse } from '@shared/pulse'
import { themeName } from '@shared/themes'
import { SUNDAY_LINE } from '@shared/words'
import { font, radius, useTheme } from '../theme'
import { Button, Chip, T, Tinted } from '../ui/kit'
import { Upcoming } from './Close'
import { Steps } from './Steps'

export function Midday({ date, morningOpen, onMorning }: { date: string; morningOpen: boolean; onMorning: () => void }) {
  const hasSteps = movesOn(date).length > 0
  return (
    <View style={{ gap: 20 }}>
      <T v="display">Your midday check.</T>
      {hasSteps ? <Steps date={date} mode="midday" label="This morning's step" /> : <T tone="muted">No small step picked this morning. That's fine; noticing counts too.</T>}
      {morningOpen && (
        <Tinted>
          <T>Your morning three are still open until 17:00.</T>
          <Button small label="Answer them" onPress={onMorning} />
        </Tinted>
      )}
      <T tone="muted">Then nothing until 14:30.</T>
    </View>
  )
}

// The Human Pulse: off until the person says yes once.
// The Human Pulse is on unless switched off in You (no prompt here).
export function Afternoon({ questions, pulse }: { questions: Question[]; pulse: boolean }) {
  if (!pulse) {
    return (
      <View style={{ gap: 12 }}>
        <T v="display">A quiet afternoon.</T>
        <T tone="muted">Nothing else until 17:00. The Human Pulse is off; you can turn it back on in You, under Privacy and choices.</T>
      </View>
    )
  }
  const answered = questions.filter((q) => {
    const c = recalledChoice(q.id)
    return !!c && c !== SKIPPED && q.care !== 'intimate' && !q.local
  })
  return (
    <View style={{ gap: 20 }}>
      <T v="display">The afternoon pulse.</T>
      <T tone="muted">How everyone else answered this morning's questions. Only totals, never who.</T>
      {answered.length === 0 && <T tone="muted">Answer this morning's questions and I'll show you how others answered.</T>}
      {answered.map((q) => (
        <PulseCard key={q.id} question={q} />
      ))}
    </View>
  )
}

function PulseCard({ question }: { question: Question }) {
  const p = useTheme()
  const [pulse, setPulse] = useState<Pulse | null>(null)
  useEffect(() => {
    let live = true
    getPulse(question.id).then((x) => live && setPulse(x))
    return () => {
      live = false
    }
  }, [question.id])
  const mine = recalledChoice(question.id)
  return (
    <View style={{ gap: 10 }}>
      <T v="eyebrow">{question.theme ? themeName(question.theme) : 'Today'}</T>
      <T v="h3">{question.prompt}</T>
      {!pulse ? (
        <T tone="muted">Counting…</T>
      ) : !showsSplit(pulse) ? (
        <T tone="muted">
          {count(pulse.total)} {pulse.total === 1 ? 'answer' : 'answers'} so far. The split shows from {PULSE_MIN}, so nobody's answer can be worked out.
        </T>
      ) : (
        <>
          {[...inOrder(question)]
            .sort((a, b) => (pulse.options.find((o) => o.optionId === b.id)?.count ?? 0) - (pulse.options.find((o) => o.optionId === a.id)?.count ?? 0))
            .map((o) => {
              const pct = pulse.options.find((x) => x.optionId === o.id)?.percent ?? 0
              const me = o.id === mine
              return (
                <View key={o.id} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                    <T v="small" bold={me} style={{ flex: 1 }}>
                      {o.label}
                      {me ? ' · you' : ''}
                    </T>
                    <T v="small" bold>
                      {Math.round(pct)}%
                    </T>
                  </View>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: p.surface3, overflow: 'hidden' }}>
                    <View style={{ width: `${pct}%`, height: 8, backgroundColor: me ? p.lime : p.leafSoft }} />
                  </View>
                </View>
              )
            })}
          {mine && shareOf(pulse, mine) !== null && <T tone="text2">{sameAs(shareOf(pulse, mine)!)}</T>}
          <T v="small" tone="muted">
            {count(pulse.total)} answers in all.
          </T>
        </>
      )}
    </View>
  )
}

const CHIPS = ['A good meal', 'A kind word', 'Something finished', 'Time outside', 'A laugh', 'A moment of rest']

export function Night({ date, tomorrowThemes, onClose }: { date: string; tomorrowThemes: string[]; onClose: () => void }) {
  const p = useTheme()
  const kept = goodThings(date)
  const [chips] = useState(() => {
    const own = movesOn(date)
      .filter((m) => m.status === 'helped')
      .map((m) => m.step.replace(/\.$/, ''))
      .slice(0, 2)
    return [...own, ...CHIPS].slice(0, 7)
  })
  const [picked, setPicked] = useState<string[]>(() => kept?.lines.filter((l) => l.trim()) ?? [])
  const [other, setOther] = useState('')
  const [closed, setClosed] = useState(false)
  const all = [...chips, ...picked.filter((x) => !chips.includes(x))]
  const toggle = (c: string) => setPicked(picked.includes(c) ? picked.filter((x) => x !== c) : picked.length < 3 ? [...picked, c] : picked)

  if (closed) {
    return (
      <View style={{ gap: 16 }}>
        <T v="display">That's your day.</T>
        {picked.length > 0 && <T tone="muted">Kept in your notebook: {picked.join(' · ')}.</T>}
        {isSaturday(date) ? <T>{SUNDAY_LINE}</T> : <Upcoming label="Tomorrow" themes={tomorrowThemes} />}
        <T style={{ fontFamily: font.semibold, fontSize: 20, lineHeight: 28 }}>
          {isSaturday(date) ? 'Sleep well. Tomorrow is for looking back: your week will be waiting in your mirror.' : `Sleep well. Your next three open at ${opensAt('morning')}.`}
        </T>
      </View>
    )
  }
  return (
    <View style={{ gap: 16 }}>
      <T v="display">Three good things from today.</T>
      <T tone="muted">
        Tap three. Small counts. <T bold>{picked.length} of 3</T>
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {all.map((c) => (
          <Chip key={c} label={c} on={picked.includes(c)} onPress={() => toggle(c)} />
        ))}
      </View>
      {picked.length < 3 && (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput
            value={other}
            onChangeText={setOther}
            maxLength={140}
            placeholder="Something else"
            placeholderTextColor={p.muted}
            accessibilityLabel="Something else that was good"
            style={{ flex: 1, borderWidth: 1.5, borderColor: p.line, backgroundColor: p.surface, borderRadius: radius.md, padding: 12, fontFamily: font.regular, fontSize: 16, color: p.text }}
          />
          <Button
            small
            label="Add"
            disabled={!other.trim()}
            onPress={() => {
              setPicked([...picked, other.trim()])
              setOther('')
            }}
          />
        </View>
      )}
      <T v="small" tone="muted">
        🔒 Kept in your notebook, on this phone only.
      </T>
      <Button
        wide
        kind="outline"
        label="Close the day"
        onPress={() => {
          if (picked.length > 0) keepGoodThings(date, picked)
          setClosed(true)
          onClose()
        }}
      />
    </View>
  )
}
