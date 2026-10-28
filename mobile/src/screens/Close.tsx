// The close of a sitting: the midnight card with
// the season tapestry weaving in, then the first glimpse (first sitting
// only) or today's thread, the small steps, and what comes next. Nothing is
// scored, shared or set against anyone else.
import { useState } from 'react'
import { useWindowDimensions, View } from 'react-native'
import { recalledChoice, SKIPPED, type Question } from '@shared/api'
import { adviceFor, levelLine } from '@shared/advice'
import { isSaturday, opensAt } from '@shared/day'
import { sharedNeed } from '@shared/glimpse'
import { HELPLINE_LINE } from '@shared/helplineText'
import { heavyPause, isLowMood, loadHistory, recordRoute, type AnswerRecord, type History, type Route } from '@shared/profile'
import { NEED_PHRASES, type Need } from '@shared/needs'
import { routeToAsk } from '@shared/reaching'
import { season } from '@shared/tapestry'
import { themeName } from '@shared/themes'
import { sideOf, TRAITS } from '@shared/traits'
import { GLIMPSE_BALANCED, GLIMPSE_NEXT, QUIET_DAY, ROUTE_ASK, ROUTE_REPLIES, ROUTE_WORDS, routeLead, SUNDAY_LINE } from '@shared/words'
import { font, gutter, radius, useTheme } from '../theme'
import { B, Chip, Option, T, Tinted } from '../ui/kit'
import { Tapestry, themeIcon } from '../ui/parts'
import { Steps } from './Steps'

type Props = {
  date: string
  glimpse?: { name: string | null }
  dayWithYou?: number
  questions: Question[]
  tomorrowThemes: string[]
} & ({ sitting: 'morning'; eveningThemes: string[] | null } | { sitting: 'evening'; morning: Question[] })

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
  if (needs.length === n && needs.every((x) => x === needs[0]))
    return n === 1 ? `${head}, reaching for ${NEED_PHRASES[needs[0]]}.` : `${head}, all reaching for ${NEED_PHRASES[needs[0]]}.`
  return `${head} woven in ${when}.`
}

export function Close(props: Props) {
  const p = useTheme()
  const { width } = useWindowDimensions()
  const { date, questions, tomorrowThemes, sitting, glimpse, dayWithYou } = props
  const [history] = useState(loadHistory)
  const mine = answersIn(history, questions, date)
  const eveningThemes = props.sitting === 'morning' ? props.eveningThemes : null
  const endsDay = !eveningThemes
  const heavy = mine.some((a) => a.heavy || isLowMood(a.theme, a.depth))
  const [paused] = useState(() => heavyPause(history, date))
  const dayAnswers = props.sitting === 'evening' ? [...answersIn(history, props.morning, date), ...mine] : mine
  const glimpseFor = glimpse && !heavy ? glimpse : null
  const s = season(date)
  const answered = questions.filter((q) => {
    const c = recalledChoice(q.id)
    return !!c && c !== SKIPPED
  }).length
  const inner = Math.min(width, 640) - gutter * 2 - 40

  return (
    <View style={{ gap: 20 }}>
      <View style={{ backgroundColor: p.navy, borderRadius: radius.xl, padding: 20, gap: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T v="label" tone="onNavy2">
            {dayWithYou === 1 ? `Your first ${sitting}` : `${sitting === 'morning' ? 'Morning close' : 'Evening close'} · ${dayWithYou ? `your day ${dayWithYou}` : `day ${s.day} of 90`}`}
          </T>
          {questions.length > 0 && (
            <T v="small" tone="onNavy" bold>
              {answered} of {questions.length}
            </T>
          )}
        </View>
        <Tapestry s={s} dark cols={15} width={inner} />
        <T v="title" tone="onNavy" style={{ fontSize: 23, lineHeight: 28 }}>
          {summaryLine(mine, sitting)}
        </T>
        <T v="small" tone="onNavy2">
          Today's tile weaves in as you watch. A missed day stays open, and nothing resets.
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
          <Steps date={date} mode="morning" emptyNote={!glimpseFor} />
          {eveningThemes && <Upcoming label={`Your evening three · ${opensAt('evening')}`} themes={eveningThemes} note={`Go about your day. They'll be waiting for you at ${opensAt('evening')}.`} />}
        </>
      ) : (
        <>
          {glimpseFor && <Glimpse answers={dayAnswers} history={history} date={date} name={glimpseFor.name} />}
          <Steps date={date} mode="evening" label="Your small steps" />
          {!paused && <RouteCheck date={date} morning={props.morning} />}
          <ForTomorrow answers={dayAnswers} history={history} date={date} paused={paused} />
        </>
      )}

      {endsDay && (
        <>
          {isSaturday(date) ? <T>{SUNDAY_LINE}</T> : <Upcoming label="Tomorrow" themes={tomorrowThemes} />}
          <T style={{ fontFamily: font.semibold, fontSize: 18, lineHeight: 25 }}>
            {isSaturday(date)
              ? 'Sleep well. Tomorrow is for looking back: your week will be waiting in your mirror.'
              : `Sleep well. Your next three open at ${opensAt('morning')}.`}
          </T>
        </>
      )}
      <T v="tiny">Something to think about, never a diagnosis.</T>
    </View>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

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
