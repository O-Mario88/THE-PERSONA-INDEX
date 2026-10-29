// The story-first Mirrors (Edwin, 2026-10-26). A story first,
// built only from real answers; then what they revealed, what helped, the
// people, the person's own words and one gentle direction. Every finding
// has "Why am I seeing this?" and can be answered with That's me / Partly /
// Not me. The older, fuller view stays under "Explore deeper". The rules all
// live in the shared mirrorStory.ts and mirrorChoices.ts.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react'
import { Linking, Pressable, Share, View } from 'react-native'
import { TextInput } from '../ui/textScale'
import Svg, { Circle, Path } from 'react-native-svg'
import { getPeriodMirror, PERIODS_BACK, type Mirror as MirrorData, type PeriodMirror } from '@shared/api'
import { connectionBetween } from '@shared/connection'
import { checkIns, heldBack, stepKey, stepWords } from '@shared/growthJourney'
import { loadMoves } from '@shared/moves'
import { getNotAlone, type NotAloneQuestion } from '@shared/insights'
import { reflectSettings, threadsBetween } from '@shared/journal'
import {
  answerStillImportant,
  chooseDirection,
  directionChoice,
  fitOf,
  keepLetter,
  keepProud,
  proudOf,
  rememberFit,
  stillImportant,
  undoDirection,
  type StillImportant,
} from '@shared/mirrorChoices'
import {
  areaPatterns,
  chapterOf,
  changeRows,
  earlierIntention,
  getOthersHelped,
  helpedFor,
  helpedSentence,
  HELPED_NOTE,
  HELPED_PILL,
  monthThemes,
  NEED_NAMES,
  NEED_PHRASES,
  NEED_PLAIN,
  needsOfYear,
  notAlonePicks,
  observations,
  othersHelped,
  ownWordsPick,
  periodNeeds,
  periodStory,
  say,
  sharedMoment,
  weekDirection,
  weekStory,
  whenSaid,
  wordsRemembered,
  yearStory,
  type Chapter,
  type ChangeRow,
  type Direction,
  type EvidenceItem,
  type HelpedItem,
  type HelpedOutcome,
  type NotAlonePick,
  type Observation,
  type OthersPick,
  type OthersStep,
  type SharedMoment,
  type Span,
  type Story,
} from '@shared/mirrorStory'
import { leanings, periodName, weekRange } from '@shared/mirrorText'
import { checkIntention, intentions, reflections } from '@shared/notebook'
import { checkPattern, hasPatterns, patternCheckOf } from '@shared/patterns'
import { helplineHere, loadPrefs, pulseOn } from '@shared/prefs'
import { leaningVerdict, loadHistory, notMeSides, rememberLeaning } from '@shared/profile'
import { font, radius, useTheme, typeScale } from '../theme'
import { Icon, type IconName } from '../ui/Icon'
import { DepthSwitch, useDeeper } from '../ui/Depth'
import { Button, Chip, T, Tinted } from '../ui/kit'
import { CardHead, Disc, type Tone } from '../ui/parts'
import { PrepareSheet } from './ConversationSheet'
import { PairWeekCard } from './WalkAlongside'
import { CircleLine, InConnection, MirrorPatterns, MirrorThreads, showConnection } from './MirrorBits'
import { locale } from '@shared/locale'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ---- jumping to a section ----

// Each page keeps its sections' views by id, so the quick links under the
// story can scroll the page to them.
export type Host = ComponentRef<typeof View>
type Jumps = { refs: Map<string, Host>; jumpTo?: (v: Host) => void }
const JumpContext = createContext<Jumps | null>(null)

function useJumps(jumpTo?: (v: Host) => void): Jumps {
  const refs = useRef(new Map<string, Host>()).current
  return useMemo(() => ({ refs, jumpTo }), [refs, jumpTo])
}

function useSectionRef(id: string) {
  const jumps = useContext(JumpContext)
  return (v: Host | null) => {
    if (!jumps) return
    if (v) jumps.refs.set(id, v)
    else jumps.refs.delete(id)
  }
}

// ---- the shared parts (MirrorParts.tsx) ----

function StoryHero({ eyebrow, story, meta, span }: { eyebrow: string; story: Story; meta?: string; span: Span }) {
  const p = useTheme()
  return (
    <View style={{ backgroundColor: p.navy, borderRadius: radius.xl, overflow: 'hidden' }}>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 150 }}>
        <HeroArt />
      </View>
      <View style={{ padding: 22, paddingBottom: 72, gap: 12 }}>
        <T v="eyebrow" tone="onNavy2">
          {eyebrow}
        </T>
        <T v="quote" tone="onNavy" style={typeScale.title}>
          {story.headline}
        </T>
        <View style={{ width: 40, height: 3, borderRadius: 2, backgroundColor: p.brandLime }} />
        {story.paragraphs.map((x, i) => (
          <T key={i} style={{ color: '#eef3f6', ...typeScale.reading }}>
            {x}
          </T>
        ))}
        {meta ? (
          <T v="small" tone="onNavy2">
            {meta}
          </T>
        ) : null}
        {story.evidence.length > 0 && <Why items={story.evidence} span={span} label="What this is built from" onDark />}
      </View>
    </View>
  )
}

// A calm horizon, drawn rather than photographed. Decoration only.
function HeroArt() {
  const p = useTheme()
  return (
    <Svg width="100%" height="100%" viewBox="0 0 800 300" preserveAspectRatio="xMidYMax slice">
      <Circle cx={610} cy={190} r={46} fill={p.brandLime} opacity={0.55} />
      <Path d="M0 230 L120 170 L210 205 L330 130 L450 200 L560 150 L690 210 L800 165 L800 300 L0 300 Z" fill={p.dark ? '#1a3d54' : '#0d5275'} opacity={0.55} />
      <Path d="M0 255 L150 215 L280 245 L420 205 L560 248 L700 222 L800 240 L800 300 L0 300 Z" fill={p.dark ? '#0b1a24' : '#002b40'} opacity={0.7} />
    </Svg>
  )
}

type Jump = { id: string; icon: IconName; tone: Tone; title: string; note: string }

function JumpRow({ jumps }: { jumps: Jump[] }) {
  const p = useTheme()
  const ctx = useContext(JumpContext)
  if (jumps.length === 0) return null
  return (
    <View accessibilityLabel="In this Mirror" style={{ gap: 2 }}>
      {jumps.map((j) => (
        <Pressable
          key={j.id}
          accessibilityRole="button"
          accessibilityLabel={j.title}
          onPress={() => {
            const v = ctx?.refs.get(j.id)
            if (v && ctx?.jumpTo) ctx.jumpTo(v)
          }}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}
        >
          <Disc icon={j.icon} tone={j.tone} size={40} />
          <View style={{ flex: 1 }}>
            <T bold>{j.title}</T>
            <T v="small" tone="muted">
              {j.note}
            </T>
          </View>
          <Icon name="chevron" size={16} color={p.muted} />
        </Pressable>
      ))}
    </View>
  )
}

