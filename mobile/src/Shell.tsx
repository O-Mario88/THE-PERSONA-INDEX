// The app's frame on every platform: which tab is open, today's questions,
// the sittings, the first week, and the tab bar (the sidebar on a wide
// screen). The rules come from the shared code (frontend/src); this file
// only draws them.
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react'
import { AppState, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ApiError, cacheEdition, cachedEdition, getDay, pruneLocal, pruneWords, recalledChoice, sendPlanChecks, sendUnrated, type DailySet, type Question } from '@shared/api'
import { clock, dayAt, nextTurn, WINDOW_INFO, type Day, type OpenWindow, type Sitting } from '@shared/day'
import { heroFor, type Progress } from '@shared/homeHero'
import { pruneNotebook } from '@shared/notebook'
import { sendUnsent } from '@shared/moves'
import { carryLine, rememberLine } from '@shared/continuity'
import { lastMemory, linkLine, personalLine } from '@shared/todayFocus'
import { forgetPick, isFirstDay, loadHistory, todaysPick, writeFirstOf, type Half } from '@shared/profile'
import { blackOn, intimacyOn, loadPrefs, pulseOn, regionHere, savePrefs, type Prefs } from '@shared/prefs'
import { cachedPack, fetchPack, regionalFor, regionalToday } from '@shared/regional'
import { addDays, keys, load as loadKey, remove as removeKey, save as saveKey } from '@shared/storage'
import { NAME_KEY, WELCOMED } from '@shared/welcomeKeys'
import { pruneCardTexts } from '@shared/insights'
import { CONNECT_OPEN_KEY, dayWithYou, glimpseHere, inWeekOne, isNewcomer, markStarted, needsAccount, SHOW_ALL_KEY } from '@shared/firstWeek'
import { signInMethods, type AccountView } from '@shared/social'
import { pullSync } from '@shared/sync'
import { useAccount } from '@shared/useAccount'
import { startBackups } from '@shared/vault'
import { startReminders, type Opens } from './platform/reminders'
import { markWindow } from '@shared/windows'
import type { Read } from '@shared/reads/types'
import { dark as darkPalette, font, light as lightPalette, radius, RAIL_AT, RAIL_W, ThemeProvider, useTheme, WIDE } from './theme'
import { Back, Button, Page, PrivacyLine, T, Tinted } from './ui/kit'
import { Icon, type IconName } from './ui/Icon'
import { CardHead } from './ui/parts'
import { usePulse } from './ui/Pulse'
import { Sidebar, type SideItem } from './ui/Sidebar'
import { QuestionCard } from './screens/QuestionCard'
import { Close } from './screens/Close'
import { Afternoon, Midday, Night } from './screens/Windows'
import { Welcome } from './screens/Welcome'
import { SignUp } from './screens/SignUp'
import { Today } from './screens/Today'
import { Reflect } from './screens/Reflect'
import { Insights } from './screens/Insights'
import { Connect } from './screens/Connect'
import { KeptScreen, You } from './screens/You'
import { Settings } from './screens/Settings'
import { Mirror } from './screens/Mirror'
import { ReadScreen } from './screens/ReadScreen'
import { CountryAsk } from './screens/Country'
import { themeName } from '@shared/themes'
import { InstallInvite } from './screens/Browser'
import { ReminderAsk } from './screens/Reminders'
import { setLanguage, tr, trf } from '@shared/i18n'
import { backFromGoogle } from './platform/googleWeb'
import { locale } from '@shared/locale'

type State = { kind: 'loading' } | { kind: 'ready'; set: DailySet; day: string; offline?: true } | { kind: 'empty' } | { kind: 'error' }
type Tab = 'today' | 'notebook' | 'circle' | 'insights' | 'account'
type View_ = Tab | 'settings' | 'kept' | 'read' | 'signin' | 'mirror'

const TABS: { tab: Tab; name: string; icon: IconName }[] = [
  { tab: 'today', name: 'Today', icon: 'home' },
  { tab: 'notebook', name: 'Reflect', icon: 'reflect' },
  { tab: 'circle', name: 'Connect', icon: 'connect' },
  { tab: 'insights', name: 'Insights', icon: 'insights' },
  { tab: 'account', name: 'You', icon: 'you' },
]

const SIGNUP_POINTS = [
  'Your first glimpse and every answer, kept',
  'Three new questions each morning and evening',
  'Your first mirror on Sunday',
  'Your notebook stays encrypted',
]
const SIGNIN_ASKED = 'pi.signin.asked'

