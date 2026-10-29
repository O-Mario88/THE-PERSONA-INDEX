// One question on its own screen: tap an answer or put it in your own words,
// and the same screen turns into what it may say about you, then Continue.
// A sitting reads as one conversation (Edwin's brief, 2026-10-28): what to
// try waits for the close (Close.tsx), and keeping a card or saying whether
// it is you waits for Insights. Every rule lives in the shared code; this
// file only draws it.
import { useEffect, useMemo, useState } from 'react'
import type { PulseCounts } from '@shared/humanPulse'
import { notAloneFor } from '@shared/insights'
import { PulseLine } from '../ui/Pulse'
import { Linking, Pressable, View } from 'react-native'
import { Text } from '../ui/textScale'
import {
  ApiError,
  sendVote,
  CLOSED,
  dropVoteKey,
  earlierAnswer,
  MAX_FIRST_LINE,
  MAX_WORDS,
  OWN_WORDS,
  PRIVATE_OPTION,
  recalledChoice,
  recalledDraft,
  recalledInstead,
  recalledVerdict,
  recalledWords,
  rememberAnswered,
  rememberChoice,
  rememberInstead,
  rememberSkip,
  rememberWords,
  saveDraft,
  SKIPPED,
  UNKNOWN,
  voteKey,
  type Instead,
  type Option as Opt,
  type OwnWords,
  type Question,
  type Sitting,
  type Verdict,
} from '@shared/api'
import { HELPLINE_LINE } from '@shared/helplineText'
import { focusPlan, makePlan } from '@shared/notebook'
import { inOrder } from '@shared/order'
import { loadPeople, namesLine } from '@shared/people'
import { countAnswersOn, crisisHere, DEFAULT_WORDS_DAYS, helplineHere, loadPrefs } from '@shared/prefs'
import { isLowMood, loadHistory, recalledAnswer, recordAnswer, recordSkip, recordVerdict, threadLine } from '@shared/profile'
import { isNeed, NEED_PHRASES } from '@shared/needs'
import { splitReveal } from '@shared/reveal'
import { themeName } from '@shared/themes'
import { themeIcon } from '../ui/parts'
import { keepCardText } from '@shared/insights'
import { rateAnswer } from '@shared/rating'
import { CRISIS_LINE, focusTouch, HEAVY_HEADLINE, HEAVY_THANKS, LOCAL_NOTE, NO_PEOPLE, NOT_ME_REPLY, peopleAsk, SWAP_NOTE, VERDICT_REPLIES } from '@shared/words'
import { font, lift, radius, useTheme, typeScale } from '../theme'
import { B, Button, Chip, Field, Option, T, Tinted, Private } from '../ui/kit'
import { addSpoken, SpeakInstead } from '../ui/Speak'

export type Done = 'answered' | 'skipped'

type Props = {
  question: Question
  date: string
  sitting?: Sitting
  wordsDays?: number
  writeFirst?: boolean
  onDone?: (questionId: string, done: Done) => void
  onNext: () => void
  // Today's Human Pulse counts, once it is on, and where "See how others answered" goes.
  pulse?: { counts: PulseCounts | null; onExplore: (questionId: string) => void }
}

type Mode = 'options' | 'writing' | 'closest'

