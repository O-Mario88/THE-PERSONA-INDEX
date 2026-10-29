// Connect: a place to feel understood by people you trust (Edwin,
// 2026-10-29). Three places and a clear end: With your people (your list,
// each a Connection or in your Inner Circle, kept on this device only, and
// what each chose to share with you), Shared with you (a small inbox with
// private replies, ending "You're caught up"), and You're not alone
// (anonymous totals, kept visually apart from friends). No feed, no activity
// status, no counts of anything but your own people. The fuller Circle
// (Common Ground, Support & Celebrate, walking alongside) waits (release.ts).
import { useCallback, useEffect, useState } from 'react'
import { Share, View } from 'react-native'
import { ApiError } from '@shared/api'
import type { Question } from '@shared/api'
import type { PulseCounts } from '@shared/humanPulse'
import { CAUGHT_UP, inboxOf, markSeen, type InboxEntry } from '@shared/inbox'
import { dayMonth } from '@shared/reflect'
import { CIRCLE_ACCESS, INNER_CIRCLE, innerCircle, setInner } from '@shared/rings'
import {
  createInvite,
  getCircle,
  getOutside,
  getReflectTogether,
  getShares,
  inviteLink,
  postNote,
  removeSharePerson,
  TAG_NAMES,
  TAGS,
  type AccountView,
  type CircleView,
  type FriendView,
  type OutsidePrompt,
  type OutsideView,
  type ReflectTogetherView,
  type RTQuestion,
  type SharesView,
  type Tag,
} from '@shared/social'
import { radius } from '../theme'
import { Back, Button, Card, Chip, Page, PageHeader, RowGroup, RowLink, T, Tinted } from '../ui/kit'
import { CardHead, Avatar } from '../ui/parts'
import { Section } from '../ui/Layout'
import { NotAloneSection } from './NotAlone'
import { AskNoteSheet, InviteCard, NoteCard } from './OutsideNotes'
import { ReflectTogetherSheet, TogetherCard } from './ReflectTogether'
import { KIND_LABEL, ReceivedCard, RepliesCard } from './SharedWithYou'

const REFRESH_MS = 30_000 // while Connect is open, new items and replies show without leaving it

