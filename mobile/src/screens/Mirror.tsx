// The Mirrors, the fuller view: the week opens first,
// the month, quarter and year look further back. Built by the server from
// this phone's kept answers, so every number is real; a section with nothing
// real in it stays hidden. It sets the person only against their own past.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Pressable, Share, View } from 'react-native'
import {
  getMirror,
  getPeriodMirror,
  PERIODS_BACK,
  WEEKS_BACK,
  wordsBetween,
  type Depth,
  type Level,
  type Mirror as MirrorData,
  type OwnWords,
  type Period,
  type PeriodMirror,
  type StepStatus,
  type ThemeRead,
  type Verdict,
} from '@shared/api'
import {
  AREA_NAMES,
  identityName,
  leanings,
  levelLine,
  levelMeta,
  longDate,
  PERIOD_CLOSE,
  periodName,
  periodSummary,
  sentenceStarter,
  summary,
  tagline,
  title,
  weekRange,
  type Lean,
} from '@shared/mirrorText'
import { setMoveStatus, startMove } from '@shared/moves'
import { NEED_NAMES, NEED_PHRASES } from '@shared/needs'
import {
  changePlan,
  closePlan,
  focusPlan,
  keepSentence,
  lookBack,
  lookBackDue,
  makePlan,
  nameFor,
  noteRevisit,
  plan as loadPlan,
  rename,
  reviseWords,
  sentence,
  sentencesBetween,
  timesDone,
  wordsBackDue,
  type Plan,
  type Revisit,
  type WordsBack,
} from '@shared/notebook'
import { changesBetween, changeWords, leaningVerdict, loadHistory, notMeSides, rememberLeaning, type Change } from '@shared/profile'
import { needsBetween, reachedFor, rememberSafety, safetyAnswer, safetyLed, UNCERTAIN, type NeedRead, type Uncertain } from '@shared/reaching'
import { readFor } from '@shared/reads/reads'
import type { Read } from '@shared/reads/types'
import { outsideMirror, type OutsideMirror as OutsideMirrorData } from '@shared/social'
import { addDays } from '@shared/storage'
import { THEMES, themeName, themeStyle } from '@shared/themes'
import { honestLine, sideOf, TRAITS } from '@shared/traits'
import { useAccount } from '@shared/useAccount'
import {
  CHANGES_NOTE,
  LEANING_REPLIES,
  LOOK_BACK_ASK,
  LOOK_BACK_REPLIES,
  REACHED_NOTE,
  reachedLine,
  REVISIT_NOTE_ASK,
  REVISIT_NOTE_KEPT,
  REVISIT_REPLIES,
  ROUTES_NOT,
  ROUTES_WORKED,
  SAFETY_ASK,
  SAFETY_REPLIES,
  SAFETY_WORDS,
  SAME_FOCUS,
  STEP_STATUS_WORDS,
  SUCCESS_TWO,
  SWAP_NOTE,
  timesDoneLine,
  WORDS_BACK_ASK,
} from '@shared/words'
import { font, radius, type Palette, useTheme } from '../theme'
import { Icon } from '../ui/Icon'
import { Button, Chip, Field, Hairline, T, Tinted } from '../ui/kit'
import { Box, Chips, Eyebrow, Note, Quote } from './MirrorBits'
import { PeriodStory, SundayMirror, YearMirror, type Host } from './MirrorStory'
import { locale } from '@shared/locale'

type Span = 'week' | Period
type State = { kind: 'loading' } | { kind: 'week'; m: MirrorData } | { kind: 'period'; p: PeriodMirror } | { kind: 'error' }

const SPANS: { span: Span; name: string; short: string; adj: string }[] = [
  { span: 'week', name: 'Weekly Mirror', short: 'Weekly', adj: 'weekly' },
  { span: 'month', name: 'Monthly Mirror', short: 'Monthly', adj: 'monthly' },
  { span: 'quarter', name: 'Quarterly Mirror', short: 'Quarterly', adj: 'quarterly' },
  { span: 'year', name: 'Yearly Mirror', short: 'Yearly', adj: 'yearly' },
]
const adjOf = (span: Span) => SPANS.find((s) => s.span === span)!.adj
const mostBack = (span: Span) => (span === 'week' ? WEEKS_BACK : PERIODS_BACK[span])
const MAX_LINE = 140
const MAX_SENTENCE = 200
const MAX_PLAN = 80

type Nav = { onOpenKept: () => void; onCircle?: () => void; onRead?: (r: Read) => void }

export function Mirror({ today, onOpenKept, onCircle, onRead, onOpenSettings, jumpTo }: { today: string; onOpenSettings?: () => void; jumpTo?: (v: Host) => void } & Nav) {
  const p = useTheme()
  const [span, setSpan] = useState<Span>('week')
  const [back, setBack] = useState(0)
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    let live = true
    const load: Promise<State> =
      span === 'week' ? getMirror(today, back).then((m) => ({ kind: 'week', m })) : getPeriodMirror(span, today, back).then((pm) => ({ kind: 'period', p: pm }))
    load.then(
      (next) => live && setState(next),
      () => live && setState({ kind: 'error' }),
    )
    return () => {
      live = false
    }
  }, [today, span, back, attempt])

  function choose(next: Span) {
    if (next === span) return
    setState({ kind: 'loading' })
    setBack(0)
    setSpan(next)
  }
  function step(by: number) {
    const next = Math.min(mostBack(span), Math.max(0, back + by))
    if (next === back) return
    setState({ kind: 'loading' })
    setBack(next)
  }
  const range = state.kind === 'week' ? `Week of ${weekRange(state.m.from)}` : state.kind === 'period' ? periodName(state.p.period, state.p.label) : '…'
  const footer = <Footer onOpenKept={onOpenKept} />

  return (
    <View style={{ gap: 20 }} accessibilityLabel={`Your ${adjOf(span)} mirror`}>
      <View style={{ gap: 4 }}>
        <T v="display">Mirrors</T>
        <T tone="text2">A clearer view of your journey.</T>
      </View>
      <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.md, backgroundColor: p.surface2 }} accessibilityRole="tablist">
        {SPANS.map((s) => (
          <Pressable
            key={s.span}
            accessibilityRole="tab"
            accessibilityLabel={s.name}
            accessibilityState={{ selected: s.span === span }}
            onPress={() => choose(s.span)}
            style={{ flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: s.span === span ? p.surface : 'transparent' }}
          >
            <T v="small" bold tone={s.span === span ? 'text' : 'muted'}>
              {s.short}
            </T>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityLabel="Which one">
        <Icon name="calendar" size={18} color={p.muted} />
        <T v="small" bold style={{ flex: 1 }}>
          {range}
        </T>
        <StepButton icon="back" label={`An earlier ${span}`} disabled={back >= mostBack(span)} onPress={() => step(1)} />
        <StepButton icon="arrow" label={`A later ${span}`} disabled={back === 0} onPress={() => step(-1)} />
      </View>
      {state.kind === 'loading' && (
        <T tone="muted" center style={{ paddingVertical: 32 }}>
          Putting your {span} together…
        </T>
      )}
      {state.kind === 'error' && (
        <View style={{ gap: 12 }}>
          <T>I couldn't load your mirror just now.</T>
          <Button
            small
            label="Try again"
            onPress={() => {
              setState({ kind: 'loading' })
              reload()
            }}
            style={{ alignSelf: 'flex-start' }}
          />
        </View>
      )}
      {state.kind === 'week' && (
        <SundayMirror
          key={state.m.from}
          m={state.m}
          today={today}
          back={back}
          onOpenSettings={onOpenSettings}
          jumpTo={jumpTo}
          footer={footer}
          deeper={<MirrorPage m={state.m} today={today} reload={reload} onCircle={onCircle} onRead={onRead} />}
        />
      )}
      {state.kind === 'period' && state.p.period !== 'year' && (
        <PeriodStory key={state.p.label} p={state.p} today={today} back={back} jumpTo={jumpTo} footer={footer} deeper={<PeriodPage p={state.p} onRead={onRead} />} />
      )}
      {state.kind === 'period' && state.p.period === 'year' && (
        <YearMirror key={state.p.label} y={state.p} today={today} back={back} jumpTo={jumpTo} footer={footer} deeper={<PeriodPage p={state.p} onRead={onRead} />} />
      )}
    </View>
  )
}

function StepButton({ icon, label, disabled, onPress }: { icon: 'back' | 'arrow'; label: string; disabled: boolean; onPress: () => void }) {
  const p = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: p.line, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}
    >
      <Icon name={icon} size={16} color={p.text} />
    </Pressable>
  )
}