function Section({ id, icon, tone = 'green', title, note, children }: { id: string; icon: IconName; tone?: Tone; title: string; note?: string; children: ReactNode }) {
  const ref = useSectionRef(id)
  return (
    <View ref={ref} collapsable={false} style={{ gap: 14 }}>
      <View style={{ gap: 6 }}>
        <CardHead icon={icon} tone={tone} title={title} />
        {note ? (
          <T v="small" tone="muted">
            {note}
          </T>
        ) : null}
      </View>
      {children}
    </View>
  )
}

function Quiet({ children }: { children: ReactNode }) {
  return <T tone="text2">{children}</T>
}

function Fine({ children }: { children: ReactNode }) {
  return (
    <T v="tiny" tone="muted">
      {children}
    </T>
  )
}

function Quote({ text, when }: { text: string; when?: string }) {
  const p = useTheme()
  return (
    <View style={{ borderLeftWidth: 3, borderLeftColor: p.purple, paddingLeft: 14, gap: 4 }}>
      <T style={{ fontFamily: font.semibold, ...typeScale.sub }}>“{text}”</T>
      {when ? <Fine>{when}</Fine> : null}
    </View>
  )
}

function Row({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
}

// "Why am I seeing this?": the answers, dates and words a line rests on.
function Why({ items, span, label, onDark }: { items: EvidenceItem[]; span: Span; label?: string; onDark?: boolean }) {
  const p = useTheme()
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null
  const shown = items.slice(0, 8)
  const ink = onDark ? p.onNavy : p.accentInk
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        hitSlop={6}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}
      >
        <T v="small" bold style={{ color: ink }}>
          {label ?? (items.length === 1 ? 'Seen in 1 answer' : `Seen in ${items.length} answers`)}
        </T>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <Icon name="chevron" size={14} color={ink} />
        </View>
      </Pressable>
      {open && (
        <View
          style={{
            gap: 8,
            padding: 14,
            borderRadius: radius.md,
            backgroundColor: onDark ? 'rgba(255,255,255,0.08)' : p.surface2,
          }}
        >
          <T v="small" style={{ color: onDark ? p.onNavy2 : p.text2 }}>
            Why am I seeing this? Because of these, from your own record:
          </T>
          {shown.map((e, i) => (
            <View key={`${e.date}-${i}`} style={{ gap: 2 }}>
              {e.date ? (
                <T v="tiny" style={{ color: onDark ? p.onNavy2 : p.muted }}>
                  {whenSaid(e.date, span === 'week' ? 'week' : 'month')}
                </T>
              ) : null}
              {e.asked ? (
                <T v="small" style={{ color: onDark ? p.onNavy : p.text }}>
                  {e.asked}
                </T>
              ) : null}
              {e.said ? (
                <T v="small" bold style={{ color: onDark ? p.onNavy : p.text }}>
                  You chose “{e.said}”.
                </T>
              ) : null}
            </View>
          ))}
          {items.length > shown.length && (
            <T v="small" style={{ color: onDark ? p.onNavy2 : p.muted }}>
              And {items.length - shown.length} more.
            </T>
          )}
        </View>
      )}
    </View>
  )
}

type FitValue = 'me' | 'partly' | 'not_me'
const FIT_REPLY: Record<FitValue, string> = {
  me: 'Noted. You said this is you.',
  partly: 'Noted. You said it’s partly you.',
  not_me: 'Thank you. It won’t be read as you again unless new answers say otherwise.',
}

// "That's me", "Partly", "Not me": every interpretation can be challenged.
function Fit({ value, onFit }: { value: FitValue | null; onFit: (v: FitValue) => void }) {
  const [said, setSaid] = useState<FitValue | null>(value)
  if (said) return <Fine>{FIT_REPLY[said]}</Fine>
  return (
    <View accessibilityLabel="Does this sound like you?">
      <Row>
        {(
          [
            ['me', 'That’s me'],
            ['partly', 'Partly'],
            ['not_me', 'Not me'],
          ] as const
        ).map(([v, label]) => (
          <Chip
            key={v}
            label={label}
            onPress={() => {
              onFit(v)
              setSaid(v)
            }}
          />
        ))}
      </Row>
    </View>
  )
}

function Pill({ outcome }: { outcome: HelpedOutcome }) {
  const p = useTheme()
  const [bg, fg] = outcome === 'helped' || outcome === 'some' ? [p.accentWash, p.leaf] : outcome === 'testing' ? [p.amberWash, p.amberInk] : [p.surface2, p.text2]
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: bg, alignSelf: 'flex-start' }}>
      <T v="tiny" bold style={{ color: fg }}>
        {HELPED_PILL[outcome]}
      </T>
    </View>
  )
}

// What the person tried and said about it: one row each, never a score.
function HelpedList({ items, span }: { items: HelpedItem[]; span: Span }) {
  const p = useTheme()
  return (
    <View>
      {items.map((i, n) => (
        <View key={i.text} style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, borderTopWidth: n === 0 ? 0 : 1, borderTopColor: p.line }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T bold>{i.text}</T>
            <T v="small" tone="muted">
              {HELPED_NOTE[i.outcome]}
              {i.times > 1 ? ` ${span === 'week' ? 'This week' : 'So far'}: ${i.times} times.` : ''}
            </T>
          </View>
          <Pill outcome={i.outcome} />
        </View>
      ))}
    </View>
  )
}