export function Connect({
  me,
  onSignIn,
  pulse = false,
  focus = null,
  onWrite = () => {},
}: {
  me: AccountView | null
  onSignIn: () => void
  today?: string
  questions?: Question[]
  pulse?: PulseCounts | null | false // the shared Human Pulse; false while it is off
  focus?: string | null // the question someone came here from
  onWrite?: (prompt?: string) => void
}) {
  const reflectOn = () => onWrite('When you saw how others answered, what did you notice? Does it change how you see your own answer?')
  const [circle, setCircle] = useState<CircleView | null>(null)
  const [shares, setShares] = useState<SharesView | null>(null)
  const [together, setTogether] = useState<ReflectTogetherView | null>(null)
  const [outside, setOutside] = useState<OutsideView | null>(null)
  const [entries, setEntries] = useState<InboxEntry[] | null>(null)
  const [error, setError] = useState('')
  const [view, setView] = useState<'home' | 'people'>('home')
  const refresh = useCallback(() => {
    getCircle().then(
      (c) => {
        setCircle(c)
        setError('')
      },
      (e) => setError(e instanceof ApiError && e.status === 401 ? '' : 'I couldn’t load your people just now. Try again in a moment.'),
    )
    getShares().then(setShares, () => {})
    getReflectTogether().then(setTogether, () => {})
    getOutside().then(setOutside, () => {})
  }, [])
  useEffect(() => {
    if (!me) return
    refresh()
    const timer = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(timer)
  }, [me, refresh])
  // What is new is worked out once per load, then remembered as seen.
  useEffect(() => {
    if (!shares) return
    const next = inboxOf(shares, together?.items ?? [], outside ?? undefined)
    setEntries(next)
    markSeen(next)
  }, [shares, together, outside])

  const notAlone = (
    <Section title="You’re not alone" icon="globe">
      <T v="small" tone="muted">
        Anonymous totals from everyone who answered. Never from the people you know, and never who.
      </T>
      <NotAloneSection pulse={pulse} focus={focus} onReflect={reflectOn} />
    </Section>
  )

  if (!me) {
    return (
      <Page>
        <PageHeader title="Connect" line="Feel understood by the people you trust." />
        <Section title="With your people" icon="people">
          <Card style={{ gap: 10 }}>
            <T tone="text2">Share a part of what you write with someone you trust, and reflect together. Everything stays private until you choose to share it, and friends never see your answers.</T>
            <Button small kind="secondary" label="Start your circle" iconAfter="chevron" onPress={onSignIn} />
          </Card>
        </Section>
        {notAlone}
      </Page>
    )
  }

  const friends = circle?.friends ?? []
  if (view === 'people') return <People friends={friends} shares={shares} questions={together?.questions ?? []} prompts={outside?.prompts ?? []} onBack={() => setView('home')} onChanged={refresh} />

  const anyNew = (entries ?? []).some((e) => e.isNew)
  return (
    <Page>
      <PageHeader title="Connect" line="Feel understood by the people you trust." />
      {error ? <T tone="danger">{error}</T> : null}

      <Section title="With your people" icon="people">
        <RowGroup>
          <RowLink inGroup label={`Your people · ${friends.length}`} sub="Who they are to you, what they chose to share with you, and reflecting together" onPress={() => setView('people')} />
        </RowGroup>
      </Section>

      <Section title="Shared with you" icon="heart">
        {(entries ?? []).map((e) =>
          e.kind === 'received' ? (
            <ReceivedCard key={e.id} share={e.share} isNew={e.isNew} onChanged={refresh} />
          ) : e.kind === 'replies' ? (
            <RepliesCard key={e.id} share={e.share} isNew={e.isNew} onChanged={refresh} />
          ) : e.kind === 'together' ? (
            <TogetherCard key={e.id} item={e.item} question={together?.questions.find((q) => q.id === e.item.questionId)} isNew={e.isNew} onChanged={refresh} />
          ) : e.kind === 'invite' ? (
            <InviteCard key={e.id} invite={e.invite} prompts={outside?.prompts ?? []} isNew={e.isNew} onChanged={refresh} />
          ) : (
            <NoteCard key={e.id} note={e.note} prompts={outside?.prompts ?? []} isNew={e.isNew} onChanged={refresh} onReflect={onWrite} />
          ),
        )}
        {entries && entries.length === 0 && <T tone="text2">Nothing shared with you yet. When someone you trust shares something with you, it shows here, for you alone.</T>}
        {entries && (
          <T v="small" tone="muted" center>
            {anyNew ? 'That’s everything new.' : CAUGHT_UP}
          </T>
        )}
      </Section>

      {notAlone}

      <T v="small" tone="muted" center>
        Friends see your name and anything you deliberately send them. Never your answers, your journal, or who is in your Inner Circle.
      </T>
    </Page>
  )
}