// ---- small pieces ----

function Scale({ dots }: { dots: { at: number; color: string }[] }) {
  const p = useTheme()
  return (
    <View style={{ height: 18, justifyContent: 'center' }}>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: p.surface3 }} />
      <View style={{ position: 'absolute', left: '50%', top: 2, bottom: 2, width: 2, marginLeft: -1, backgroundColor: p.lineStrong }} />
      {dots.map((d, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: `${Math.max(0, Math.min(100, d.at))}%`,
            marginLeft: -9,
            width: 18,
            height: 18,
            borderRadius: 9,
            borderWidth: 3,
            borderColor: p.surface,
            backgroundColor: d.color,
          }}
        />
      ))}
    </View>
  )
}

// One ink at three strengths: light is the faintest,
// deep stronger, and deeper the darkest (text colour, or white in dark).
const depthColor = (p: Palette, d: Depth) =>
  d === 'deeper' ? (p.dark ? '#ffffff' : p.text) : d === 'deep' ? `${p.accentInk}${p.dark ? 'BF' : 'A6'}` : d === 'light' ? `${p.accentInk}${p.dark ? '66' : '4D'}` : p.accentInk

function sqStyle(p: Palette, kind: Depth | 'missed' | 'later') {
  const base = { width: 12, height: 12, borderRadius: 3 }
  if (kind === 'private') return { ...base, borderWidth: 1.5, borderColor: p.accentInk }
  if (kind === 'missed' || kind === 'later') return { ...base, borderRadius: 6, borderWidth: 1.5, borderColor: p.lineStrong }
  return { ...base, backgroundColor: depthColor(p, kind) }
}

function Sq({ kind }: { kind: Depth | 'missed' | 'later' }) {
  const p = useTheme()
  return <View style={sqStyle(p, kind)} />
}

function Legend({ items }: { items: [Depth | 'missed', string][] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6 }}>
      {items.map(([k, label]) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Sq kind={k} />
          <T v="tiny" tone="muted">
            {label}
          </T>
        </View>
      ))}
    </View>
  )
}

function ThemeMeta({ theme, children }: { theme?: string; children: ReactNode }) {
  return (
    <T v="small" tone="muted">
      {themeStyle(theme).icon} {children}
    </T>
  )
}

type Part = { key: string; title: string; body: ReactNode; show: boolean }

// numbered lays out the sections that have something real in them, 01, 02…
function numbered(parts: Part[]) {
  return parts
    .filter((x) => x.show)
    .map((x, i) => (
      <View key={x.key} style={{ gap: 14 }}>
        <Hairline />
        <T v="h2">
          <T v="h2" tone="muted">
            {String(i + 1).padStart(2, '0')}
          </T>{' '}
          {x.title}
        </T>
        {x.body}
      </View>
    ))
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const edition = (n: number) => (n > 0 ? ` · Edition #${n}` : '')
const weekday = (iso: string, style: 'short' | 'long' = 'short') => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale(), { weekday: style, timeZone: 'UTC' })
const DEPTH_ANSWER: Record<Depth, string> = { light: 'a light answer', deeper: 'a deeper answer', deep: 'a deep answer', private: 'a private answer' }

// ---- the week ----

function MirrorPage({ m, today, reload, onCircle, onRead }: { m: MirrorData; today: string; reload: () => void; onCircle?: () => void; onRead?: (r: Read) => void }) {
  const p = useTheme()
  const signedIn = !!useAccount()
  const [notMe, setNotMe] = useState(() => notMeSides(today))
  const top = leanings(m.traits, notMe)
  const shareName = top.length ? titleCase(`the ${top[0].side.adj} ${(top[1] ?? top[0]).side.noun}`) : null
  const name = title(m.traits, notMe)
  const suggested = identityName(m.traits, notMe)
  const line = tagline(m.traits, notMe)
  const lean = leanings(m.traits)
  const sunday = new Date(`${today}T00:00:00Z`).getUTCDay() === 0
  const [wordsBack] = useState(() => (sunday ? wordsBackDue(today) : null))
  const [changes] = useState(() => changesBetween(loadHistory(), m.from, m.to).slice(-3))
  const [needs] = useState(() => {
    const h = loadHistory()
    return { top: reachedFor(h, m.from, m.to), all: needsBetween(h, m.from, m.to), safety: safetyLed(h, m.from, m.to) }
  })
  const [focus] = useState(focusPlan)
  const starter = sentenceStarter(leanings(m.traits, notMe)[0]?.side.lean)
  const moved = m.traits.some((t) => t.history.filter((h) => h.score !== undefined).length >= 2)
  const words = wordsBetween(m.from, m.to)

  const parts: Part[] = [
    { key: 'who', title: 'Where you leaned', body: <Who leans={lean} date={today} span="week" onVerdict={() => setNotMe(notMeSides(today))} onRead={onRead} />, show: lean.length > 0 },
    { key: 'outside', title: 'How your circle experiences you', body: <OutsideMirrorSection m={m} onCircle={onCircle} />, show: signedIn },
    {
      key: 'sentence',
      title: 'One line for your week',
      body: <SundaySentence week={m.from} starter={starter} />,
      show: (sunday && m.stats.answers > 0) || sentencesBetween(m.from, m.from).length > 0,
    },
    { key: 'revisit', title: 'Still true?', body: wordsBack && <WordsBackCard item={wordsBack} today={today} />, show: !!wordsBack },
    { key: 'glance', title: 'Your week at a glance', body: <Glance m={m} />, show: true },
    { key: 'traits', title: 'Your trait read', body: <Traits m={m} />, show: true },
    { key: 'moved', title: "How you've moved", body: <Moved rows={m.traits.map((t) => ({ trait: t.trait, weeks: t.history }))} why />, show: moved },
    { key: 'changed', title: 'What changed', body: <Changes changes={changes} />, show: changes.length > 0 },
    { key: 'reached', title: 'What you reached for', body: <Reached top={needs.top} all={needs.all} safety={needs.safety} week={m.from} />, show: needs.top.length > 0 },
    { key: 'all', title: 'All of you', body: <AllOfYou themes={m.themes} />, show: m.themes.length > 0 },
    { key: 'words', title: 'Answers in your own words', body: <OwnWordsList words={words} />, show: words.length > 0 },
    { key: 'focus', title: "What you're working on", body: focus && <FocusCard plan={focus} today={today} />, show: !!focus },
    {
      key: 'steps',
      title: 'Your small steps',
      body: <Steps m={m} today={today} reload={reload} />,
      show: m.steps.length > 0 || m.stepRecord.started > 0 || (m.stats.plansDid ?? 0) + (m.stats.plansNotYet ?? 0) > 0,
    },
    { key: 'next', title: 'Next week', body: <NextWeek m={m} today={today} reload={reload} />, show: true },
    { key: 'road', title: 'The road ahead', body: <RoadAhead />, show: true },
  ]

  return (
    <>
      <View style={{ backgroundColor: p.navy, borderRadius: radius.xl, padding: 22, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <T v="eyebrow" tone="onNavy2" style={{ flex: 1 }}>
            {sunday ? `Sunday · week ${m.week}` : `Week ${m.week}`} · {weekRange(m.from)}
          </T>
          {shareName && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share the card"
              hitSlop={8}
              onPress={() => Share.share({ message: `Week ${m.week} · My Sunday Mirror\n${shareName}${line ? `\n${line}` : ''}` })}
              style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' }}
            >
              <Icon name="share" size={18} color={p.onNavy} />
            </Pressable>
          )}
        </View>
        <T v="title" tone="onNavy">
          {name ? (
            <>
              This week, you were <T v="title" style={{ color: p.brandLime }}>{name}.</T>
            </>
          ) : (
            'This week is just getting started.'
          )}
        </T>
        {line ? (
          <T tone="onNavy" style={{ fontFamily: font.semibold, fontSize: 17, lineHeight: 23 }}>
            {line}
          </T>
        ) : null}
        <T tone="onNavy2">{summary(m, notMe)}</T>
      </View>

      {suggested && <IdentityCard key={`${m.from}-${suggested}`} week={m.from} suggested={suggested} />}
      <OneLine m={m} notMe={notMe} />
      <Tiles tiles={statTiles(m)} />
      {numbered(parts)}
    </>
  )
}

function OneLine({ m, notMe }: { m: MirrorData; notMe: string[] }) {
  const lean = leanings(m.traits, notMe)[0]
  if (!lean?.read.evidence[0]) return null
  return (
    <View style={{ gap: 6 }}>
      <Eyebrow>One line from this week</Eyebrow>
      <Quote big>“{lean.read.evidence[0]}”</Quote>
      <Note>The answer that said the most about you this week.</Note>
    </View>
  )
}

function Tiles({ tiles }: { tiles: [string, string, string][] }) {
  const p = useTheme()
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {tiles.map(([label, value, note]) => (
        <View key={label} style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: p.surface, borderColor: p.line, borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 2 }}>
          <T v="tiny" tone="muted">
            {label}
          </T>
          <T v="title">{value}</T>
          <T v="tiny" tone="muted">
            {note}
          </T>
        </View>
      ))}
    </View>
  )
}

