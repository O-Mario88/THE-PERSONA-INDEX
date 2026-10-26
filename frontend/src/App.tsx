import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ApiError,
  cacheEdition,
  cachedEdition,
  getDay,
  pruneLocal,
  pruneWords,
  recalledChoice,
  sendPlanChecks,
  sendUnrated,
  SKIPPED,
  type DailySet,
  type Question,
} from './api'
import { left, useDay, WINDOW_INFO, windowCloses, type OpenWindow, type Sitting } from './day'
import { QuestionCard, type Done } from './QuestionCard'
import { closeCard, DayClose, hasOpenStep, StepCheck } from './DayClose'
import { GoodThings } from './Keep'
import { PrivacyLine, RestScreen, Upcoming } from './Sittings'
import { NotebookScreen } from './NotebookScreen'
import { ReflectGuide } from './ReflectGuide'
import { pruneNotebook } from './notebook'
import { InstallInvite } from './pwa/InstallInvite'
import { ReadScreen, TodaysRead } from './Read'
import { OpenRead } from './readContext'
import type { Read } from './reads/types'
import type { Practice } from './practices'
import { themeVars } from './themes'
import { openThisWeek, sendUnsent } from './moves'
import { forgetPick, isFirstDay, loadHistory, todaysPick, writeFirstOf, type Half } from './profile'
import { CountryAsk } from './CountryViews'
import { blackOn, intimacyOn, loadPrefs, pulseOn, regionHere, savePrefs, stillOn, type Prefs } from './prefs'
import { cachedPack, fetchPack, regionalFor, regionalToday } from './regional'
import { onOtherTab } from './storage'
import { startBackups } from './vault'
import { Home, heroFor, type FeedItem, type Progress } from './Home'
import { Flow } from './Flow'
import { MiddayScreen, StepNudge } from './Midday'
import { NightScreen } from './Night'
import { PulseAsk, PulseScreen } from './PulseViews'
import { getPulse, count } from './pulse'
import { lastSeen, markWindow, noteSeen } from './windows'
import { Icon, type IconName } from './ui/icons'
import { FriendQuestion, NodPicker, TogetherAsk, TogetherCard } from './Friends'
import { useFriendToday, useNods, useTogethers } from './friendsData'
import { NodCard } from './Friends'
import { SignInSheet } from './SignIn'
import { inviteFromURL } from './social'
import { pullSync } from './sync'
import { useAccount } from './useAccount'
import { keys, load as loadKey, remove as removeKey, save as saveKey } from './storage'
import { NAME_KEY, Welcome, WELCOMED } from './Welcome'
import { pruneCardTexts } from './insights'
import { CONNECT_OPEN_KEY, dayWithYou, glimpseHere, inWeekOne, isNewcomer, lastLeaning, markStarted, needsAccount, SHOW_ALL_KEY } from './firstWeek'
import { signInMethods } from './social'

type State =
  | { kind: 'loading' }
  // day: the phone's date it was loaded for; offline: opened from what the
  // phone kept, because the server could not be reached
  | { kind: 'ready'; set: DailySet; day: string; offline?: true }
  | { kind: 'empty' }
  | { kind: 'error' }

type View = 'today' | 'insights' | 'mirror' | 'circle' | 'notebook' | 'account' | 'kept' | 'settings' | 'practice' | 'read'
// The views reached from the tabs, which Back returns to.
type Tab = 'today' | 'insights' | 'circle' | 'notebook' | 'account'
const isTab = (v: View): v is Tab =>
  v === 'today' || v === 'insights' || v === 'circle' || v === 'notebook' || v === 'account'

// The five tabs of the 2026-10-25 redesign, in its order and words.
const TABS: { tab: Tab; name: string; icon: IconName }[] = [
  { tab: 'today', name: 'Today', icon: 'home' },
  { tab: 'notebook', name: 'Reflect', icon: 'reflect' },
  { tab: 'circle', name: 'Connect', icon: 'connect' },
  { tab: 'insights', name: 'Insights', icon: 'insights' },
  { tab: 'account', name: 'You', icon: 'you' },
]
// Tabs that open before today's questions have loaded.
const ALWAYS_OPEN: Tab[] = ['today', 'insights', 'circle', 'notebook', 'account']

const themesOf = (qs: Question[]) => qs.map((q) => q.theme).filter((t): t is string => !!t)

function progressOf(qs: Question[]): Progress {
  const done = qs.filter((q) => recalledChoice(q.id)).length
  return done === 0 ? 'none' : done === qs.length ? 'done' : 'started'
}

const wideQuery = '(min-width: 900px)'
const darkQuery = '(prefers-color-scheme: dark)'

// useMedia follows a media query, for the wide layout and the phone's own dark mode.
function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const m = matchMedia(query)
    const change = () => setOn(m.matches)
    m.addEventListener?.('change', change)
    return () => m.removeEventListener?.('change', change)
  }, [query])
  return on
}

