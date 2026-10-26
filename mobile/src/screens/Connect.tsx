// Connect (the web app's Circle.tsx): a private space for understanding,
// encouragement and meaningful connection. No feed. This first native
// version has Your Circle (the three private circles, placed on this device
// only) and inviting a friend; Our Common Ground, What Helped Us and
// Support & Celebrate follow from the web app next.
import { useCallback, useEffect, useState } from 'react'
import { Pressable, Share, View } from 'react-native'
import { ApiError } from '@shared/api'
import { loadRings, placeIn, RING_NAMES, RING_NOTES, RINGS, ringOf, type Ring, type Rings } from '@shared/rings'
import { createInvite, getCircle, inviteLink, TAG_NAMES, TAGS, type AccountView, type CircleView, type Tag } from '@shared/social'
import { dayMonth } from '@shared/reflect'
import { radius } from '../theme'
import { Button, Chip, Hairline, Page, T, Tinted } from '../ui/kit'
import { Avatar, Disc, Ring as Progress } from '../ui/parts'

export function Connect({ me, onSignIn }: { me: AccountView | null; onSignIn: () => void }) {
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
        <View style={{ gap: 4 }}>
          <T v="label">Connect</T>
          <T v="display">Your circle</T>
          <T tone="text2">A private space for understanding, encouragement and meaningful connection.</T>
        </View>
        <T tone="muted">
          Three friends unlock your Outside Mirror: how the people around you experience you, blended so no one answer can be traced. Friends never see your
          answers or your readings.
        </T>
        <Tinted>
          <T v="h2">Sign in to start your circle.</T>
          <T tone="text2">No password: a 6-digit code. Your answers stay as private as they are now.</T>
          <Button label="Sign in" onPress={onSignIn} />
        </Tinted>
        <Tagline />
      </Page>
    )
  }

  const friends = circle?.friends ?? []
  const counts = RINGS.map((r) => friends.filter((f) => ringOf(rings, f.id) === r).length)
  return (
    <Page>
      <View style={{ gap: 4 }}>
        <T v="label">Connect{me.handle ? ` · @${me.handle}` : ''}</T>
        <T v="display">Connect</T>
        <T tone="text2">A private space for understanding, encouragement and meaningful connection.</T>
      </View>
      {error ? <T tone="danger">{error}</T> : null}

      <View style={{ gap: 14 }}>
        <T v="h2">Your Circle</T>
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
      </View>

      <Hairline />
      <Invite circle={circle} />

      <Tagline />
    </Page>
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Disc icon="user-plus" tone="purple" size={44} />
        <View style={{ flex: 1 }}>
          <T v="h2">Invite a friend</T>
          <T v="small" tone="muted">
            They see your name and handle, never your answers.
          </T>
        </View>
        {active < need && <Progress part={active / need} big={`${active}/${need}`} label={`${active} of ${need} friends for your Outside Mirror`} size={56} />}
      </View>
      {active < need && <T tone="text2">{need - active === 1 ? 'One more friend unlocks your Outside Mirror.' : `${need - active} more friends unlock your Outside Mirror.`}</T>}
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

function Tagline() {
  return (
    <T style={{ fontFamily: 'Georgia', fontSize: 20, lineHeight: 28 }} center>
      A little closer. A little stronger. Together.
    </T>
  )
}