function statTiles(m: MirrorData): [string, string, string][] {
  const s = m.stats
  const daysNote =
    s.daysActiveLastWeek === 0
      ? 'Your first week here'
      : s.daysActive > s.daysActiveLastWeek
        ? `Up from ${s.daysActiveLastWeek} last week`
        : s.daysActive === s.daysActiveLastWeek
          ? 'Same as last week'
          : `${s.daysActiveLastWeek} last week`
  return [
    ['Days active', `${s.daysActive} of 6`, daysNote],
    ['Answers', `${s.answers}`, (s.daysSoFar >= 6 ? 'this week' : 'so far this week') + (s.private > 0 ? `, ${s.private} kept private` : '')],
    fitTile(s),
    s.stepsStarted > 0 ? ['Small steps kept', `${s.stepsTried} of ${s.stepsStarted}`, `${s.stepsHelped} helped`] : ['Small steps kept', '–', 'Pick one with "I\'ll try it"'],
  ]
}

function fitTile(s: { me: number; partly: number; rated: number }): [string, string, string] {
  return s.rated > 0
    ? ["That's me", `${s.me} of ${s.rated}`, s.partly > 0 ? `cards you judged, ${s.partly} partly` : 'cards you judged']
    : ["That's me", '–', 'Tap "That\'s me" on a card that fits']
}

function Glance({ m }: { m: MirrorData }) {
  const active = m.days.map((d, i) => i < m.stats.daysSoFar && d.answers.length > 0)
  let run = 0
  let best = 0
  for (const a of active) {
    run = a ? run + 1 : 0
    best = Math.max(best, run)
  }
  const shown = active.filter(Boolean).length
  const rhythm =
    shown === 0
      ? 'No answers yet this week. Whenever you come back, your week starts filling in.'
      : `You came back on ${shown} of ${Math.min(6, m.stats.daysSoFar)} ${m.stats.daysSoFar >= 6 ? 'days' : 'days so far'}` +
        (best >= 2 ? `, with a run of ${best} in a row.` : '.') +
        ' Showing up is the whole trick: patterns only appear once there are a few answers to look back on.'
  return (
    <>
      <View style={{ gap: 8 }}>
        {m.days.map((d, i) => {
          const review = d.edition === 0 && d.answers.length === 0
          const future = !review && i >= m.stats.daysSoFar
          const label = `${weekday(d.date, 'long')}: ${
            review
              ? 'review day'
              : future
                ? 'still to come'
                : d.answers.length === 0
                  ? 'missed'
                  : d.answers.map((a) => `${themeName(a.theme)}, ${DEPTH_ANSWER[a.depth]}`).join('; ')
          }`
          return (
            <View key={d.date} accessible accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: future ? 0.5 : 1 }}>
              <T v="small" bold style={{ width: 40 }}>
                {weekday(d.date)}
              </T>
              <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
                {review ? <T v="small">🪞</T> : d.answers.length === 0 ? <Sq kind={future ? 'later' : 'missed'} /> : d.answers.map((a, j) => <Sq key={j} kind={a.depth} />)}
              </View>
              <T v="tiny" tone="muted">
                {review ? 'Review' : `#${d.edition}`}
              </T>
            </View>
          )
        })}
      </View>
      <Legend
        items={[
          ['deep', 'Deep'],
          ['deeper', 'Deeper'],
          ['light', 'Light'],
          ['private', 'Private answer'],
          ['missed', 'Missed day'],
        ]}
      />
      <T tone="text2">{rhythm}</T>
    </>
  )
}

function Traits({ m }: { m: MirrorData }) {
  const p = useTheme()
  const unread = Object.keys(TRAITS).filter((t) => !m.traits.some((r) => r.trait === t))
  return (
    <>
      {m.traits.length === 0 ? (
        <T tone="text2">Your trait read starts once two answers touch the same trait. A few more days will do it.</T>
      ) : (
        m.traits.map((t) => {
          const text = TRAITS[t.trait]
          if (!text) return null
          return (
            <View key={t.trait} style={{ gap: 6 }}>
              <T bold>{text.name}</T>
              <Scale dots={[{ at: t.score, color: p.accentInk }]} />
              <Note>{levelMeta(t)}</Note>
              <WhyThis t={t} name={text.name} />
            </View>
          )
        })
      )}
      <Note>0 to 100: where your answers sit between each question's two ends, with 50 in the middle. It compares you only with yourself, week to week.</Note>
      {unread.length > 0 && (
        <Box eyebrow="The trait you never described">
          <T>
            Nothing you answered lately touched <T bold>{TRAITS[unread[0]].name.toLowerCase()}</T>. A question on it will come round; that's where you might
            surprise yourself.
          </T>
        </Box>
      )}
      <Box eyebrow="Reading this honestly">
        <T>
          A week of everyday answers gives a rough read, not a verdict. Traits like these do predict real outcomes, but each by a modest amount, and you are
          always more than a number.
        </T>
      </Box>
    </>
  )
}

