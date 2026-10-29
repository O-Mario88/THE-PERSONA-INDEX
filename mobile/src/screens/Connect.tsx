// Connect: a private space for understanding,
// encouragement and meaningful connection. No feed. Your Circle (the three
// private circles, placed on this device only), inviting a friend, Growing
// together, Our Common Ground, What Helped Us and Support & Celebrate, with
// at most two quiet "Closer together" cards above them.
import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, Share, View } from 'react-native'
import { ApiError } from '@shared/api'
import { loadRings, placeIn, RING_NAMES, RING_NOTES, RINGS, ringOf, type Ring, type Rings } from '@shared/rings'
import type { Question } from '@shared/api'
import { createInvite, getCircle, inviteLink, TAG_NAMES, TAGS, type AccountView, type CircleView, type Tag } from '@shared/social'
import { dayMonth } from '@shared/reflect'
import { radius } from '../theme'
import { Button, Card, Chip, Page, PageHeader, T } from '../ui/kit'
import { CardHead, Avatar } from '../ui/parts'
import { Section } from '../ui/Layout'
import { CloserTogether, CommonGround, Growing, SupportCelebrate, WhatHelped } from './ConnectMore'
import { NotAloneSection } from './NotAlone'
import { WalkAlongside } from './WalkAlongside'
import type { PulseCounts } from '@shared/humanPulse'

export function Connect({
  me,
  onSignIn,
  today,
  questions = [],
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
  const [error, setError] = useState('')
  const [rings, setRings] = useState<Rings>(loadRings)
  const refresh = useCallback(() => {
    getCircle().then(
      (c) => {
        setCircle(c)
        setError('')
      },
      (e) => setError(e instanceof ApiError && e.status === 401 ? '' : 'I couldn’t load your circle. Try again in a moment.'),
    )
  }, [])
  useEffect(() => {
    if (me) refresh()
  }, [me, refresh])

  if (!me) {
    return (
      <Page>
        {/* Connect is complete with no friends at all (Edwin, 2026-10-28): shared
            experiences first, and the circle as an open door, never a lock. */}
        <PageHeader title="Connect" line="A little understanding goes a long way." />
        <NotAloneSection pulse={pulse} focus={focus} onReflect={reflectOn} />
        <Section title="Reach out when you’re ready" icon="heart">
          <T tone="text2">Is there someone you’d feel comfortable reconnecting with? Your Circle is here whenever you want it, and friends never see your answers.</T>
          <Button small kind="secondary" label="Start your circle" iconAfter="chevron" onPress={onSignIn} />
        </Section>
        {today && <Growing date={today} questions={questions} circle={null} />}
      </Page>
    )
  }

  const friends = circle?.friends ?? []
  const counts = RINGS.map((r) => friends.filter((f) => ringOf(rings, f.id) === r).length)
  return (
    <Page
      aside={
        <Card>
          <Invite circle={circle} />
        </Card>
      }
    >
      <PageHeader title="Connect" line="A little understanding goes a long way." />
      <NotAloneSection pulse={pulse} focus={focus} onReflect={reflectOn} />
      {error ? <T tone="danger">{error}</T> : null}
      {friends.length > 0 && <CloserTogether friends={friends} rings={rings} />}

      <Card style={{ gap: 14 }}>
        <T v="h2">Your Circle</T>
        {friends.length > 0 && <Faces names={friends.map((f) => f.name)} />}
        <View style={{ flexDirection: 'row', gap: 24 }}>
          <Stat n={friends.length} label="People in your circle" />
          <Stat n={circle?.active ?? 0} label="Active this week" />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {RINGS.map((r, i) => (
            <View key={r} style={{ flex: 1, gap: 2 }}>
              <T v="h3">{counts[i]}</T>
              <T v="small" tone="muted">
                {RING_NAMES[r]}
              </T>
            </View>
          ))}
        </View>
        <T v="small" tone="muted">
          Which circle someone is in stays on this phone. Nobody, the server included, ever learns it.
        </T>
        {friends.map((f) => (
          <Friend key={f.id} name={f.name} sub={`${TAG_NAMES[f.tag]}${f.active ? ' · active this week' : ''}`} ring={ringOf(rings, f.id)} onPlace={(r) => setRings(placeIn(f.id, r))} />
        ))}
      </Card>

      {/* Walk alongside one person (Edwin's brief, 2026-10-29). */}
      <WalkAlongside friends={friends.filter((f) => !f.muted)} />
      {today && <Growing date={today} questions={questions} circle={circle} />}
      {friends.length > 0 && (
        <>
          <Card>
            <CommonGround friends={friends} />
          </Card>
          <Card>
            <WhatHelped />
          </Card>
          <Card>
            <SupportCelebrate today={today} />
          </Card>
        </>
      )}

      <T v="small" tone="muted" center>
        Friends see that you’re connected and the circle tag you gave them. Never your answers, your readings, or who else is here. Anything more is only what you choose to share, with the people you
        choose.
      </T>
    </Page>
  )
}

// The circle as a row of faces, the way the big apps show the people closest
// to you. Names only; nothing about their answers.
function Faces({ names }: { names: string[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingRight: 8 }}>
      {names.map((n, i) => (
        <View key={`${n}-${i}`} style={{ alignItems: 'center', gap: 6, width: 64 }}>
          <Avatar name={n} size={52} />
          <T v="tiny" tone="text2" lines={1}>
            {n.split(' ')[0]}
          </T>
        </View>
      ))}
    </ScrollView>
  )
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ gap: 2 }}>
      <T v="display">{n}</T>
      <T v="small" tone="muted">
        {label}
      </T>
    </View>
  )
}

function Friend({ name, sub, ring, onPlace }: { name: string; sub: string; ring: Ring; onPlace: (r: Ring) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <View style={{ gap: 10 }}>
      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={name} size={40} />
        <View style={{ flex: 1 }}>
          <T v="h3">{name}</T>
          <T v="small" tone="muted">
            {sub}
          </T>
        </View>
        <Chip label={RING_NAMES[ring]} />
      </Pressable>
      {open && (
        <View style={{ gap: 8, paddingLeft: 52 }}>
          {RINGS.map((r) => (
            <Pressable key={r} accessibilityRole="radio" accessibilityState={{ checked: r === ring }} onPress={() => onPlace(r)}>
              <T bold={r === ring}>
                {r === ring ? '● ' : '○ '}
                {RING_NAMES[r]}
              </T>
              <T v="small" tone="muted">
                {RING_NOTES[r]}
              </T>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

// Invite one friend: a link for them, named by the tag the person gives
// them. Three active friends unlock the Outside Mirror.
function Invite({ circle }: { circle: CircleView | null }) {
  const [tag, setTag] = useState<Tag>('friends')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [until, setUntil] = useState('')
  const active = circle?.active ?? 0
  const need = circle?.need ?? 3
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
      {/* No counts and nothing locked: the Outside Mirror is a possibility, not a target. */}
      {active < need && <T tone="text2">When a few friends are here, your Outside Mirror can show how the people around you experience you.</T>}
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