export function QuestionCard({ question, date, sitting, wordsDays = DEFAULT_WORDS_DAYS, writeFirst = false, onDone, onNext, pulse }: Props) {
  const [choice, setChoice] = useState<string | null>(() => recalledChoice(question.id))
  const [words, setWords] = useState<OwnWords | null>(() => recalledWords(question.id))
  const [draft, setDraft] = useState(() => (recalledChoice(question.id) ? '' : recalledDraft(question.id)))
  const [first, setFirst] = useState(() => writeFirst && !recalledChoice(question.id) && draft.length <= MAX_FIRST_LINE)
  const [mode, setMode] = useState<Mode>(() => (draft || first ? 'writing' : 'options'))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [kept, setKept] = useState(false)
  const intimate = question.care === 'intimate'
  const options = useMemo(() => inOrder(question), [question])

  useEffect(() => {
    if (choice) onDone?.(question.id, choice === SKIPPED ? 'skipped' : 'answered')
  }, [choice, question.id, onDone])

  function editDraft(text: string) {
    setDraft(text)
    saveDraft(question.id, text)
  }

  function keep(text: string, closest?: string) {
    const w: OwnWords = { questionId: question.id, date, prompt: question.prompt, words: text }
    if (question.theme) w.theme = question.theme
    if (intimate) w.private = true
    if (closest) w.closest = closest
    rememberWords(w, wordsDays)
    saveDraft(question.id, '')
    setWords(w)
  }

  function accepted(o: Opt, typed?: string) {
    rememberChoice(question.id, o.id)
    recordAnswer(question, o.id, date)
    keepCardText(question, o.id, date)
    if (typed) keep(typed, o.label)
    setChoice(o.id)
  }

  async function vote(o: Opt, typed?: string) {
    if (question.local) {
      accepted(o, typed)
      return
    }
    setSending(true)
    setError(null)
    const sent = intimate ? PRIVATE_OPTION : o.id
    // Counted in the shared totals only once the person said yes (prefs.countAnswers).
    // Kept on the phone and sent later when the server can't take it now (api.ts sendVote).
    const send = () => sendVote(question.id, sent, voteKey(question.id, sent), sitting, countAnswersOn(loadPrefs()))
    try {
      try {
        await send()
      } catch (e) {
        if (!(e instanceof ApiError && e.code === 'idempotency_key_reused')) throw e
        dropVoteKey(question.id)
        await send()
      }
      accepted(o, typed)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'duplicate_vote') {
        const earlier = intimate ? null : question.options.find((x) => x.id === earlierAnswer(question.id))
        if (earlier) {
          accepted(earlier)
          setKept(true)
        } else {
          if (typed) keep(typed)
          rememberAnswered(question.id)
          setChoice(recalledChoice(question.id))
        }
      } else {
        setError('Your answer did not go through. Please try again.')
      }
    } finally {
      setSending(false)
    }
  }

  function noneClose() {
    keep(draft.trim())
    rememberChoice(question.id, OWN_WORDS)
    setChoice(OWN_WORDS)
  }

  function skip() {
    rememberSkip(question.id)
    recordSkip(question, date)
    setChoice(SKIPPED)
    onDone?.(question.id, 'skipped')
    onNext()
  }

  const chosen = question.options.find((o) => o.id === choice)
  const typed = draft.trim()
  const max = first ? MAX_FIRST_LINE : MAX_WORDS

  return (
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: 'row' }}>
        <Chip icon={themeIcon(question.theme)} label={question.theme ? themeName(question.theme) : 'Today'} />
      </View>
      <T v="title">
        {question.prompt}
      </T>
      {question.local && <T tone="muted">{LOCAL_NOTE}</T>}

      {!choice && mode === 'options' && (
        <View style={{ gap: 12 }}>
          {options.map((o) => (
            <Option key={o.id} label={o.label} disabled={sending} onPress={() => vote(o)} />
          ))}
          <Option icon="pencil" label="In my own words" disabled={sending} onPress={() => setMode('writing')} />
          <Button kind="text" label="Skip" disabled={sending} onPress={skip} style={{ alignSelf: 'center' }} />
        </View>
      )}

      {!choice && mode === 'writing' && (
        <View style={{ gap: 12 }}>
          <T v="eyebrow">{first ? 'Say it in one line' : 'In your own words'}</T>
          <Field
            value={draft}
            maxLength={max}
            multiline
            autoFocus={!first}
            placeholder="Say it the way it really is for you."
            onChangeText={editDraft}
          />
          <SpeakInstead onText={(t) => editDraft(addSpoken(draft, t, max))} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Private>Kept on this phone. The app never sends it.</Private>
            </View>
            <T v="small" tone="muted">
              {max - draft.length} left
            </T>
          </View>
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button small label="Keep my words" disabled={!typed} onPress={() => typed && setMode('closest')} />
            <Button
              kind="text"
              label={first ? 'Just tap instead' : 'Back to the options'}
              onPress={() => {
                setFirst(false)
                setMode('options')
              }}
            />
          </View>
        </View>
      )}

      {!choice && mode === 'closest' && (
        <View style={{ gap: 12 }}>
          <Quote text={typed} />
          <T tone="text2">Which of these is closest to what you meant? I'll read your answer from that one.</T>
          {options.map((o) => (
            <Option key={o.id} label={o.label} disabled={sending} onPress={() => vote(o, typed)} />
          ))}
          <View style={{ flexDirection: 'row', gap: 20 }}>
            {!error && <Button kind="text" label="None of these" disabled={sending} onPress={noneClose} />}
            <Button kind="text" label="Change my words" disabled={sending} onPress={() => setMode('writing')} />
          </View>
        </View>
      )}

      {choice === SKIPPED && (
        <>
          <T tone="muted">You skipped this one. That's fine.</T>
          <Button wide label="Continue" onPress={onNext} />
        </>
      )}

      {choice === UNKNOWN && (
        <>
          {words && <YourWords words={words} />}
          <T tone="muted">You already answered this one on this phone.</T>
          <Button wide label="Continue" onPress={onNext} />
        </>
      )}

      {choice === CLOSED && (
        <>
          <T tone="muted">You answered this one before you deleted everything. It stays closed today, so it isn't counted twice.</T>
          <Button wide label="Continue" onPress={onNext} />
        </>
      )}

      {choice === OWN_WORDS && (
        <View style={{ gap: 14 }}>
          {words ? <YourWords words={words} /> : <T tone="muted">You answered this one in your own words.</T>}
          <T tone="text2">
            None of the options matched what you meant, so there is no card for this one. I'd rather say nothing than guess about you. Your words are kept in
            your mirror, on this phone only.
          </T>
          <Button wide label="Continue" onPress={onNext} />
        </View>
      )}

      {chosen && kept && <T tone="muted">Your first answer had already reached me, so that's the one I kept.</T>}
      {chosen && (
        <Answer
          question={question}
          option={chosen}
          words={words}
          date={date}
          onNext={onNext}
          pulse={pulse}
        />
      )}

      {error && (
        <T tone="danger" style={{ fontFamily: font.semibold }}>
          {error}
        </T>
      )}
    </View>
  )
}