function WhyThis({ t, name }: { t: MirrorData['traits'][number]; name: string }) {
  const [open, setOpen] = useState(false)
  if (!t.behind || t.behind.length === 0) return null
  const high = t.score >= 50
  const way = (l: 'high' | 'low' | 'middle') => (l === 'middle' ? 'in between' : (l === 'high') === high ? 'points this way' : 'points the other way')
  return (
    <View style={{ gap: 6 }}>
      <Button kind="text" small label={open ? 'Hide the answers' : 'Why do you say that?'} onPress={() => setOpen(!open)} style={{ alignSelf: 'flex-start' }} />
      {open && (
        <>
          <Note>
            {`Your read on ${name.toLowerCase()} comes from ${t.answers === 1 ? 'one answer' : `${t.answers} answers`} over ${t.weeks === 1 ? 'one week' : `${t.weeks} weeks`}.`}
            {t.behind.length < t.answers ? ` Here are the newest ${t.behind.length}.` : ' Here they are, newest first.'}
          </Note>
          {t.behind.map((b, i) => (
            <T key={`${b.date}-${i}`} v="small">
              <T v="small" bold>
                {longDate(b.date)}
              </T>{' '}
              {b.question} You said “{b.answer}”. <T v="small" tone="muted">({way(b.leans)})</T>
            </T>
          ))}
        </>
      )}
    </View>
  )
}

function Changes({ changes }: { changes: Change[] }) {
  return (
    <>
      {changes.map((c) => (
        <T key={`${c.questionId}-${c.trait}`}>
          <T bold>{longDate(c.date)}</T> {changeWords(c)}
        </T>
      ))}
      <Note>{CHANGES_NOTE}</Note>
    </>
  )
}

function Reached({ top, all, safety, week }: { top: NeedRead[]; all: NeedRead[]; safety: boolean; week: string }) {
  const [first, second] = top
  const has = (n: NeedRead['need']) => all.some((r) => r.need === n)
  return (
    <>
      <T tone="text2">{reachedLine(NEED_PHRASES[first.need], second && NEED_PHRASES[second.need])}</T>
      {top.map((r) => (
        <Routes key={r.need} read={r} />
      ))}
      {has('competence') && has('respect') && <Note>{SUCCESS_TWO}</Note>}
      {safety && <SafetyAsk week={week} />}
      <Note>{REACHED_NOTE}</Note>
    </>
  )
}

function Routes({ read }: { read: NeedRead }) {
  const worked = read.routes.filter((r) => r.route !== 'no')
  const not = read.routes.filter((r) => r.route === 'no')
  if (worked.length === 0 && not.length === 0) return null
  const list = (rs: NeedRead['routes']) => rs.map((r) => `“${r.label}”`).join(', ')
  return (
    <View style={{ gap: 4 }} accessibilityLabel={NEED_NAMES[read.need]}>
      <T bold>{NEED_NAMES[read.need]}</T>
      {worked.length > 0 && (
        <T>
          {ROUTES_WORKED}: {list(worked)}.
        </T>
      )}
      {not.length > 0 && (
        <T>
          {ROUTES_NOT}: {list(not)}.
        </T>
      )}
    </View>
  )
}

function SafetyAsk({ week }: { week: string }) {
  const [answer, setAnswer] = useState<Uncertain | null>(() => safetyAnswer(week))
  return (
    <View style={{ gap: 8 }}>
      <T>{SAFETY_ASK}</T>
      {answer ? (
        <Note>{SAFETY_REPLIES[answer]}</Note>
      ) : (
        <Chips>
          {UNCERTAIN.map((u) => (
            <Chip
              key={u}
              label={SAFETY_WORDS[u]}
              onPress={() => {
                rememberSafety(week, u)
                setAnswer(u)
              }}
            />
          ))}
        </Chips>
      )}
    </View>
  )
}

// Small bars per week for each trait: the week's "How you've moved" and the
// month's and quarter's too.
function Moved({ rows, why }: { rows: { trait: string; weeks: { week: number; score?: number }[] }[]; why?: boolean }) {
  const p = useTheme()
  const shown = rows.filter((t) => TRAITS[t.trait] && t.weeks.filter((h) => h.score !== undefined).length >= 2)
  return (
    <>
      {shown.map((t) => (
        <View key={t.trait} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
          <T bold style={{ flex: 1 }}>
            {TRAITS[t.trait].name}
          </T>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {t.weeks.map((h) => (
              <View key={h.week} style={{ alignItems: 'center', gap: 2 }} accessibilityLabel={h.score === undefined ? `Week ${h.week}: no read` : `Week ${h.week}`}>
                <View style={{ width: 14, height: 40, borderRadius: 4, backgroundColor: p.surface3, justifyContent: 'flex-end', overflow: 'hidden', opacity: h.score === undefined ? 0.4 : 1 }}>
                  <View style={{ height: `${h.score ?? 0}%`, backgroundColor: p.accentInk }} />
                </View>
                <T v="tiny" tone="muted">
                  W{h.week}
                </T>
              </View>
            ))}
          </View>
        </View>
      ))}
      {why && (
        <Box eyebrow="Why movement is possible">
          <T>Traits shift across a lifetime, people who set out to change a trait often do move it a little, and small if-then plans make new habits stick.</T>
        </Box>
      )}
    </>
  )
}

const DEPTH_WORDS = { light: 'light', deeper: 'deeper', deep: 'deep', private: 'private' } as const

