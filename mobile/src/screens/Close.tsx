// The close of a sitting, one reflection after a conversation (Edwin's
// brief, 2026-10-28): the midnight card with this week's tiles, then the
// first glimpse (first sitting only) or today's thread, how today's steps
// went (the same check-in as everywhere), one thing worth trying from the
// sitting's own answers, and what comes next. Nothing is scored, shared or
// set against anyone else.
import { useEffect, useState, type ReactNode } from 'react'
import { View } from 'react-native'
import { recalledChoice, SKIPPED, type Question } from '@shared/api'
import { adviceFor, levelLine } from '@shared/advice'
import { isSaturday, opensAt } from '@shared/day'
import { checkInFor } from '@shared/growthJourney'
import { sharedNeed } from '@shared/glimpse'
import { HELPLINE_LINE } from '@shared/helplineText'
import { movesOn, startMove, startedInEvening, type Move } from '@shared/moves'
import { loadPrefs } from '@shared/prefs'
import { heavyPause, isLowMood, loadHistory, recordRoute, type AnswerRecord, type History, type Route } from '@shared/profile'
import { NEED_PHRASES, type Need } from '@shared/needs'
import { routeToAsk } from '@shared/reaching'
import { stepToTry, type SittingPick } from '@shared/sittingClose'
import { week } from '@shared/tapestry'
import { themeName } from '@shared/themes'
import { sideOf, TRAITS } from '@shared/traits'
import { GLIMPSE_BALANCED, GLIMPSE_NEXT, QUIET_DAY, ROUTE_ASK, ROUTE_REPLIES, ROUTE_WORDS, routeLead, SUNDAY_LINE } from '@shared/words'
import { font, radius, useTheme } from '../theme'
import { B, Button, Chip, feel, Option, T, Tinted } from '../ui/kit'
import { themeIcon, WeekTiles } from '../ui/parts'
import { CheckIn } from './CheckIn'
import { OwnIdea } from './QuestionCard'

type Props = {
  date: string
  glimpse?: { name: string | null }
  dayWithYou?: number
  questions: Question[]
  tomorrowThemes: string[]
} & ({ sitting: 'morning'; eveningThemes: string[] | null; carry?: string | null } | { sitting: 'evening'; morning: Question[] })

// The sitting's answers that have a reading: what one thing to try is picked from.
const picksIn = (questions: Question[]): SittingPick[] =>
  questions.flatMap((q) => {
    const id = recalledChoice(q.id)
    return id && id !== SKIPPED && q.options.some((o) => o.id === id) ? [{ question: q, optionId: id }] : []
  })

// Today's steps not asked about yet, leaving out one chosen this evening.
const openSteps = (date: string): Move[] => movesOn(date).filter((m) => m.status === 'started' && !startedInEvening(m) && !checkInFor(m.questionId))

const answersIn = (h: History, questions: Question[], date: string): AnswerRecord[] =>
  questions.flatMap((q) => {
    const id = recalledChoice(q.id)
    if (!id || id === SKIPPED) return []
    const kept = h.answers.find((a) => a.questionId === q.id)
    if (kept) return [kept]
    const o = q.options.find((x) => x.id === id)
    return o ? [{ date, questionId: q.id, theme: q.theme ?? '', depth: o.depth ?? 1, traits: o.traits ?? {}, optionId: o.id }] : []
  })

const COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six']

function summaryLine(answers: AnswerRecord[], sitting: 'morning' | 'evening'): string {
  const n = answers.length
  const when = sitting === 'morning' ? 'this morning' : 'this evening'
  if (n === 0) return `Nothing woven ${when}, and that's fine.`
  const head = `${COUNT[n] ?? n} new ${n === 1 ? 'thread' : 'threads'}`
  const needs = answers.map((a) => a.need).filter((x): x is Need => !!x)
  if (needs.length === n && needs.every((x) => x === needs[0])) return n === 1 ? `${head}, reaching for ${NEED_PHRASES[needs[0]]}.` : `${head}, all reaching for ${NEED_PHRASES[needs[0]]}.`
  return `${head} woven in ${when}.`
}

