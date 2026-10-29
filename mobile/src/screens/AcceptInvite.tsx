// Following an invite (found on the iPhone, 2026-10-29): who is inviting,
// what they are to you, and one button to connect. Connecting shows them your
// name and anything you choose to send later, nothing you wrote before. A
// link can also be pasted in, for when it arrived somewhere the app can't open.
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { ApiError } from '@shared/api'
import { acceptError, inviteCodeIn } from '@shared/invites'
import { acceptInvite, peekInvite, TAG_NAMES, TAGS, type FriendView, type InvitePeek, type Tag } from '@shared/social'
import { Button, Card, Chip, Field, feel, T } from '../ui/kit'
import { Avatar } from '../ui/parts'

const why = (e: unknown) => acceptError(e instanceof ApiError ? e.code : 'unavailable')

export function AcceptInvite({
  code,
  signedIn,
  onSignIn,
  onAccepted,
  onDismiss,
}: {
  code: string
  signedIn: boolean
  onSignIn: () => void // the invite waits on this device while they sign in
  onAccepted: (friend: FriendView) => void
  onDismiss: () => void
}) {
  const [peek, setPeek] = useState<InvitePeek | null>(null)
  const [tag, setTag] = useState<Tag>('friends')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    setPeek(null)
    setError('')
    peekInvite(code).then(
      (p) => {
        if (!live) return
        setPeek(p)
        setTag(p.tag)
      },
      (e) => live && setError(why(e)),
    )
    return () => {
      live = false
    }
  }, [code])

  async function connect() {
    setBusy(true)
    setError('')
    try {
      const friend = await acceptInvite(code, tag)
      feel('done')
      onAccepted(friend)
    } catch (e) {
      setError(why(e))
    }
    setBusy(false)
  }

  if (error && !peek) {
    return (
      <Card style={{ gap: 10 }}>
        <T v="h3">An invite</T>
        <T tone="text2">{error}</T>
        <Button small kind="text" label="Close" onPress={onDismiss} style={{ alignSelf: 'flex-start' }} />
      </Card>
    )
  }
  if (!peek) return null
  const first = peek.name.split(' ')[0]
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={peek.name} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="h3">{`${peek.name} invited you to connect`}</T>
          {peek.handle ? <T v="small" tone="muted">{`@${peek.handle}`}</T> : null}
        </View>
      </View>
      <T tone="text2">{`${first} will see your name and anything you choose to send them. Nothing you wrote before, and never your answers.`}</T>
      <T v="small" bold>{`What is ${first} to you?`}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {TAGS.map((t) => (
          <Chip key={t} label={TAG_NAMES[t]} on={tag === t} onPress={() => setTag(t)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {signedIn ? <Button small label={`Connect with ${first}`} busy={busy} onPress={connect} /> : <Button small label={`Sign in to connect with ${first}`} onPress={onSignIn} />}
        <Button small kind="text" label="Not now" onPress={onDismiss} />
      </View>
      {error ? (
        <T v="small" tone="danger">
          {error}
        </T>
      ) : null}
    </Card>
  )
}

// Pasting an invite link someone sent you.
export function PasteInvite({ onCode }: { onCode: (code: string) => void }) {
  const [text, setText] = useState('')
  const [wrong, setWrong] = useState(false)
  function open() {
    const code = inviteCodeIn(text)
    setWrong(!code)
    if (!code) return
    setText('')
    onCode(code)
  }
  return (
    <View style={{ gap: 10 }}>
      <Field
        label="Have an invite link?"
        value={text}
        onChangeText={(t) => (setText(t), setWrong(false))}
        placeholder="Paste the link or code"
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={open}
        returnKeyType="go"
      />
      <Button small kind="secondary" label="Open invite" disabled={!text.trim()} onPress={open} style={{ alignSelf: 'flex-start' }} />
      {wrong && (
        <T v="small" tone="danger">
          That doesn’t look like an invite link. Copy the whole link they sent you.
        </T>
      )}
    </View>
  )
}