function AllOfYou({ themes: read }: { themes: ThemeRead[] }) {
  const p = useTheme()
  const answered = new Map(read.map((t) => [t.theme, t]))
  const deepest = read.filter((t) => t.depth === 'deep').slice(0, 3)
  const unknown = Object.keys(THEMES).filter((t) => !answered.has(t))
  return (
    <>
      {Object.keys(AREA_NAMES).map((area) => {
        const themes = Object.entries(THEMES).filter(([, t]) => t.area === area)
        return (
          <View key={area} style={{ gap: 8 }}>
            <T v="small" bold tone="muted">
              {AREA_NAMES[area]}
            </T>
            <Chips>
              {themes.map(([slug, t]) => {
                const r = answered.get(slug)
                return (
                  <View
                    key={slug}
                    accessible
                    accessibilityLabel={`${t.name}: ${r ? `${r.answers} ${r.answers === 1 ? 'answer' : 'answers'}, ${DEPTH_WORDS[r.depth]}` : 'not yet'}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: radius.pill,
                      borderWidth: 1.5,
                      borderColor: r ? depthColor(p, r.depth) : p.line,
                      opacity: r ? 1 : 0.55,
                    }}
                  >
                    <T v="small">{t.icon}</T>
                    <T v="small" bold>
                      {t.name}
                    </T>
                    {r ? (
                      <T v="small" tone="muted">
                        {r.answers}
                      </T>
                    ) : null}
                  </View>
                )
              })}
            </Chips>
          </View>
        )
      })}
      <Legend
        items={[
          ['deep', 'Deep'],
          ['deeper', 'Deeper'],
          ['light', 'Light'],
          ['private', 'Private'],
        ]}
      />
      {deepest.length > 0 && (
        <Box eyebrow="Where you go deepest">
          <T>{deepest.map((t) => themeName(t.theme)).join(', ')}. When you pick the most revealing answers somewhere, it usually means that part of life is on your mind.</T>
        </Box>
      )}
      {unknown.length > 0 && (
        <Box eyebrow="Still mostly unknown">
          <T>
            {unknown.slice(0, 4).map(themeName).join(', ')}
            {unknown.length > 4 ? ` and ${unknown.length - 4} more` : ''}. They'll come round in the coming weeks.
          </T>
        </Box>
      )}
    </>
  )
}

function PlanRecord({ did, notYet }: { did: number; notYet: number }) {
  if (did + notYet === 0) return null
  const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`)
  return (
    <Box eyebrow="Your plans this week">
      <T>
        {did > 0 ? `You did what you planned ${times(did)}` : 'You checked in on your plans'}
        {notYet > 0 ? `, and said "not yet" ${times(notYet)}.` : '.'}{' '}
        {notYet > did ? 'A plan that keeps slipping may need a smaller "I will".' : 'Plans tied to a moment are the ones that last.'}
      </T>
    </Box>
  )
}

function Who({
  leans,
  date,
  span,
  onVerdict,
  onRead,
}: {
  leans: Lean<{ trait: string; score: number; level: Level; answers: number; days: number; weeks: number; evidence?: string[] }>[]
  date: string
  span: string
  onVerdict: () => void
  onRead?: (r: Read) => void
}) {
  return (
    <>
      {leans.slice(0, 3).map((l) => {
        const read = onRead ? readFor('trait', `${l.read.trait}.${l.high ? 'high' : 'low'}`) : null
        return (
          <Box key={l.read.trait} eyebrow={l.text.name}>
            <T v="h3">{l.side.headline}</T>
            <T>{l.side.prediction}</T>
            <T>
              <T bold>The honest part:</T> {honestLine(l.side, date, 'mirror').text}
            </T>
            <PlanOffer trait={l.read.trait} high={l.high} date={date} />
            {read && onRead && <Button kind="text" small label={`A read on this: ${read.title}`} onPress={() => onRead(read)} style={{ alignSelf: 'flex-start' }} />}
            {l.read.evidence && l.read.evidence.length > 0 && <Note>You said: {l.read.evidence.map((e) => `“${e}”`).join(', ')}</Note>}
            <Note>{levelLine(l.read, span)}</Note>
            <LeaningVerdict trait={l.read.trait} high={l.high} date={date} onVerdict={onVerdict} />
          </Box>
        )
      })}
    </>
  )
}

function LeaningVerdict({ trait, high, date, onVerdict }: { trait: string; high: boolean; date: string; onVerdict: () => void }) {
  const [verdict, setVerdict] = useState(() => leaningVerdict(trait, high, date))
  function tap(v: Verdict) {
    rememberLeaning(trait, high, v, date)
    setVerdict(v)
    onVerdict()
  }
  if (verdict) return <Note>{LEANING_REPLIES[verdict]}</Note>
  return (
    <Chips>
      <Chip label="That's me" onPress={() => tap('me')} />
      <Chip label="Partly" onPress={() => tap('partly')} />
      <Chip label="Not me" onPress={() => tap('not_me')} />
    </Chips>
  )
}

function OwnWordsList({ words }: { words: OwnWords[] }) {
  return (
    <>
      {words.map((w) => (
        <View key={w.questionId} style={{ gap: 4 }}>
          <ThemeMeta theme={w.theme}>
            {w.theme ? themeName(w.theme) : 'Today'} · {longDate(w.date)}
          </ThemeMeta>
          <T bold>{w.prompt}</T>
          {w.private ? <T tone="muted">A private answer, in your own words.</T> : <Quote>“{w.words}”</Quote>}
          {w.closest && !w.private && <Note>Closest to: {w.closest}</Note>}
        </View>
      ))}
      <Note>Only on this phone. These words were never sent anywhere.</Note>
    </>
  )
}

const STEPS_SHOWN = 4

function Steps({ m, today, reload }: { m: MirrorData; today: string; reload: () => void }) {
  const [error, setError] = useState(false)
  const [all, setAll] = useState(false)
  const shown = all ? m.steps : m.steps.slice(0, STEPS_SHOWN)
  async function mark(s: MirrorData['steps'][number], status: StepStatus) {
    setError(false)
    try {
      await setMoveStatus(s.questionId, status, today, { optionId: s.optionId, step: s.step, date: s.started })
      reload()
    } catch {
      setError(true)
    }
  }
  const r = m.stepRecord
  return (
    <>
      {shown.map((s) => (
        <View key={s.questionId} style={{ gap: 6 }}>
          <ThemeMeta theme={s.theme}>
            {themeName(s.theme)}
            {edition(s.edition)} · {STEP_STATUS_WORDS[s.status]}
          </ThemeMeta>
          <T>{s.step}</T>
          {s.status === 'started' && (
            <Chips>
              <Chip label="It helped" onPress={() => mark(s, 'helped')} />
              <Chip label="No change yet" onPress={() => mark(s, 'no_change')} />
              <Chip label="Not today" onPress={() => mark(s, 'not_tried')} />
            </Chips>
          )}
        </View>
      ))}
      {m.steps.length > shown.length && <Button kind="text" small label={`Show all ${m.steps.length} steps`} onPress={() => setAll(true)} style={{ alignSelf: 'flex-start' }} />}
      {error && <T tone="danger">That didn't save. Please try again.</T>}
      <Box eyebrow="Your record so far">
        <T>
          {r.started} {r.started === 1 ? 'step' : 'steps'} started, {r.tried} tried, {r.helped} helped.{' '}
          {r.tried === 0 ? 'Trying one is what counts, even when nothing changes.' : 'Every try teaches you something, including the ones that change nothing.'}
        </T>
      </Box>
      <PlanRecord did={m.stats.plansDid ?? 0} notYet={m.stats.plansNotYet ?? 0} />
    </>
  )
}

function NextWeek({ m, today, reload }: { m: MirrorData; today: string; reload: () => void }) {
  const [error, setError] = useState(false)
  const early = m.traits.filter((t) => t.level === 'hint' && TRAITS[t.trait]).slice(0, 2)
  async function start(s: MirrorData['nextSteps'][number]) {
    setError(false)
    try {
      await startMove(today, s.questionId, s.optionId, s.step)
      reload()
    } catch {
      setError(true)
    }
  }
  return (
    <>
      {m.nextSteps.map((s) => (
        <View key={s.questionId} style={{ gap: 6 }}>
          <ThemeMeta theme={s.theme}>
            {themeName(s.theme)}
            {s.edition > 0 && ` · from Edition #${s.edition}`}
          </ThemeMeta>
          <T>{s.step}</T>
          <Button small kind="soft" label="Start this step" onPress={() => start(s)} style={{ alignSelf: 'flex-start' }} />
        </View>
      ))}
      {error && <T tone="danger">That didn't save. Please try again.</T>}
      {m.comingUp.length > 0 && (
        <Box eyebrow="Coming up">
          <T>{m.comingUp.map(themeName).join(' · ')}</T>
        </Box>
      )}
      {early.length > 0 && (
        <Box eyebrow="Sharpen your read">
          <T>
            {early.map((t) => TRAITS[t.trait].name).join(' and ')} {early.length === 1 ? 'is' : 'are'} only a hint so far. Answers on a few more days will show
            whether {early.length === 1 ? "it's a pattern" : "they're patterns"}.
          </T>
        </Box>
      )}
    </>
  )
}

function RoadAhead() {
  const rows: [string, string][] = [
    ['Next Sunday', 'Another week of answers, and your reads firm up.'],
    ['In a month', 'Four weeks is enough to see which small steps actually stuck.'],
    ['In a year', 'The slow changes, the ones you only notice looking back.'],
  ]
  return (
    <>
      {rows.map(([when, what]) => (
        <T key={when}>
          <T bold>{when}</T> {what}
        </T>
      ))}
      <T tone="text2">Nothing on this page is fixed. It's a mirror of one week, and next week you get to answer again.</T>
    </>
  )
}

function Footer({ onOpenKept }: { onOpenKept: () => void }) {
  const signedIn = !!useAccount()
  return (
    <View style={{ gap: 10 }}>
      <Hairline />
      <T bold>Something to think about, never a diagnosis.</T>
      <Eyebrow>What leaves my phone</Eyebrow>
      <Note>
        {signedIn
          ? "You're signed in, so I keep your answers under a key made from your account, the same on every device you sign in on. Your name and handle are never stored with them, but the server can tell they belong to your account. For an intimate question I keep only that you answered, never what you chose. Anything you write in your own words stays on your phone and is never sent."
          : "I keep your answers on the server under an anonymous key made from this phone's pass: no name, no email, no account. That's how I build this mirror. For an intimate question I keep only that you answered, never what you chose. Anything you write in your own words stays on this phone and is never sent."}
      </Note>
      <Note>
        Your answers and small steps go after five weeks. For your month, quarter and year, I keep a small note of each week for 13 months: how many answers, how
        deep they went, your three clearest answers and the steps that helped.
      </Note>
      <Button kind="text" small label="What I keep, and how to delete it" onPress={onOpenKept} style={{ alignSelf: 'flex-start' }} />
    </View>
  )
}

// ---- the month, quarter or year ----

function PeriodPage({ p: pm, onRead }: { p: PeriodMirror; onRead?: (r: Read) => void }) {
  const p = useTheme()
  const noun = pm.period
  const [notMe, setNotMe] = useState(() => notMeSides(pm.date))
  const name = title(pm.traits, notMe)
  const line = tagline(pm.traits, notMe)
  const lean = leanings(pm.traits)
  const moved = noun !== 'year' && pm.traits.some((t) => t.weekly.filter((w) => w.score !== undefined).length >= 2)
  const lines = sentencesBetween(addDays(pm.from, -3), addDays(pm.to, -3))
  const parts: Part[] = [
    { key: 'weeks', title: 'Week by week', body: <WeekByWeek p={pm} />, show: true },
    { key: 'traits', title: 'Your trait read', body: <PeriodTraits p={pm} />, show: true },
    { key: 'moved', title: "How you've moved", body: <Moved rows={pm.traits.map((t) => ({ trait: t.trait, weeks: t.weekly }))} />, show: moved },
    { key: 'moments', title: 'The answers that said the most', body: <Moments p={pm} />, show: pm.moments.length > 0 },
    { key: 'who', title: `Who you were this ${noun}`, body: <Who leans={lean} date={pm.date} span={noun} onVerdict={() => setNotMe(notMeSides(pm.date))} onRead={onRead} />, show: lean.length > 0 },
    { key: 'lines', title: 'In your own words, week by week', body: <WeekLines lines={lines} />, show: lines.length > 0 },
    { key: 'all', title: 'All of you', body: <AllOfYou themes={pm.themes} />, show: pm.themes.length > 0 },
    { key: 'steps', title: 'Your small steps', body: <PeriodSteps p={pm} />, show: pm.stats.stepsStarted > 0 },
  ]
  return (
    <>
      <View style={{ backgroundColor: p.navy, borderRadius: radius.xl, padding: 22, gap: 12 }}>
        <T v="eyebrow" tone="onNavy2">
          Your {adjOf(noun)} mirror · {periodName(noun, pm.label)} · Week {pm.weeks.length} of {pm.weeksTotal}
        </T>
        <T v="title" tone="onNavy">
          {name ? (
            <>
              This {noun}, you were <T v="title" style={{ color: p.brandLime }}>{name}.</T>
            </>
          ) : (
            `This ${noun} is just getting started.`
          )}
        </T>
        {line ? (
          <T tone="onNavy" style={{ fontFamily: font.semibold, fontSize: 17, lineHeight: 23 }}>
            {line}
          </T>
        ) : null}
        <T tone="onNavy2">{periodSummary(pm, notMe)}</T>
      </View>
      <Tiles tiles={periodTiles(pm)} />
      {numbered(parts)}
      <T tone="text2">{PERIOD_CLOSE[noun]}</T>
    </>
  )
}

function periodTiles(p: PeriodMirror): [string, string, string][] {
  const s = p.stats
  const prev = p.previous
  const before = prev && p.previousLabel ? periodName(p.period, p.previousLabel, false) : null
  const all = s.weeksSoFar === p.weeks.length
  return [
    ['Days active', `${s.daysActive} of ${s.daysSoFar}`, prev && before ? `${prev.daysActive} of ${prev.daysSoFar} in ${before}` : all ? 'question days so far' : 'question days on record'],
    ['Weeks you came back', `${s.weeksActive} of ${s.weeksSoFar}`, prev && before ? `${prev.weeksActive} of ${prev.weeksSoFar} in ${before}` : all ? 'weeks with an answer' : 'weeks on record'],
    ['Answers', `${s.answers}`, s.private > 0 ? `${s.private} kept private` : `this ${p.period}`],
    fitTile(s),
    s.stepsStarted > 0 ? ['Small steps kept', `${s.stepsTried} of ${s.stepsStarted}`, `${s.stepsHelped} helped`] : ['Small steps kept', '–', 'Pick one with "I\'ll try it"'],
  ]
}

function WeekByWeek({ p: pm }: { p: PeriodMirror }) {
  const p = useTheme()
  const kept = pm.weeks.filter((w) => w.kept)
  let run = 0
  let best = 0
  for (const w of kept) {
    run = w.answers > 0 ? run + 1 : 0
    best = Math.max(best, run)
  }
  const active = kept.filter((w) => w.answers > 0).length
  const toCome = pm.weeksTotal - pm.weeks.length
  const rhythm =
    active === 0
      ? `No answers yet this ${pm.period}. Whenever you come back, it starts filling in.`
      : `You came back in ${active} of ${plural(kept.length, 'week', 'weeks')}` + (best >= 2 ? `, ${best} in a row at best.` : '.') + ' A week off is fine; the mirror picks up wherever you left off.'
  const year = pm.period === 'year'
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: year ? 2 : 6, flexWrap: 'wrap' }}>
        {pm.weeks.map((w) => (
          <View
            key={w.monday}
            accessible
            accessibilityLabel={w.kept ? `Week ${w.week}: ${w.daysActive} of ${w.daysSoFar} days, ${plural(w.answers, 'answer', 'answers')}` : `Week ${w.week}: nothing on record`}
            style={{ alignItems: 'center', gap: 2 }}
          >
            <View style={{ width: year ? 4 : 18, height: 56, borderRadius: 4, backgroundColor: p.surface3, justifyContent: 'flex-end', overflow: 'hidden', opacity: w.kept ? 1 : 0.4 }}>
              <View style={{ height: `${Math.min(100, (w.daysActive / 6) * 100)}%`, backgroundColor: p.accentInk }} />
            </View>
            {!year && (
              <T v="tiny" tone="muted">
                W{w.week}
              </T>
            )}
          </View>
        ))}
      </View>
      <Note>
        {year && pm.weeks.length > 0 ? `Each bar is a week, from week ${pm.weeks[0].week} to week ${pm.weeks[pm.weeks.length - 1].week}. ` : ''}
        A full bar is all six question days.
        {toCome > 0 ? ` ${plural(toCome, 'week', 'weeks')} still to come.` : ''}
      </Note>
      <T tone="text2">{rhythm}</T>
    </>
  )
}

function PeriodTraits({ p: pm }: { p: PeriodMirror }) {
  const p = useTheme()
  if (pm.traits.length === 0) return <T tone="text2">Your trait read starts once two answers touch the same trait. A few more days will do it.</T>
  return (
    <>
      {pm.traits.map((t) => {
        const text = TRAITS[t.trait]
        if (!text) return null
        return (
          <View key={t.trait} style={{ gap: 6 }}>
            <T bold>{text.name}</T>
            <Scale dots={[{ at: t.score, color: p.accentInk }]} />
            <Note>{levelMeta(t)}</Note>
          </View>
        )
      })}
      <Note>
        0 to 100: where your answers this {pm.period} sit between each question's two ends, with 50 in the middle. The change sets your latest weeks against your
        first ones; it compares you only with yourself.
      </Note>
    </>
  )
}

function Moments({ p }: { p: PeriodMirror }) {
  return (
    <>
      {p.moments.map((mo) => (
        <View key={`${mo.date}-${mo.prompt}`} style={{ gap: 4 }}>
          <ThemeMeta theme={mo.theme}>
            {themeName(mo.theme)} · {longDate(mo.date)}
            {edition(mo.edition)}
          </ThemeMeta>
          <T bold>{mo.prompt}</T>
          <Quote>“{mo.label}”</Quote>
          {mo.headline ? <T tone="text2">{mo.headline}</T> : null}
        </View>
      ))}
      <Note>Your deepest answers this {p.period} that leaned clearly one way. Private answers are never shown.</Note>
    </>
  )
}

function PeriodSteps({ p }: { p: PeriodMirror }) {
  const s = p.stats
  return (
    <>
      {p.helped.map((h) => (
        <View key={`${h.started}-${h.step}`} style={{ gap: 4 }}>
          <ThemeMeta theme={h.theme}>
            {themeName(h.theme)} · started {longDate(h.started)} · Helped
          </ThemeMeta>
          <T>{h.step}</T>
        </View>
      ))}
      <Box eyebrow={`This ${p.period}`}>
        <T>
          {plural(s.stepsStarted, 'step', 'steps')} started, {s.stepsTried} tried, {s.stepsHelped} helped.{' '}
          {s.stepsHelped > 0 ? 'The ones that helped are worth keeping.' : 'Every try teaches you something, including the ones that change nothing.'}
        </T>
      </Box>
    </>
  )
}

function WeekLines({ lines }: { lines: { week: string; text: string }[] }) {
  return (
    <>
      {lines.map((l) => (
        <View key={l.week} style={{ gap: 4 }}>
          <Note>{weekRange(l.week)}</Note>
          <Quote>“{l.text}”</Quote>
        </View>
      ))}
      <Note>Only on this phone. These lines were never sent anywhere.</Note>
    </>
  )
}

// ---- the Outside Mirror ----

function OutsideMirrorSection({ m, onCircle }: { m: MirrorData; onCircle?: () => void }) {
  const p = useTheme()
  const [o, setO] = useState<OutsideMirrorData | null>(null)
  useEffect(() => {
    let live = true
    outsideMirror().then(
      (x) => live && setO(x),
      () => {},
    )
    return () => {
      live = false
    }
  }, [])
  if (!o) return null
  if (!o.open) {
    const rows = Array.from({ length: o.need }, (_, i) => i < o.friends)
    return (
      <Box>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="lock" size={20} color={p.text} />
          <T bold>Opens when {o.need} friends have answered</T>
        </View>
        <View accessibilityLabel={`${o.friends} of ${o.need} friends have answered`} style={{ gap: 8 }}>
          {rows.map((done, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: done ? p.lime : 'transparent',
                  borderWidth: done ? 0 : 1.5,
                  borderColor: p.lineStrong,
                }}
              >
                {done && <Icon name="check" size={14} color={p.onLime} />}
              </View>
              <T style={{ flex: 1 }}>{done ? 'A friend' : o.need - o.friends === 1 ? 'One more friend' : 'A friend to invite'}</T>
              {done ? (
                <T v="small" tone="muted">
                  Answered
                </T>
              ) : (
                onCircle && <Button kind="text" small label="Invite" onPress={onCircle} />
              )}
            </View>
          ))}
        </View>
        <Note>
          With two friends you could work out who said what by elimination. Three keeps every answer anonymous, by arithmetic, not by promise. Answers already
          given are held until the third friend joins.
        </Note>
        {onCircle && <Button wide label={o.need - o.friends === 1 ? 'Invite one more person' : 'Invite friends'} onPress={onCircle} />}
      </Box>
    )
  }
  const own = new Map(m.traits.map((t) => [t.trait, t.score]))
  const rows = o.traits.filter((t) => TRAITS[t.trait])
  const gaps = rows
    .filter((t) => own.has(t.trait))
    .map((t) => ({ t, gap: t.position - (own.get(t.trait) ?? 50) }))
    .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap))
  const shared = gaps[0] && Math.abs(gaps[0].gap) < 15 ? gaps[0] : null
  const miss = gaps.length && Math.abs(gaps[gaps.length - 1].gap) >= 20 ? gaps[gaps.length - 1] : null
  return (
    <>
      <Note>
        Blended from {o.friends} friends over {o.weeks} weeks. No single answer is ever shown.
      </Note>
      {shared && (
        <Box eyebrow="Shared ground">
          <T>You and your circle both see you near {sideOf(TRAITS[shared.t.trait], shared.t.position >= 50).lean}.</T>
        </Box>
      )}
      {miss && (
        <Box eyebrow="What your circle notices that you might miss">
          <T>
            Your circle places you nearer {sideOf(TRAITS[miss.t.trait], miss.gap > 0).lean} than your own answers do. Neither is the truer one: people see the side of
            you that you show them.
          </T>
        </Box>
      )}
      {rows.map((t) => {
        const tr = TRAITS[t.trait]
        const mine = own.get(t.trait)
        return (
          <View
            key={t.trait}
            style={{ gap: 6 }}
            accessible
            accessibilityLabel={`${tr.name}: your circle ${Math.round(t.position)} of 100${mine === undefined ? '' : `, you ${mine}`}`}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T v="small">{tr.low.lean}</T>
              <T v="small">{tr.high.lean}</T>
            </View>
            <Scale dots={[...(mine !== undefined ? [{ at: mine, color: p.accentInk }] : []), { at: t.position, color: p.amber }]} />
          </View>
        )
      })}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.accentInk }} />
        <T v="small" tone="muted">
          you ·
        </T>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.amber }} />
        <T v="small" tone="muted">
          your circle
        </T>
      </View>
    </>
  )
}