const themesOf = (qs: Question[]) => qs.map((q) => q.theme).filter((t): t is string => !!t)

function progressOf(qs: Question[]): Progress {
  const done = qs.filter((q) => recalledChoice(q.id)).length
  return done === 0 ? 'none' : done === qs.length ? 'done' : 'started'
}

const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale(), { weekday: 'long', timeZone: 'UTC' })

// useDay: the device's date and window, turning by itself, and checked again
// whenever the app comes back to the front.
function useDay(): Day {
  const [day, setDay] = useState(() => dayAt(new Date()))
  useEffect(() => {
    const check = () =>
      setDay((d) => {
        const now = dayAt(new Date())
        return now.date === d.date && now.window === d.window ? d : now
      })
    const now = new Date()
    const id = setTimeout(check, nextTurn(now) - now.getTime() + 1000)
    const backstop = setInterval(check, 60_000)
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check())
    return () => {
      clearTimeout(id)
      clearInterval(backstop)
      sub.remove()
    }
  }, [day])
  return day
}

// useStep: which question of the sitting is showing; it opens on the first
// unanswered one and then moves only when the person moves it.
function useStep(steps: Question[]) {
  const key = steps.map((q) => q.id).join(',')
  const [pin, setPin] = useState({ key: '', at: 0 })
  let at = pin.at
  if (pin.key !== key) {
    const open = steps.findIndex((q) => !recalledChoice(q.id))
    at = open < 0 ? steps.length : open
    setPin({ key, at })
  }
  const go = (i: number) => setPin({ key, at: Math.max(0, Math.min(i, steps.length)) })
  return { at, go }
}