// Your people: everyone you are connected with, each a Connection or in your
// Inner Circle, with the last thing they chose to share with you. No status,
// no last seen, no rankings.
function People({
  friends,
  shares,
  questions,
  prompts,
  onBack,
  onChanged,
}: {
  friends: FriendView[]
  shares: SharesView | null
  questions: RTQuestion[]
  prompts: OutsidePrompt[]
  onBack: () => void
  onChanged: () => void
}) {
  const [inner, setInnerIds] = useState<string[]>(innerCircle)
  const [reflecting, setReflecting] = useState<FriendView | null>(null)
  const [askingNote, setAskingNote] = useState<FriendView | null>(null)
  const [note, setNote] = useState('')
  // Leaving the Inner Circle ends access to what was shared with it, quietly.
  async function placeInner(id: string, on: boolean) {
    setInnerIds(setInner(id, on))
    setNote('')
    if (on || !shares) return
    const shared = shares.sent.filter((s) => s.audience === 'inner' && s.people.some((x) => x.id === id))
    await Promise.all(shared.map((s) => removeSharePerson(s.id, id).catch(() => {})))
    if (shared.length) {
      setNote('They no longer see what you shared with your Inner Circle. Anything they already read can’t be taken back.')
      onChanged()
    }
  }
  const lastFrom = (id: string) => shares?.received.find((s) => s.from.id === id)
  return (
    <Page>
      <Back onPress={onBack} />
      <PageHeader title={`Your people · ${friends.length}`} line="A small, private list. Nobody else sees it." />
      <Card style={{ gap: 10 }}>
        {CIRCLE_ACCESS.map((a) => (
          <View key={a.who} style={{ gap: 2 }}>
            <T bold>{a.who}</T>
            <T v="small" tone="text2">
              {a.sees}
            </T>
          </View>
        ))}
        <T v="small" tone="muted">
          {`Who is in your ${INNER_CIRCLE} stays on this phone. Adding someone shows them nothing you shared before.`}
        </T>
      </Card>
      {note ? (
        <Tinted tone="blue">
          <T v="small">{note}</T>
        </Tinted>
      ) : null}
      {friends.map((f) => {
        const last = lastFrom(f.id)
        return (
          <Card key={f.id} style={{ gap: 10 }}>
            <Friend name={f.name} sub={TAG_NAMES[f.tag]} inner={inner.includes(f.id)} onInner={(on) => placeInner(f.id, on)} />
            {last ? (
              <View style={{ gap: 4 }}>
                <T v="small" tone="muted">{`${KIND_LABEL[last.kind]} · Shared with you`}</T>
                <T v="quote">{`“${last.text}”`}</T>
                {last.replies && (
                  <Button
                    small
                    kind="text"
                    label="Send encouragement"
                    onPress={() => postNote(last.id, { kind: 'encourage' }).then(onChanged, () => setNote('That didn’t go through. Try again in a moment.'))}
                    style={{ alignSelf: 'flex-start' }}
                  />
                )}
              </View>
            ) : (
              <T v="small" tone="muted">{`Nothing shared with you yet. What ${f.name.split(' ')[0]} chooses to share shows here.`}</T>
            )}
            {!f.muted && f.connect && (
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {questions.length > 0 && <Button small kind="secondary" label="Reflect together" onPress={() => setReflecting(f)} />}
                {prompts.length > 0 && <Button small kind="text" label="Ask for a note" onPress={() => setAskingNote(f)} />}
              </View>
            )}
          </Card>
        )
      })}
      {friends.length === 0 && <T tone="text2">Nobody here yet. Invite someone you trust below.</T>}
      <Card>
        <Invite />
      </Card>
      {reflecting && <ReflectTogetherSheet friend={reflecting} questions={questions} onClose={() => setReflecting(null)} onSent={onChanged} />}
      {askingNote && <AskNoteSheet friend={askingNote} prompts={prompts} onClose={() => setAskingNote(null)} onSent={onChanged} />}
    </Page>
  )
}

// One person: their name, how you know them, and whether they are in your
// Inner Circle. Nothing about their activity: no status, no last seen.
function Friend({ name, sub, inner, onInner }: { name: string; sub: string; inner: boolean; onInner: (on: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Avatar name={name} size={40} />
      <View style={{ flex: 1 }}>
        <T v="h3">{name}</T>
        <T v="small" tone="muted">
          {inner ? `${sub} · ${INNER_CIRCLE}` : sub}
        </T>
      </View>
      <Chip label={inner ? INNER_CIRCLE : `Add to ${INNER_CIRCLE}`} on={inner} onPress={() => onInner(!inner)} />
    </View>
  )
}

// Invite one friend: a link for them, named by the tag the person gives them.
function Invite() {
  const [tag, setTag] = useState<Tag>('friends')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [until, setUntil] = useState('')
  async function invite() {
    setBusy(true)
    setError('')
    try {
      const { code, expiresOn } = await createInvite(tag)
      setUntil(expiresOn)
      await Share.share({ message: `Join my circle on The Persona Index: ${inviteLink(code)}` })
    } catch {
      setError('I couldn’t make an invite just now. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <View style={{ gap: 14 }}>
      <CardHead icon="user-plus" tone="purple" v="h2" title="Invite a friend" />
      <T v="small" tone="muted">
        They see your name and handle, never your answers.
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {TAGS.map((t) => (
          <Chip key={t} label={TAG_NAMES[t]} on={tag === t} onPress={() => setTag(t)} />
        ))}
      </View>
      <View style={{ borderRadius: radius.md }}>
        <Button wide icon="share" label="Share an invite link" busy={busy} onPress={invite} />
      </View>
      {error ? <T tone="danger">{error}</T> : null}
      {until ? (
        <T v="small" tone="muted">
          Your invite link works until {dayMonth(until)}.
        </T>
      ) : null}
    </View>
  )
}