// ---- the Keep pieces the Mirror uses (Keep.tsx) ----

function SundaySentence({ week, starter }: { week: string; starter: string }) {
  const kept = sentence(week)
  const [text, setText] = useState(kept?.text ?? starter)
  const [done, setDone] = useState(!!kept)
  if (done) {
    return (
      <Box eyebrow="In your words">
        <Quote>“{sentence(week)?.text ?? text}”</Quote>
        <Note>Kept in your notebook. Your month shows four of these, and your year all of them.</Note>
        <Button kind="text" small label="Change it" onPress={() => setDone(false)} style={{ alignSelf: 'flex-start' }} />
      </Box>
    )
  }
  const ready = !!text.trim() && text.trim() !== starter.trim()
  return (
    <View style={{ gap: 10 }}>
      <Field label="One line for your week" multiline value={text} maxLength={MAX_SENTENCE} onChangeText={setText} />
      <Note>Finish it in your own words. It stays on this phone.</Note>
      <Button
        small
        label="Keep my line"
        disabled={!ready}
        onPress={() => {
          if (!ready) return
          keepSentence(week, text)
          setDone(true)
        }}
        style={{ alignSelf: 'flex-start' }}
      />
    </View>
  )
}

function WordsBackCard({ item, today }: { item: WordsBack; today: string }) {
  const [answer, setAnswer] = useState<Revisit['verdict'] | null>(null)
  const [note, setNote] = useState('')
  const [noted, setNoted] = useState<'kept' | 'skipped' | null>(null)
  const card = item.kind === 'card' ? item.card : null
  const intro = card ? `On ${longDate(card.date)} you ${card.words ? 'wrote' : 'kept this'}:` : `The week of ${longDate(item.kind === 'sentence' ? item.sentence.week : today)}, you wrote:`
  const quote = card ? (card.words ?? card.headline) : item.kind === 'sentence' ? item.sentence.text : ''
  function tap(verdict: Revisit['verdict']) {
    reviseWords(item, { date: today, verdict })
    setAnswer(verdict)
  }
  return (
    <Box eyebrow="From your notebook">
      <T tone="text2">{intro}</T>
      <Quote>“{quote}”</Quote>
      {card && <Note>{card.prompt}</Note>}
      {!answer && (
        <>
          <T>{WORDS_BACK_ASK}</T>
          <Chips>
            <Chip label="Still true" onPress={() => tap('still')} />
            <Chip label="It's changing" onPress={() => tap('changing')} />
            <Chip label="Not any more" onPress={() => tap('not_anymore')} />
          </Chips>
        </>
      )}
      {answer && <Note>{REVISIT_REPLIES[answer]}</Note>}
      {answer && answer !== 'still' && !noted && (
        <>
          <Field label={REVISIT_NOTE_ASK} value={note} maxLength={MAX_LINE} onChangeText={setNote} />
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Button
              small
              label="Keep my line"
              disabled={!note.trim()}
              onPress={() => {
                if (!note.trim()) return
                noteRevisit(item, note)
                setNoted('kept')
              }}
            />
            <Button kind="text" small label="Not now" onPress={() => setNoted('skipped')} />
          </View>
        </>
      )}
      {noted === 'kept' && <Note>{REVISIT_NOTE_KEPT}</Note>}
    </Box>
  )
}