function App() {
  useEffect(prefetchScreens, [])
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [tab, setTab] = useState<View>('today')
  // Where Back goes from What I keep, Settings, a practice and a read.
  const [back, setBack] = useState<Tab | 'mirror'>('today')
  // Where the Mirror's own Back goes: the tab it was opened from.
  const [mirrorBack, setMirrorBack] = useState<Tab>('insights')
  const [practice, setPractice] = useState<Practice | null>(null)
  const [reading, setReading] = useState<Read | null>(null)
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [pickVersion, setPickVersion] = useState(0)
  // The window opened from Today, full screen; null shows Today itself.
  const [flow, setFlow] = useState<OpenWindow | null>(null)
  // What is answered lives on the phone; a finished card only asks for a
  // fresh render so the dashes catch up.
  const [, setFinished] = useState(0)
  const onDone = useCallback(() => setFinished((n) => n + 1), [])
  // The phone's clock decides the window: five a day, with the morning three
  // open from 5 am to 5 pm and the evening three from 5 pm to midnight.
  const { date, window: win, sitting: clockSitting } = useDay()
  // The one-time welcome: a first open on a phone with no answers yet.
  const [welcome, setWelcome] = useState(
    () => loadKey(WELCOMED) === null && loadHistory().answers.length === 0 && keys('pi.choice.').length === 0,
  )
  // What the person asked to be called on the welcome, kept on this phone.
  const [localName, setLocalName] = useState(() => loadKey(NAME_KEY) ?? '')
  const wide = useMedia(wideQuery)
  const phoneDark = useMedia(darkQuery)
  // Stage 5: the account, if the person signed in, and an invite link they
  // followed (kept until they join or say not now).
  const me = useAccount()
  // Where Connect opens to, when Insights points there.
  const [circleFocus, setCircleFocus] = useState<'support' | null>(null)
  const [invited] = useState(inviteFromURL)
  useEffect(() => {
    if (invited && !me) setTab('circle')
  }, [invited, me])
  const [friendDay, refreshFriend] = useFriendToday(date)
  const nods = useNods(date)
  const [togethers, refreshTogethers] = useTogethers()
  const [askedSignIn, setAskedSignIn] = useState(() => !!loadKey(SIGNIN_ASKED))
  // The first week (firstWeek.ts): read each render, since one answer can
  // change it. dayN counts the person's own days, from 1.
  const weekOne = inWeekOne(date)
  const dayN = dayWithYou(date)
  // The sign-up page after the first glimpse, and whether signing in works
  // here at all (no account is asked for where it can't be made).
  const [signup, setSignup] = useState(false)
  const [canSignIn, setCanSignIn] = useState(false)
  useEffect(() => {
    let live = true
    signInMethods().then(
      (m) => live && setCanSignIn(!!(m.email || m.phone || m.google || m.apple)),
      () => {},
    )
    return () => {
      live = false
    }
  }, [])
  const accountFirst = canSignIn && needsAccount(!!me, date)
  // Connect comes in after the first week, or sooner once there is someone
  // to connect with: signed in, invited, or asked for from the first glimpse.
  const connectShown = !weekOne || !!me || !!invited || loadKey(CONNECT_OPEN_KEY) === '1'

  useEffect(() => {
    let live = true
    getDay(date).then(
      (set) => {
        if (!live) return
        cacheEdition(set, date)
        setState((s) => {
          // Sunday has no new questions: it opens on the week in the mirror.
          if (set.review && !(s.kind === 'ready' && s.day === date)) {
            setMirrorBack('insights')
            setTab('mirror')
          }
          return { kind: 'ready', set, day: date }
        })
      },
      (e) => {
        if (!live) return
        const empty = e instanceof ApiError && e.code === 'no_questions_today'
        // Without a connection the app opens on the day it already holds.
        const kept = empty ? null : cachedEdition(date)
        setState(kept ? { kind: 'ready', set: kept, day: date, offline: true } : { kind: empty ? 'empty' : 'error' })
      },
    )
    return () => {
      live = false
    }
  }, [date, attempt])

  // Offline, try again as soon as the phone is back online.
  const offline = state.kind === 'ready' && state.offline
  useEffect(() => {
    if (!offline) return
    const again = () => setAttempt((n) => n + 1)
    window.addEventListener('online', again)
    return () => window.removeEventListener('online', again)
  }, [offline])

  // Each day the app opens: clear what has outlived its use and send any
  // small step or card tap the server did not get.
  useEffect(() => {
    pruneLocal(date, loadPrefs().wordsDays)
    pruneNotebook(date)
    pruneCardTexts(date)
    sendUnsent(date)
    sendUnrated()
    sendPlanChecks()
  }, [date])

  // While backup is on, changes worth keeping are sealed and sent a little
  // after they happen (vault.ts).
  useEffect(() => startBackups(), [])

  // When the view changes, its title takes focus, so a screen reader says
  // where the person now is and the keyboard starts from there.
  const firstView = useRef(true)
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false
      return
    }
    // The mirror's title arrives with its data, so it starts on its region.
    // A screen still loading its piece is waited for, briefly.
    // While a piece loads, React hides the screen before it with display:
    // none; its title is not the one to focus.
    const shown = (el: HTMLElement) => !el.closest('[style*="display: none"]')
    const find = () =>
      [...document.querySelectorAll<HTMLElement>('main h2')].find(shown) ?? [...document.querySelectorAll<HTMLElement>('main > section')].find(shown) ?? null
    const focusTitle = (title: HTMLElement) => {
      if (!title.hasAttribute('tabindex')) title.tabIndex = -1
      title.focus({ preventScroll: true })
    }
    const now = find()
    if (now) return focusTitle(now)
    const main = document.querySelector('main')
    if (!main) return
    const watch = new MutationObserver(() => {
      const title = find()
      if (!title) return
      watch.disconnect()
      focusTitle(title)
    })
    watch.observe(main, { childList: true, subtree: true })
    const giveUp = setTimeout(() => watch.disconnect(), 3000)
    return () => {
      watch.disconnect()
      clearTimeout(giveUp)
    }
  }, [tab, flow])

  // Another tab on this phone answered, changed a setting or deleted
  // everything: catch up.
  useEffect(
    () =>
      onOtherTab(() => {
        setPrefs(loadPrefs())
        setFinished((n) => n + 1)
      }),
    [],
  )

  // Just after midnight the set on hand is yesterday's until the new one
  // arrives; it is not shown as today's.
  const set = state.kind === 'ready' && state.day === date ? state.set : null
  const loading = state.kind === 'loading' || (state.kind === 'ready' && !set)
  // Questions about everyday life where the person lives (regional.ts): the
  // phone's copy of the pack opens at once, a fresh one follows each day.
  const region = regionHere(prefs)
  const [pack, setPack] = useState(cachedPack)
  useEffect(() => {
    if (!region) return
    fetchPack().then(setPack, () => {
      // offline or not there: the kept copy serves
    })
  }, [region, date])
  // Judged from answers before today, so the day's offer holds all day.
  const offer = useMemo(() => (set ? regionalFor(pack, region, set.date, loadHistory()) : null), [set, pack, region])
  const local = useMemo(() => (set ? regionalToday(pack, set.date) : []), [set, pack])
  // Nothing is picked behind the welcome: the pick waits until the person
  // has begun (firstWeek.ts), so a newcomer's first three open light.
  const morningQs = useMemo(
    () => (set && !welcome ? todaysPick(set.pool ?? [], set.questions ?? [], set.date, intimacyOn(prefs), 'morning', [], offer, local) : []),
    // pickVersion forces a fresh pick after a preference change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [set, welcome, prefs.adult, prefs.mild, pickVersion, offer, local],
  )
  const morning = progressOf(morningQs)
  // The evening three are picked once the morning is answered or closed, so
  // they can follow what the morning showed, and never repeat it.
  const hasEvening = !!set?.evening?.length
  const eveningReady = hasEvening && (morning === 'done' || clockSitting === 'evening')
  const eveningQs = useMemo(
    () =>
      set && eveningReady && !welcome
        ? todaysPick(set.pool ?? [], set.evening ?? [], set.date, intimacyOn(prefs), 'evening', morningQs, offer, local)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [set, eveningReady, welcome, prefs.adult, prefs.mild, pickVersion, morningQs, offer, local],
  )
  const evening: Progress | null = hasEvening ? (eveningReady ? progressOf(eveningQs) : 'none') : null

  // Opening the app in a sitting's own window with its three unanswered goes
  // straight to the questions; otherwise it opens on Today.
  // Decided while rendering, so Today never flashes before the questions.
  const [flowFor, setFlowFor] = useState('')
  const flowKey = set ? `${set.date}|${win}` : ''
  if (set && flowFor !== flowKey) {
    setFlowFor(flowKey)
    setFlow(
      set.review
        ? null
        : win === 'morning' && morning !== 'done'
          ? 'morning'
          : win === 'evening' && evening !== null && evening !== 'done'
            ? 'evening'
            : null,
    )
  }

  const sitting: Sitting | null = flow === 'morning' ? 'morning' : flow === 'evening' ? 'evening' : null
  // A sitting can be opened while its questions are open: the morning three
  // until 5 pm, the evening three from 5 pm to midnight.
  const canSit = (s: Sitting) => (s === 'morning' ? clockSitting === 'morning' || morning === 'done' : clockSitting === 'evening')
  const steps = sitting && canSit(sitting) ? (sitting === 'morning' ? morningQs : eveningQs) : []
  const flowStep = useStep(steps)
  const current = steps[flowStep.at]
  // One card a sitting opens with a short box for your own words (profile.ts).
  // Judged from answers before today, so it holds while the sitting goes on.
  const writeFirst = useMemo(
    () => (set ? writeFirstOf(sitting === 'morning' ? morningQs : sitting === 'evening' ? eveningQs : [], loadHistory(), set.date) : null),
    [set, sitting, morningQs, eveningQs],
  )
  const hasIntimate = !!set?.pool?.some((q) => q.care === 'intimate')
  // A person's first day (profile.ts): judged from answers before today, so
  // it holds all day.
  const firstDay = useMemo(() => (set ? isFirstDay(loadHistory(), set.date) : false), [set])

  // The Human Pulse count for Today's "since" list: the most answers any one
  // of this morning's questions has, so "at least" is always true.
  const [morningCount, setMorningCount] = useState<number | null>(null)
  const pulse = pulseOn(prefs)
  const morningIds = morningQs.filter((q) => q.care !== 'intimate' && !q.local).map((q) => q.id).join(',')
  useEffect(() => {
    if (!pulse || !morningIds || tab !== 'today' || flow) return
    let live = true
    Promise.all(morningIds.split(',').map(getPulse)).then((ps) => {
      const best = Math.max(0, ...ps.map((p) => p?.total ?? 0))
      if (live) setMorningCount(best > 0 ? best : null)
    })
    return () => {
      live = false
    }
  }, [pulse, morningIds, tab, flow])

  // "Since 07:51": when Today was last looked at before this visit.
  const [since] = useState(lastSeen)
  useEffect(() => {
    if (tab === 'today' && !flow) noteSeen()
  }, [tab, flow])

  function changePrefs(next: Prefs) {
    savePrefs(next)
    setPrefs(next)
    if (next.wordsDays !== prefs.wordsDays) pruneWords(date, next.wordsDays)
    // Re-pick only a sitting nobody has started, so questions never change
    // under someone mid-sitting.
    if (!set || (next.adult === prefs.adult && next.mild === prefs.mild)) return
    const started = (qs: Question[]) => qs.some((q) => recalledChoice(q.id))
    const halves = (['morning', 'evening'] as Half[]).filter((h) => !started(h === 'morning' ? morningQs : eveningQs))
    if (halves.length > 0) {
      forgetPick(set.date, halves)
      setPickVersion((v) => v + 1)
    }
  }

  function retry() {
    setState({ kind: 'loading' })
    setAttempt((n) => n + 1)
  }

  function open(view: 'mirror' | 'kept' | 'settings' | 'practice' | 'read') {
    if (view === 'mirror') setMirrorBack(isTab(tab) ? tab : 'insights')
    else if (isTab(tab) || tab === 'mirror') setBack(tab)
    setTab(view)
    window.scrollTo?.({ top: 0 })
  }

  function goTab(t: Tab) {
    if (t !== 'circle') setCircleFocus(null)
    setTab(t)
    if (t === 'today' && tab === 'today') setFlow(null)
    window.scrollTo?.({ top: 0 })
  }

  function openPractice(p: Practice) {
    setPractice(p)
    open('practice')
  }

  const openRead = useCallback((r: Read) => {
    setReading(r)
    setTab((t) => {
      if (isTab(t) || t === 'mirror') setBack(t)
      return 'read'
    })
    window.scrollTo?.({ top: 0 })
  }, [])

  function closeFlow() {
    if (set && flow && flow !== 'morning' && flow !== 'evening') markWindow(set.date, flow)
    setFlow(null)
    window.scrollTo?.({ top: 0 })
  }

  const read = set && (
    <TodaysRead date={set.date} themes={themesOf([...morningQs, ...eveningQs])} intimacy={intimacyOn(prefs)} />
  )
  // Navy when the phone asks for dark, and on Today through the evening and night;
  // the Dark mode switch turns both off.
  const dark = blackOn(prefs) && (phoneDark || ((win === 'evening' || win === 'night' || win === 'rest') && tab === 'today'))

  const hero = set
    ? heroFor({
        date: set.date,
        window: win,
        review: !!set.review,
        morning,
        evening,
        pulse: prefs.pulse !== false,
        friend: friendDay?.open && !friendDay.answered ? friendDay.friend?.name : null,
      })
    : null

  const feed: FeedItem[] = []
  if (pulse && morningCount)
    feed.push({
      key: 'pulse',
      icon: 'globe',
      text: (
        <>
          <strong>{count(morningCount)} people</strong> joined the morning's questions
        </>
      ),
      aside: win === 'morning' || win === 'midday' ? 'Pulse at 14:30' : undefined,
    })

  // Quiet nods that arrived today, from friends not muted (the server hides
  // the rest), and Answer Together, newest state first. Never counted.
  for (const n of nods?.received ?? []) {
    if (n.date !== set?.date) continue
    feed.push({
      key: `nod-${n.from.id}`,
      who: n.from.name,
      text: (
        <>
          <strong>{n.from.name}</strong> sent you a quiet nod · “{n.text}”
        </>
      ),
      aside: <Icon name="heart" size={18} />,
    })
  }
  for (const t of togethers) {
    if (t.state === 'revealed' && t.asked)
      feed.push({ key: `tog-${t.id}`, who: t.with.name, text: <><strong>{t.with.name}</strong> answered your together question</>, aside: 'Revealed below' })
  }
  const togetherCards = togethers.filter((t) => t.state !== 'revealed' || t.asked)

  let body: ReactNode = null
  const signupName = me?.name || localName
  if (set && tab === 'today' && (signup || (accountFirst && (flow === 'morning' || flow === 'evening')))) {
    const back = () => {
      setSignup(false)
      closeFlow()
    }
    body = (
      <SignInSheet
        page={{
          label: accountFirst ? 'Your next three are ready' : 'Your first glimpse is saved',
          title: signupName ? `Keep going, ${signupName}.` : 'Keep going.',
          lead: 'Make a free account to carry on. No password to remember: one tap, or a 6-digit code.',
          head: 'Create your free account',
          points: SIGNUP_POINTS,
        }}
        onDone={(acc) => {
          saveKey(SIGNIN_ASKED, '1')
          setAskedSignIn(true)
          pullSync(acc.sync).catch(() => {})
          setSignup(false)
          if (!accountFirst) closeFlow()
        }}
        onNotNow={back}
        notNow={accountFirst ? 'Back to today' : 'Maybe later'}
      />
    )
  } else if (set && tab === 'today') {
    if (!flow || !hero) {
      body = (
        <Home
          date={set.date}
          window={win}
          hero={hero!}
          onOpen={() => {
            if (hero?.opens === 'mirror') open('mirror')
            else if (hero?.opens) setFlow(hero.opens)
          }}
          onAccount={() => setTab('account')}
          name={me?.name || localName || null}
          note={homeNote(set.date, weekOne ? dayN : null)}
          since={since}
          feed={feed}
          morning={morning}
          evening={evening}
          wide={wide}
        >
          {!set.review && morning !== 'done' && win !== 'morning' && clockSitting === 'morning' && (
            <div className="card soft row-between">
              <p>Your morning three are still open until 17:00.</p>
              <button type="button" className="btn small" onClick={() => setFlow('morning')}>
                Answer them
              </button>
            </div>
          )}
          {!set.review && evening !== null && evening !== 'done' && win === 'night' && (
            <div className="card soft row-between">
              <p>Your evening three are still open until midnight.</p>
              <button type="button" className="btn small" onClick={() => setFlow('evening')}>
                Answer them
              </button>
            </div>
          )}
          {set.review && (
            <section className="card review" aria-labelledby="review-title">
              <h2 id="review-title" className="title">
                Sunday is for looking back.
              </h2>
              <p className="muted">
                No new questions today. Your week is waiting in your mirror: what you noticed, how you've been changing
                and what to try next. Fresh questions arrive tomorrow at 5 am.
              </p>
              <Upcoming label="Tomorrow" themes={set.tomorrowThemes ?? []} />
              <StepCheck date={set.date} label="This week's small steps" pick={() => openThisWeek(set.date)} />
              <GoodThings date={set.date} label="Three good things from today" />
            </section>
          )}
          {togetherCards.map((t) => (
            <TogetherCard key={t.id} t={t} onChange={refreshTogethers} />
          ))}
          {win === 'rest' && !set.review && <RestScreen date={set.date} morningThemes={themesOf(morningQs)} />}
          {read}
          <InstallInvite today={set.date} />
          <PrivacyLine onOpenKept={() => open('kept')} onOpenSettings={() => open('settings')} />
        </Home>
      )
    } else if (flow === 'morning' || flow === 'evening') {
      const name = WINDOW_INFO[flow].name
      const at = flowStep.at
      const closing = at >= steps.length
      // The close of the person's first sitting carries their first glimpse,
      // then the sign-up page (firstWeek.ts).
      const glimpse = closing && steps.length > 0 && glimpseHere(set.date, flow)
      body = (
        <Flow
          tone={flow}
          label={steps.length === 0 ? name : closing ? `${name} close` : `${name} · ${at + 1} of ${steps.length}`}
          onClose={closeFlow}
          bar={
            steps.length > 0 && (
              <>
              <nav className="dashes" aria-label="Today's questions">
                {steps.map((q, i) => {
                  const done = doneOf(recalledChoice(q.id))
                  return (
                    <button
                      key={q.id}
                      type="button"
                      className={`dash ${done ?? ''}`}
                      style={themeVars(q.theme)}
                      aria-label={`Question ${i + 1} of ${steps.length}`}
                      aria-current={at === i ? 'step' : undefined}
                      disabled={!done && at !== i}
                      onClick={() => flowStep.go(i)}
                    />
                  )
                })}
              </nav>
              <p className="label edition-line">
                {weekOne && dayN > 1
                  ? `Day ${dayN} with you · ${weekday(set.date)}${flow === 'evening' ? ' evening' : ''}`
                  : weekOne || firstDay
                    ? `Your first ${flow} · ${weekday(set.date)}`
                    : `${set.edition ? `Edition #${set.edition}` : "Today's questions"} · ${weekday(set.date)}${flow === 'evening' ? ' evening' : ''}`}
              </p>
              </>
            )
          }
          footer={
            !closing && current ? (
              <p className="muted small">
                {flow === 'evening' && at === 0 && morning !== 'none' && !weekOne
                  ? 'Then: the route you took this morning.'
                  : 'What you usually do, not what you wish you did.'}
              </p>
            ) : undefined
          }
        >
          {hasIntimate && prefs.adult === null && !isNewcomer() && !closing && !firstDay && (
            <section className="card gate" aria-labelledby="gate-title">
              <h2 id="gate-title" className="title">
                Are you 18 or older?
              </h2>
              <p className="muted">
                Some questions are about intimacy and sex. They are frank, never graphic, and only kept as "a private
                answer".
              </p>
              <div className="row-gap">
                <button type="button" className="btn small" onClick={() => changePrefs({ ...prefs, adult: true })}>
                  Yes, I'm 18 or older
                </button>
                <button type="button" className="btn small ghost" onClick={() => changePrefs({ ...prefs, adult: false })}>
                  No
                </button>
              </div>
            </section>
          )}
          {flow === 'evening' && at === 0 && !closing && <StepNudge date={set.date} evening />}
          {at === 0 &&
            !closing &&
            (nods?.received ?? [])
              .filter((n) => n.date === set.date)
              .map((n) => <NodCard key={n.from.id} name={n.from.name} text={n.text} />)}
          {steps.length === 0 && (
            <p className="muted">
              {flow === 'evening' ? 'Your evening three open at 5 pm.' : 'Your morning three open at 5 am.'}
            </p>
          )}
          {current && (
            <QuestionCard
              key={current.id}
              question={current}
              date={set.date}
              sitting={flow}
              wordsDays={prefs.wordsDays}
              writeFirst={current.id === writeFirst}
              still={stillOn(prefs)}
              index={at}
              of={steps.length}
              pulse={prefs.pulse}
              onPulse={(on) => changePrefs({ ...prefs, pulse: on })}
              onDone={onDone}
              onNext={() => flowStep.go(at + 1)}
            />
          )}
          {current && <TogetherAsk key={`ask-${current.id}`} question={current} />}
          {closing &&
            steps.length > 0 &&
            (flow === 'evening' ? (
              <DayClose
                sitting="evening"
                date={set.date}
                questions={eveningQs}
                morning={morningQs}
                tomorrowThemes={set.tomorrowThemes ?? []}
                onPractice={openPractice}
                glimpse={glimpse ? { name: me?.name || localName || null } : undefined}
                dayWithYou={weekOne ? dayN : undefined}
              />
            ) : (
              <DayClose
                sitting="morning"
                date={set.date}
                questions={morningQs}
                eveningThemes={hasEvening ? themesOf(eveningQs) : null}
                tomorrowThemes={set.tomorrowThemes ?? []}
                glimpse={glimpse ? { name: me?.name || localName || null } : undefined}
                dayWithYou={weekOne ? dayN : undefined}
              />
            ))}
          {closing && steps.length > 0 && !me && !askedSignIn && !glimpse && (
            <SignInSheet
              // On the first day it sits under the close, so the close stays in view.
              overlay={!firstDay}
              card={closeCard(flow === 'evening' ? eveningQs : morningQs)}
              title={`Your ${steps.length === 3 ? 'three cards are' : 'cards are'} on this phone. Keep them everywhere.`}
              onDone={(acc) => {
                saveKey(SIGNIN_ASKED, '1')
                setAskedSignIn(true)
                pullSync(acc.sync).catch(() => {})
              }}
              onNotNow={() => {
                saveKey(SIGNIN_ASKED, '1')
                setAskedSignIn(true)
              }}
            />
          )}
          {closing && steps.length > 0 && hasIntimate && prefs.adult === null && isNewcomer() && dayN > 1 && !glimpse && (
            <section className="card gate" aria-labelledby="gate-title">
              <h2 id="gate-title" className="title">
                One more thing: are you 18 or older?
              </h2>
              <p className="muted">
                Some questions are about intimacy and sex. They are frank, never graphic, and only kept as "a private
                answer". You can change this any time in Settings.
              </p>
              <div className="row-gap">
                <button type="button" className="btn small" onClick={() => changePrefs({ ...prefs, adult: true })}>
                  Yes, I'm 18 or older
                </button>
                <button type="button" className="btn small ghost" onClick={() => changePrefs({ ...prefs, adult: false })}>
                  No
                </button>
              </div>
            </section>
          )}
          {closing && steps.length > 0 && prefs.country === undefined && !glimpse && (
            <CountryAsk onAnswer={(country) => changePrefs({ ...prefs, country })} />
          )}
          {glimpse && (
            <div className="glimpse-next">
              <button type="button" className="btn wide close-cta" onClick={() => (canSignIn && !me ? setSignup(true) : closeFlow())}>
                {canSignIn && !me ? 'Keep going' : 'Back to today'}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  saveKey(CONNECT_OPEN_KEY, '1')
                  setFlow(null)
                  goTab('circle')
                }}
              >
                Invite one friend who knows you well
              </button>
            </div>
          )}
          {closing && steps.length > 0 && !glimpse && (
            <button type="button" className="btn wide close-cta" onClick={closeFlow}>
              {flow === 'morning' && hasEvening && hasOpenStep(set.date) && new Date().getHours() < 12
                ? "I'll try it · we'll check in at lunch"
                : 'Back to today'}
            </button>
          )}
          <PrivacyLine onOpenKept={() => open('kept')} onOpenSettings={() => open('settings')} />
        </Flow>
      )
    } else if (flow === 'midday') {
      body = (
        <Flow
          tone="midday"
          live
          label={`Midday · closes in ${left(windowCloses(set.date, 'midday') - Date.now()).text}`}
          onClose={closeFlow}
          footer={
            <div className="window-foot">
              {set && <TodaysRead compact date={set.date} themes={themesOf([...morningQs, ...eveningQs])} intimacy={intimacyOn(prefs)} />}
              <span>Then nothing until 14:30</span>
            </div>
          }
        >
          <MiddayScreen
            date={set.date}
            friend={<FriendQuestion date={set.date} today={friendDay} onCircle={() => setTab('circle')} onAnswered={refreshFriend} />}
            read={null}
            morningOpen={morning !== 'done' && clockSitting === 'morning'}
            onMorning={() => setFlow('morning')}
            onDone={() => markWindow(set.date, 'midday')}
          />
        </Flow>
      )
    } else if (flow === 'afternoon') {
      body = (
        <Flow
          tone="afternoon"
          live
          label={pulse ? 'Live · afternoon pulse' : 'Afternoon'}
          onClose={closeFlow}
          footer={
            <div className="window-foot">
              {set && <TodaysRead compact date={set.date} themes={themesOf([...morningQs, ...eveningQs])} intimacy={intimacyOn(prefs)} />}
              <span>Then the evening at 17:00</span>
            </div>
          }
        >
          {prefs.pulse === undefined && <PulseAsk onAnswer={(on) => changePrefs({ ...prefs, pulse: on })} />}
          {pulse && <PulseScreen questions={morningQs.filter((q) => recalledChoice(q.id))} />}
        </Flow>
      )
    } else if (flow === 'night') {
      body = (
        <Flow tone="night" label={`Night · ${new Date().toTimeString().slice(0, 5)}`} onClose={closeFlow}>
          <NightScreen
            date={set.date}
            tomorrowThemes={set.tomorrowThemes ?? []}
            nod={<NodPicker date={set.date} />}
            onPractice={openPractice}
            onClose={() => markWindow(set.date, 'night')}
          />
        </Flow>
      )
    }
  }

  if (welcome) {
    return (
      <div className={`app in-flow${dark ? ' is-dark' : ''}`}>
        <main className="page page-welcome">
          <h1 className="sr-only">The Persona Index</h1>
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
        </main>
      </div>
    )
  }

  return (
    <OpenRead.Provider value={openRead}>
      <div className={`app${dark ? ' is-dark' : ''}${flow && tab === 'today' ? ' in-flow' : ''}${stillOn(prefs) ? ' is-still' : ''}`} data-window={win}>
        <nav className="tabs" aria-label="Sections">
          <span className="side-brand" aria-hidden="true">
            <Icon name="leaf" size={26} />
            <span>The Persona Index</span>
          </span>
          {TABS.filter((t) => t.tab !== 'circle' || connectShown).map((t) => (
            <button
              key={t.tab}
              type="button"
              className={`tab tab-${t.tab}`}
              aria-label={t.name}
              aria-pressed={tab === t.tab || (t.tab === 'insights' && tab === 'mirror')}
              onClick={() => goTab(t.tab)}
              disabled={!set && !ALWAYS_OPEN.includes(t.tab)}
            >
              <Icon name={t.icon} size={24} />
              <span className="tab-name">
                {t.tab === 'account' ? (
                  <>
                    <span className="phone-only">You</span>
                    <span className="wide-only">Profile</span>
                  </>
                ) : (
                  t.name
                )}
              </span>
            </button>
          ))}
          {/* On a wide screen the sidebar also lists the Mirrors, Saved and
              Settings, as the reference designs do. */}
          {/* In the first week the Mirrors and Saved wait until there is
              something in them; Insights links to both. */}
          {!weekOne && (
            <>
              <button type="button" className="tab side-only" aria-label="Open your mirrors" aria-pressed={tab === 'mirror'} onClick={() => open('mirror')} disabled={!set}>
                <Icon name="mirror" size={22} />
                <span className="tab-name">Mirrors</span>
              </button>
              <button type="button" className="tab side-only" aria-label="Open saved" aria-pressed={tab === 'kept'} onClick={() => open('kept')}>
                <Icon name="bookmark" size={22} />
                <span className="tab-name">Saved</span>
              </button>
            </>
          )}
          <button type="button" className="tab side-only side-settings" aria-label="Open settings" aria-pressed={tab === 'settings'} onClick={() => open('settings')}>
            <Icon name="gear" size={22} />
            <span className="tab-name">Settings</span>
          </button>
        </nav>
        <main className={`page page-${tab}`}>
          <Suspense fallback={<div className="screen-reserve" aria-busy="true" />}>
          <h1 className="sr-only">The Persona Index</h1>

          {offline && tab === 'today' && (
            <p className="notice offline" role="status">
              You're offline, so I opened what this phone already had. Answers go through once you're back.
            </p>
          )}

          {tab === 'kept' && <KeptScreen today={date} mild={!intimacyOn(prefs)} onBack={() => setTab(back)} />}

          {tab === 'notebook' && (
            <>
              <ReflectGuide today={date} questions={[...morningQs, ...eveningQs]} />
              <NotebookScreen mild={!intimacyOn(prefs)} today={date} />
            </>
          )}

          {tab === 'circle' && (
            <CircleScreen onOpenMirror={() => open('mirror')} today={date} questions={[...morningQs, ...eveningQs]} focus={circleFocus ?? undefined} />
          )}

          {tab === 'account' && (
            <AccountScreen
              today={date}
              prefs={prefs}
              onChange={changePrefs}
              onOpenSettings={() => open('settings')}
              onOpenKept={() => open('kept')}
            />
          )}

          {tab === 'practice' && practice && <PracticeScreen practice={practice} date={date} onBack={() => setTab(back)} />}

          {tab === 'read' && reading && (
            <ReadScreen key={reading.slug} read={reading} date={date} intimacy={intimacyOn(prefs)} onBack={() => setTab(back)} />
          )}

          {tab === 'settings' && (
            <SettingsScreen
              prefs={prefs}
              onChange={changePrefs}
              onOpenKept={() => open('kept')}
              onBack={() => setTab(back)}
              name={localName}
              onShowAll={
                weekOne
                  ? () => {
                      saveKey(SHOW_ALL_KEY, '1')
                      setFinished((n) => n + 1)
                    }
                  : undefined
              }
              onName={(n) => {
                if (n) saveKey(NAME_KEY, n)
                else removeKey(NAME_KEY)
                setLocalName(n)
              }}
            />
          )}

          {loading && (tab === 'today' || tab === 'mirror') && (
            <p className="muted center">Getting today's questions ready…</p>
          )}

          {state.kind === 'empty' && tab === 'today' && <p className="notice">No questions today yet. Check back soon.</p>}

          {state.kind === 'error' && tab === 'today' && (
            <div className="notice" role="alert">
              <p>I couldn't load today's questions.</p>
              <button type="button" className="btn small" onClick={retry}>
                Try again
              </button>
            </div>
          )}

          {tab === 'insights' && (
            <InsightsScreen
              today={date}
              questions={[...morningQs, ...eveningQs]}
              pulse={pulseOn(prefs)}
              onOpenMirror={() => open('mirror')}
              onOpenKept={() => open('kept')}
              onOpenReflect={() => goTab('notebook')}
              onOpenSettings={() => open('settings')}
              onOpenSupport={() => {
                setCircleFocus('support')
                goTab('circle')
              }}
            />
          )}

          {set && tab === 'mirror' && (
            <>
              <button type="button" className="text-button back" onClick={() => setTab(mirrorBack)}>
                ← Back
              </button>
              <Mirror today={set.date} onOpenKept={() => open('kept')} onCircle={() => setTab('circle')} />
            </>
          )}

          {body}
          </Suspense>
        </main>
      </div>
    </OpenRead.Provider>
  )
}

