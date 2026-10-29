// The rest of Connect, ported from the web app: Closer together (CloserTogether
// in SupportCelebrate.tsx), Growing together (Growing.tsx), Our Common Ground
// (CommonGround.tsx), What Helped Us (WhatHelped.tsx) and Support &
// Celebrate (SupportCelebrate.tsx), with the share, reach-out and nod
// pickers they open (Closer.tsx, Friends.tsx). The same rules hold: nothing
// is sent without a press, nothing says whether it was seen, no counts of
// likes or replies, and silence is never read as anything.
import { useCallback, useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { ApiError, recalledChoice, type Question } from '@shared/api'
import { suggestCommonTags } from '@shared/commonTags'
import { noteConnection } from '@shared/connection'
import { localDate } from '@shared/day'
import { useNods } from '@shared/friendsData'
import { loadHistory } from '@shared/profile'
import { count } from '@shared/pulse'

import {
  getCircle,
  AUDIENCES,
  audienceOf,
  getCommon,
  getReachOuts,
  getShares,
  postShare,
  putAwayReachOut,
  putCommon,
  sendNod,
  sendReachOut,
  setCommonFriend,
  SHARE_TEXT_MAX,
  SHARE_TEXT_MIN,
  withdrawShare,
  type CircleView,
  type CommonView,
  type FriendView,
  type ReachKind,
  type ReachOutView,
  type SharesView,
  type ShareKind,
  type ShareView,
  type ThemeOption,
} from '@shared/social'
import { useAccount } from '@shared/useAccount'
import { font, radius, useTheme, typeScale } from '../theme'
import { Icon, type IconName } from '../ui/Icon'
import { Button, Chip, Field, T, Tinted } from '../ui/kit'
import { CardHead, Avatar, Disc, type Tone } from '../ui/parts'
import { locale } from '@shared/locale'

const dayMonth = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale(), { day: 'numeric', month: 'long', timeZone: 'UTC' })

