// "What would you like help making sense of today?" (Edwin's brief,
// 2026-10-29): the first experience, and the way in from Today's "Need a
// moment?". A starting point, two or three questions (typed or spoken), then
// a small result the person can edit before keeping it: what they described,
// one possibility, one next step and, when a conversation is involved, a
// sentence they could say. Built on the phone from their own choices and
// words (shared makeSense.ts); kept, the step is checked on two days later.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { readWriting } from '@shared/kinder'
import { dateOf } from '@shared/locale'
import {
  keepSense,
  memoryFor,
  resultFor,
  senseQuestions,
  SENSE_ASK,
  SENSE_CHECK_IN_DAYS,
  SENSE_FOOT,
  STARTS,
  type SenseAnswers,
  type SenseQuestion,
  type SenseResult,
  type SenseStart,
} from '@shared/makeSense'
import { freeLeft, isPatron, noteFreeTry } from '@shared/patron'
import { addDays } from '@shared/storage'
import { radius, useTheme, typeScale, font } from '../theme'
import { Icon } from '../ui/Icon'
import { Button, Card, Option, Page, T } from '../ui/kit'
import { PatronNote } from '../ui/Patron'
import { addSpoken, SpeakInstead } from '../ui/Speak'
import { TextInput } from '../ui/textScale'
import { HeavyCard } from './QuestionCard'
import { RemindersOn } from './Reminders'

const WORDS_MAX = 600

export function MakeSense({ today, start: given, first = false, onClose }: { today: string; start?: SenseStart; first?: boolean; onClose: () => void }) {
  const p = useTheme()
  const [start, setStart] = useState<SenseStart | null>(given ?? null)
  const [n, setN] = useState(0)
  const [answers, setAnswers] = useState<SenseAnswers>({})
  const [result, setResult] = useState<SenseResult | null>(null)
  const [kept, setKept] = useState(false)
  const qs = start ? senseQuestions(start) : []
  const q = qs[n]

  const next = (a: SenseAnswers) => {
    if (!start) return
    if (n + 1 < qs.length) setN(n + 1)
    else setResult(resultFor(start, a))
  }

  let body: ReactNode
  if (!start) body = <Pick onPick={setStart} />
  else if (!result && q)
    body = (
      <Ask
        key={q.id}
        q={q}
        value={answers[q.id] ?? ''}
        onWords={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
        onNext={(id) => {
          const a = id ? { ...answers, [q.id]: id } : answers
          setAnswers(a)
          next(a)
        }}
      />
    )
  else if (result && !kept)
    body = (
      <Result
        start={start}
        today={today}
        result={result}
        onChange={setResult}
        onKeep={() => {
          keepSense(start, answers, result, today)
          setKept(true)
        }}
        onLeave={onClose}
      />
    )
  else if (result) body = <Kept checkOn={addDays(today, SENSE_CHECK_IN_DAYS)} first={first} onDone={onClose} />

  return (
    <Page bottom={48}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to today" onPress={onClose} hitSlop={12}>
          <Icon name="back" size={24} color={p.text} />
        </Pressable>
        <T v="label" tone="text" center style={{ flex: 1, marginRight: 24 }}>
          {result ? 'Your result' : start && qs.length ? `${n + 1} of ${qs.length}` : 'Making sense'}
        </T>
      </View>
      {start && !result && qs.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {qs.map((x, i) => (
            <View key={x.id} style={{ flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: i <= n ? p.lime : p.surface3 }} />
          ))}
        </View>
      )}
      {body}
    </Page>
  )
}

function Pick({ onPick }: { onPick: (s: SenseStart) => void }) {
  return (
    <View style={{ gap: 12 }}>
      <T v="title">{SENSE_ASK}</T>
      <T tone="text2">Choose one. A few questions, then something you can use, in about two minutes.</T>
      {STARTS.map((s) => (
        <Option key={s.id} label={s.label} onPress={() => onPick(s.id)} />
      ))}
    </View>
  )
}

function Ask({ q, value, onWords, onNext }: { q: SenseQuestion; value: string; onWords: (v: string) => void; onNext: (choice?: string) => void }) {
  const p = useTheme()
  if (q.kind === 'choice')
    return (
      <View style={{ gap: 12 }}>
        <T v="title">{q.ask}</T>
        {(q.options ?? []).map((o) => (
          <Option key={o.id} label={o.label} onPress={() => onNext(o.id)} />
        ))}
      </View>
    )
  const crisis = readWriting(value)?.kind === 'crisis'
  return (
    <View style={{ gap: 12 }}>
      <T v="title">{q.ask}</T>
      <TextInput
        value={value}
        onChangeText={(t) => onWords(t.slice(0, WORDS_MAX))}
        placeholder={q.placeholder}
        placeholderTextColor={p.muted}
        multiline
        accessibilityLabel={q.ask}
        style={{
          minHeight: 120,
          borderWidth: 1.5,
          borderColor: p.control,
          backgroundColor: p.surface,
          borderRadius: radius.md,
          padding: 14,
          fontFamily: font.regular,
          ...typeScale.body,
          color: p.text,
          textAlignVertical: 'top',
        }}
      />
      <SpeakInstead onText={(t) => onWords(addSpoken(value, t, WORDS_MAX))} />
      {crisis && <HeavyCard />}
      <Button wide label="Continue" disabled={value.trim().length < 2} onPress={() => onNext()} />
    </View>
  )
}