// The heavier tab screens load as their own pieces, so the first screen
// arrives sooner. They are fetched while the phone is idle after Today
// appears, so switching tabs stays instant; the reserved space below stands
// in for the moment it takes otherwise, with no spinner and no jump.
const screens = {
  mirror: () => import('./Mirror'),
  insights: () => import('./InsightsPage'),
  kept: () => import('./Kept'),
  practice: () => import('./Practice'),
  settings: () => import('./Settings'),
  account: () => import('./Account'),
  circle: () => import('./Circle'),
}
const Mirror = lazy(() => screens.mirror().then((m) => ({ default: m.Mirror })))
const InsightsScreen = lazy(() => screens.insights().then((m) => ({ default: m.Insights })))
const KeptScreen = lazy(() => screens.kept().then((m) => ({ default: m.KeptScreen })))
const PracticeScreen = lazy(() => screens.practice().then((m) => ({ default: m.PracticeScreen })))
const SettingsScreen = lazy(() => screens.settings().then((m) => ({ default: m.SettingsScreen })))
const AccountScreen = lazy(() => screens.account().then((m) => ({ default: m.AccountScreen })))
const CircleScreen = lazy(() => screens.circle().then((m) => ({ default: m.CircleScreen })))

function prefetchScreens() {
  const all = () => Object.values(screens).forEach((load) => void load().catch(() => {}))
  if (typeof window === 'undefined') return
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
  if (idle) idle(all)
  else setTimeout(all, 1500)
}