function Quote({ text }: { text: string }) {
  const p = useTheme()
  return (
    <View style={{ borderLeftWidth: 3, borderLeftColor: p.amber, paddingLeft: 14 }}>
      <T v="body" style={{ fontFamily: font.semibold }}>
        “{text}”
      </T>
    </View>
  )
}

function YourWords({ words }: { words: OwnWords }) {
  return (
    <View style={{ gap: 8 }}>
      <T v="eyebrow">In your words</T>
      <Quote text={words.words} />
      {words.closest && (
        <T tone="muted">
          Closest to: <B>{words.closest}</B>
        </T>
      )}
    </View>
  )
}

// The answer: one insight card with the whole reading at once (Edwin,
// 2026-10-27: the headline alone was too short), one line saying you're not
// the only one, then Continue. Nothing competes with the next question.
function Answer({
  question,
  option,
  words,
  date,
  onNext,
  pulse,
}: {
  question: Question
  option: Opt
  words: OwnWords | null
  date: string
  onNext: () => void
  pulse?: Props['pulse']
}) {
  const insight = option.heavy ? undefined : option.insight
  const [thread] = useState(() => threadLine(loadHistory(), question, option.id, date))
  const [focus] = useState(() => {
    const f = focusPlan()
    return f && (option.traits?.[f.trait] ?? 0) !== 0 ? f : null
  })
  const [notMe] = useState(() => recalledVerdict(question.id) === 'not_me')
  return (
    <View style={{ gap: 16 }}>
      {words ? (
        <YourWords words={words} />
      ) : (
        !insight && (
          <View style={{ gap: 4 }}>
            <T v="eyebrow">You chose</T>
            <T v="h3">{option.label}</T>
          </View>
        )
      )}
      {option.heavy && <HeavyCard />}
      {insight && (
        <InsightPanel
          area={question.theme ? themeName(question.theme) : 'Today'}
          chose={words ? undefined : option.label}
          reveal={insight.reveal}
          otherSide={insight.otherSide}
          reach={notMe || !isNeed(option.need) ? null : NEED_PHRASES[option.need!]}
          thread={notMe ? null : thread}
          focus={notMe || !focus ? null : focusTouch(focus.when, focus.will)}
        />
      )}
      {/* After your own reading, one line saying you're not the only one (never after a heavy answer). Exploring it waits for later. */}
      {insight && pulse?.counts && !option.heavy && !question.local && (
        <PulseLine line={notAloneFor(pulse.counts.questions, question.id, option.id)} stale={pulse.counts.stale} />
      )}
      {insight && isLowMood(question.theme, option.depth) && <Helpline />}
      <Button wide label="Continue" onPress={onNext} />
    </View>
  )
}