export function Shell({ phoneDark, onRestart }: { phoneDark: boolean; onRestart: () => void }) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  // Back from Google's sign-in on the website: open on sign-in to finish it.
  const [tab, setTab] = useState<View_>(() => (backFromGoogle() ? 'signin' : 'today'))
  const { width: windowWidth } = useWindowDimensions()
  const wide = windowWidth >= WIDE
  const rail = windowWidth >= RAIL_AT
  const [writeFree, setWriteFree] = useState(false)
  const [writePrompt, setWritePrompt] = useState<string | null>(null)
  const [writeFollows, setWriteFollows] = useState<string | null>(null)
  const mirrorScroll = useRef<ComponentRef<typeof ScrollView>>(null)
  const [back, setBack] = useState<Tab>('today')
  const [reading, setReading] = useState<Read | null>(null)
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [connectFocus, setConnectFocus] = useState<string | null>(null)
  // The app's language: the person's choice, or the phone's (i18n/index.ts).
  setLanguage(prefs.lang ?? 'auto', locale())
  const [pickVersion, setPickVersion] = useState(0)
  const [flow, setFlow] = useState<OpenWindow | null>(null)
  const [, setFinished] = useState(0)
  const onDone = useCallback(() => setFinished((n) => n + 1), [])
  const { date, window: win, sitting: clockSitting } = useDay()
  // One Human Pulse for every page (shared humanPulse.ts), once it is on.
  const pulseCounts = usePulse(date, pulseOn(prefs))
  const [welcome, setWelcome] = useState(() => loadKey(WELCOMED) === null && loadHistory().answers.length === 0 && keys('pi.choice.').length === 0)
  const [localName, setLocalName] = useState(() => loadKey(NAME_KEY) ?? '')
  const me = useAccount()
  const [askedSignIn, setAskedSignIn] = useState(() => !!loadKey(SIGNIN_ASKED))
  const weekOne = inWeekOne(date)
  const dayN = dayWithYou(date)
  const [signup, setSignup] = useState(false)
  const [canSignIn, setCanSignIn] = useState(false)
  // The 12-word backup, when it is on: changes are sealed and sent a little
  // after they happen (vault.ts).
  useEffect(() => startBackups(), [])
  // A tapped reminder opens where it said: the day's sitting, the Mirrors or Reflect.
  const onReminder = useRef<(w: Opens) => void>(() => {})
  useEffect(() => startReminders((w) => onReminder.current(w)), [])
  useEffect(() => {
    let live = true
    signInMethods().then(
      (m) => live && setCanSignIn(!!(m.email || m.phone)),
      () => {},
    )
    return () => {
      live = false
    }
  }, [])
  const accountFirst = canSignIn && needsAccount(!!me, date)
  const connectShown = !weekOne || !!me || loadKey(CONNECT_OPEN_KEY) === '1'

  useEffect(() => {
    let live = true
    getDay(date).then(
      (set) => {
        if (!live) return
        cacheEdition(set, date)
        setState({ kind: 'ready', set, day: date })
      },
      (e) => {
        if (!live) return
        const empty = e instanceof ApiError && e.code === 'no_questions_today'
        const kept = empty ? null : cachedEdition(date)
        setState(kept ? { kind: 'ready', set: kept, day: date, offline: true } : { kind: empty ? 'empty' : 'error' })
      },
    )
    return () => {
      live = false
    }
  }, [date, attempt])

  useEffect(() => {
    pruneLocal(date, loadPrefs().wordsDays)
    pruneNotebook(date)
    pruneCardTexts(date)
    sendUnsent(date)
    sendUnrated()
    sendPlanChecks()
  }, [date])

  const set = state.kind === 'ready' && state.day === date ? state.set : null
  const offline = state.kind === 'ready' && state.offline
  const region = regionHere(prefs)
  const [pack, setPack] = useState(cachedPack)
  useEffect(() => {
    if (!region) return
    fetchPack().then(setPack, () => {})
  }, [region, date])
  const offer = useMemo(() => (set ? regionalFor(pack, region, set.date, loadHistory()) : null), [set, pack, region])
  const local = useMemo(() => (set ? regionalToday(pack, set.date) : []), [set, pack])
  const morningQs = useMemo(
    // Not while the welcome shows: Begin marks the start, and only then does
    // the newcomer's first sitting open light.
    () => (set && !welcome ? todaysPick(set.pool ?? [], set.questions ?? [], set.date, intimacyOn(prefs), 'morning', [], offer, local) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [set, welcome, prefs.adult, prefs.mild, pickVersion, offer, local],
  )
  const morning = progressOf(morningQs)
  const hasEvening = !!set?.evening?.length
  const eveningReady = hasEvening && (morning === 'done' || clockSitting === 'evening')
  const eveningQs = useMemo(
    () => (set && eveningReady && !welcome ? todaysPick(set.pool ?? [], set.evening ?? [], set.date, intimacyOn(prefs), 'evening', morningQs, offer, local) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [set, eveningReady, welcome, prefs.adult, prefs.mild, pickVersion, morningQs, offer, local],
  )
  const evening: Progress | null = hasEvening ? (eveningReady ? progressOf(eveningQs) : 'none') : null

  // Opening the app in a sitting's own window with questions left goes
  // straight to them; otherwise it opens on Today.
  const [flowFor, setFlowFor] = useState('')
  const flowKey = set ? `${set.date}|${win}` : ''
  if (set && flowFor !== flowKey) {
    setFlowFor(flowKey)
    setFlow(set.review ? null : win === 'morning' && morning !== 'done' ? 'morning' : win === 'evening' && evening !== null && evening !== 'done' ? 'evening' : null)
  }

  const sitting: Sitting | null = flow === 'morning' ? 'morning' : flow === 'evening' ? 'evening' : null
  const canSit = (s: Sitting) => (s === 'morning' ? clockSitting === 'morning' || morning === 'done' : clockSitting === 'evening')
  const steps = sitting && canSit(sitting) ? (sitting === 'morning' ? morningQs : eveningQs) : []
  const flowStep = useStep(steps)
  const current = steps[flowStep.at]
  const writeFirst = useMemo(
    () => (set ? writeFirstOf(sitting === 'morning' ? morningQs : sitting === 'evening' ? eveningQs : [], loadHistory(), set.date) : null),
    [set, sitting, morningQs, eveningQs],
  )
  const hasIntimate = !!set?.pool?.some((q) => q.care === 'intimate')
  const firstDay = useMemo(() => (set ? isFirstDay(loadHistory(), set.date) : false), [set])

  function changePrefs(next: Prefs) {
    savePrefs(next)
    setPrefs(next)
    if (next.wordsDays !== prefs.wordsDays) pruneWords(date, next.wordsDays)
    if (!set || (next.adult === prefs.adult && next.mild === prefs.mild)) return
    const started = (qs: Question[]) => qs.some((q) => recalledChoice(q.id))
    const halves = (['morning', 'evening'] as Half[]).filter((h) => !started(h === 'morning' ? morningQs : eveningQs))
    if (halves.length > 0) {
      forgetPick(set.date, halves)
      setPickVersion((v) => v + 1)
    }
  }

  function goTab(t: Tab) {
    setTab(t)
    setWriteFree(false)
    setWritePrompt(null)
    setWriteFollows(null)
    if (t === 'today' && tab === 'today') setFlow(null)
  }
  // Today's "What's on your mind?" opens Reflect on a blank page.
  function write(prompt?: string, followsUp?: string) {
    setTab('notebook')
    setWritePrompt(prompt ?? null)
    setWriteFollows(followsUp ?? null)
    setWriteFree(!prompt)
  }
  // "See how others answered": Connect, opened on that exact question.
  function exploreWithOthers(questionId: string) {
    saveKey(CONNECT_OPEN_KEY, '1')
    setConnectFocus(questionId)
    setTab('circle')
  }
  function open(v: 'settings' | 'kept' | 'signin' | 'mirror') {
    if (tab === 'today' || tab === 'notebook' || tab === 'circle' || tab === 'insights' || tab === 'account') setBack(tab)
    setTab(v)
  }
  onReminder.current = (w) => (w === 'mirrors' ? open('mirror') : setTab(w === 'reflect' ? 'notebook' : 'today'))
  function openRead(r: Read) {
    setReading(r)
    if (tab !== 'read' && tab !== 'settings' && tab !== 'kept' && tab !== 'signin' && tab !== 'mirror') setBack(tab)
    setTab('read')
  }
  function closeFlow() {
    if (set && flow && flow !== 'morning' && flow !== 'evening') markWindow(set.date, flow)
    setFlow(null)
  }
  const afterSignIn = (acc: AccountView) => {
    saveKey(SIGNIN_ASKED, '1')
    setAskedSignIn(true)
    pullSync(acc.sync).catch(() => {})
  }

  // Same rule as the web: midnight when the phone asks for dark, and on Today
  // through the evening and night; the Dark mode switch turns both off.
  const dark = blackOn(prefs) && (phoneDark || ((win === 'evening' || win === 'night' || win === 'rest') && tab === 'today'))
  const palette = dark ? darkPalette : lightPalette

  const hero = set
    ? heroFor({ date: set.date, window: win, review: !!set.review, morning, evening, pulse: prefs.pulse !== false, friend: null })
    : null

  // Focused Today: what you said last time, tied to the sitting on offer
  // only when one of its questions truly comes back to it (todayFocus.ts).
  const memory = set && !welcome ? lastMemory(set.date, loadHistory()) : null
  const offering = hero && ((hero.opens === 'morning' && morning !== 'done') || (hero.opens === 'evening' && evening !== null && evening !== 'done'))
  const link = memory && offering ? linkLine(memory, themesOf(hero.opens === 'evening' ? eveningQs : morningQs)) : null
  const dayDone = evening === 'done' || (evening === null && morning === 'done')
  const tomorrowThemes = (set?.tomorrowThemes ?? []).slice(0, 2).map((t) => themeName(t).toLowerCase())
  const tomorrow = dayDone && tomorrowThemes.length > 0 ? `Tomorrow your morning three open at ${clock(5 * 60)}, with questions about ${tomorrowThemes.join(' and ')}.` : null

  const signupName = me?.name || localName
  let body: ReactNode = null
  let fullScreen = false

  if (welcome) {
    body = (
      <Welcome
        onBegin={(name) => {
          saveKey(WELCOMED, '1')
          markStarted(date)
          if (name) {
            saveKey(NAME_KEY, name)
            setLocalName(name)
          }
          setWelcome(false)
          // The first questions straight away, whatever the hour they're open.
          if (set && !set.review) {
            if (morning !== 'done' && canSit('morning')) setFlow('morning')
            else if (evening !== null && evening !== 'done' && canSit('evening')) setFlow('evening')
          }
        }}
      />
    )
    fullScreen = true
  } else if (tab === 'signin') {
    body = (
      <SignUp
        page={{ label: 'Sign in, or come back', title: 'Your Notebook is waiting.', lead: 'No password to remember. A 6-digit code to your email, phone or WhatsApp.', head: 'Sign in' }}
        notNow="Back"
        onNotNow={() => setTab(back)}
        onDone={(acc) => {
          afterSignIn(acc)
          setTab(back)
        }}
      />
    )
    fullScreen = true
  } else if (set && tab === 'today' && (signup || (accountFirst && (flow === 'morning' || flow === 'evening')))) {
    body = (
      <SignUp
        page={{
          label: accountFirst ? 'Your next three are ready' : 'Your first glimpse is saved',
          title: signupName ? `Keep going, ${signupName}.` : 'Keep going.',
          lead: 'Make a free account to carry on. No password to remember: just a 6-digit code.',
          head: 'Create your free account',
          points: SIGNUP_POINTS,
        }}
        notNow={accountFirst ? 'Back to today' : 'Maybe later'}
        onNotNow={() => {
          setSignup(false)
          closeFlow()
        }}
        onDone={(acc) => {
          afterSignIn(acc)
          setSignup(false)
          if (!accountFirst) closeFlow()
        }}
      />
    )
    fullScreen = true
  } else if (tab === 'settings') {
    body = (
      <Settings
        prefs={prefs}
        onChange={changePrefs}
        onBack={() => setTab(back)}
        name={localName}
        onName={(n) => {
          if (n) saveKey(NAME_KEY, n)
          else removeKey(NAME_KEY)
          setLocalName(n)
        }}
        onShowAll={
          weekOne
            ? () => {
                saveKey(SHOW_ALL_KEY, '1')
                setFinished((n) => n + 1)
              }
            : undefined
        }
        onOpenKept={() => setTab('kept')}
        onRestored={onRestart}
      />
    )
  } else if (tab === 'kept') {
    body = <KeptScreen today={date} mild={!intimacyOn(prefs)} signedIn={!!me} onBack={() => setTab(back)} onDeleted={() => setFinished((n) => n + 1)} />
  } else if (tab === 'read' && reading) {
    body = <ReadScreen read={reading} date={date} intimacy={intimacyOn(prefs)} onBack={() => setTab(back)} onOpen={openRead} />
  } else if (tab === 'mirror') {
    body = (
      <Page scrollRef={mirrorScroll}>
        <Back onPress={() => setTab(back)} />
        <Mirror
          today={set?.date ?? date}
          onOpenKept={() => setTab('kept')}
          onCircle={() => goTab('circle')}
          onRead={openRead}
          onOpenSettings={() => open('settings')}
          jumpTo={(v) => {
            const sv = mirrorScroll.current
            const inner = sv?.getInnerViewRef()
            if (sv && inner) v.measureLayout(inner, (_x, y) => sv.scrollTo({ y: Math.max(0, y - 12), animated: true }))
          }}
        />
      </Page>
    )
  } else if (tab === 'notebook') {
    body = <Reflect today={date} questions={[...morningQs, ...eveningQs]} mild={!intimacyOn(prefs)} startFree={writeFree} startPrompt={writePrompt} startFollowsUp={writeFollows} name={me?.name || localName || null} />
  } else if (tab === 'insights') {
    body = <Insights today={date} questions={[...morningQs, ...eveningQs]} pulseCounts={pulseCounts} onExplore={exploreWithOthers} onOpenMirror={() => open('mirror')} />
  } else if (tab === 'circle') {
    body = (
      <Connect
        me={me}
        onSignIn={() => open('signin')}
        today={date}
        questions={[...morningQs, ...eveningQs]}
        pulse={pulseOn(prefs) ? pulseCounts : false}
        focus={connectFocus}
        onPulseOn={() => changePrefs({ ...prefs, pulse: true })}
      />
    )
  } else if (tab === 'account') {
    body = (
      <You
        me={me}
        localName={localName}
        prefs={prefs}
        onChange={changePrefs}
        onSignIn={() => open('signin')}
        onOpenSettings={() => open('settings')}
        onOpenKept={() => open('kept')}
      />
    )
  } else if (tab === 'today' && set && flow && hero) {
    fullScreen = true
    if (flow === 'morning' || flow === 'evening') {
      const name = WINDOW_INFO[flow].name
      const at = flowStep.at
      const closing = at >= steps.length
      const glimpse = closing && steps.length > 0 && glimpseHere(set.date, flow)
      // The app shows it remembers: the sitting opens with an earlier answer.
      const remember = rememberLine(set.date, loadHistory())
      const carry = closing ? carryLine(set.date, loadHistory()) : null
      body = (
        <Flow
          label={steps.length === 0 ? tr(name) : closing ? trf('{name} close', { name: tr(name) }) : trf('{name} · {n} of {m}', { name: tr(name), n: at + 1, m: steps.length })}
          onClose={closeFlow}
          dashes={steps.map((q, i) => ({ done: !!recalledChoice(q.id), now: at === i, go: () => flowStep.go(i) }))}
          line={
            steps.length > 0
              ? weekOne && dayN > 1
                ? `Day ${dayN} with you · ${weekday(set.date)}${flow === 'evening' ? ' evening' : ''}`
                : weekOne || firstDay
                  ? trf('Your first {sitting} · {day}', { sitting: tr(flow), day: weekday(set.date) })
                  : `${set.edition ? `Edition #${set.edition}` : "Today's questions"} · ${weekday(set.date)}${flow === 'evening' ? ' evening' : ''}`
              : undefined
          }
        >
          {hasIntimate && prefs.adult === null && !isNewcomer() && !closing && !firstDay && <AdultGate onAnswer={(adult) => changePrefs({ ...prefs, adult })} />}
          {steps.length === 0 && <T tone="muted">{flow === 'evening' ? `Your evening three open at ${clock(17 * 60)}.` : `Your morning three open at ${clock(5 * 60)}.`}</T>}
          {at === 0 && current && remember && (
            <Tinted tone="plain">
              <T tone="text2">{remember}</T>
            </Tinted>
          )}
          {current && (
            <QuestionCard
              key={current.id}
              question={current}
              date={set.date}
              sitting={flow}
              wordsDays={prefs.wordsDays}
              writeFirst={current.id === writeFirst}
              index={at}
              of={steps.length}
              onDone={onDone}
              onNext={() => flowStep.go(at + 1)}
              pulse={{ counts: pulseCounts, onExplore: exploreWithOthers }}
            />
          )}
          {closing &&
            steps.length > 0 &&
            (flow === 'evening' ? (
              <Close
                sitting="evening"
                date={set.date}
                questions={eveningQs}
                morning={morningQs}
                tomorrowThemes={set.tomorrowThemes ?? []}
                glimpse={glimpse ? { name: me?.name || localName || null } : undefined}
                dayWithYou={weekOne ? dayN : undefined}
              />
            ) : (
              <Close
                sitting="morning"
                date={set.date}
                questions={morningQs}
                eveningThemes={hasEvening ? themesOf(eveningQs) : null}
                tomorrowThemes={set.tomorrowThemes ?? []}
                glimpse={glimpse ? { name: me?.name || localName || null } : undefined}
                dayWithYou={weekOne ? dayN : undefined}
              />
            ))}
          {closing && steps.length > 0 && carry && (
            <Tinted style={{ gap: 6 }}>
              <T v="eyebrow">One thing to carry into today</T>
              <T v="quote" style={{ fontSize: 19, lineHeight: 26 }}>
                {carry}
              </T>
              <T v="small" tone="muted">
                You don’t need to change anything. Just notice.
              </T>
            </Tinted>
          )}
          {/* The questions lead somewhere: everything they add up to lives in Insights. */}
          {closing && steps.length > 0 && (
            <Button
              kind="text"
              label="See what your answers add up to"
              iconAfter="arrow"
              onPress={() => {
                setFlow(null)
                goTab('insights')
              }}
            />
          )}
          {closing && steps.length > 0 && glimpse && <ReminderAsk />}
          {closing && steps.length > 0 && !me && !askedSignIn && !glimpse && canSignIn && (
            <Tinted>
              <T v="h2">Your {steps.length === 3 ? 'three cards are' : 'cards are'} on this phone. Keep them everywhere.</T>
              <T tone="text2">Signing in syncs your Notebook across devices. No password, just a 6-digit code.</T>
              <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button small label="Sign in" onPress={() => open('signin')} />
                <Button
                  kind="text"
                  label="Not now"
                  onPress={() => {
                    saveKey(SIGNIN_ASKED, '1')
                    setAskedSignIn(true)
                  }}
                />
              </View>
            </Tinted>
          )}
          {closing && steps.length > 0 && hasIntimate && prefs.adult === null && isNewcomer() && dayN > 1 && !glimpse && (
            <AdultGate again onAnswer={(adult) => changePrefs({ ...prefs, adult })} />
          )}
          {closing && steps.length > 0 && prefs.country === undefined && !glimpse && <CountryAsk onAnswer={(country) => changePrefs({ ...prefs, country })} />}
          {glimpse && (
            <View style={{ gap: 12, alignItems: 'center' }}>
              <Button wide label={canSignIn && !me ? 'Keep going' : 'Back to today'} onPress={() => (canSignIn && !me ? setSignup(true) : closeFlow())} style={{ alignSelf: 'stretch' }} />
              <Button
                kind="text"
                label="Invite one friend who knows you well"
                onPress={() => {
                  saveKey(CONNECT_OPEN_KEY, '1')
                  setFlow(null)
                  goTab('circle')
                }}
              />
            </View>
          )}
          {closing && steps.length > 0 && !glimpse && <Button wide label="Back to today" onPress={closeFlow} />}
          <PrivacyLine onKept={() => open('kept')} onSettings={() => open('settings')} />
        </Flow>
      )
    } else if (flow === 'midday') {
      body = (
        <Flow label="Midday" onClose={closeFlow}>
          <Midday date={set.date} morningOpen={morning !== 'done' && clockSitting === 'morning'} onMorning={() => setFlow('morning')} />
        </Flow>
      )
    } else if (flow === 'afternoon') {
      body = (
        <Flow label={pulseOn(prefs) ? 'Live · afternoon pulse' : 'Afternoon'} onClose={closeFlow}>
          <Afternoon questions={morningQs} pulse={prefs.pulse} onPulse={(on) => changePrefs({ ...prefs, pulse: on })} />
        </Flow>
      )
    } else if (flow === 'night') {
      body = (
        <Flow label="Night" onClose={closeFlow}>
          <Night date={set.date} tomorrowThemes={set.tomorrowThemes ?? []} onClose={() => markWindow(set.date, 'night')} />
        </Flow>
      )
    }
  } else {
    // Today itself.
    body = (
      <Page wideMax={rail ? RAIL_W + 24 : 0}>
        {offline && <T tone="muted">You're offline, so I opened what this phone already had. Answers go through once you're back.</T>}
        {set && hero ? (
          <Today
            date={set.date}
            window={win}
            name={me?.name || localName || null}
            note={personalLine(weekOne ? dayN : null, memory)}
            hero={hero}
            memory={memory}
            link={link}
            tomorrow={tomorrow}
            onOpen={() => {
              if (hero.opens === 'mirror') open('mirror')
              else if (hero.opens) setFlow(hero.opens)
            }}
            onAccount={() => goTab('account')}
            themes={themesOf([...morningQs, ...eveningQs])}
            intimacy={intimacyOn(prefs)}
            onRead={openRead}
            rail={rail}
            onWrite={write}
            onInsights={() => goTab('insights')}
          >
            {!weekOne && <InviteNudge today={set.date} signedIn={!!me} onOpen={() => goTab('circle')} />}
            <InstallInvite today={set.date} />
            <PrivacyLine onKept={() => open('kept')} onSettings={() => open('settings')} />
          </Today>
        ) : state.kind === 'empty' ? (
          <T>No questions today yet. Check back soon.</T>
        ) : state.kind === 'error' ? (
          <View style={{ gap: 12 }}>
            <T>I couldn't load today's questions.</T>
            <Button
              small
              label="Try again"
              onPress={() => {
                setState({ kind: 'loading' })
                setAttempt((n) => n + 1)
              }}
            />
          </View>
        ) : (
          <T tone="muted" center>
            Getting today's questions ready…
          </T>
        )}
      </Page>
    )
  }

  const shown = TABS.filter((t) => t.tab !== 'circle' || connectShown)
  // A wide browser or Mac window keeps the sidebar through a sitting, as the
  // web app does; the welcome and sign-up pages stand alone.
  const sidebar = wide && !welcome && !(fullScreen && !flow)
  const showTabs = !wide && !fullScreen
  // As on the web: You reads "Profile" here, and after the first week the
  // Mirrors and Saved get their own rows.
  const sideItems = (ts: typeof TABS): SideItem[] =>
    ts.map((t) => ({
      key: t.tab,
      name: t.tab === 'account' ? 'Profile' : t.name,
      icon: t.icon,
      on: tab === t.tab || (t.tab === 'insights' && tab === 'mirror'),
      onPress: () => goTab(t.tab),
    }))
  const sideExtras: SideItem[] = weekOne
    ? []
    : [
        { key: 'mirror', name: 'Mirrors', icon: 'mirror', on: tab === 'mirror', onPress: () => open('mirror') },
        { key: 'kept', name: 'Saved', icon: 'bookmark', on: tab === 'kept', onPress: () => open('kept') },
      ]
  return (
    <ThemeProvider palette={palette}>
      {/* Light clock and icons on midnight, dark ones on cream. */}
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={{ flex: 1, flexDirection: sidebar ? 'row' : 'column', backgroundColor: palette.bg }}>
        {sidebar && (
          <Sidebar
            top={[...sideItems(shown.filter((t) => t.tab !== 'account')), ...sideExtras]}
            foot={[
              ...sideItems(shown.filter((t) => t.tab === 'account')),
              { key: 'settings', name: 'Settings', icon: 'gear', on: tab === 'settings', onPress: () => open('settings') },
            ]}
          />
        )}
        <View style={{ flex: 1 }}>{body}</View>
        {showTabs && <TabBar tab={tab} onTab={goTab} shown={shown} />}
      </View>
    </ThemeProvider>
  )
}

// Inner pages light the tab they belong under.
function tabHome(tab: View_): View_ {
  return tab === 'settings' || tab === 'kept' || tab === 'signin' ? 'account' : tab === 'mirror' ? 'insights' : tab
}

function TabBar({ tab, onTab, shown }: { tab: View_; onTab: (t: Tab) => void; shown: typeof TABS }) {
  const p = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', backgroundColor: p.surface, borderTopWidth: 1, borderTopColor: p.line, paddingBottom: Math.max(insets.bottom, 8), paddingTop: 8 }}
    >
      {shown.map((t) => {
        const on = tabHome(tab) === t.tab
        return (
          <Pressable
            key={t.tab}
            accessibilityRole="tab"
            accessibilityLabel={tr(t.name)}
            accessibilityState={{ selected: on }}
            onPress={() => onTab(t.tab)}
            style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 }}
          >
            <Icon name={t.icon} size={24} color={on ? p.lime : p.muted} width={on ? 2 : 1.6} />
            <Text style={{ fontFamily: on ? font.bold : font.medium, fontSize: 12, color: on ? p.text : p.muted }}>{tr(t.name)}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// A sitting or window, full screen: the back arrow, its name, the dashes.
function Flow({
  label,
  onClose,
  dashes,
  line,
  children,
}: {
  label: string
  onClose: () => void
  dashes?: { done: boolean; now: boolean; go: () => void }[]
  line?: string
  children: ReactNode
}) {
  const p = useTheme()
  return (
    <Page bottom={48}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to today" onPress={onClose} hitSlop={12}>
          <Icon name="back" size={24} color={p.text} />
        </Pressable>
        <T v="label" tone="text" center style={{ flex: 1, marginRight: 24 }}>
          {label}
        </T>
      </View>
      {dashes && dashes.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {dashes.map((d, i) => (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`Question ${i + 1} of ${dashes.length}`}
              disabled={!d.done && !d.now}
              onPress={d.go}
              style={{ flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: d.done || d.now ? p.lime : p.surface3 }}
            />
          ))}
        </View>
      )}
      {line && <T v="label">{line}</T>}
      {children}
    </Page>
  )
}

function AdultGate({ again, onAnswer }: { again?: boolean; onAnswer: (adult: boolean) => void }) {
  return (
    <Tinted tone="plain">
      <T v="h2">{again ? 'One more thing: are you 18 or older?' : 'Are you 18 or older?'}</T>
      <T tone="muted">
        Some questions are about intimacy and sex. They are frank, never graphic, and only kept as "a private answer".{again ? ' You can change this any time in Settings.' : ''}
      </T>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Button small label="Yes, I'm 18 or older" onPress={() => onAnswer(true)} />
        <Button small kind="ghost" label="No" onPress={() => onAnswer(false)} />
      </View>
    </Tinted>
  )
}

// After the first Mirror: one gentle invitation to bring in someone who knows
// you, since Connect is otherwise easy to miss. "Not now" waits a week.
const INVITE_LATER = 'pi.invite.later'

function InviteNudge({ today, signedIn, onOpen }: { today: string; signedIn: boolean; onOpen: () => void }) {
  const [later, setLater] = useState(() => loadKey(INVITE_LATER))
  if (later && addDays(later, 7) > today) return null
  return (
    <Tinted style={{ gap: 10 }}>
      <CardHead icon="people" tone="purple" title="Invite someone who knows you" />
      <T tone="text2">Three friends unlock your Outside Mirror: how the people around you experience you. They never see your answers.</T>
      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button small kind="outline" label={signedIn ? 'Invite a friend' : 'Start your circle'} iconAfter="chevron" onPress={onOpen} />
        <Button
          small
          kind="text"
          label="Not now"
          onPress={() => {
            saveKey(INVITE_LATER, today)
            setLater(today)
          }}
        />
      </View>
    </Tinted>
  )
}