function FocusCard({ plan: start, today }: { plan: Plan; today: string }) {
  const [x, setX] = useState(start)
  const [reply, setReply] = useState<keyof typeof LOOK_BACK_REPLIES | null>(null)
  const [editing, setEditing] = useState(false)
  const [when, setWhen] = useState(start.when)
  const [will, setWill] = useState(start.will)
  const side = TRAITS[x.trait] ? sideOf(TRAITS[x.trait], x.high) : null
  const due = !reply && lookBackDue(x, today)
  return (
    <Box eyebrow={`What you're working on${side ? ` · ${side.lean}` : ''}`}>
      <T>
        When {x.when}, I will {x.will}.
      </T>
      <Note>{timesDoneLine(timesDone(x), longDate(x.made))}</Note>
      {due && !editing && (
        <>
          <T>{LOOK_BACK_ASK}</T>
          <Chips>
            <Chip
              label="Keep going"
              onPress={() => {
                lookBack(x.id, today)
                setReply('keep')
              }}
            />
            <Chip label="Make it smaller" onPress={() => setEditing(true)} />
            <Chip
              label="Close it"
              onPress={() => {
                closePlan(x.id)
                setReply('close')
              }}
            />
          </Chips>
        </>
      )}
      {editing && (
        <>
          <Field label="When" value={when} maxLength={MAX_PLAN} onChangeText={setWhen} />
          <Field label="I will" value={will} maxLength={MAX_PLAN} onChangeText={setWill} />
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Button
              small
              label="Keep the smaller plan"
              disabled={!when.trim() || !will.trim()}
              onPress={() => {
                if (!when.trim() || !will.trim()) return
                changePlan(x.id, when.trim(), will.trim(), today)
                lookBack(x.id, today)
                setX(loadPlan(x.id) ?? x)
                setEditing(false)
                setReply('smaller')
              }}
            />
            <Button kind="text" small label="Cancel" onPress={() => setEditing(false)} />
          </View>
        </>
      )}
      {reply && <Note>{LOOK_BACK_REPLIES[reply]}</Note>}
    </Box>
  )
}