function Helpline() {
  return (
    <T v="small" tone="muted">
      {HELPLINE_LINE}{' '}
      <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(helplineHere())}>
        Find a helpline
      </Text>
    </T>
  )
}

export function HeavyCard() {
  const crisis = crisisHere()
  const people = loadPeople()
  const names = people?.names ?? []
  const draft = names[0] ? `Hey ${names[0]}, had a heavy day. Free for a 5-minute call later?` : ''
  return (
    <Tinted tone="rose">
      <T v="h2">{HEAVY_HEADLINE}</T>
      <T>{HEAVY_THANKS}</T>
      {names.length > 0 && <T>{peopleAsk(namesLine(names))}</T>}
      {people?.helps && <T>What helps, in your words: “{people.helps}”</T>}
      {names.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Button small kind="secondary" icon="chat" label="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(draft)}`)} />
          <Button small kind="secondary" icon="sms" label="SMS" onPress={() => Linking.openURL(`sms:?&body=${encodeURIComponent(draft)}`)} />
        </View>
      )}
      {names.length === 0 && <T>{NO_PEOPLE}</T>}
      <Helpline />
      <T v="small" tone="muted">
        {CRISIS_LINE}{' '}
        <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(helplineHere())}>
          Talk to someone now
        </Text>
      </T>
      {crisis && <Button small kind="danger" icon="chat" label={crisis.label} onPress={() => Linking.openURL(`tel:${crisis.tel}`)} />}
      <T v="tiny">Something to think about, never a diagnosis.</T>
    </Tinted>
  )
}

// The insight card, all at once as the iPhone app showed it: the headline
// (the bright side of the answer), the fuller reading, the other side, and
// what it reached for.
function InsightPanel({
  area,
  chose,
  reveal,
  otherSide,
  reach,
  thread,
  focus,
}: {
  area: string
  chose?: string
  reveal: string
  otherSide?: string
  reach: string | null
  thread: string | null
  focus: string | null
}) {
  const p = useTheme()
  const { headline, body } = splitReveal(reveal)
  return (
    <View
      accessibilityLabel="What your answer may say"
      style={[{ gap: 16, padding: 20, borderRadius: radius.lg, borderWidth: 1, borderColor: p.line, backgroundColor: p.surface }, lift(p)]}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <T v="eyebrow">{area}</T>
        {chose && (
          <T v="small" tone="muted" style={{ flexShrink: 1, textAlign: 'right' }}>
            {chose}
          </T>
        )}
      </View>
      <T v="title">
        {headline}
      </T>
      {body ? (
        <T v="reading" tone="text2">
          {body}
        </T>
      ) : null}
      {otherSide ? <Side label="The other side" color={p.rose} text={otherSide} /> : null}
      {reach && <Side label="What you were reaching for" color={p.accentInk} text={reach} />}
      {thread && <T tone="text2">↺ {thread}</T>}
      {focus && <T tone="text2">→ {focus}</T>}
      <T v="tiny">Something to think about, never a diagnosis.</T>
    </View>
  )
}

// One side of a reading: a coloured rule, its name, and the words.
function Side({ label, color, text }: { label: string; color: string; text: string }) {
  return (
    <View style={{ gap: 4, borderLeftWidth: 3, borderLeftColor: color, paddingLeft: 14 }}>
      <T v="eyebrow" style={{ color }}>
        {label}
      </T>
      <T tone="text2">{text}</T>
    </View>
  )
}

