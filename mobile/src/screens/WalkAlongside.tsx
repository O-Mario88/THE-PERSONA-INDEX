// Walk alongside one person (Edwin's brief, 2026-10-29: Paired Mirrors): on
// Connect under Your Circle, choosing one person, answering an ask, or
// stopping; and in the Sunday Mirror, under The moments we share, where the
// two weeks rhymed and differed, with one question for the two of them.
// Built from what both people's answers reached for, never the answers.
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { ApiError } from '@shared/api'
import { acceptPair, askPair, endPair, getPair, getPairWeek, pairWeekWords, type PairInfo, type PairWeek } from '@shared/pair'
import { mondayOf } from '@shared/profile'
import { dayMonth } from '@shared/reflect'
import { accountToken, type FriendView } from '@shared/social'
import { radius, useTheme } from '../theme'
import { Button, Card, RowGroup, RowLink, T } from '../ui/kit'
import { CardHead } from '../ui/parts'
import { PatronNote } from '../ui/Patron'

const ABOUT = 'Each Sunday you’d both see where your weeks rhymed and differed, from what your answers reached for. Never your answers or your words.'

export function WalkAlongside({ friends }: { friends: FriendView[] }) {
  const [pair, setPair] = useState<PairInfo | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    getPair().then(
      (p) => live && setPair(p),
      () => live && setPair({ state: 'none' }),
    )
    return () => {
      live = false
    }
  }, [])

  async function act(run: () => Promise<PairInfo>) {
    setBusy(true)
    setNote(null)
    try {
      setPair(await run())
    } catch (e) {
      setNote(e instanceof ApiError && e.code === 'pair_busy' ? 'They’re already walking alongside someone.' : 'That didn’t go through. Please try again.')
    }
    setBusy(false)
    setChoosing(false)
  }

  if (!pair) return null
  const name = pair.with?.name || 'them'
  return (
    <Card style={{ gap: 10 }}>
      <CardHead icon="together" tone="green" title="Walk alongside one person" />
      {pair.state === 'none' && (
        <>
          <T tone="text2">{`Choose one person from your circle: a partner, a sister, a close friend. ${ABOUT}`}</T>
          {friends.length === 0 ? (
            <T v="small" tone="muted">
              Once someone is in your circle, you can walk alongside them.
            </T>
          ) : choosing ? (
            <>
              <RowGroup>
                {friends.map((f) => (
                  <RowLink key={f.id} inGroup label={f.name} sub={f.handle ? `@${f.handle}` : undefined} onPress={() => act(() => askPair(f.id))} />
                ))}
              </RowGroup>
              <Button small kind="text" label="Cancel" onPress={() => setChoosing(false)} />
            </>
          ) : (
            <Button small kind="secondary" label="Choose someone" busy={busy} onPress={() => setChoosing(true)} />
          )}
        </>
      )}
      {pair.state === 'asked' && (
        <>
          <T tone="text2">{`You asked ${name} to walk alongside you. Once they say yes, your Sundays begin.`}</T>
          <Button small kind="text" label="Take back the ask" busy={busy} onPress={() => act(endPair)} />
        </>
      )}
      {pair.state === 'invited' && (
        <>
          <T tone="text2">{`${name} would like to walk alongside you. ${ABOUT}`}</T>
          <Button label={`Walk alongside ${name}`} busy={busy} onPress={() => act(acceptPair)} />
          <Button small kind="text" label="Not now" onPress={() => act(endPair)} />
        </>
      )}
      {pair.state === 'walking' && (
        <>
          <T tone="text2">{`Walking alongside ${name}${pair.since ? ` since ${dayMonth(pair.since)}` : ''}. Your Sunday Mirror shows where your weeks rhymed.`}</T>
          <Button small kind="text" label="Stop walking alongside" busy={busy} onPress={() => act(endPair)} />
        </>
      )}
      {note && (
        <T v="small" tone="danger">
          {note}
        </T>
      )}
    </Card>
  )
}

// Sunday's card, for the week starting `from`.
export function PairWeekCard({ from }: { from: string }) {
  const p = useTheme()
  const [week, setWeek] = useState<PairWeek | null>(null)
  useEffect(() => {
    if (!accountToken()) return
    let live = true
    getPair()
      .then((pr) => (pr.state === 'walking' ? getPairWeek(mondayOf(from)) : null))
      .then((w) => live && w && setWeek(w))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [from])
  if (!week) return null
  if (!week.unlocked) return <PatronNote text={`Seeing where your week rhymed with ${week.with}’s is part of The Persona Index Patron. Either of you can hold it, and a Duo plan covers you both.`} />
  if (week.forming)
    return (
      <T v="small" tone="muted">
        {`Alongside ${week.with}: the picture forms once you’ve both answered a few times this week.`}
      </T>
    )
  const words = pairWeekWords(week)
  if (!words) return null
  return (
    <View style={{ gap: 8, padding: 16, borderRadius: radius.lg, backgroundColor: p.accentWash, borderWidth: 1, borderColor: p.accentLine }}>
      <T v="eyebrow">{words.title}</T>
      {words.lines.map((l) => (
        <T key={l} tone="text2">
          {l}
        </T>
      ))}
      <T v="label" style={{ marginTop: 4 }}>
        One question for the two of you
      </T>
      <T v="quote" style={{ fontSize: 17, lineHeight: 23 }}>
        {words.question}
      </T>
    </View>
  )
}
