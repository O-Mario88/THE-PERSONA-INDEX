// Reflect: a quiet
// space for your thoughts. Writing first, with one question made on this
// device from the person's own answers, cards and earlier words, or none at
// all; then what they have noticed across the parts of their life, earlier
// words, and their choices. Everything stays on this device.
import { writingWaits } from '@shared/vault'
import { useEffect, useMemo, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { cachedEdition, getMirror, recalledChoice, type Mirror, type Question } from '@shared/api'
import { draftOf, reflectSettings, reminderFor, saveDraft, setReflectSettings, type DraftSpace, type ReflectSettings } from '@shared/journal'
import { intentionsDue, keepIntention, keepReflection, keptCards, reflections, type ReflectionArea, type ReflectionPeriod } from '@shared/notebook'
import { noticedFrom, type Noticed, type NoticedSource } from '@shared/noticed'
import { loadHistory } from '@shared/profile'
import { AREA_NAMES, dayMonth, PERIOD_NAMES, reflectionItems } from '@shared/reflect'
import { PRIVACY_LINE } from '@shared/words'
import { addDays } from '@shared/storage'
import { thoughtsFor, type Answered, type Thought } from '@shared/thoughts'
import { BringBack } from './Backup'
import { Notebook } from './Notebook'
import { font, radius, useTheme } from '../theme'
import { Button, Card, Page, T, Tinted, Toggle } from '../ui/kit'
import { Disc, type Tone } from '../ui/parts'
import { Icon, type IconName } from '../ui/Icon'

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
const ICONS: Record<ReflectionArea, IconName> = { work: 'briefcase', school: 'notebook', family: 'heart', culture: 'globe', social: 'people', health: 'leaf', money: 'bars', self: 'you' }
const TONES: Record<ReflectionArea, Tone> = { work: 'blue', school: 'blue', family: 'rose', culture: 'blue', social: 'blue', health: 'green', money: 'amber', self: 'purple' }

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
  name = null,
}: {
  today: string
  questions: Question[]
  mild?: boolean
  startFree?: boolean
  name?: string | null
}) {
  const p = useTheme()
  const [period, setPeriod] = useState<ReflectionPeriod>('day')
  const [free, setFree] = useState(startFree)
  const [at, setAt] = useState(0)
  const [chosen, setChosen] = useState<Thought | null>(null)
  const [mirror, setMirror] = useState<Mirror | null>(null)
  const [settings, setSettings] = useState<ReflectSettings>(reflectSettings)
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
  const noticed = noticedFrom(items, past, settings.reflectionsInNoticed, addDays(today, -30))
  const consider = noticed.find((n) => n.group === 'grow') ?? null

  function changeSettings(next: Partial<ReflectSettings>) {
    setReflectSettings(next)
    setSettings(reflectSettings())
  }

  return (
    <Page
      aside={
        <>
          <Card style={{ flexDirection: 'row', gap: 14 }}>
            <Disc icon="leaf" tone="amber" size={44} />
            <View style={{ flex: 1, gap: 4 }}>
              <T v="h3">A gentle reminder</T>
              <T tone="muted">{reminderFor(today)}</T>
            </View>
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
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <Disc icon="pin" tone="rose" size={44} />
              <View style={{ flex: 1, gap: 8 }}>
                <T v="h3">Something to consider</T>
                <T tone="muted">{consider.text}</T>
                <Button small kind="soft" label="Reflect on this" iconAfter="arrow" onPress={() => setChosen(fromNoticed(consider, period))} />
              </View>
            </View>
          )}
          <Card style={{ gap: 4 }}>
            <T v="h2">Your choices</T>
            <Toggle
              label="Use my reflections in What you’ve noticed"
              note="Only counts of what you wrote about, worked out on this phone. Off unless you turn it on."
              value={settings.reflectionsInNoticed}
              onChange={(on) => changeSettings({ reflectionsInNoticed: on })}
            />
            <Toggle
              label="Show my reflections in Your Growth"
              note="Insights sets an earlier and a more recent reflection side by side, on this phone only. Off unless you turn it on."
              value={settings.reflectionsInGrowth}
              onChange={(on) => changeSettings({ reflectionsInGrowth: on })}
            />
            <Toggle
              label="Let my threads add to the longer Mirrors"
              note="Your month, quarter and year Mirrors show which threads you kept going. Off unless you turn it on."
              value={settings.threadsInMirror}
              onChange={(on) => changeSettings({ threadsInMirror: on })}
            />
            <T v="small" tone="muted" style={{ marginTop: 8 }}>
              🔒 {PRIVACY_LINE}
            </T>
          </Card>
        </>
      }
    >
      <View style={{ gap: 4 }}>
        <T v="display">Reflect</T>
        <T tone="text2">{name ? `A quiet space for your thoughts, ${name}.` : 'A quiet space for your thoughts.'}</T>
      </View>

      <View style={{ flexDirection: 'row', backgroundColor: p.surface, borderColor: p.line, borderWidth: 1, borderRadius: radius.md, padding: 4 }}>
        {(Object.keys(PERIOD_NAMES) as ReflectionPeriod[]).map((pd) => {
          const on = !free && period === pd
          return (
            <Pressable
              key={pd}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => {
                setFree(false)
                setPeriod(pd)
                setAt(0)
                setChosen(null)
              }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.sm, backgroundColor: on ? p.lime : 'transparent' }}
            >
              <Text style={{ fontFamily: font.bold, fontSize: 14, color: on ? p.onLime : p.text }}>{PERIOD_NAMES[pd]}</Text>
            </Pressable>
          )
        })}
      </View>
      <Button kind={free ? 'primary' : 'outline'} small icon="reflect" label="Write freely" onPress={() => setFree(!free)} />

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
      />

      <Card style={{ gap: 14 }}>
        <View style={{ gap: 4 }}>
          <T v="h2">What you’ve noticed</T>
          <T v="small" tone="muted">
            Insights from your answers, your Circle and, if you choose, your reflections.
          </T>
        </View>
        <View style={{ flexDirection: 'row', gap: 20, borderBottomWidth: 1, borderBottomColor: p.line }}>
          {(['strength', 'grow'] as const).map((g) => (
            <Pressable key={g} accessibilityRole="tab" accessibilityState={{ selected: group === g }} onPress={() => setGroup(g)} style={{ paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: group === g ? p.lime : 'transparent' }}>
              <Text style={{ fontFamily: font.bold, fontSize: 15, color: group === g ? p.accentInk : p.muted }}>{g === 'strength' ? 'Strengths' : 'Areas to grow'}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 18 }}>
          {AREAS.map((area) => {
            const item = noticed.find((n) => n.area === area && n.group === group)
            return (
              <Pressable
                key={area}
                disabled={!item}
                onPress={() => item && setChosen(fromNoticed(item, period))}
                style={{ width: '50%', paddingRight: 12, gap: 6 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Disc icon={ICONS[area]} tone={TONES[area]} size={28} />
                  <T v="h3" style={{ fontSize: 16 }}>
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

      <Card>
        <Notebook mild={mild} today={today} />
      </Card>
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
}: {
  today: string
  period: ReflectionPeriod
  free: boolean
  thought: Thought | null
  onAnother: () => void
  onSaved: () => void
  onDone: () => void
}) {
  const p = useTheme()
  const space: DraftSpace = free ? 'free' : period
  const [text, setText] = useState(() => draftOf(space))
  const [saved, setSaved] = useState<string | null>(null)
  const [intention, setIntention] = useState('')
  const [kept, setKept] = useState(false)

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
    setText('')
    saveDraft(space, '')
    setSaved(rid)
  }

  if (saved) {
    return (
      <Tinted>
        <T tone="leaf" bold>
          ✓ Saved, on this phone.
        </T>
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
              style={{ borderWidth: 1.5, borderColor: p.line, backgroundColor: p.surface, borderRadius: radius.md, padding: 14, fontFamily: font.regular, fontSize: 16, color: p.text }}
            />
            <T v="small" tone="muted">
              In a week, a gentle check-in asks how it went. No goals and no scores.
            </T>
            <Button
              small
              kind="outline"
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
    )
  }

  return (
    <Tinted>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: p.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={free ? 'pencil' : 'leaf'} size={22} color={p.leaf} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <T v="eyebrow">{free ? 'Write freely' : 'A thought for you'}</T>
          <T style={{ fontFamily: 'Georgia', fontSize: 24, lineHeight: 30 }}>{free ? 'Whatever is on your mind.' : (thought?.question ?? 'Your reflection')}</T>
        </View>
        {!free && (
          <Pressable accessibilityRole="button" accessibilityLabel="Another question" onPress={onAnother} hitSlop={10}>
            <Icon name="refresh" size={18} color={p.text2} />
          </Pressable>
        )}
      </View>
      <T tone="text2">{free ? 'No question, no shape to fill. Just your words.' : thought?.lead}</T>
      {!free && thought && (
        <View style={{ flexDirection: 'row' }}>
          <View style={{ backgroundColor: p.surface, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
            <T v="tiny" tone="accent" bold>
              {thought.why}
            </T>
          </View>
        </View>
      )}
      <View style={{ backgroundColor: p.surface, borderColor: p.line, borderWidth: 1, borderRadius: radius.lg }}>
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
          style={{ minHeight: 160, padding: 16, fontFamily: font.regular, fontSize: 17, lineHeight: 25, color: p.text, textAlignVertical: 'top' }}
        />
        <View style={{ borderTopWidth: 1, borderTopColor: p.line, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'flex-end' }}>
          <T v="small" tone="muted">
            {countWords(text) === 1 ? '1 word' : `${countWords(text)} words`}
          </T>
        </View>
      </View>
      <T v="small" tone="muted">
        🔒 {PRIVACY_LINE}
      </T>
      <Button label="Save reflection" iconAfter="arrow" disabled={!text.trim()} onPress={save} />
    </Tinted>
  )
}