// One part of the result, with a way to put it in the person's own words.
function Part({ label, text, onChange, quote, children }: { label: string; text: string; onChange: (t: string) => void; quote?: boolean; children?: ReactNode }) {
  const p = useTheme()
  const [editing, setEditing] = useState(false)
  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <T v="eyebrow">{label}</T>
        <Button small kind="text" label={editing ? 'Done' : 'Edit'} onPress={() => setEditing(!editing)} />
      </View>
      {editing ? (
        <TextInput
          value={text}
          onChangeText={onChange}
          multiline
          autoFocus
          accessibilityLabel={label}
          style={{
            minHeight: 80,
            borderWidth: 1.5,
            borderColor: p.control,
            backgroundColor: p.surface,
            borderRadius: radius.md,
            padding: 12,
            fontFamily: font.regular,
            ...typeScale.body,
            color: p.text,
            textAlignVertical: 'top',
          }}
        />
      ) : (
        <T v={quote ? 'quote' : 'reading'}>{quote ? `“${text}”` : text}</T>
      )}
      {children}
    </Card>
  )
}

function Result({
  start,
  today,
  result,
  onChange,
  onKeep,
  onLeave,
}: {
  start: SenseStart
  today: string
  result: SenseResult
  onChange: (r: SenseResult) => void
  onKeep: () => void
  onLeave: () => void
}) {
  const [fit, setFit] = useState<'yes' | 'no' | null>(null)
  const [memory] = useState(() => memoryFor(start, today))
  // A step that helped before: the first time free, then part of Patron.
  const [open] = useState(() => !!memory && (isPatron(today) || freeLeft('memory') > 0))
  const [used, setUsed] = useState(false)
  const counted = useRef(false)
  useEffect(() => {
    if (open && !isPatron(today) && !counted.current) {
      counted.current = true
      noteFreeTry('memory')
    }
  }, [open, today])

  return (
    <View style={{ gap: 12 }}>
      <Part label="What you described" text={result.described} onChange={(described) => onChange({ ...result, described })} />
      <Part label="What it could mean" text={result.possibility} onChange={(possibility) => onChange({ ...result, possibility })}>
        {fit === null ? (
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button small kind="secondary" label="That fits" onPress={() => setFit('yes')} />
            <Button
              small
              kind="text"
              label="Not quite"
              onPress={() => {
                setFit('no')
                onChange({ ...result, possibility: '' })
              }}
            />
          </View>
        ) : fit === 'no' && !result.possibility.trim() ? (
          <T v="small" tone="muted">
            Tap Edit and put it in your own words. You know this better than I do.
          </T>
        ) : null}
      </Part>
      {memory && open && !used && (
        <Card style={{ gap: 10 }}>
          <T v="eyebrow">What helped before</T>
          <T v="reading">{memory.line}</T>
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button
              small
              label="Use that again"
              onPress={() => {
                onChange({ ...result, step: memory.step })
                setUsed(true)
              }}
            />
            <Button small kind="text" label="Try something new" onPress={() => setUsed(true)} />
          </View>
        </Card>
      )}
      {memory && !open && <PatronNote text="Something like this happened before, and I kept what you said helped. Bringing it back when it matters is part of The Persona Index Patron." />}
      <Part label="One next step" text={result.step} onChange={(step) => onChange({ ...result, step })} />
      {result.say !== undefined && <Part label="Something you could say" quote text={result.say} onChange={(say) => onChange({ ...result, say })} />}
      <T v="tiny">{SENSE_FOOT}</T>
      <Button wide label="Keep this" disabled={!result.step.trim()} onPress={onKeep} />
      <Button kind="text" label="Leave it" onPress={onLeave} />
    </View>
  )
}

function Kept({ checkOn, first, onDone }: { checkOn: string; first: boolean; onDone: () => void }) {
  const p = useTheme()
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 8, padding: 20, borderRadius: radius.xl, backgroundColor: p.navy }}>
        <T v="title" tone="onNavy">
          Kept in your Notebook.
        </T>
        <T tone="onNavy2">{`I’ll check in on ${dateOf(checkOn, { weekday: 'long' })} to ask how your next step went.`}</T>
      </View>
      {first && (
        <PatronNote text="As you go, I’ll remember what helped and bring it back when something similar happens, and each week your Mirror shows what kept coming up. That memory across your weeks is part of The Persona Index Patron." />
      )}
      {first && <RemindersOn />}
      <Button wide label="Back to today" onPress={onDone} />
    </View>
  )
}