// What an account keeps, on the sign-up page after the first glimpse.
const SIGNUP_POINTS = [
  'Your first glimpse and every answer, kept',
  'Three new questions each morning and evening',
  'Your first mirror on Sunday',
  'Your notebook stays encrypted',
]

// The sign-in sheet after the first sitting is offered once.
const SIGNIN_ASKED = 'pi.signin.asked'

// The line under the greeting: the person's own day count in their first
// week, and what their answers last leaned towards, in the traits' own words.
function homeNote(today: string, dayN: number | null): string | null {
  const lean = lastLeaning(today)
  const day = dayN && dayN > 1 ? `Day ${dayN} with you. ` : ''
  if (lean) return `${day}Last time, your answers leaned towards ${lean}.`
  return day ? day.trim() : null
}

function weekday(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en', { weekday: 'long', timeZone: 'UTC' })
}

function doneOf(choice: string | null): Done | undefined {
  if (!choice) return undefined
  return choice === SKIPPED ? 'skipped' : 'answered'
}

// useStep tracks which question of the sitting is showing: it opens on the
// first unanswered one (or the end, when all are done) and then moves only
// when the person moves it, so answering never jumps ahead on its own. When
// the sitting changes, it opens again on the first unanswered question.
function useStep(steps: Question[]) {
  const key = steps.map((q) => q.id).join(',')
  const [pin, setPin] = useState({ key: '', at: 0 })
  let at = pin.at
  if (pin.key !== key) {
    const open = steps.findIndex((q) => !recalledChoice(q.id))
    at = open < 0 ? steps.length : open
    setPin({ key, at })
  }
  const go = (i: number) => {
    setPin({ key, at: Math.max(0, Math.min(i, steps.length)) })
    window.scrollTo?.({ top: 0 })
  }
  return { at, go }
}

export default App