function IdentityCard({ week, suggested }: { week: string; suggested: string }) {
  const [name, setName] = useState(() => nameFor(week)?.name ?? suggested)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const mine = name !== suggested
  return (
    <Tinted>
      <Eyebrow accent>{mine ? 'Your name for this week' : 'A name for this week'}</Eyebrow>
      {editing ? (
        <>
          <Field label="Call it what fits you" value={draft} maxLength={40} onChangeText={setDraft} />
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Button
              small
              label="Keep this name"
              onPress={() => {
                const next = draft.trim() || suggested
                rename(week, suggested, next)
                setName(next)
                setEditing(false)
              }}
            />
            <Button kind="text" small label="Cancel" onPress={() => setEditing(false)} />
          </View>
        </>
      ) : (
        <>
          <T v="title">{name}</T>
          <Note>{mine ? `I suggested ${suggested}.` : 'My suggestion, from your answers. You know yourself best.'}</Note>
          <Button
            kind="text"
            small
            label="Rename it"
            onPress={() => {
              setDraft(name)
              setEditing(true)
            }}
            style={{ alignSelf: 'flex-start' }}
          />
        </>
      )}
    </Tinted>
  )
}

function PlanOffer({ trait, high, date }: { trait: string; high: boolean; date: string }) {
  const side = TRAITS[trait] ? sideOf(TRAITS[trait], high) : null
  const [open, setOpen] = useState(false)
  const [when, setWhen] = useState('')
  const [will, setWill] = useState('')
  const [made, setMade] = useState<Plan | null>(null)
  const [focus] = useState(focusPlan)
  if (!side) return null
  const same = !!focus && focus.trait === trait && focus.high === high
  if (made) {
    return (
      <View style={{ gap: 4 }}>
        <T>
          <T bold>Your plan:</T> When {made.when}, I will {made.will}.
        </T>
        <Note>Kept in your notebook. Next time you sit down, I'll ask how it went.</Note>
      </View>
    )
  }
  if (!open) {
    return same ? (
      <Note>
        {SAME_FOCUS} When {focus.when}, I will {focus.will}.
      </Note>
    ) : (
      <Chips>
        <Chip label={focus ? 'Work on this instead?' : 'Want to work on this?'} onPress={() => setOpen(true)} />
      </Chips>
    )
  }
  const ready = !!when.trim() && !!will.trim()
  return (
    <View style={{ gap: 10 }}>
      <Eyebrow>One plan, tied to a moment</Eyebrow>
      {focus && (
        <Note>
          {SWAP_NOTE} Now: “When {focus.when}, I will {focus.will}.”
        </Note>
      )}
      <Field label="When" value={when} maxLength={MAX_PLAN} placeholder={side.plan.when} onChangeText={setWhen} />
      <Field label="I will" value={will} maxLength={MAX_PLAN} placeholder={side.plan.will} onChangeText={setWill} />
      <Note>🔒 Your plan stays on this phone. I only ever send whether you did it.</Note>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Button
          small
          label="Keep my plan"
          disabled={!ready}
          onPress={() => {
            if (!ready) return
            setMade(makePlan({ made: date, trait, high, when: when.trim(), will: will.trim() }))
          }}
        />
        <Button kind="text" small label="Not now" onPress={() => setOpen(false)} />
      </View>
    </View>
  )
}