export function Close(props: Props) {
  const p = useTheme()
  const { date, questions, tomorrowThemes, sitting, glimpse, dayWithYou } = props
  const [history] = useState(loadHistory)
  const mine = answersIn(history, questions, date)
  const eveningThemes = props.sitting === 'morning' ? props.eveningThemes : null
  const endsDay = !eveningThemes
  const heavy = mine.some((a) => a.heavy || isLowMood(a.theme, a.depth))
  const [paused] = useState(() => heavyPause(history, date))
  // Finishing a sitting gets a small "done" under the finger, unless it was a heavy one.
  useEffect(() => {
    if (!heavy) feel('done')
  }, [heavy])
  const dayAnswers = props.sitting === 'evening' ? [...answersIn(history, props.morning, date), ...mine] : mine
  const glimpseFor = glimpse && !heavy ? glimpse : null
  const [thisWeek] = useState(() => week(date))
  const answered = questions.filter((q) => {
    const c = recalledChoice(q.id)
    return !!c && c !== SKIPPED
  }).length
  const [pending] = useState(() => (sitting === 'evening' ? openSteps(date) : []))

  return (
    <View style={{ gap: 20 }}>
      <View style={{ backgroundColor: p.navy, borderRadius: radius.xl, padding: 20, gap: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T v="label" tone="onNavy2">
            {dayWithYou === 1 ? `Your first ${sitting}` : `${sitting === 'morning' ? 'Morning close' : 'Evening close'} · ${dayWithYou ? `your day ${dayWithYou}` : 'this week'}`}
          </T>
          {questions.length > 0 && (
            <T v="small" tone="onNavy" bold>
              {answered} of {questions.length}
            </T>
          )}
        </View>
        <WeekTiles tiles={thisWeek} dark />
        <T v="title" tone="onNavy" style={{ fontSize: 23, lineHeight: 28 }}>
          {summaryLine(mine, sitting)}
        </T>
        <T v="small" tone="onNavy2">
          Today’s tile is woven. Your week comes together in Sunday’s Mirror, and a missed day takes nothing away.
        </T>
      </View>

      {heavy && (
        <T v="small" tone="muted">
          {HELPLINE_LINE}
        </T>
      )}

      {props.sitting === 'morning' ? (
        <>
          {glimpseFor ? <Glimpse answers={mine} history={history} date={date} name={glimpseFor.name} /> : <Thread answers={mine} history={history} date={date} paused={paused} />}
          {!heavy && <TryOne date={date} questions={questions} sitting="morning" otherwise={props.carry ? <Carry text={props.carry} /> : null} />}
          {eveningThemes && <Upcoming label={`Your evening three · ${opensAt('evening')}`} themes={eveningThemes} note={`Go about your day. They'll be waiting for you at ${opensAt('evening')}.`} />}
        </>
      ) : (
        <>
          {glimpseFor && <Glimpse answers={dayAnswers} history={history} date={date} name={glimpseFor.name} />}
          <TodaysCheckIns date={date} steps={pending} />
          {/* One question at the close at most: how the morning's choice went, only when no step is waiting. */}
          {!paused && pending.length === 0 && <RouteCheck date={date} morning={props.morning} />}
          {heavy ? (
            <ForTomorrow answers={dayAnswers} history={history} date={date} paused={paused} />
          ) : (
            <TryOne date={date} questions={questions} sitting="evening" otherwise={<ForTomorrow answers={dayAnswers} history={history} date={date} paused={paused} />} />
          )}
        </>
      )}

      {endsDay && (
        <>
          {isSaturday(date) ? <T>{SUNDAY_LINE}</T> : <Upcoming label="Tomorrow" themes={tomorrowThemes} />}
          <T style={{ fontFamily: font.semibold, fontSize: 18, lineHeight: 25 }}>
            {isSaturday(date) ? 'Sleep well. Tomorrow is for looking back: your week will be waiting in your mirror.' : `Sleep well. Your next three open at ${opensAt('morning')}.`}
          </T>
        </>
      )}
      <T v="tiny">Something to think about, never a diagnosis.</T>
    </View>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// One thing worth trying, from this sitting's own answers (shared
// sittingClose.ts): the step already chosen, or one offered with I'll try it,
// your own idea or Not now. Otherwise, the quiet line passed in, which also
// comes first for someone who'd rather think things through (My Reflection
// Style); the step stays with today's cards in Insights.
function TryOne({ date, questions, sitting, otherwise }: { date: string; questions: Question[]; sitting: 'morning' | 'evening'; otherwise: ReactNode }) {
  const [picked] = useState(() => stepToTry(picksIn(questions)))
  const [think] = useState(() => loadPrefs().style === 'think')
  const [state, setState] = useState<'open' | 'trying' | 'own' | 'planned' | 'later'>(picked?.kind === 'trying' ? 'trying' : 'open')
  if (!picked || (think && picked.kind === 'offer' && otherwise)) return <>{otherwise}</>
  const offer = picked.kind === 'offer' ? picked : null
  const option = offer ? questions.find((q) => q.id === offer.questionId)?.options.find((o) => o.id === offer.optionId) : undefined
  const step = offer ? offer.step : picked.kind === 'trying' ? picked.move.step : ''
  return (
    <Tinted style={{ gap: 10 }}>
      <T v="eyebrow">{state === 'trying' ? 'You’re trying' : 'One thing worth trying'}</T>
      <T v="h3">{step}</T>
      {state === 'open' && offer && (
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            small
            label="I'll try it"
            onPress={() => {
              startMove(date, offer.questionId, offer.optionId, offer.step, Date.now(), false, offer.local).catch(() => {})
              setState('trying')
            }}
          />
          {option && <Button kind="text" label="My own idea" onPress={() => setState('own')} />}
          <Button kind="text" label="Not now" onPress={() => setState('later')} />
        </View>
      )}
      {state === 'own' && option && <OwnIdea option={option} date={date} onMade={() => setState('planned')} onCancel={() => setState('open')} />}
      {state === 'trying' && <T tone="muted">{sitting === 'morning' ? 'I’ll ask you how it went this evening.' : 'I’ll ask you how it went tomorrow, on Today.'}</T>}
      {state === 'planned' && <T tone="muted">Your own plan, kept in your notebook. Next time you sit down, I’ll ask how it went.</T>}
      {state === 'later' && <T tone="muted">It stays with today’s cards in Insights, if you want it later.</T>}
    </Tinted>
  )
}

// One thing to carry into today: noticing, not a task.
function Carry({ text }: { text: string }) {
  return (
    <Tinted style={{ gap: 6 }}>
      <T v="eyebrow">One thing to carry into today</T>
      <T v="quote" style={{ fontSize: 17, lineHeight: 23 }}>
        {text}
      </T>
      <T v="small" tone="muted">
        You don’t need to change anything. Just notice.
      </T>
    </Tinted>
  )
}

// How today's steps went: the same three-question check-in as everywhere.
function TodaysCheckIns({ date, steps }: { date: string; steps: Move[] }) {
  const [said, setSaid] = useState<Record<string, string>>({})
  if (steps.length === 0) return null
  return (
    <View style={{ gap: 14 }}>
      <T v="eyebrow">{steps.length > 1 ? 'Your steps today' : 'Your step today'}</T>
      {steps.map((m) =>
        said[m.questionId] ? (
          <T key={m.questionId} tone="text2">
            {said[m.questionId]}
          </T>
        ) : (
          <CheckIn key={m.questionId} move={m} today={date} onDone={(reply) => setSaid((was) => ({ ...was, [m.questionId]: reply }))} />
        ),
      )}
    </View>
  )
}

// The first glimpse: a few plain lines on what the first answers hint at,
// said to the person by name, in the trait library's own warm words.
function Glimpse({ answers, history, date, name }: { answers: AnswerRecord[]; history: History; date: string; name: string | null }) {
  const p = useTheme()
  if (answers.length === 0) return null
  const points = adviceFor(answers, history, date, 'morning').points
  const top = points[0] && TRAITS[points[0].trait] ? sideOf(TRAITS[points[0].trait], points[0].high) : null
  const need = sharedNeed(answers)
  return (
    <Tinted>
      <T v="eyebrow">Your first glimpse</T>
      <T v="h3">{name ? `${name}, here’s what your first answers hint at.` : 'Here’s what your first answers hint at.'}</T>
      {top && (
        <T style={{ fontFamily: font.semibold, fontSize: 16, lineHeight: 22 }}>
          {cap(top.quality)}, with {top.with}.
        </T>
      )}
      {points.length === 0 ? (
        <T>{GLIMPSE_BALANCED}</T>
      ) : (
        points.map((pt) => (
          <View key={pt.trait} style={{ borderLeftWidth: 3, borderLeftColor: p.amber, paddingLeft: 14 }}>
            <T>
              <B>You lean towards {pt.lean}.</B> {pt.strength}
            </T>
          </View>
        ))
      )}
      {need && <T>What you reached for most: {NEED_PHRASES[need]}.</T>}
      <T tone="muted">{GLIMPSE_NEXT}</T>
    </Tinted>
  )
}

function Thread({ answers, history, date, paused }: { answers: AnswerRecord[]; history: History; date: string; paused: boolean }) {
  const [open, setOpen] = useState(false)
  if (answers.length === 0) return null
  const advice = adviceFor(answers, history, date, 'morning')
  return (
    <View style={{ gap: 10 }}>
      <T v="eyebrow">Today's thread</T>
      <T v="h3" style={{ fontSize: 17, lineHeight: 23 }}>
        {advice.headline}
      </T>
      {advice.points.length > 0 && !open && (
        <View style={{ flexDirection: 'row' }}>
          <Chip label={advice.points.length > 1 ? 'What each could mean' : 'What it could mean'} onPress={() => setOpen(true)} />
        </View>
      )}
      {open &&
        advice.points.map((pt) => (
          <View key={pt.trait} style={{ gap: 4 }}>
            <T v="h3">{pt.name}</T>
            <T v="small" tone="muted">
              {levelLine(pt.earned)}
            </T>
            <T>{pt.strength}</T>
            {pt.honest && !paused && (
              <T>
                <B>The honest part:</B> {pt.honest}
              </T>
            )}
            <T>
              <B>For the rest of today:</B> {pt.grow}
            </T>
          </View>
        ))}
    </View>
  )
}

function ForTomorrow({ answers, history, date, paused }: { answers: AnswerRecord[]; history: History; date: string; paused: boolean }) {
  const top = adviceFor(answers, history, date, 'evening').points[0]
  return (
    <View style={{ gap: 6 }}>
      <T v="eyebrow">For tomorrow</T>
      {top && <T v="h3">{top.name}</T>}
      {top && (
        <T v="small" tone="muted">
          {levelLine(top.earned)}
        </T>
      )}
      {top?.honest && !paused && (
        <T>
          <B>The honest part:</B> {top.honest}
        </T>
      )}
      <T>{top ? top.grow : QUIET_DAY}</T>
    </View>
  )
}

function RouteCheck({ date, morning }: { date: string; morning: Question[] }) {
  const [ask] = useState(() => routeToAsk(loadHistory(), morning, date))
  const [route, setRoute] = useState<Route | null>(ask?.record.route ?? null)
  if (!ask) return null
  return (
    <View style={{ gap: 10 }}>
      <T v="eyebrow">This morning's choice</T>
      <T>{routeLead(ask.label, NEED_PHRASES[ask.record.need])}</T>
      {route ? (
        <T tone="text2">{ROUTE_REPLIES[route]}</T>
      ) : (
        <>
          <T tone="muted">{ROUTE_ASK}</T>
          {(Object.keys(ROUTE_WORDS) as Route[]).map((r) => (
            <Option
              key={r}
              label={ROUTE_WORDS[r]}
              onPress={() => {
                recordRoute(ask.question.id, r, ask.label)
                setRoute(r)
              }}
            />
          ))}
        </>
      )}
    </View>
  )
}

export function Upcoming({ label, themes, note }: { label: string; themes: string[]; note?: string }) {
  if (themes.length === 0 && !note) return null
  return (
    <Tinted tone="plain">
      <T v="eyebrow">{label}</T>
      {themes.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {themes.map((t) => (
            <Chip key={t} icon={themeIcon(t)} label={themeName(t)} />
          ))}
        </View>
      )}
      {note && <T tone="muted">{note}</T>}
    </Tinted>
  )
}
