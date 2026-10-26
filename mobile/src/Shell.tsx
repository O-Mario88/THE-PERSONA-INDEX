// The app's frame, the native twin of the web app's App.tsx: which tab is
// open, today's questions, the sittings, the first week, and the tab bar.
// The rules come from the shared code (frontend/src); only the drawing is
// native. Keep the two in step: a change to the flow in App.tsx belongs here
// too.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppState, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ApiError, cacheEdition, cachedEdition, getDay, pruneLocal, pruneWords, recalledChoice, sendPlanChecks, sendUnrated, type DailySet, type Question } from '@shared/api'
import { dayAt, nextTurn, WINDOW_INFO, type Day, type OpenWindow, type Sitting } from '@shared/day'
import { heroFor, type Progress } from '@shared/Home'
import { pruneNotebook } from '@shared/notebook'
import { sendUnsent } from '@shared/moves'
import { forgetPick, isFirstDay, loadHistory, todaysPick, writeFirstOf, type Half } from '@shared/profile'
import { blackOn, intimacyOn, loadPrefs, pulseOn, regionHere, savePrefs, type Prefs } from '@shared/prefs'
import { cachedPack, fetchPack, regionalFor, regionalToday } from '@shared/regional'
import { keys, load as loadKey, remove as removeKey, save as saveKey } from '@shared/storage'
import { NAME_KEY, WELCOMED } from '@shared/Welcome'
import { pruneCardTexts } from '@shared/insights'
import { CONNECT_OPEN_KEY, dayWithYou, glimpseHere, inWeekOne, isNewcomer, lastLeaning, markStarted, needsAccount, SHOW_ALL_KEY } from '@shared/firstWeek'
import { signInMethods, type AccountView } from '@shared/social'
import { pullSync } from '@shared/sync'
import { useAccount } from '@shared/useAccount'
import { markWindow } from '@shared/windows'
import type { Read } from '@shared/reads/types'
import { dark as darkPalette, font, light as lightPalette, radius, ThemeProvider, useTheme } from './theme'
import { Button, Page, PrivacyLine, T, Tinted } from './ui/kit'
import { Icon, type IconName } from './ui/Icon'
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
import { ReadScreen } from './screens/ReadScreen'
import { CountryAsk } from './screens/Country'

type State = { kind: 'loading' } | { kind: 'ready'; set: DailySet; day: string; offline?: true } | { kind: 'empty' } | { kind: 'error' }
type Tab = 'today' | 'notebook' | 'circle' | 'insights' | 'account'
type View_ = Tab | 'settings' | 'kept' | 'read' | 'signin'

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

function homeNote(today: string, dayN: number | null): string | null {
  const lean = lastLeaning(today)
  const day = dayN && dayN > 1 ? `Day ${dayN} with you. ` : ''
  if (lean) return `${day}Last time, your answers leaned towards ${lean}.`
  return day ? day.trim() : null
}

const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en', { weekday: 'long', timeZone: 'UTC' })

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