function names(list: string[]): string {
  if (list.length <= 1) return list[0] ?? ''
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

function Head({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <T v="h2">{title}</T>
      {sub ? (
        <T v="small" tone="muted">
          {sub}
        </T>
      ) : null}
    </View>
  )
}

function Err({ text }: { text: string }) {
  return text ? (
    <T v="small" tone="danger" style={{ marginTop: 2 }}>
      {text}
    </T>
  ) : null
}

// A friend to pick: a row with their initials, ticked or not.
function PickFriend({ name, on, onPress, radio, label }: { name: string; on: boolean; onPress: () => void; radio?: boolean; label?: string }) {
  const p = useTheme()
  return (
    <Pressable
      accessibilityRole={radio ? 'radio' : 'checkbox'}
      accessibilityState={radio ? { selected: on } : { checked: on }}
      accessibilityLabel={label ?? name}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: radio ? 11 : 6,
          borderWidth: 2,
          borderColor: on ? p.lime : p.line,
          backgroundColor: on ? p.lime : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {on && <Icon name="check" size={14} color={p.onLime} />}
      </View>
      <Avatar name={name} size={32} />
      <T style={{ flex: 1 }}>{name}</T>
    </Pressable>
  )
}

function Chips({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
}

function useFriends(): FriendView[] | null {
  const [friends, setFriends] = useState<FriendView[] | null>(null)
  useEffect(() => {
    let live = true
    getCircle().then(
      (c) => live && setFriends(c.friends.filter((f) => !f.muted && f.connect)),
      () => live && setFriends([]),
    )
    return () => {
      live = false
    }
  }, [])
  return friends
}

// ---- Closer together: at most two quiet cards ----

const MAX_CLOSER_CARDS = 2

export function CloserTogether({ friends, inner }: { friends: FriendView[]; inner: string[] }) {
  const [received, setReceived] = useState<ReachOutView[]>([])
  const refresh = useCallback(() => {
    getReachOuts().then(
      (r) => setReceived(r.received),
      () => {},
    )
  }, [])
  useEffect(refresh, [refresh])

  const quiet = friends.find((f) => !f.muted && f.connect && !f.active && inner.includes(f.id))
  const cards = received.slice(0, MAX_CLOSER_CARDS)
  const showQuiet = quiet && cards.length < MAX_CLOSER_CARDS
  if (cards.length === 0 && !showQuiet) return null

  return (
    <View style={{ gap: 14 }}>
      <T v="eyebrow">Closer together</T>
      {cards.map((r) => (
        <View key={r.id} style={{ flexDirection: 'row', gap: 12 }}>
          <Avatar name={r.from.name} size={40} />
          <View style={{ flex: 1, gap: 4 }}>
            <T v="h3">{r.kind === 'support' ? `${r.from.name} reached out` : `${r.from.name} has good news`}</T>
            <T>“{r.text}”</T>
            <T v="small" tone="muted">
              {r.kind === 'support' ? 'A call or a message outside the app might mean a lot.' : 'A quiet nod, or a word next time you see them.'}
            </T>
            <Button kind="text" small label="Put away" onPress={() => putAwayReachOut(r.id).then(refresh, () => {})} style={{ alignSelf: 'flex-start' }} />
          </View>
        </View>
      ))}
      {showQuiet && (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Avatar name={quiet.name} size={40} />
          <View style={{ flex: 1, gap: 4 }}>
            <T v="h3">{quiet.name} hasn’t been in this week</T>
            <T v="small" tone="muted">
              If they are on your mind, a quiet nod is enough. No reply needed.
            </T>
          </View>
        </View>
      )}
    </View>
  )
}

// ---- Growing together: real anonymous totals ----

type Split = { questionId: string; totalVotes: number; options: { optionId: string; count: number; percent: number; few?: boolean }[] }
type GrowingView = { date: string; answers: number; min: number; questions: Split[] }

const mondayOf = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

export function Growing({ date, questions, circle }: { date: string; questions: Question[]; circle: CircleView | null }) {
  const [g, setG] = useState<GrowingView | null>(null)
  useEffect(() => {
    let live = true
    fetch(`/api/growing?date=${date}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (body) => live && setG(body),
        () => live && setG(null),
      )
    return () => {
      live = false
    }
  }, [date])

  const monday = mondayOf(date)
  const newThisWeek = circle ? circle.friends.filter((f) => f.since >= monday).length : null

  const shares = (g?.questions ?? [])
    .filter((s) => s.totalVotes >= (g?.min ?? Infinity))
    .flatMap((s) => {
      const q = questions.find((x) => x.id === s.questionId)
      if (!q) return []
      const mine = recalledChoice(q.id)
      const pick = s.options.find((o) => o.optionId === mine) ?? [...s.options].sort((a, b) => b.count - a.count)[0]
      const option = q.options.find((o) => o.id === pick?.optionId)
      if (!pick || !option) return []
      const same = pick.optionId === mine
      const share = pick.few ? 'A few people' : `${count(pick.count)} of ${count(s.totalVotes)} people`
      const text = same ? `${share} chose “${option.label}” too. You’re not the only one.` : `${share} chose “${option.label}”.`
      return [{ id: q.id, prompt: q.prompt, text, same }]
    })

  const tiles: { icon: IconName; tone: Tone; n: string; name: string }[] = [
    { icon: 'doc', tone: 'green', n: g ? String(g.answers) : '–', name: 'answers to today’s questions' },
    ...(circle ? [{ icon: 'people' as IconName, tone: 'blue' as Tone, n: String(circle.active), name: 'friends active this week' }] : []),
    ...(newThisWeek !== null ? [{ icon: 'user-plus' as IconName, tone: 'purple' as Tone, n: String(newThisWeek), name: 'new connections this week' }] : []),
  ]

  return (
    <View style={{ gap: 14 }}>
      <Head title="Growing together" sub="How people are showing up today, so you know you are not alone in it." />
      {/* One number sits in a row beside its icon; several share the width. */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {tiles.map((t) => (
          <View key={t.name} style={tiles.length === 1 ? { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 } : { flex: 1, gap: 6 }}>
            <Disc icon={t.icon} tone={t.tone} size={40} />
            <View style={{ flexShrink: 1 }}>
              <T v="title">{t.n}</T>
              <T v="small" tone="muted">
                {t.name}
              </T>
            </View>
          </View>
        ))}
      </View>
      {shares.length > 0 ? (
        shares.map((s) => (
          <View key={s.id} style={{ gap: 4 }}>
            <T v="eyebrow" tone="muted">
              {s.same ? 'You’re not alone' : 'Today, most people'}
            </T>
            <T v="h3">{s.prompt}</T>
            <T>{s.text}</T>
            {s.same && (
              <T v="small" tone="muted">
                If it is hard for you, someone in your circle may be carrying the same thing. A quiet nod tonight can help.
              </T>
            )}
          </View>
        ))
      ) : (
        <T tone="text2">{g ? `Each question’s split shows once ${g.min} people have answered it. It fills in through the day.` : 'Today’s totals will show here.'}</T>
      )}
      <T v="small" tone="muted">
        Anonymous totals only. No one sees who chose what, and private answers are never counted here.
      </T>
    </View>
  )
}

// ---- Our Common Ground ----

const MAX_TAGS = 6

export function CommonGround({ friends }: { friends: FriendView[] }) {
  const p = useTheme()
  const [view, setView] = useState<CommonView | null>(null)
  const [mode, setMode] = useState<'show' | 'tags' | 'people'>('show')
  const [at, setAt] = useState(0)
  const [error, setError] = useState('')

  const refresh = useCallback(() => {
    getCommon().then(
      (v) => {
        setView(v)
        setError('')
      },
      () => setError('I couldn’t load your common ground just now.'),
    )
  }, [])
  useEffect(refresh, [refresh])

  if (!view) {
    return (
      <View style={{ gap: 8 }}>
        <Head title="Our Common Ground" />
        <Err text={error} />
      </View>
    )
  }

  const pair = view.pairs[at % Math.max(view.pairs.length, 1)]
  const label = (id: string) => view.tags.find((t) => t.id === id)?.label ?? id
  const reachable = friends.filter((f) => !f.muted && f.connect)

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Head title="Our Common Ground" />
        </View>
        {view.pairs.length > 1 && mode === 'show' && (
          <Pressable accessibilityRole="button" accessibilityLabel="Next friend" onPress={() => setAt(at + 1)} hitSlop={12}>
            <Icon name="chevron" size={20} color={p.text} />
          </Pressable>
        )}
      </View>

      {mode === 'tags' && (
        <TagChooser
          view={view}
          onSaved={() => {
            setMode(view.optedIn.length ? 'show' : 'people')
            refresh()
          }}
          onCancel={() => setMode('show')}
        />
      )}
      {mode === 'people' && <PeopleChooser view={view} friends={reachable} onChange={refresh} onDone={() => setMode('show')} />}

      {mode === 'show' &&
        (pair ? (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flexDirection: 'row' }}>
                <Avatar name="You" size={36} />
                <View style={{ marginLeft: -10 }}>
                  <Avatar name={pair.friend.name} size={36} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <T v="h3">You & {pair.friend.name}</T>
                <T v="small" tone="muted">
                  A shared perspective
                </T>
              </View>
            </View>
            <T style={{ fontFamily: font.semibold, ...typeScale.heading }}>{pair.headline}</T>
            <Chips>
              {pair.shared.map((id) => (
                <Chip key={id} label={label(id)} />
              ))}
            </Chips>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <Icon name="heart" size={20} color={p.text} />
              <View style={{ flex: 1 }}>
                <T bold>Something to explore together</T>
                <T tone="muted">“{pair.explore}”</T>
              </View>
            </View>
          </View>
        ) : (
          <T tone="text2">
            {!view.mine.length
              ? 'Pick a few things that matter to you. A friend sees what you share only if you both choose to look.'
              : !view.optedIn.length
                ? 'Choose who to find common ground with. Nothing shows until they choose you too.'
                : 'Nothing in common shows yet. It appears when a friend you chose has chosen you too.'}
          </T>
        ))}

      {mode === 'show' && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 8 }}>
          <Button kind="text" small label={view.mine.length ? 'What matters to you' : 'Choose what matters to you'} onPress={() => setMode('tags')} />
          {view.mine.length > 0 && reachable.length > 0 && <Button kind="text" small label="Who you find it with" onPress={() => setMode('people')} />}
        </View>
      )}
      <Err text={error} />
    </View>
  )
}

function TagChooser({ view, onSaved, onCancel }: { view: CommonView; onSaved: () => void; onCancel: () => void }) {
  // A first choice starts from what the phone suggests; nothing is sent until Save.
  const [suggested] = useState(() => (view.mine.length ? [] : suggestCommonTags(loadHistory().answers).filter((id) => view.tags.some((t) => t.id === id))))
  const [picked, setPicked] = useState<string[]>(view.mine.length ? view.mine : suggested)
  const [error, setError] = useState('')
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : picked.length < MAX_TAGS ? [...picked, id] : picked)
  function save() {
    putCommon(picked).then(onSaved, (e) =>
      setError(e instanceof ApiError && e.code === 'tags_changed_recently' ? 'You can add new ones once a week. Removing one is always fine.' : 'That didn’t save.'),
    )
  }
  return (
    <View style={{ gap: 12 }}>
      <T v="small" tone="muted">
        Up to six. Only the ones you share with a friend are ever shown to them.
      </T>
      {suggested.length > 0 && (
        <T v="small" tone="muted">
          Suggested from the themes you answer most, worked out on this phone. Untick any you’d rather keep to yourself; nothing is shared until you save.
        </T>
      )}
      <Chips>
        {view.tags.map((t) => (
          <Chip key={t.id} label={t.label} on={picked.includes(t.id)} onPress={() => toggle(t.id)} />
        ))}
      </Chips>
      {view.nextChange ? (
        <T v="small" tone="muted">
          New ones can be added from {dayMonth(view.nextChange)}.
        </T>
      ) : null}
      <Err text={error} />
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Button small label="Save" onPress={save} />
        <Button small kind="text" label="Cancel" onPress={onCancel} />
      </View>
    </View>
  )
}

function PeopleChooser({ view, friends, onChange, onDone }: { view: CommonView; friends: FriendView[]; onChange: () => void; onDone: () => void }) {
  const [error, setError] = useState('')
  return (
    <View style={{ gap: 10 }}>
      <T v="small" tone="muted">
        You see what you share with someone only when you have both chosen each other. Turning it off is silent.
      </T>
      <T v="small" bold>
        Find common ground with
      </T>
      {friends.map((f) => (
        <PickFriend
          key={f.id}
          name={f.name}
          label={`Find common ground with ${f.name}`}
          on={view.optedIn.includes(f.id)}
          onPress={() => setCommonFriend(f.id, !view.optedIn.includes(f.id)).then(onChange, () => setError('That didn’t save.'))}
        />
      ))}
      <Err text={error} />
      <Button small label="Done" onPress={onDone} style={{ alignSelf: 'flex-start' }} />
    </View>
  )
}

// ---- What Helped Us ----

export function WhatHelped() {
  const p = useTheme()
  const [view, setView] = useState<SharesView | null>(null)
  const [theme, setTheme] = useState('all')
  const [composing, setComposing] = useState(false)
  const [showMine, setShowMine] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(() => {
    getShares().then(
      (v) => {
        setView(v)
        setError('')
      },
      () => setError('I couldn’t load what your circle shared just now.'),
    )
  }, [])
  useEffect(refresh, [refresh])

  const themeName = (id: string) => view?.themes.find((t) => t.id === id)?.label ?? ''
  const received = view?.received ?? []
  const present = view?.themes.filter((t) => received.some((s) => s.theme === t.id)) ?? []
  const shown = theme === 'all' ? received : received.filter((s) => s.theme === theme)
  const sent = view?.sent ?? []

  return (
    <View style={{ gap: 14 }}>
      <Head title="What Helped Us" sub="Real perspectives from people you trust." />
      {present.length > 1 && (
        <Chips>
          <Chip label="All themes" on={theme === 'all'} onPress={() => setTheme('all')} />
          {present.map((t) => (
            <Chip key={t.id} label={t.label} on={theme === t.id} onPress={() => setTheme(t.id)} />
          ))}
        </Chips>
      )}
      {shown.length > 0
        ? shown.slice(0, 3).map((s) => <HelpedCard key={s.id} share={s} title={themeName(s.theme)} />)
        : view && <T tone="text2">Nothing shared with you yet. When a friend shares what helped them, it shows here, for you alone.</T>}

      {composing ? (
        <ShareComposer
          kind="helped"
          text=""
          onDone={() => {
            setComposing(false)
            refresh()
          }}
          onCancel={() => setComposing(false)}
        />
      ) : (
        <Button small kind="secondary" label="Share what helped you" onPress={() => setComposing(true)} style={{ alignSelf: 'flex-start' }} />
      )}

      {sent.length > 0 && (
        <View style={{ gap: 10 }}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showMine }} onPress={() => setShowMine(!showMine)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T bold>What you’ve shared ({sent.length})</T>
            <View style={{ transform: [{ rotate: showMine ? '90deg' : '0deg' }] }}>
              <Icon name="chevron" size={16} color={p.text} />
            </View>
          </Pressable>
          {showMine &&
            sent.map((s) => (
              <View key={s.id} style={{ gap: 2 }}>
                <T>“{s.text}”</T>
                <T v="small" tone="muted">
                  {themeName(s.theme)} · with {s.to.length ? s.to.join(', ') : 'no one now'}
                </T>
                <Button kind="text" small label="Withdraw" onPress={() => withdrawShare(s.id).then(refresh, () => setError('That didn’t go through.'))} style={{ alignSelf: 'flex-start' }} />
              </View>
            ))}
        </View>
      )}
      <Err text={error} />
    </View>
  )
}

function HelpedCard({ share: s, title }: { share: ShareView; title: string }) {
  const p = useTheme()
  return (
    <View style={{ gap: 8, paddingVertical: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Disc icon="connect" tone="blue" size={36} />
        <View style={{ flex: 1 }}>
          <T bold>{s.kind === 'win' ? 'A win from your circle' : 'A perspective from your circle'}</T>
          <T v="small" tone="muted">
            Shared by someone you trust
          </T>
        </View>
      </View>
      {title ? (
        <T v="eyebrow" tone="muted">
          {title}
        </T>
      ) : null}
      <T style={{ fontFamily: font.semibold, ...typeScale.heading }}>“{s.text}”</T>
      {s.why ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Icon name="sun" size={18} color={p.text} />
          <View style={{ flex: 1 }}>
            <T v="small" bold>
              Why it helped
            </T>
            <T v="small" tone="muted">
              {s.why}
            </T>
          </View>
        </View>
      ) : null}
      {s.try ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Icon name="heart" size={18} color={p.text} />
          <View style={{ flex: 1 }}>
            <T v="small" bold>
              Try it for yourself
            </T>
            <T v="small" tone="muted">
              {s.try}
            </T>
          </View>
        </View>
      ) : null}
    </View>
  )
}

// ---- Support & Celebrate ----

type Open = 'encourage' | 'celebrate' | 'support' | null

export function SupportCelebrate({ today }: { today?: string }) {
  const [open, setOpen] = useState<Open>(null)
  const close = () => setOpen(null)
  return (
    <View style={{ gap: 14 }}>
      <Head title="Support & Celebrate" sub="Reach out, appreciate progress and be there for each other." />
      {open === null && (
        <>
          {today && (
            <Tinted tone="purple">
              <CardHead icon="heart" tone="purple" title="Is there someone you’d like to encourage?" />
              <T v="small" tone="muted">
                A small message can make a big difference.
              </T>
              <Button small kind="secondary" label="Reach out" iconAfter="arrow" onPress={() => setOpen('encourage')} style={{ alignSelf: 'flex-start' }} />
            </Tinted>
          )}
          <Tinted tone="amber">
            <CardHead icon="sun" tone="amber" title="Celebrate a win together" />
            <T v="small" tone="muted">
              Made progress on something that matters? Tell someone who matters.
            </T>
            <Button small kind="secondary" label="Share a win" iconAfter="arrow" onPress={() => setOpen('celebrate')} style={{ alignSelf: 'flex-start' }} />
          </Tinted>
          <Button kind="text" small label="Having a hard week? Ask someone for support" onPress={() => setOpen('support')} style={{ alignSelf: 'flex-start' }} />
        </>
      )}
      {open === 'encourage' && today && (
        <>
          <NodPicker date={today} title="Who would you like to encourage?" />
          <Button kind="text" small label="Close" onPress={close} style={{ alignSelf: 'flex-start' }} />
        </>
      )}
      {(open === 'celebrate' || open === 'support') && <ReachOutPicker kind={open} onDone={close} onCancel={close} />}
    </View>
  )
}

// ---- the pickers (Closer.tsx, Friends.tsx) ----

const SHARE_NOTE_MAX = 160
const KIND_TITLES: Record<ShareKind, string> = { helped: 'Share what helped', win: 'Share a win' }

export function ShareComposer({ kind, text: initial, onDone, onCancel }: { kind: ShareKind; text: string; onDone: () => void; onCancel: () => void }) {
  const friends = useFriends()
  const [themes, setThemes] = useState<ThemeOption[]>([])
  const [text, setText] = useState(initial.trim().slice(0, SHARE_TEXT_MAX))
  const [theme, setTheme] = useState('')
  const [why, setWhy] = useState('')
  const [tryThis, setTryThis] = useState('')
  const [to, setTo] = useState<string[]>([])
  const [sentTo, setSentTo] = useState<string[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    getShares().then(
      (s) => live && setThemes(s.themes),
      () => {},
    )
    return () => {
      live = false
    }
  }, [])

  const words = text.trim()
  const ready = words.length >= SHARE_TEXT_MIN && theme !== '' && to.length > 0

  function share() {
    if (!ready || !friends) return
    const notes = { ...(why.trim() ? { why: why.trim() } : {}), ...(tryThis.trim() ? { try: tryThis.trim() } : {}) }
    postShare({ kind, theme, text: words, ...notes, to }).then(
      () => {
        noteConnection('share', localDate())
        setSentTo(friends.filter((f) => to.includes(f.id)).map((f) => f.name))
      },
      (e) => setError(e instanceof ApiError && e.code === 'no_links' ? 'Links can’t be shared here. Say it in your own words.' : 'That didn’t go through. Nothing was shared.'),
    )
  }

  if (sentTo) {
    return (
      <View style={{ gap: 10 }}>
        <T tone="leaf" bold>
          Shared with {names(sentTo)}. You can withdraw it any time in Connect.
        </T>
        <Button small label="Done" onPress={onDone} style={{ alignSelf: 'flex-start' }} />
      </View>
    )
  }

  return (
    <View style={{ gap: 12 }}>
      <T v="h3">{KIND_TITLES[kind]}</T>
      <Field label="What your friends will see" multiline maxLength={SHARE_TEXT_MAX} value={text} onChangeText={setText} />
      <T v="small" tone="muted">
        Exactly these words, and nothing else from your answers. {SHARE_TEXT_MAX - text.length} characters left.
      </T>
      {kind === 'helped' && (
        <>
          <Field label="Why it helped (optional)" maxLength={SHARE_NOTE_MAX} value={why} onChangeText={setWhy} />
          <Field label="Try it for yourself (optional)" maxLength={SHARE_NOTE_MAX} value={tryThis} onChangeText={setTryThis} />
        </>
      )}
      {themes.length > 0 && (
        <Chips>
          {themes.map((t) => (
            <Chip key={t.id} label={t.label} on={theme === t.id} onPress={() => setTheme(t.id)} />
          ))}
        </Chips>
      )}
      <T v="small" bold>
        Who sees it
      </T>
      {/* A whole group in one tap: loved ones, workmates or close friends (Edwin, 2026-10-29). */}
      {friends && friends.length > 0 && AUDIENCES.some((a) => audienceOf(friends, a.id).length > 0) && (
        <Chips>
          {AUDIENCES.filter((a) => audienceOf(friends, a.id).length > 0).map((a) => {
            const ids = audienceOf(friends, a.id)
            const all = ids.every((id) => to.includes(id))
            return <Chip key={a.id} label={a.label} icon="people" on={all} onPress={() => setTo(all ? to.filter((x) => !ids.includes(x)) : [...new Set([...to, ...ids])])} />
          })}
        </Chips>
      )}
      {friends === null ? (
        <T v="small" tone="muted">
          Finding your circle…
        </T>
      ) : friends.length === 0 ? (
        <T v="small" tone="muted">
          Add someone to your circle first.
        </T>
      ) : (
        friends.map((f) => <PickFriend key={f.id} name={f.name} on={to.includes(f.id)} onPress={() => setTo(to.includes(f.id) ? to.filter((x) => x !== f.id) : [...to, f.id])} />)
      )}
      <Err text={error} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Button label={to.length === 0 ? 'Share' : `Share with ${to.length} ${to.length === 1 ? 'friend' : 'friends'}`} disabled={!ready} onPress={share} />
        <Button kind="text" small label="Keep it private" onPress={onCancel} />
      </View>
    </View>
  )
}

const REACH_TITLES: Record<ReachKind, string> = { support: 'Ask someone for support', celebrate: 'Celebrate a win together' }

export function ReachOutPicker({ kind, onDone, onCancel }: { kind: ReachKind; onDone: () => void; onCancel: () => void }) {
  const friends = useFriends()
  const [phrases, setPhrases] = useState<ThemeOption[]>([])
  const [to, setTo] = useState('')
  const [phrase, setPhrase] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [error, setError] = useState('')
  const p = useTheme()

  useEffect(() => {
    let live = true
    getReachOuts().then(
      (r) => live && setPhrases(r.phrases[kind] ?? []),
      () => {},
    )
    return () => {
      live = false
    }
  }, [kind])

  function send() {
    if (!to || !phrase) return
    sendReachOut(to, kind, phrase).then(
      () => {
        noteConnection(kind, localDate())
        setSentTo(friends?.find((f) => f.id === to)?.name ?? '')
      },
      (e) => setError(e instanceof ApiError && e.code === 'already_reached_out' ? 'You’ve sent them one of these today.' : 'That didn’t go through.'),
    )
  }

  if (sentTo) {
    return (
      <View style={{ gap: 10 }}>
        <T tone="leaf" bold>
          Sent to {sentTo}. They are not asked to reply.
        </T>
        <Button small label="Done" onPress={onDone} style={{ alignSelf: 'flex-start' }} />
      </View>
    )
  }

  return (
    <View style={{ gap: 10 }}>
      <T v="h3">{REACH_TITLES[kind]}</T>
      <T v="small" bold>
        To
      </T>
      {friends?.length === 0 && (
        <T v="small" tone="muted">
          Add someone to your circle first.
        </T>
      )}
      {friends?.map((f) => (
        <PickFriend key={f.id} radio name={f.name} on={to === f.id} onPress={() => setTo(f.id)} />
      ))}
      <T v="small" bold>
        Say
      </T>
      {phrases.map((ph) => (
        <Pressable
          key={ph.id}
          accessibilityRole="radio"
          accessibilityState={{ selected: phrase === ph.id }}
          onPress={() => setPhrase(ph.id)}
          style={{
            borderWidth: 1,
            borderColor: phrase === ph.id ? p.lime : p.line,
            backgroundColor: phrase === ph.id ? p.accentWash : 'transparent',
            borderRadius: radius.md,
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <T>{ph.label}</T>
        </Pressable>
      ))}
      <Err text={error} />
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Button label="Send" disabled={!to || !phrase} onPress={send} />
        <Button kind="text" small label="Not now" onPress={onCancel} />
      </View>
      <T v="small" tone="muted">
        One of these a day to each friend. You won’t be told whether they saw it.
      </T>
    </View>
  )
}

function tonightsCards(cards: string[], date: string): number[] {
  let h = 0
  for (const ch of date) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const out: number[] = []
  for (let i = 0; out.length < Math.min(4, cards.length); i++) {
    const c = (h + i * 7) % cards.length
    if (!out.includes(c)) out.push(c)
  }
  return out
}

export function NodPicker({ date, title }: { date: string; title?: string }) {
  const me = useAccount()
  const p = useTheme()
  const [friends, setFriends] = useState<FriendView[] | null>(null)
  const nods = useNods(date)
  const [to, setTo] = useState<string | null>(null)
  const [card, setCard] = useState<number | null>(null)
  const [all, setAll] = useState(false)
  const [sent, setSent] = useState<string[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (!me?.connect) return
    getCircle().then(
      (c) => setFriends(c.friends.filter((f) => !f.muted && f.connect)),
      () => setFriends([]),
    )
  }, [me])
  if (!me?.connect || !friends?.length || !nods) return null
  const already = [...nods.sentTo, ...sent]
  const offered = all ? nods.cards.map((_, i) => i) : tonightsCards(nods.cards, date)
  function send() {
    if (to === null || card === null) return
    sendNod(to, card, date).then(
      () => {
        noteConnection('nod', date)
        setSent([...sent, to])
        setTo(null)
        setCard(null)
      },
      (e) => setError(e instanceof ApiError && e.code === 'already_nodded' ? 'You’ve nodded to them today.' : 'That didn’t go through.'),
    )
  }
  return (
    <View style={{ gap: 10 }}>
      <T v="h3">
        {title ?? 'Send a quiet nod before bed?'} <T tone="muted">No reply needed.</T>
      </T>
      <Chips>
        {friends.map((f) => (
          <Chip key={f.id} label={`${f.name}${already.includes(f.id) ? ' · sent' : ''}`} on={to === f.id} onPress={already.includes(f.id) ? undefined : () => setTo(to === f.id ? null : f.id)} />
        ))}
      </Chips>
      {to && (
        <View style={{ gap: 8 }}>
          {offered.map((i) => (
            <Pressable
              key={i}
              accessibilityRole="radio"
              accessibilityState={{ selected: card === i }}
              onPress={() => setCard(i)}
              style={{
                borderWidth: 1,
                borderColor: card === i ? p.lime : p.line,
                backgroundColor: card === i ? p.accentWash : 'transparent',
                borderRadius: radius.md,
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
            >
              <T>“{nods.cards[i]}”</T>
            </Pressable>
          ))}
          {!all && <Button kind="text" small label="More nods" onPress={() => setAll(true)} style={{ alignSelf: 'flex-start' }} />}
          <Button wide label="Send the nod" disabled={card === null} onPress={send} />
        </View>
      )}
      {sent.length > 0 && !to && <T v="small">Sent. It waits for them to open the app; you won’t be told when.</T>}
      {error ? <T v="small">{error}</T> : null}
    </View>
  )
}
