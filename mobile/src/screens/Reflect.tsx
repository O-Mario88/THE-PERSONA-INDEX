// Reflect: a quiet
// space for your thoughts. Writing first, with one question made on this
// device from the person's own answers, cards and earlier words, or none at
// all; then what they have noticed across the parts of their life, earlier
// words, and their choices. Everything stays on this device.
import { writingWaits } from '@shared/vault'
import { useEffect, useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'
import { Text, TextInput } from '../ui/textScale'
import { cachedEdition, getMirror, recalledChoice, type Mirror, type Question } from '@shared/api'
import { draftOf, reflectSettings, reminderFor, saveDraft, type DraftSpace } from '@shared/journal'
import { allGoodThings, intentionsDue, keepIntention, keepReflection, keptCards, reflections, type ReflectionArea, type ReflectionPeriod } from '@shared/notebook'
import { KINDER_FRIEND, KINDER_TITLE, KINDER_WRITE, kinderLook, readWriting, type Reading } from '@shared/kinder'
import { noticedFrom, type Noticed, type NoticedSource } from '@shared/noticed'
import { loadHistory } from '@shared/profile'
import { AREA_NAMES, dayMonth, PERIOD_NAMES, reflectionItems } from '@shared/reflect'
import { PRIVACY_LINE } from '@shared/words'
import { addDays } from '@shared/storage'
import { thoughtsFor, type Answered, type Thought } from '@shared/thoughts'
import { BringBack } from './Backup'
import { Notebook } from './Notebook'
import { KeepMoment } from './KeepMoment'
import { HeavyCard } from './QuestionCard'
import { font, radius, useTheme, typeScale } from '../theme'
import { Button, Card, Page, PageHeader, Private, Segmented, T, Tinted } from '../ui/kit'
import { AREA_ICON, AREA_TONE, CardHead, Disc } from '../ui/parts'
import { Icon } from '../ui/Icon'
import { addSpoken, SpeakInstead } from '../ui/Speak'
import { mirrorName } from '@shared/mirrorDay'
import { ShareSheet } from './ShareSheet'

const SPAN_DAYS: Record<ReflectionPeriod, number> = { day: 0, week: 6, month: 30 }
const THIS: Record<ReflectionPeriod, string> = { day: 'today', week: 'this week', month: 'this month' }
const NEXT: Record<ReflectionPeriod, string> = { day: 'tomorrow', week: 'next week', month: 'next month' }
const SOURCE: Record<NoticedSource, string> = {
  answers: 'From your answers',
  week: 'From your answers this week',
  circle: 'From your Circle',
  reflections: 'From your reflections',
}
const AREAS: ReflectionArea[] = ['work', 'school', 'family', 'culture', 'social', 'health', 'money', 'self']
const ICONS = AREA_ICON
const TONES = AREA_TONE

function answeredIn(period: ReflectionPeriod, today: string, todays: Question[]): Answered[] {
  const from = addDays(today, -SPAN_DAYS[period])
  const out: Answered[] = []
  for (const a of [...loadHistory().answers].reverse()) {
    if (a.date < from || a.date > today || !a.optionId || a.regional) continue
    const set = a.date === today ? null : cachedEdition(a.date)
    const q = (a.date === today ? todays : [...(set?.questions ?? []), ...(set?.evening ?? [])]).find((x) => x.id === a.questionId)
    const option = q?.options.find((o) => o.id === a.optionId)
    if (q && option) out.push({ question: q, option, date: a.date })
  }
  return out
}

function fromNoticed(n: Noticed, period: ReflectionPeriod): Thought {
  return {
    id: `noticed-${n.area}-${n.group}`,
    question: n.group === 'grow' ? `What is one small thing you could try ${NEXT[period]}?` : `Where did this help you ${THIS[period]}?`,
    lead: n.text,
    why: SOURCE[n.source],
    source: n.source === 'circle' ? 'circle' : n.source === 'week' ? 'week' : n.source === 'reflections' ? 'reflections' : 'answers',
    area: n.area,
  }
}

const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

export function Reflect({
  today,
  questions,
  mild = false,
  startFree = false,
  startPrompt = null,
  startFollowsUp = null,
  name = null,
}: {
  today: string
  questions: Question[]
  mild?: boolean
  startFree?: boolean
  startPrompt?: string | null
  startFollowsUp?: string | null // carrying on from an earlier reflection (Today's remembered one)
  name?: string | null
}) {
  const p = useTheme()
  const [period, setPeriod] = useState<ReflectionPeriod>('day')
  const [free, setFree] = useState(startFree)
  const [keeping, setKeeping] = useState(false)
  const [at, setAt] = useState(0)
  const [chosen, setChosen] = useState<Thought | null>(() =>
    startPrompt
      ? {
          id: `moment-${Date.now().toString(36)}`,
          question: startPrompt,
          lead: '',
          why: startFollowsUp ? 'Carrying on from what you wrote' : 'Something on your mind',
          source: 'general',
          area: 'self',
          ...(startFollowsUp ? { followsUp: startFollowsUp } : {}),
        }
      : null,
  )
  const [mirror, setMirror] = useState<Mirror | null>(null)
  const [version, setVersion] = useState(0)
  const [group, setGroup] = useState<'strength' | 'grow'>('strength')

  useEffect(() => {
    let live = true
    if (period !== 'day') getMirror(today).then((m) => live && setMirror(m), () => {})
    return () => {
      live = false
    }
  }, [period, today])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const past = useMemo(() => reflections(), [version])
  const answered = useMemo(() => answeredIn(period, today, questions), [period, today, questions])
  const thoughts = useMemo(
    () => thoughtsFor({ period, today, answered, kept: keptCards(), traits: mirror?.traits ?? null, outside: null, past, due: intentionsDue(today) }),
    [period, today, answered, mirror, past],
  )
  const thought = chosen ?? thoughts[at % thoughts.length]
  const todays = questions.flatMap((q) => {
    const id = recalledChoice(q.id)
    const option = q.options.find((o) => o.id === id)
    return option ? [{ question: q, option }] : []
  })
  const items = reflectionItems(period, period === 'day' ? todays : answered, mirror, null)
  const noticed = noticedFrom(items, past, reflectSettings().reflectionsInNoticed, addDays(today, -30))
  const consider = noticed.find((n) => n.group === 'grow') ?? null


  return (
    <Page
      aside={
        <>
          <Card style={{ gap: 10 }}>
            <CardHead icon="leaf" tone="amber" title="Remember" />
            <T tone="muted">{reminderFor(today)}</T>
          </Card>
          {past.length > 0 && (
            <Card style={{ gap: 12 }}>
              <T v="h2">Your recent reflections</T>
              {past.slice(0, 4).map((r) => (
                <View key={r.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                  <Icon name="doc" size={20} color={p.text2} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <T v="small" tone="muted">
                      {dayMonth(r.date)}
                    </T>
                    <T bold lines={2}>
                      {r.answer}
                    </T>
                  </View>
                </View>
              ))}
            </Card>
          )}

          {consider && (
            <View style={{ gap: 10 }}>
              <CardHead icon="pin" tone="rose" title="Something I noticed" />
              <T tone="muted">{consider.text}</T>
              <Button small kind="secondary" label="Reflect on this" iconAfter="arrow" onPress={() => setChosen(fromNoticed(consider, period))} style={{ alignSelf: 'flex-start' }} />
            </View>
          )}
        </>
      }
    >
      <PageHeader title="Reflect" line={name ? `A quiet space for your thoughts, ${name}.` : 'A quiet space for your thoughts.'} />

      {/* The same switch as everywhere else in the app (the light-mode review, 2026-10-29). */}
      <Segmented
        label="Reflect on"
        value={free ? null : period}
        onChange={(pd) => {
          setFree(false)
          setPeriod(pd)
          setAt(0)
          setChosen(null)
        }}
        options={(Object.keys(PERIOD_NAMES) as ReflectionPeriod[]).map((pd) => ({ value: pd, label: PERIOD_NAMES[pd] }))}
      />
      {writingWaits() && <BringBack onBack={() => setVersion((v) => v + 1)} />}

      <Writing
        key={`${free ? 'free' : period}-${thought?.id}-${version}`}
        today={today}
        period={period}
        free={free}
        thought={free ? null : thought}
        onAnother={() => (chosen ? setChosen(null) : setAt((n) => n + 1))}
        onSaved={() => setVersion((v) => v + 1)}
        onDone={() => setChosen(null)}
        onKinder={(rid) => {
          setFree(false)
          setChosen({ id: `kinder-${rid}`, question: KINDER_FRIEND, lead: '', why: 'From what you just wrote', source: 'reflections', area: 'self', followsUp: rid })
          setVersion((v) => v + 1)
        }}
      />
      <Button kind="text" small icon={free ? 'leaf' : 'pencil'} label={free ? 'Back to a question' : 'Or write freely, with no question'} onPress={() => setFree(!free)} style={{ alignSelf: 'flex-start' }} />
      {keeping ? (
        <Card>
          <KeepMoment today={today} />
        </Card>
      ) : (
        <Button kind="text" small icon="bookmark" label="Or keep a moment, in a sentence or two" onPress={() => setKeeping(true)} style={{ alignSelf: 'flex-start' }} />
      )}

      {noticed.length > 0 && (
      <Card style={{ gap: 14 }}>
        <View style={{ gap: 4 }}>
          <T v="h2">What I've noticed about you</T>
          <T v="small" tone="muted">
            From your answers, your Circle and what you write to me.
          </T>
        </View>
        <View style={{ flexDirection: 'row', gap: 20, borderBottomWidth: 1, borderBottomColor: p.line }}>
          {(['strength', 'grow'] as const).map((g) => (
            <Pressable key={g} accessibilityRole="tab" accessibilityState={{ selected: group === g }} onPress={() => setGroup(g)} style={{ paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: group === g ? p.lime : 'transparent' }}>
              <Text style={{ fontFamily: font.bold, ...typeScale.small, color: group === g ? p.accentInk : p.muted }}>{g === 'strength' ? 'Strengths' : 'Areas to grow'}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 18 }}>
          {/* Only the parts of life with something in them, never a grid of empty boxes. */}
          {!AREAS.some((area) => noticed.some((n) => n.area === area && n.group === group)) && (
            <T tone="muted">{group === 'strength' ? 'Nothing here yet. Your strengths show up as you answer and write.' : 'Nothing here yet. Areas to grow show up as you answer and write.'}</T>
          )}
          {AREAS.filter((area) => noticed.some((n) => n.area === area && n.group === group)).map((area) => {
            const item = noticed.find((n) => n.area === area && n.group === group)
            return (
              <Pressable
                key={area}
                disabled={!item}
                onPress={() => item && setChosen(fromNoticed(item, period))}
                style={{ width: '50%', paddingRight: 12, gap: 6 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <Disc icon={ICONS[area]} tone={TONES[area]} size={28} />
                  <T v="h3" style={{ ...typeScale.body, flex: 1, paddingTop: 4 }}>
                    {AREA_NAMES[area]}
                  </T>
                </View>
                <T v="small" tone={item ? 'text' : 'muted'}>
                  {item ? item.text : 'Nothing here yet.'}
                </T>
                {item && <T v="tiny">{SOURCE[item.source]}</T>}
              </Pressable>
            )
          })}
        </View>
      </Card>
      )}

      <Notebook mild={mild} today={today} hideWhenEmpty />
    </Page>
  )
}

function Writing({
  today,
  period,
  free,
  thought,
  onAnother,
  onSaved,
  onDone,
  onKinder,
}: {
  today: string
  period: ReflectionPeriod
  free: boolean
  thought: Thought | null
  onAnother: () => void
  onSaved: () => void
  onDone: () => void
  onKinder: (savedId: string) => void
}) {
  const p = useTheme()
  const space: DraftSpace = free ? 'free' : period
  const [text, setText] = useState(() => draftOf(space))
  const [saved, setSaved] = useState<string | null>(null)
  const [reading, setReading] = useState<Reading | null>(null)
  const [intention, setIntention] = useState('')
  const [kept, setKept] = useState(false)
  // After saving (Edwin, 2026-10-29): keep it private, or share a part of it.
  const [savedText, setSavedText] = useState('')
  const [privacy, setPrivacy] = useState<'asking' | 'private' | 'sharing' | 'talking'>('asking')

  function save() {
    if (!text.trim()) return
    const rid = `${today}-${free ? 'free' : period}-${Date.now().toString(36)}`
    keepReflection({
      id: rid,
      date: today,
      period,
      area: thought?.area ?? 'self',
      group: 'learnt',
      source: thought?.source === 'circle' ? 'circle' : thought?.source === 'week' ? 'week' : 'answers',
      about: free ? '' : (thought?.lead ?? ''),
      question: free ? 'Written freely' : (thought?.question ?? ''),
      answer: text,
      ...(free ? { free: true as const } : {}),
      ...(thought && !free ? { why: thought.why } : {}),
      ...(thought?.followsUp ? { followsUp: thought.followsUp } : {}),
    })
    setReading(readWriting(text))
    setSavedText(text)
    setPrivacy('asking')
    setText('')
    saveDraft(space, '')
    setSaved(rid)
  }

  if (saved) {
    return (
      <>
      {reading?.kind === 'crisis' && <HeavyCard />}
      {reading?.kind === 'hard' && <KinderCard reading={reading} onWrite={() => onKinder(saved)} />}
      <Tinted>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Icon name="check" size={18} color={p.leaf} width={2.4} />
          <T tone="leaf" bold style={{ flex: 1 }}>
            {`Saved, on this phone. It comes back on Today, and in your ${mirrorName()}.`}
          </T>
        </View>
        {privacy === 'asking' ? (
          <View style={{ gap: 8 }}>
            <T v="small" bold>
              Would you like to keep this private, share a part of it, or reflect on it with someone?
            </T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Button small kind="secondary" label="Keep it private" onPress={() => setPrivacy('private')} />
              <Button small kind="secondary" label="Share a part of it" onPress={() => setPrivacy('sharing')} />
              <Button small kind="secondary" label="Reflect on it with someone" onPress={() => setPrivacy('talking')} />
            </View>
          </View>
        ) : privacy === 'private' ? (
          <T v="small" tone="muted">
            Kept private. Only you can see it.
          </T>
        ) : null}
        {privacy === 'sharing' && <ShareSheet kind="reflection" text={savedText} onClose={() => setPrivacy('private')} />}
        {privacy === 'talking' && <ShareSheet kind="reflection" text={savedText} initialMode="talk" onClose={() => setPrivacy('private')} />}
        {!kept ? (
          <>
            <T v="small" bold>
              Something I’d like to try (optional)
            </T>
            <TextInput
              value={intention}
              onChangeText={setIntention}
              maxLength={140}
              placeholder="Ask for help earlier"
              placeholderTextColor={p.muted}
              style={{ borderWidth: 1.5, borderColor: p.control, backgroundColor: p.surface, borderRadius: radius.md, padding: 14, fontFamily: font.regular, ...typeScale.body, color: p.text }}
            />
            <T v="small" tone="muted">
              In a week, a gentle check-in asks how it went. No goals and no scores.
            </T>
            <Button
              small
              kind="secondary"
              label="Keep it"
              disabled={!intention.trim()}
              onPress={() => {
                keepIntention({ id: `${saved}-try`, date: today, text: intention, from: saved })
                setKept(true)
              }}
            />
          </>
        ) : (
          <T v="small" tone="muted">
            Kept. I’ll ask how it went in a week.
          </T>
        )}
        <Button
          kind="text"
          label="Done"
          onPress={() => {
            onSaved()
            onDone()
          }}
        />
      </Tinted>
      </>
    )
  }

  return (
    <Tinted>
      <CardHead
        icon={free ? 'pencil' : 'leaf'}
        v="eyebrow"
        title={free ? 'Write freely' : 'A thought for you'}
        right={
          !free && (
            <Pressable accessibilityRole="button" accessibilityLabel="Another question" onPress={onAnother} hitSlop={10}>
              <Icon name="refresh" size={18} color={p.text2} />
            </Pressable>
          )
        }
      />
      <T v="title">{free ? 'Whatever is on your mind.' : (thought?.question ?? 'Your reflection')}</T>
      <T tone="text2">{free ? 'No question, no shape to fill. Just your words.' : thought?.lead}</T>
      {!free && thought && (
        <View style={{ flexDirection: 'row' }}>
          <View style={{ backgroundColor: p.accentWash, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
            <T v="tiny" tone="accent" bold>
              {thought.why}
            </T>
          </View>
        </View>
      )}
      <View style={{ backgroundColor: p.surface, borderColor: p.control, borderWidth: 1, borderRadius: radius.lg }}>
        <TextInput
          multiline
          value={text}
          onChangeText={(t) => {
            setText(t)
            saveDraft(space, t)
          }}
          placeholder="Start writing here…"
          placeholderTextColor={p.muted}
          accessibilityLabel={free ? 'Write freely' : (thought?.question ?? 'Your reflection')}
          style={{ minHeight: 160, padding: 16, fontFamily: font.regular, ...typeScale.reading, color: p.text, textAlignVertical: 'top' }}
        />
        <View style={{ borderTopWidth: 1, borderTopColor: p.line, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'flex-end' }}>
          <T v="small" tone="muted">
            {countWords(text) === 1 ? '1 word' : `${countWords(text)} words`}
          </T>
        </View>
      </View>
      <SpeakInstead
        onText={(t) => {
          const next = addSpoken(text, t)
          setText(next)
          saveDraft(space, next)
        }}
      />
      <Private>{PRIVACY_LINE}</Private>
      <Button label="Save reflection" iconAfter="arrow" disabled={!text.trim()} onPress={save} />
    </Tinted>
  )
}

// A kinder look, after harsh words about oneself (shared kinder.ts): the
// feeling first, one gentle question, the wider view, the person's own good
// words, and a friend's eyes. Read on this phone; nothing is sent.
function KinderCard({ reading, onWrite }: { reading: Extract<Reading, { kind: 'hard' }>; onWrite: () => void }) {
  const p = useTheme()
  const [look] = useState(() =>
    kinderLook(reading, {
      goodThings: allGoodThings().flatMap((g) => g.lines.map((text) => ({ date: g.date, text }))),
      kept: keptCards()
        .filter((c) => !c.private)
        .map((c) => ({ date: c.date, text: c.headline })),
    }),
  )
  return (
    <Card style={{ gap: 14 }}>
      <CardHead icon="heart" tone="rose" v="h2" title={KINDER_TITLE} />
      {look.lines.slice(0, -1).map((line) => (
        <T key={line} tone="text2">
          {line}
        </T>
      ))}
      {look.evidence && (
        <View style={{ gap: 4, borderLeftWidth: 3, borderLeftColor: p.leaf, paddingLeft: 14 }}>
          <T v="eyebrow" tone="leaf">
            {look.evidence.lead}
          </T>
          <T v="quote" style={typeScale.body}>
            “{look.evidence.text}”
          </T>
        </View>
      )}
      <T bold>{look.lines[look.lines.length - 1]}</T>
      <Button small label={KINDER_WRITE} icon="pencil" onPress={onWrite} />
    </Card>
  )
}