export function Shell({ phoneDark }: { phoneDark: boolean }) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [tab, setTab] = useState<View_>('today')
  const [back, setBack] = useState<Tab>('today')
  const [reading, setReading] = useState<Read | null>(null)
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [pickVersion, setPickVersion] = useState(0)
  const [flow, setFlow] = useState<OpenWindow | null>(null)
  const [, setFinished] = useState(0)
  const onDone = useCallback(() => setFinished((n) => n + 1), [])
  const { date, window: win, sitting: clockSitting } = useDay()
  const [welcome, setWelcome] = useState(() => loadKey(WELCOMED) === null && loadHistory().answers.length === 0 && keys('pi.choice.').length === 0)
  const [localName, setLocalName] = useState(() => loadKey(NAME_KEY) ?? '')
  const me = useAccount()
  const [askedSignIn, setAskedSignIn] = useState(() => !!loadKey(SIGNIN_ASKED))
  const weekOne = inWeekOne(date)
  const dayN = dayWithYou(date)
  const [signup, setSignup] = useState(false)
  const [canSignIn, setCanSignIn] = useState(false)
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
    () => (set ? todaysPick(set.pool ?? [], set.questions ?? [], set.date, intimacyOn(prefs), 'morning', [], offer, local) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [set, prefs.adult, prefs.mild, pickVersion, offer, local],
  )
  const morning = progressOf(morningQs)
  const hasEvening = !!set?.evening?.length
  const eveningReady = hasEvening && (morning === 'done' || clockSitting === 'evening')
  const eveningQs = useMemo(
    () => (set && eveningReady ? todaysPick(set.pool ?? [], set.evening ?? [], set.date, intimacyOn(prefs), 'evening', morningQs, offer, local) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [set, eveningReady, prefs.adult, prefs.mild, pickVersion, morningQs, offer, local],
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
    if (t === 'today' && tab === 'today') setFlow(null)
  }
  function open(v: 'settings' | 'kept' | 'signin') {
    if (tab === 'today' || tab === 'notebook' || tab === 'circle' || tab === 'insights' || tab === 'account') setBack(tab)
    setTab(v)
  }
  function openRead(r: Read) {
    setReading(r)
    if (tab !== 'read' && tab !== 'settings' && tab !== 'kept' && tab !== 'signin') setBack(tab)
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

  const dark = blackOn(prefs) && (phoneDark || ((win === 'evening' || win === 'night' || win === 'rest') && tab === 'today'))
  const palette = dark ? darkPalette : lightPalette

  const hero = set
    ? heroFor({ date: set.date, window: win, review: !!set.review, morning, evening, pulse: prefs.pulse !== false, friend: null })
    : null

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
      />
    )
  } else if (tab === 'kept') {
    body = <KeptScreen today={date} signedIn={!!me} onBack={() => setTab(back)} onDeleted={() => setFinished((n) => n + 1)} />
  } else if (tab === 'read' && reading) {
    body = <ReadScreen read={reading} date={date} intimacy={intimacyOn(prefs)} onBack={() => setTab(back)} onOpen={openRead} />
  } else if (tab === 'notebook') {
    body = <Reflect today={date} questions={[...morningQs, ...eveningQs]} />
  } else if (tab === 'insights') {
    body = <Insights today={date} questions={[...morningQs, ...eveningQs]} pulse={pulseOn(prefs)} onOpenReflect={() => goTab('notebook')} onOpenSettings={() => goTab('account')} />
  } else if (tab === 'circle') {
    body = <Connect me={me} onSignIn={() => open('signin')} />
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
      body = (
        <Flow
          label={steps.length === 0 ? name : closing ? `${name} close` : `${name} · ${at + 1} of ${steps.length}`}
          onClose={closeFlow}
          dashes={steps.map((q, i) => ({ done: !!recalledChoice(q.id), now: at === i, go: () => flowStep.go(i) }))}
          line={
            steps.length > 0
              ? weekOne && dayN > 1
                ? `Day ${dayN} with you · ${weekday(set.date)}${flow === 'evening' ? ' evening' : ''}`
                : weekOne || firstDay
                  ? `Your first ${flow} · ${weekday(set.date)}`
                  : `${set.edition ? `Edition #${set.edition}` : "Today's questions"} · ${weekday(set.date)}${flow === 'evening' ? ' evening' : ''}`
              : undefined
          }
        >
          {hasIntimate && prefs.adult === null && !isNewcomer() && !closing && !firstDay && <AdultGate onAnswer={(adult) => changePrefs({ ...prefs, adult })} />}
          {steps.length === 0 && <T tone="muted">{flow === 'evening' ? 'Your evening three open at 5 pm.' : 'Your morning three open at 5 am.'}</T>}
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
      <Page>
        {offline && <T tone="muted">You're offline, so I opened what this phone already had. Answers go through once you're back.</T>}
        {set && hero ? (
          <Today
            date={set.date}
            window={win}
            name={me?.name || localName || null}
            note={homeNote(set.date, weekOne ? dayN : null)}
            hero={hero}
            onOpen={() => {
              // The Mirrors come to this app next; until then Sunday opens Insights.
              if (hero.opens === 'mirror') goTab('insights')
              else if (hero.opens) setFlow(hero.opens)
            }}
            onAccount={() => goTab('account')}
            morning={morning}
            evening={evening}
            themes={themesOf([...morningQs, ...eveningQs])}
            intimacy={intimacyOn(prefs)}
            onRead={openRead}
          >
            {!set.review && morning !== 'done' && win !== 'morning' && clockSitting === 'morning' && (
              <Tinted>
                <T>Your morning three are still open until 17:00.</T>
                <Button small label="Answer them" onPress={() => setFlow('morning')} />
              </Tinted>
            )}
            {!set.review && evening !== null && evening !== 'done' && win === 'night' && (
              <Tinted>
                <T>Your evening three are still open until midnight.</T>
                <Button small label="Answer them" onPress={() => setFlow('evening')} />
              </Tinted>
            )}
            {set.review && (
              <Tinted tone="plain">
                <T v="h2">Sunday is for looking back.</T>
                <T tone="muted">No new questions today. Fresh questions arrive tomorrow at 5 am.</T>
              </Tinted>
            )}
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

  const showTabs = !fullScreen
  return (
    <ThemeProvider palette={palette}>
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <View style={{ flex: 1 }}>{body}</View>
        {showTabs && <TabBar tab={tab} onTab={goTab} shown={TABS.filter((t) => t.tab !== 'circle' || connectShown)} />}
      </View>
    </ThemeProvider>
  )
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
        const on = tab === t.tab
        return (
          <Pressable
            key={t.tab}
            accessibilityRole="tab"
            accessibilityLabel={t.name}
            accessibilityState={{ selected: on }}
            onPress={() => onTab(t.tab)}
            style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 }}
          >
            <Icon name={t.icon} size={24} color={on ? p.lime : p.muted} width={on ? 2 : 1.6} />
            <Text style={{ fontFamily: on ? font.bold : font.medium, fontSize: 12, color: on ? p.text : p.muted }}>{t.name}</Text>
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