// Your own way to try it, tied to a moment, kept as a plan in your notebook.
export function OwnIdea({ option, date, onMade, onCancel }: { option: Opt; date: string; onMade: () => void; onCancel: () => void }) {
  const [when, setWhen] = useState('')
  const [will, setWill] = useState('')
  const [focus] = useState(focusPlan)
  const [trait, w] = Object.entries(option.traits ?? {}).find(([, v]) => v !== 0) ?? ['', 1]
  const ready = !!(when.trim() && will.trim())
  return (
    <View style={{ gap: 10 }}>
      <T v="eyebrow">Your own way, tied to a moment</T>
      {focus && <T tone="muted">{SWAP_NOTE}</T>}
      <Field label="When" value={when} maxLength={80} onChangeText={setWhen} />
      <Field label="I will" value={will} maxLength={80} onChangeText={setWill} />
      <Private>Your plan stays on this phone. I only ever send whether you did it.</Private>
      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
        <Button
          small
          label="Keep my plan"
          disabled={!ready}
          onPress={() => {
            makePlan({ made: date, trait, high: w > 0, when: when.trim(), will: will.trim() })
            onMade()
          }}
        />
        <Button kind="text" label="Cancel" onPress={onCancel} />
      </View>
    </View>
  )
}

// "Does this sound like you?" That's me, Partly or Not me.
export function Rate({ question, option, date, wordsDays, onVerdict }: { question: Question; option: Opt; date: string; wordsDays: number; onVerdict?: (v: Verdict) => void }) {
  const [verdict, setVerdict] = useState(() => recalledVerdict(question.id))
  function tap(v: Verdict) {
    setVerdict(v)
    onVerdict?.(v)
    rateAnswer(question, option.id, v)
  }
  if (verdict === 'not_me') return <Closer question={question} option={option} date={date} wordsDays={wordsDays} />
  if (verdict) return <T tone="muted">{VERDICT_REPLIES[verdict]}</T>
  return (
    <View style={{ gap: 10 }}>
      <T v="h3">Does this sound like you?</T>
      <VerdictRow onTap={tap} />
    </View>
  )
}

export function VerdictRow({ onTap }: { onTap: (v: Verdict) => void }) {
  const p = useTheme()
  const items: [Verdict, string][] = [
    ['me', "That's me"],
    ['partly', 'Partly'],
    ['not_me', 'Not me'],
  ]
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {items.map(([v, label]) => (
        <Pressable
          key={v}
          accessibilityRole="button"
          onPress={() => onTap(v)}
          style={({ pressed }) => ({
            flex: 1,
            alignItems: 'center',
            paddingVertical: 10,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: p.lineStrong,
            backgroundColor: pressed ? p.accentWash : p.surface,
          })}
        >
          <Text style={{ fontFamily: font.bold, ...typeScale.small, color: p.text }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

const NEITHER = ''

function Closer({ question, option, date, wordsDays }: { question: Question; option: Opt; date: string; wordsDays: number }) {
  const others = useMemo(() => inOrder(question).filter((o) => o.id !== option.id && o.insight), [question, option.id])
  const [closer, setCloser] = useState(() => recalledAnswer(question.id)?.closer?.optionId ?? null)
  const [instead, setInstead] = useState<Instead | null>(() => recalledInstead(question.id))
  const [line, setLine] = useState('')
  const [done, setDone] = useState(closer === NEITHER)
  const picked = others.find((o) => o.id === closer)
  return (
    <View style={{ gap: 12 }}>
      <T tone="muted">{NOT_ME_REPLY}</T>
      {picked && <T>Closer to you: “{splitReveal(picked.insight!.reveal).headline}”</T>}
      {instead && <Quote text={instead.words} />}
      {!picked && !instead && !done && (
        <>
          <T v="h3">What's closer to you?</T>
          {others.map((o) => (
            <Option
              key={o.id}
              label={splitReveal(o.insight!.reveal).headline}
              onPress={() => {
                recordVerdict(question.id, 'not_me', { optionId: o.id, traits: o.traits ?? {} })
                setCloser(o.id)
              }}
            />
          ))}
          <Field label="Or in a line of your own" value={line} maxLength={140} onChangeText={setLine} />
          <Private>Kept on this phone. The app never sends it.</Private>
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            <Button
              small
              label="Keep my line"
              disabled={!line.trim()}
              onPress={() => {
                const w: Instead = { questionId: question.id, date, words: line.trim() }
                rememberInstead(w, wordsDays)
                setInstead(w)
              }}
            />
            <Button
              kind="text"
              label="Neither"
              onPress={() => {
                recordVerdict(question.id, 'not_me', { optionId: NEITHER, traits: {} })
                setDone(true)
              }}
            />
          </View>
        </>
      )}
    </View>
  )
}