function Bar({ part, small }: { part: number; small?: boolean }) {
  const p = useTheme()
  return (
    <View style={{ flex: small ? 1 : undefined, height: small ? 6 : 8, borderRadius: radius.pill, backgroundColor: p.surface2, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(2, Math.min(100, Math.round(part * 100)))}%`, height: '100%', borderRadius: radius.pill, backgroundColor: p.leaf }} />
    </View>
  )
}

// You're not alone: real counts, past the privacy threshold. It says the
// experience is shared, nothing more.
function NotAloneView({ picks }: { picks: NotAlonePick[] }) {
  return (
    <View style={{ gap: 16 }}>
      {picks.map((x) => (
        <View key={x.questionId} style={{ gap: 6 }} accessible accessibilityLabel={`${x.same} of ${x.total} people chose “${x.label}” too, when asked: ${x.prompt}`}>
          <T v="h3">
            {x.same.toLocaleString(locale())} of {x.total.toLocaleString(locale())} people
          </T>
          <T v="small" tone="text2">
            chose “{x.label}” too, when asked: {x.prompt}
          </T>
          <Bar part={x.same / Math.max(1, x.total)} />
        </View>
      ))}
    </View>
  )
}

// The moments we share: a move towards someone that the person recorded, in
// their words, and what it taught them, written privately in Reflect.
function MomentView({ moment, onWrite }: { moment: SharedMoment; onWrite?: (prompt: string) => void }) {
  const prompt = moment.prompt
  return (
    <View style={{ gap: 6 }}>
      <T>{moment.line}</T>
      {moment.ask ? <T bold>{moment.ask}</T> : null}
      {prompt && onWrite ? <Button kind="text" small label="Write about it, privately" iconAfter="arrow" onPress={() => onWrite(prompt)} style={{ alignSelf: 'flex-start' }} /> : null}
    </View>
  )
}

function OthersView({ picks }: { picks: OthersPick[] }) {
  return (
    <View style={{ gap: 16 }}>
      {picks.map((x) => (
        <View key={x.step} style={{ gap: 8 }}>
          <T bold>“{x.step}”</T>
          {x.rows.map((r) => (
            <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <T v="small" tone="text2" style={{ width: 110 }}>
                {r.label}
              </T>
              <Bar small part={r.count === null ? 0.03 : r.count / Math.max(1, x.total)} />
              <T v="small" bold style={{ width: 44, textAlign: 'right' }}>
                {r.count === null ? 'a few' : r.count.toLocaleString(locale())}
              </T>
            </View>
          ))}
          <T v="small" tone="text2">
            {x.line}
          </T>
        </View>
      ))}
      <Fine>Voluntary, self-reported outcomes from people who chose to report back. Not a promise that it will work for you.</Fine>
    </View>
  )
}

// In your own words: one line the person wrote in Reflect comes back, read
// on this phone and never sent.
function OwnWordsView({ pick, span }: { pick: { id: string; date: string; sentence: string } | null; span: Span }) {
  const [still, setStill] = useState<StillImportant | null>(() => (pick ? stillImportant(pick.id) : null))
  if (!pick) return <Quiet>Nothing written in Reflect in this {span === 'week' ? 'week' : span} yet. When you write, a line can come back here.</Quiet>
  return (
    <View style={{ gap: 12 }}>
      <Quote text={pick.sentence} when={`Written on ${whenSaid(pick.date, span === 'week' ? 'week' : 'month')}`} />
      <T bold>Does this still feel important to you?</T>
      {still ? (
        <Fine>{still === 'yes' ? 'You said it still matters.' : still === 'changing' ? 'You said it’s changing.' : 'You said it no longer feels important. That is allowed.'}</Fine>
      ) : (
        <Row>
          {(
            [
              ['yes', 'Yes'],
              ['changing', 'It’s changing'],
              ['no', 'Not any more'],
            ] as const
          ).map(([v, label]) => (
            <Chip
              key={v}
              label={label}
              onPress={() => {
                answerStillImportant(pick.id, v)
                setStill(v)
              }}
            />
          ))}
        </Row>
      )}
    </View>
  )
}

function Box({ children }: { children: ReactNode }) {
  return <Tinted tone="amber">{children}</Tinted>
}

function Area({ label, value, onChange, max, lines = 2, id }: { label: string; value: string; onChange: (t: string) => void; max: number; lines?: number; id?: string }) {
  const p = useTheme()
  return (
    <TextInput
      nativeID={id}
      accessibilityLabel={label}
      value={value}
      onChangeText={onChange}
      maxLength={max}
      multiline
      placeholderTextColor={p.muted}
      style={{
        minHeight: 24 * lines + 28,
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
  )
}

// One gentle direction: "I'll try this", "My own idea" or "Not now". Taken
// up, it becomes an intention Reflect checks in on a week later.
function DirectionBox({ span, from, today, direction, title, allowOwn = false }: { span: Span; from: string; today: string; direction: Direction | null; title: string; allowOwn?: boolean }) {
  const ref = useSectionRef('ms-direction')
  const [chosen, setChosen] = useState(() => directionChoice(span, from))
  const [own, setOwn] = useState<string | null>(null)
  if (!direction && !chosen && !allowOwn) return null
  function choose(choice: 'try' | 'own' | 'not_now', text?: string) {
    chooseDirection(span, from, choice, direction?.key ?? 'own', today, text)
    setChosen(directionChoice(span, from))
    setOwn(null)
  }
  return (
    <View ref={ref} collapsable={false}>
      <Box>
        <View style={{ gap: 6 }}>
          <CardHead icon="arrow" tone="amber" title={title} />
          {direction && <T v="quote">{direction.text}</T>}
          {direction && (
            <T v="small" tone="muted">
              {direction.why}
            </T>
          )}
        </View>
        {chosen ? (
          <View style={{ gap: 4 }}>
            <T v="small" tone="text2">
              {chosen.choice === 'try'
                ? 'Kept as an intention. Reflect will ask how it went in a week.'
                : chosen.choice === 'own'
                  ? 'Your own idea is kept as an intention. Reflect will ask how it went in a week.'
                  : 'Put away for now. Nothing else will be suggested in its place.'}
            </T>
            <Button
              kind="text"
              small
              label="Change"
              onPress={() => {
                undoDirection(span, from)
                setChosen(null)
              }}
              style={{ alignSelf: 'flex-start' }}
            />
          </View>
        ) : own !== null ? (
          <View style={{ gap: 10 }}>
            <T v="small" bold>
              Your own idea, in a few words
            </T>
            <Area label="Your own idea, in a few words" value={own} onChange={setOwn} max={200} />
            <Row>
              <Button small label="Keep it" disabled={!own.trim()} onPress={() => own.trim() && choose('own', own)} />
              <Chip label="Cancel" onPress={() => setOwn(null)} />
            </Row>
          </View>
        ) : (
          <Row>
            {direction && <Button small label="I’ll try this" onPress={() => choose('try', direction.text)} />}
            <Chip label="My own idea" onPress={() => setOwn('')} />
            <Chip label="Not now" onPress={() => choose('not_now')} />
          </Row>
        )}
      </Box>
    </View>
  )
}

// Two reading depths: the essential Mirror, and the whole of it.
function Deeper({ deep, children }: { deep: boolean; children: ReactNode }) {
  return deep ? (
    <View accessibilityLabel="Explore deeper" style={{ gap: 20 }}>
      {children}
    </View>
  ) : null
}

function Changes({ rows, head = ['Earlier in your journey', 'More recently'] }: { rows: ChangeRow[]; head?: [string, string] }) {
  const p = useTheme()
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {head.map((h) => (
          <T key={h} v="label" style={{ flex: 1 }}>
            {h}
          </T>
        ))}
      </View>
      {rows.map((c) => (
        <View key={c.key} style={{ gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: p.line }}>
          <T bold>{c.area}</T>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {[c.earlier, c.recent].map((x, i) => (
              <View key={i} style={{ flex: 1, gap: 2 }}>
                <Fine>{x.when}</Fine>
                <T v="small">{x.text}</T>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}

function Strengths({ strength, explore }: { strength: string; explore: string }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ gap: 2 }}>
        <T v="label">Strength worth appreciating</T>
        <T>{strength}</T>
      </View>
      <View style={{ gap: 2 }}>
        <T v="label">Something to explore</T>
        <T>{explore}</T>
      </View>
    </View>
  )
}

function Page({ jumps, children }: { jumps: Jumps; children: ReactNode }) {
  return (
    <JumpContext.Provider value={jumps}>
      <View style={{ gap: 28 }}>{children}</View>
    </JumpContext.Provider>
  )
}

// ---- Your Sunday Mirror (MirrorWeek.tsx) ----

export function SundayMirror({
  m,
  today,
  back,
  onOpenChoices,
  onWrite,
  jumpTo,
  deeper,
  footer,
}: {
  m: MirrorData
  today: string
  back: number
  onOpenChoices?: () => void
  onWrite?: (prompt: string) => void
  jumpTo?: (v: Host) => void
  deeper: ReactNode
  footer: ReactNode
}) {
  const jumps = useJumps(jumpTo)
  const [deep, setDeep] = useDeeper('mirror')
  const [, setTick] = useState(0)
  const history = useMemo(loadHistory, [m])
  const notMe = notMeSides(today)
  const leans = leanings(m.traits, notMe)
  // A step marked this week counts this week, whenever it was saved; its
  // check-in, when there is one, says how it went.
  const steps = useMemo(() => m.steps.map((s) => ({ ...s, started: s.started < m.from ? m.from : s.started })), [m])
  const checks = useMemo(checkIns, [m])
  const helped = useMemo(() => helpedFor(m.from, m.to, { steps, intentions: intentions(), checks }), [m, steps, checks])
  const connection = connectionBetween(m.from, m.to)
  const moment = sharedMoment({ from: m.from, to: m.to, history, steps, checks, connection })
  const story = weekStory({
    from: m.from,
    to: m.to,
    history,
    answers: m.stats.answers,
    heavy: m.lowMood,
    lean: leans[0] ? { headline: leans[0].side.headline, lean: leans[0].side.lean } : null,
    helped,
    connection,
  })
  const found = observations({ from: m.from, to: m.to, today, history, leans })
  const pulse = pulseOn(loadPrefs())
  const [counts, setCounts] = useState<NotAloneQuestion[] | null>(null)
  const [others, setOthers] = useState<OthersStep[] | null>(null)
  useEffect(() => {
    let live = true
    if (pulse) getNotAlone(today).then((c) => live && setCounts(c))
    getOthersHelped().then((s) => live && setOthers(s))
    return () => {
      live = false
    }
  }, [today, pulse])
  const alone = notAlonePicks(history, m.from, m.to, counts)
  const othersPicks = othersHelped(history, m.from, m.to, others)
  const words = reflectSettings().reflectionsInMirror ? ownWordsPick(reflections(), m.from, m.to) : null
  // Never a step they said made things harder, unless they choose it again.
  const held = heldBack(loadMoves(), checks)
  const direction = weekDirection({ from: m.from, history, helped, nextStep: m.nextSteps.find((s) => !held.has(stepKey(s.step)))?.step })
  const helpedLine = helpedSentence(helped)
  const connected = showConnection(m.from, m.to)
  const revealed = `${found.length === 1 ? 'One thing' : `${cap(say(found.length))} things`}`

  const jumpList = [
    found.length > 0 && { id: 'ms-revealed', icon: 'leaf', tone: 'green', title: `${revealed} revealed`, note: 'What stood out this week' },
    ((pulse && alone.length > 0) || moment) && { id: 'ms-alone', icon: 'people', tone: 'blue', title: 'The moments we share', note: 'Shared experiences' },
    (helped.length > 0 || othersPicks.length > 0) && { id: 'ms-helped', icon: 'bulb', tone: 'amber', title: 'What helped', note: othersPicks.length ? 'For you and others' : 'What you tried' },
    connected && { id: 'ms-connection', icon: 'heart', tone: 'rose', title: 'Your connections', note: 'Support and encouragement' },
  ].filter(Boolean) as Jump[]

  const eyebrow = back === 0 ? 'Your Sunday Mirror' : `Your Sunday Mirror · ${weekRange(m.from)}`
  const meta = m.stats.answers > 0 ? `${m.stats.answers} ${m.stats.answers === 1 ? 'answer' : 'answers'} on ${say(m.stats.daysActive)} ${m.stats.daysActive === 1 ? 'day' : 'days'}` : undefined

  return (
    <Page jumps={jumps}>
      <StoryHero eyebrow={eyebrow} story={story} meta={meta} span="week" />

      {m.lowMood && (
        <Tinted tone="rose">
          <T>Some of your answers this week sounded heavy. If things feel hard, talking to someone you trust, or to a helpline, can help.</T>
          <Button kind="text" small label="Find a helpline in your country" onPress={() => Linking.openURL(helplineHere())} style={{ alignSelf: 'flex-start' }} />
        </Tinted>
      )}

      <JumpRow jumps={jumpList} />

      {found.length > 0 && (
        <Section id="ms-revealed" icon="leaf" title={`${revealed} your answers revealed`} note="Based on your daily answers. Not labels: what your answers suggest.">
          {found.map((o, i) => (
            <ObservationCard key={o.key} o={o} n={i + 1} today={today} onFit={() => setTick((t) => t + 1)} />
          ))}
        </Section>
      )}

      {helped.length > 0 && (
        <Section id="ms-helped" icon="check" title="What helped you this week?" note="Based on the steps you chose to try, in your own words.">
          {helpedLine ? <T v="quote" style={typeScale.sub}>{helpedLine}</T> : null}
          <HelpedList items={helped} span="week" />
        </Section>
      )}

      <Section id="ms-words" icon="notebook" tone="purple" title="In your own words" note="From your private reflections, only on this phone.">
        <OwnWordsView pick={words} span="week" />
      </Section>

      <Section id="ms-alone" icon="people" tone="blue" title="The moments we share">
        {/* Alongside the one person someone walks with (Edwin's brief, 2026-10-29). */}
        <PairWeekCard from={m.from} />
        {pulse && alone.length > 0 && (
          <>
            <NotAloneView picks={alone} />
            <Fine>Real counts, shown only once enough people have answered. Shared, not a sign that one answer is right.</Fine>
          </>
        )}
        {moment && <MomentView moment={moment} onWrite={onWrite} />}
        {!pulse ? (
          <>
            <Quiet>The Human Pulse is switched off, so no numbers show here. You can turn it back on in You, under Privacy and choices.</Quiet>
            {onOpenChoices && <Button kind="text" small label="Privacy and choices" onPress={onOpenChoices} style={{ alignSelf: 'flex-start' }} />}
          </>
        ) : alone.length === 0 && !moment ? (
          <Quiet>The picture is still forming for this week’s questions.</Quiet>
        ) : null}
      </Section>

      {othersPicks.length > 0 && (
        <Section id={helped.length ? 'ms-helped-others' : 'ms-helped'} icon="bulb" tone="amber" title="What helped people" note="For a step one of your answers offered">
          <OthersView picks={othersPicks} />
        </Section>
      )}

      {connected && (
        <Section id="ms-connection" icon="heart" tone="rose" title="Your week in connection">
          <InConnection from={m.from} to={m.to} span="week" />
          <CircleLine own={m.traits} />
        </Section>
      )}

      <DirectionBox span="week" from={m.from} today={today} direction={direction} title="One gentle direction for next week" />

      <DepthSwitch deep={deep} onChange={setDeep} />
      <Deeper deep={deep}>{deeper}</Deeper>
      {/* The conversation sheet (Edwin's brief, 2026-10-29), at the bottom of the Sunday Mirror. */}
      <PrepareSheet today={today} />
      {footer}
    </Page>
  )
}

const FIT_TO_CHECK = { me: 'yes', partly: 'partly', not_me: 'no' } as const
const CHECK_TO_FIT = { yes: 'me', partly: 'partly', no: 'not_me' } as const

function ObservationCard({ o, n, today, onFit, span = 'week' }: { o: Observation; n: number; today: string; onFit?: () => void; span?: Span }) {
  const p = useTheme()
  const initial: FitValue | null =
    o.kind === 'need' && o.need
      ? (() => {
          const c = patternCheckOf(o.need)
          return c ? CHECK_TO_FIT[c.check] : null
        })()
      : o.trait
        ? leaningVerdict(o.trait, !!o.high, today)
        : null
  function fit(v: FitValue) {
    if (o.kind === 'need' && o.need) checkPattern(o.need, FIT_TO_CHECK[v], today)
    else if (o.trait) rememberLeaning(o.trait, !!o.high, v, today)
    onFit?.()
  }
  return (
    <View style={{ gap: 10, paddingTop: n === 1 ? 0 : 16, borderTopWidth: n === 1 ? 0 : 1, borderTopColor: p.line }}>
      <T v="h3">
        <T v="h3" tone="accent">
          {n}.
        </T>{' '}
        {o.title}
      </T>
      <Strengths strength={o.strength} explore={o.explore} />
      <Why items={o.evidence} span={span} label={o.seen === 1 ? 'Seen in 1 answer' : `Seen in ${o.seen} answers`} />
      <Fit value={initial} onFit={fit} />
    </View>
  )
}

// ---- the month and the quarter (MirrorPeriodStory.tsx) ----

export function PeriodStory({ p: pm, today, back, jumpTo, deeper, footer }: { p: PeriodMirror; today: string; back: number; jumpTo?: (v: Host) => void; deeper: ReactNode; footer: ReactNode }) {
  const p = useTheme()
  const jumps = useJumps(jumpTo)
  const noun = pm.period
  const [deep, setDeep] = useDeeper('mirror')
  const [showAll, setShowAll] = useState(false)
  const [, setTick] = useState(0)
  const history = useMemo(loadHistory, [pm])
  const own = intentions()
  const helped = helpedFor(pm.from, pm.to, { helped: pm.helped, noChange: pm.noChange, intentions: own })
  const story = periodStory(pm, history, helped)
  const areas = areaPatterns(history, pm.from, pm.to)
  const includeReflections = reflectSettings().reflectionsInGrowth || reflectSettings().reflectionsInMirror
  const changes = changeRows({
    p: pm,
    previousName: pm.previousLabel ? periodName(pm.period, pm.previousLabel, false) : null,
    history,
    reflections: reflections(),
    today,
    includeReflections,
  })
  const leans = leanings(pm.traits, notMeSides(today))
  const [others, setOthers] = useState<OthersStep[] | null>(null)
  useEffect(() => {
    let live = true
    getOthersHelped().then((s) => live && setOthers(s))
    return () => {
      live = false
    }
  }, [])
  const lessons = othersHelped(history, pm.from, pm.to, others, undefined, 3)
  const intention = earlierIntention(own, pm.from, pm.to)
  const words = reflectSettings().reflectionsInMirror ? ownWordsPick(reflections(), pm.from, pm.to) : null
  const themes = monthThemes(periodNeeds(pm, history))
  const connected = showConnection(pm.from, pm.to)
  const threads = threadsBetween(pm.from, pm.to).length > 0
  const name = periodName(noun, pm.label)
  const meta = pm.stats.answers > 0 ? `${pm.stats.answers} answers on ${pm.stats.daysActive} days, in ${pm.stats.weeksActive} of ${pm.stats.weeksSoFar} weeks` : undefined
  const patterns = areas.length > 0 || hasPatterns(today)
  const [patternsOpen, setPatternsOpen] = useState(false)

  const jumpList = [
    patterns && { id: 'ms-patterns', icon: 'leaf', tone: 'green', title: 'Your patterns', note: 'What kept coming back' },
    changes.length > 0 && { id: 'ms-changed', icon: 'mountain', tone: 'blue', title: 'What changed', note: `Since last ${noun}` },
    (helped.length > 0 || lessons.length > 0) && { id: 'ms-worked', icon: 'bulb', tone: 'amber', title: 'What worked', note: 'For you and others' },
    connected && { id: 'ms-connection', icon: 'heart', tone: 'rose', title: 'Your connections', note: 'People and support' },
  ].filter(Boolean) as Jump[]

  return (
    <Page jumps={jumps}>
      <StoryHero eyebrow={noun === 'month' ? `Your month in perspective · ${name}` : `Your quarter in perspective · ${name}`} story={story} meta={meta} span={noun} />
      <JumpRow jumps={jumpList} />

      {patterns && (
        <Section id="ms-patterns" icon="leaf" title="Your recurring patterns" note="Across the parts of your life your answers touched. Mixed answers are called uncertain, not forced.">
          {areas.map((a, i) => (
            <View key={a.area} style={{ gap: 8, paddingTop: i === 0 ? 0 : 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: p.line }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                <T bold>{a.areaName}</T>
                {a.need && <Tag>{NEED_NAMES[a.need]}</Tag>}
                {a.uncertain && <Tag quiet>Uncertain</Tag>}
              </View>
              <T>{a.description}</T>
              {a.benefit && (
                <View style={{ gap: 8 }}>
                  <View style={{ gap: 2 }}>
                    <T v="label">What it gives you</T>
                    <T>{a.benefit}</T>
                  </View>
                  <View style={{ gap: 2 }}>
                    <T v="label">What it can cost</T>
                    <T>{a.cost}</T>
                  </View>
                </View>
              )}
              <Why items={a.evidence} span={noun} />
              {!a.uncertain && <Fit value={fitOf(`area.${pm.label}.${a.area}`)} onFit={(v) => rememberFit(`area.${pm.label}.${a.area}`, v)} />}
            </View>
          ))}
          {areas.length > 0 && noun !== 'month' && <Fine>From the answers on this phone, which keeps the last 60 days of them.</Fine>}
          {hasPatterns(today) && (
            <View style={{ gap: 12 }}>
              <Button kind="text" small label={patternsOpen ? 'Hide what you’ve been reaching for' : 'What you’ve been reaching for'} onPress={() => setPatternsOpen(!patternsOpen)} style={{ alignSelf: 'flex-start' }} />
              {patternsOpen && <MirrorPatterns today={today} />}
            </View>
          )}
        </Section>
      )}

      <Section id="ms-changed" icon="mountain" tone="blue" title={`What changed since last ${noun}?`} note="Earlier and more recent, side by side, from your own record. Not every change is an improvement, and that is fine.">
        {changes.length > 0 ? <Changes rows={changes} /> : <Quiet>Not enough on record yet to set earlier against more recent. This fills in once there are answers at least two weeks apart.</Quiet>}
      </Section>

      {leans.length > 0 && (
        <Section id="ms-strengths" icon="star" tone="amber" title="Your strengths and areas to grow" note="What your answers showed, and where there is room to explore.">
          {(showAll ? leans : leans.slice(0, 3)).map((l, i) => (
            <View key={l.read.trait} style={{ gap: 6, paddingTop: i === 0 ? 0 : 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: p.line }}>
              <T v="h3">{l.side.headline}</T>
              <T>
                <T bold>Strength:</T> {l.side.strength}
              </T>
              <T>
                <T bold>To explore:</T> {l.side.grow}
              </T>
              <Fine>
                From {l.read.answers} {l.read.answers === 1 ? 'answer' : 'answers'} in {say(l.read.weeks)} {l.read.weeks === 1 ? 'week' : 'weeks'} this {noun}.
              </Fine>
            </View>
          ))}
          {leans.length > 3 && <Button kind="text" small label={showAll ? 'Show fewer' : `View all ${leans.length}`} onPress={() => setShowAll(!showAll)} style={{ alignSelf: 'flex-start' }} />}
        </Section>
      )}

      {helped.length > 0 && (
        <Section id="ms-worked" icon="check" title="What worked for you" note="Only what you marked yourself. Choosing a step is not the same as it working.">
          {helpedSentence(helped) ? <T v="quote" style={typeScale.sub}>{helpedSentence(helped)}</T> : null}
          <HelpedList items={helped} span={noun} />
        </Section>
      )}

      {(intention || words || threads) && (
        <Section id="ms-memory" icon="notebook" tone="purple" title="Your reflection memory" note="Something from earlier, brought back to ask whether it still matters.">
          {intention && <IntentionAsk id={intention.id} text={intention.text} noun={noun} today={today} onDone={() => setTick((t) => t + 1)} />}
          {words && <OwnWordsView pick={words} span={noun} />}
          {threads && <MirrorThreads from={pm.from} to={pm.to} span={noun} />}
        </Section>
      )}

      {lessons.length > 0 && (
        <Section id={helped.length ? 'ms-lessons' : 'ms-worked'} icon="bulb" tone="amber" title="Lessons from others" note="What people who tried a step from your answers reported">
          <OthersView picks={lessons} />
        </Section>
      )}
      {connected && (
        <Section id="ms-connection" icon="heart" tone="rose" title="Your relationships and connection">
          <InConnection from={pm.from} to={pm.to} span={noun} />
          <CircleLine own={pm.traits} />
        </Section>
      )}
      <ThemeBox noun={noun} from={pm.from} today={today} themes={themes} back={back} />

      <DepthSwitch deep={deep} onChange={setDeep} />
      <Deeper deep={deep}>{deeper}</Deeper>
      {footer}
    </Page>
  )
}

function Tag({ children, quiet }: { children: ReactNode; quiet?: boolean }) {
  const p = useTheme()
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: quiet ? p.surface2 : p.accentWash }}>
      <T v="tiny" bold style={{ color: quiet ? p.text2 : p.leaf }}>
        {children}
      </T>
    </View>
  )
}

const INTENTION_REPLIES = { keep: 'Kept. It is still in your notebook.', let_go: 'Let go. It won’t come back here.' }

function IntentionAsk({ id, text, noun, today, onDone }: { id: string; text: string; noun: string; today: string; onDone: () => void }) {
  const [said, setSaid] = useState<'keep' | 'let_go' | null>(null)
  return (
    <View style={{ gap: 10 }}>
      <T bold>Earlier this {noun}, you wanted to:</T>
      <Quote text={text} />
      <T bold>What have you noticed since then?</T>
      {said ? (
        <Fine>{INTENTION_REPLIES[said]}</Fine>
      ) : (
        <Row>
          <Chip label="It still matters" onPress={() => setSaid('keep')} />
          <Chip
            label="Close it"
            onPress={() => {
              checkIntention(id, 'let_go', today)
              setSaid('let_go')
              onDone()
            }}
          />
        </Row>
      )}
    </View>
  )
}

// One direction for the period ahead: a theme the person picks from what
// their own answers reached for, or their own words. Never a plan.
function ThemeBox({ noun, from, today, themes, back }: { noun: 'month' | 'quarter' | 'year'; from: string; today: string; themes: { need: string; theme: string }[]; back: number }) {
  const [picked, setPicked] = useState<string | null>(null)
  if (back > 0) return null
  const chosen = themes.find((t) => t.need === picked)
  return (
    <View style={{ gap: 16 }}>
      {themes.length > 0 && !chosen && (
        <View style={{ gap: 12 }}>
          <View style={{ gap: 6 }}>
            <CardHead icon="arrow" tone="amber" title={`One direction for the coming ${noun}`} />
            <T v="small" tone="muted">
              A theme from your own answers, if one feels right. Pick one, or none.
            </T>
          </View>
          <Row>
            {themes.map((t) => (
              <Chip key={t.need} label={t.theme} onPress={() => setPicked(t.need)} />
            ))}
          </Row>
        </View>
      )}
      <DirectionBox
        key={picked ?? 'none'}
        span={noun}
        from={from}
        today={today}
        direction={chosen ? { key: `theme.${chosen.need}`, text: chosen.theme, why: 'A theme you picked from your own answers.' } : null}
        title={chosen ? `Your theme for the coming ${noun}` : `Something of your own for the coming ${noun}?`}
        allowOwn
      />
    </View>
  )
}

// ---- My Year in Perspective (MirrorYear.tsx) ----

export function YearMirror({ y, today, back, jumpTo, deeper, footer }: { y: PeriodMirror; today: string; back: number; jumpTo?: (v: Host) => void; deeper: ReactNode; footer: ReactNode }) {
  const p = useTheme()
  const jumps = useJumps(jumpTo)
  const [deep, setDeep] = useDeeper('mirror')
  const quarters = useQuarters(y, today)
  const chapters = [1, 2, 3, 4].map((q) => chapterOf(q, quarters ? quarters[q - 1] : null))
  const story = quarters ? yearStory(chapters, y) : { headline: 'Gathering your year…', paragraphs: [], evidence: [] }
  const history = useMemo(loadHistory, [y])
  const helped = helpedFor(y.from, y.to, { helped: y.helped, noChange: y.noChange, intentions: intentions() })
  const needs = needsOfYear(y, (quarters ?? []).map((q) => (q && q !== 'later' ? q : null)))
  const told = chapters.filter((c) => c.state === 'told')
  const firstTold = told[0]
  const lastTold = told[told.length - 1]
  const pairs = changeRows({
    p: { ...y, previousNeeds: undefined },
    previousName: null,
    history,
    reflections: reflections(),
    today,
    includeReflections: reflectSettings().reflectionsInGrowth || reflectSettings().reflectionsInMirror,
  })
  const remembered = reflectSettings().reflectionsInMirror ? wordsRemembered(reflections(), y.from, y.to) : []
  const connected = showConnection(y.from, y.to)
  const inYear = /^\d{4}$/.test(y.label)

  const jumpList = [
    { id: 'ms-chapters', icon: 'doc', tone: 'blue', title: 'Your chapters', note: 'The year in four parts' },
    y.moments.length > 0 && { id: 'ms-shaped', icon: 'star', tone: 'amber', title: 'What shaped it', note: 'Moments in your answers' },
    needs.length > 0 && { id: 'ms-needs', icon: 'leaf', tone: 'green', title: 'What mattered', note: 'Peace, meaning, connection' },
    { id: 'ms-forward', icon: 'arrow', tone: 'purple', title: 'Carrying forward', note: 'Into next year' },
  ].filter(Boolean) as Jump[]

  return (
    <Page jumps={jumps}>
      <StoryHero
        eyebrow={`My year in perspective · ${y.label}`}
        story={story}
        meta={y.stats.answers > 0 ? `${y.stats.answers.toLocaleString(locale())} answers in ${y.stats.weeksActive} weeks` : undefined}
        span="year"
      />
      <JumpRow jumps={jumpList} />

      <Section id="ms-chapters" icon="doc" tone="blue" title="The chapters of your year" note="One for each quarter, from what was kept of it. A year can be hard, steady, joyful, uncertain, or all four.">
        {chapters.map((c) => (
          <ChapterCard key={c.quarter} c={c} />
        ))}
      </Section>

      {y.moments.length > 0 && (
        <Section id="ms-shaped" icon="star" tone="amber" title="The experiences that shaped your year" note="Questions where your answer said the most. Only what you answered; nothing is assumed about what happened.">
          {y.moments.map((m, i) => (
            <View key={`${m.date}-${m.prompt}`} style={{ gap: 4, paddingTop: i === 0 ? 0 : 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: p.line }}>
              <Fine>{whenSaid(m.date, 'year')}</Fine>
              <T>{m.prompt}</T>
              <T bold>You chose “{m.label}”.</T>
              {m.headline ? <Fine>{m.headline}</Fine> : null}
            </View>
          ))}
        </Section>
      )}

      <Section id="ms-perspective" icon="mountain" tone="blue" title="How your perspective changed" note="Your earliest and latest record, side by side. No growth score: changing is not always better, and staying the same is not always worse.">
        {firstTold && lastTold && firstTold !== lastTold ? (
          <Changes
            head={['Earlier', 'Later']}
            rows={[
              {
                key: 'reached',
                area: 'What your answers reached for most',
                earlier: { when: firstTold.months, text: `${cap(NEED_PHRASES[firstTold.needs[0].need])}, in ${firstTold.needs[0].answers} answers.` },
                recent: { when: lastTold.months, text: `${cap(NEED_PHRASES[lastTold.needs[0].need])}, in ${lastTold.needs[0].answers} answers.` },
              },
              ...pairs,
            ]}
          />
        ) : (
          <Quiet>There is not yet enough dated evidence from different parts of the year to show a change. It will not be guessed.</Quiet>
        )}
      </Section>

      {needs.length > 0 && (
        <Section id="ms-needs" icon="leaf" title="What brought you peace, meaning and connection" note="The needs your choices reached for this year. None is healthier than another.">
          {needs.map((n, i) => (
            <View key={n.need} style={{ gap: 4, paddingTop: i === 0 ? 0 : 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: p.line }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T bold>{NEED_NAMES[n.need]}</T>
                <Tag quiet>{`${n.answers} answers`}</Tag>
              </View>
              <T>{NEED_PLAIN[n.need]}</T>
              {n.example && (
                <Fine>
                  For example, on {whenSaid(n.example.date, 'year')}: {n.example.prompt} You chose “{n.example.label}”.
                </Fine>
              )}
            </View>
          ))}
        </Section>
      )}

      {helped.length > 0 && (
        <Section id="ms-helped" icon="check" title="What helped you through" note="The small steps you tried and what you said about them: knowledge for the years ahead.">
          <HelpedList items={helped} span="year" />
        </Section>
      )}

      <Section id="ms-words" icon="notebook" tone="purple" title="Your words, remembered" note="Reflections you wrote, earliest and latest, side by side. Only on this phone.">
        {remembered.length > 0 ? (
          remembered.map((r) => <Quote key={r.id} text={r.answer.length > 280 ? `${r.answer.slice(0, 279)}…` : r.answer} when={whenSaid(r.date, 'year')} />)
        ) : (
          <OwnWordsView pick={null} span="year" />
        )}
      </Section>

      {connected && (
        <Section id="ms-connection" icon="heart" tone="rose" title="The people and connections that mattered" note="What you did, never who. No rankings.">
          {/* A year's weeks can start in late December; month by month keeps to the calendar year. */}
          <InConnection from={inYear && y.from < `${y.label}-01-01` ? `${y.label}-01-01` : y.from} to={inYear && y.to > `${y.label}-12-31` ? `${y.label}-12-31` : y.to} span="year" />
          <CircleLine own={y.traits} />
        </Section>
      )}
      <Proud year={y.label} />

      <Forward y={y} chapters={chapters} helped={helped.filter((h) => h.outcome === 'helped' || h.outcome === 'some').map((h) => h.text)} today={today} back={back} remembered={remembered} />

      <DepthSwitch deep={deep} onChange={setDeep} />
      <Deeper deep={deep}>{deeper}</Deeper>
      {footer}
    </Page>
  )
}

// Each quarter of the year, read from its own mirror. A quarter that has not
// begun is "later"; one older than the weekly notes kept is null.
function useQuarters(y: PeriodMirror, today: string): (PeriodMirror | null | 'later')[] | null {
  const [quarters, setQuarters] = useState<(PeriodMirror | null | 'later')[] | null>(null)
  useEffect(() => {
    let live = true
    setQuarters(null)
    getPeriodMirror('quarter', today)
      .then(async (now) => {
        const [cy, cq] = now.label.split('-Q').map(Number)
        const year = Number(y.label)
        if (!Number.isInteger(cy) || !Number.isInteger(cq) || !Number.isInteger(year)) {
          if (live) setQuarters([null, null, null, null])
          return
        }
        const out = await Promise.all(
          [1, 2, 3, 4].map(async (q): Promise<PeriodMirror | null | 'later'> => {
            const back = cy * 4 + cq - (year * 4 + q)
            if (back < 0) return 'later'
            if (back > PERIODS_BACK.quarter) return null
            if (back === 0) return now
            return getPeriodMirror('quarter', today, back).catch(() => null)
          }),
        )
        if (live) setQuarters(out)
      })
      .catch(() => live && setQuarters([null, null, null, null]))
    return () => {
      live = false
    }
  }, [y, today])
  return quarters
}

function ChapterCard({ c }: { c: Chapter }) {
  const p = useTheme()
  const quiet = c.state === 'none' || c.state === 'later'
  return (
    <View style={{ gap: 4, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: p.line, backgroundColor: quiet ? 'transparent' : p.surface, borderStyle: quiet ? 'dashed' : 'solid' }}>
      <T v="label">{c.months}</T>
      <T v="quote" style={{ color: quiet ? p.muted : p.text }}>
        {c.title}
      </T>
      {c.state === 'told' && (
        <Fine>
          {c.needs
            .slice(0, 2)
            .map((n) => `${NEED_NAMES[n.need]}: ${n.answers}`)
            .join(' · ')}
        </Fine>
      )}
      {c.state === 'counted' && c.answers > 0 && (
        <Fine>
          {c.answers} answers in {c.weeks} weeks. What they reached for was not yet counted then.
        </Fine>
      )}
      {c.state === 'none' && <Fine>Nothing kept from these months, so nothing is said.</Fine>}
      {c.state === 'later' && <Fine>This chapter has not begun.</Fine>}
      {c.moment && (
        <T v="small">
          {c.moment.prompt} You chose “{c.moment.label}”.
        </T>
      )}
      {c.helped[0] && <T v="small" tone="text2">What helped: “{c.helped[0]}”</T>}
    </View>
  )
}

// What you're proud of: the person's own words, kept in the journal.
function Proud({ year }: { year: string }) {
  const [text, setText] = useState(() => proudOf(year))
  const [saved, setSaved] = useState(false)
  return (
    <View style={{ gap: 10 }}>
      <T v="h3">
        What you’re proud of
      </T>
      <T v="small" tone="text2">
        What is something about this year you’re proud of, even if nobody else noticed?
      </T>
      <Area
        label="What you’re proud of this year"
        value={text}
        lines={4}
        max={1000}
        onChange={(t) => {
          setText(t)
          setSaved(false)
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Button
          small
          label="Keep it"
          onPress={() => {
            keepProud(year, text)
            setSaved(true)
          }}
        />
        {saved && <Fine>Kept, privately, in your journal.</Fine>}
      </View>
      <Fine>Only yours. It is encrypted with your journal and never shared.</Fine>
    </View>
  )
}

// What you're carrying forward, a letter to your future self, and a private
// copy of the year to keep (the web prints it; the phone hands it to the
// share sheet, where it can be saved to Files or Notes).
function Forward({
  y,
  chapters,
  helped,
  today,
  back,
  remembered,
}: {
  y: PeriodMirror
  chapters: Chapter[]
  helped: string[]
  today: string
  back: number
  remembered: { answer: string; date: string }[]
}) {
  const ref = useSectionRef('ms-forward')
  const [letter, setLetter] = useState('')
  const [kept, setKept] = useState(false)
  const [withWords, setWithWords] = useState(false)
  const lastTold = [...chapters].reverse().find((c) => c.state === 'told')
  const lines: string[] = []
  if (lastTold) lines.push(`What still matters, by your latest answers: ${NEED_PHRASES[lastTold.needs[0].need]}.`)
  if (helped[0]) lines.push(`What you learned helps you: “${stepWords(helped[0])}”${helped[1] ? ` and “${stepWords(helped[1])}”` : ''}.`)
  if (y.noChange && y.noChange[0]) lines.push(`What made little difference, and is fine to leave: “${stepWords(y.noChange[0].step)}”.`)

  function copy() {
    const parts = [`My year in perspective · ${y.label}`, '', ...chapters.map((c) => `${c.months}: ${c.title}`), '', ...lines]
    if (withWords && remembered.length) parts.push('', ...remembered.map((r) => `${whenSaid(r.date, 'year')}: “${r.answer}”`))
    parts.push('', 'Something to think about, never a diagnosis.')
    Share.share({ message: parts.join('\n') }).catch(() => {})
  }

  return (
    <View ref={ref} collapsable={false} style={{ gap: 12 }}>
      <T v="h3">
        What you’re carrying forward
      </T>
      {lines.length > 0 ? lines.map((l) => <T key={l}>• {l}</T>) : <Quiet>As the year fills in, what you learned and what still matters gathers here.</Quiet>}
      {back === 0 && (
        <View style={{ gap: 8 }}>
          <T v="small" bold>
            Write a letter to your future self
          </T>
          <Fine>Optional, and only in your words. It is kept in your encrypted journal, in Reflect.</Fine>
          <Area label="A letter to your future self" value={letter} onChange={setLetter} max={4000} lines={5} />
          <Button
            small
            label={kept ? 'Kept in your journal' : 'Keep my letter'}
            disabled={!letter.trim() || kept}
            onPress={() => {
              keepLetter(y.label, letter, today)
              setKept(true)
            }}
            style={{ alignSelf: 'flex-start' }}
          />
        </View>
      )}
      <View style={{ gap: 8 }}>
        <Row>
          <Chip label="Include my own words" on={withWords} onPress={() => setWithWords(!withWords)} />
          <Chip label="Save a copy" onPress={copy} />
        </Row>
        <Fine>Made on this phone. Your journal text is left out unless you choose to include it.</Fine>
      </View>
    </View>
  )
}
