// Share a part of it (Edwin, 2026-10-29): after saving, a person may share an
// excerpt of what they wrote with people they trust. They pick the words,
// who sees them, what would feel helpful and whether replies are welcome,
// and see exactly what will arrive before anything is sent. Only those words
// go; the rest of the journal stays on the phone. SharingHistory, on You,
// lists what was shared and lets the person take it back from anyone.
import { useEffect, useMemo, useState } from 'react'
import { Modal, Platform, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { audienceOf, excerptOf, HELPFUL, sentencesOf, startingAudience } from '@shared/sharing'
import { innerCircle, INNER_CIRCLE } from '@shared/rings'
import { getCircle, getShares, postShare, removeSharePerson, withdrawShare, type FriendView, type SentShareView, type ShareAudience, type ShareKind, type ShareMode } from '@shared/social'
import { dayMonth } from '@shared/reflect'
import { useAccount } from '@shared/useAccount'
import { font, gutter, radius, typeScale, useTheme } from '../theme'
import { Button, Card, feel, Option, T, Toggle } from '../ui/kit'
import { Avatar } from '../ui/parts'
import { TextInput } from '../ui/textScale'
import { KIND_LABEL, MODE_LINE } from './SharedWithYou'
import { PushAsk } from './ShareChoices'
import { pushState, shouldAskPush } from '@shared/push'
import { localDate } from '@shared/day'
import { pushAvailable } from '../platform/push'

const TEXT_MAX = 500

export function ShareSheet({
  kind,
  text,
  onClose,
  onSent = () => {},
  initialMode = 'share',
}: {
  kind: ShareKind
  text: string
  onClose: () => void
  onSent?: (people: number) => void // so the screen behind says it was shared, not kept private
  initialMode?: ShareMode
}) {
  const p = useTheme()
  const insets = useSafeAreaInsets()
  const me = useAccount()
  const sentences = useMemo(() => sentencesOf(text), [text])
  const [picked, setPicked] = useState<number[]>(sentences.length === 1 ? [0] : [])
  const [words, setWords] = useState<string | null>(null) // the person's own edit of the excerpt
  const [friends, setFriends] = useState<FriendView[] | null>(null)
  const [audience, setAudience] = useState<ShareAudience>('inner')
  const [people, setPeople] = useState<string[]>([])
  const [mode, setMode] = useState<ShareMode>(initialMode)
  const [replies, setReplies] = useState(true)
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle')
  const [pushDone, setPushDone] = useState(false)
  const inner = useMemo(innerCircle, [])
  useEffect(() => {
    if (!me) return
    getCircle().then(
      (c) => {
        setFriends(c.friends)
        setAudience(startingAudience(inner, c.friends))
      },
      () => setFriends([]),
    )
  }, [me, inner])

  const excerpt = (words ?? excerptOf(sentences, picked)).slice(0, TEXT_MAX)
  const to = friends ? audienceOf(audience, inner, people, friends) : []
  const open = (friends ?? []).filter((f) => !f.muted && f.connect)
  const ready = excerpt.trim().length >= 10 && to.length > 0 && state !== 'busy'

  async function send() {
    setState('busy')
    try {
      await postShare({ kind, text: excerpt.trim(), mode, replies, audience, to })
      feel('done')
      setState('sent')
      onSent(to.length)
    } catch {
      setState('failed')
    }
  }

  const body = !me ? (
    <T tone="text2">Sharing needs a free account, so only the people you choose can ever see it. Sign in on You, then come back to share.</T>
  ) : state === 'sent' ? (
    <View style={{ gap: 10 }}>
      <T v="title">{`Shared with ${to.length === 1 ? '1 person' : `${to.length} people`}`}</T>
      <T tone="text2">Only those words went. You can take them back from anyone on You, under What you’ve shared. Anything already read can’t be taken back.</T>
      {pushAvailable && !pushDone && shouldAskPush(pushState(), to.length) && <PushAsk today={localDate()} onDone={() => setPushDone(true)} />}
      <Button wide label="Done" onPress={onClose} />
    </View>
  ) : (
    <>
      <View style={{ gap: 8 }}>
        <T v="h3">Which part?</T>
        <T v="small" tone="muted">
          Tap the sentences to share. Only these words are sent; the rest stays private.
        </T>
        {sentences.map((s, i) => (
          <Option key={`${i}${s}`} label={s} chosen={picked.includes(i)} onPress={() => (setWords(null), setPicked((xs) => (xs.includes(i) ? xs.filter((x) => x !== i) : [...xs, i])))} />
        ))}
        {excerpt ? (
          <TextInput
            value={excerpt}
            onChangeText={(t) => setWords(t.slice(0, TEXT_MAX))}
            multiline
            accessibilityLabel="The words to share"
            style={{
              minHeight: 72,
              borderWidth: 1.5,
              borderColor: p.control,
              backgroundColor: p.surface,
              borderRadius: radius.md,
              padding: 12,
              fontFamily: font.regular,
              ...typeScale.body,
              color: p.text,
              textAlignVertical: 'top',
            }}
          />
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <T v="h3">Who with?</T>
        <Option label={`Your ${INNER_CIRCLE}${inner.length ? ` (${audienceOf('inner', inner, [], open).length})` : ''}`} chosen={audience === 'inner'} onPress={() => setAudience('inner')} />
        <Option label="People I choose" chosen={audience === 'people'} onPress={() => setAudience('people')} />
        {audience === 'inner' && audienceOf('inner', inner, [], open).length === 0 && (
          <T v="small" tone="muted">{`Nobody is in your ${INNER_CIRCLE} yet. Add people on Connect, under Your people, or choose people here.`}</T>
        )}
        {audience === 'people' &&
          open.map((f) => (
            <Pressable
              key={f.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: people.includes(f.id) }}
              onPress={() => setPeople((xs) => (xs.includes(f.id) ? xs.filter((x) => x !== f.id) : [...xs, f.id]))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}
            >
              <Avatar name={f.name} size={32} />
              <T style={{ flex: 1 }}>{f.name}</T>
              <T bold tone="accent">
                {people.includes(f.id) ? '✓ Chosen' : 'Choose'}
              </T>
            </Pressable>
          ))}
        {friends && open.length === 0 && (
          <T v="small" tone="muted">
            Nobody to share with yet. Invite someone you trust on Connect.
          </T>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <T v="h3">What would feel helpful?</T>
        {HELPFUL.map((h) => (
          <Option key={h.id} label={h.label} chosen={mode === h.id} onPress={() => setMode(h.id)} />
        ))}
        <Toggle label="Replies welcome" note="They can answer you privately. Nobody else sees it." value={replies} onChange={setReplies} />
      </View>

      {excerpt ? (
        <View style={{ gap: 8 }}>
          <T v="h3">What they will receive</T>
          <Card style={{ gap: 10, borderWidth: 1, borderColor: p.line }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={me.name} size={36} />
              <View style={{ flex: 1 }}>
                <T v="h3">{me.name}</T>
                <T v="small" tone="muted">{`${KIND_LABEL[kind]} · Shared with you`}</T>
              </View>
            </View>
            <T v="quote">{`“${excerpt.trim()}”`}</T>
            <T v="small" tone="text2">
              {MODE_LINE[mode](me.name.split(' ')[0])}
            </T>
          </Card>
        </View>
      ) : null}

      <Button wide label={to.length ? `Share with ${to.length === 1 ? '1 person' : `${to.length} people`}` : 'Share'} busy={state === 'busy'} disabled={!ready} onPress={send} />
      {state === 'failed' && (
        <T v="small" tone="danger" center>
          That didn’t go through. Try again in a moment.
        </T>
      )}
      <T v="small" tone="muted" center>
        You can take it back later. Nobody is told when you do.
      </T>
    </>
  )

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: gutter,
            paddingTop: Platform.OS === 'ios' ? 20 : Math.max(insets.top, 16) + 4,
            paddingBottom: insets.bottom + 40,
            gap: 18,
            width: '100%',
            maxWidth: 640,
            alignSelf: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <T v="title" style={{ flex: 1 }}>
              {initialMode === 'talk' ? 'Reflect on it with someone' : 'Share a part of it'}
            </T>
            <Button kind="text" label="Close" onPress={onClose} />
          </View>
          {body}
        </ScrollView>
      </View>
    </Modal>
  )
}

// What you've shared, on You: each item with who has it, a way to take it
// back from one person, or from everyone. Nobody is told.
export function SharingHistory() {
  const me = useAccount()
  const [sent, setSent] = useState<SentShareView[] | null>(null)
  const [error, setError] = useState('')
  const load = () =>
    getShares().then(
      (v) => setSent(v.sent),
      () => setSent([]),
    )
  useEffect(() => {
    if (me) load()
  }, [me])
  if (!me || !sent || sent.length === 0) return null
  const act = (p: Promise<unknown>) => p.then(load, () => setError('That didn’t go through. Try again in a moment.'))
  return (
    <Card style={{ gap: 12 }}>
      <T v="h2">What you’ve shared</T>
      <T v="small" tone="muted">
        Taking something back ends access in the app, quietly. Anything already read or copied can’t be taken back.
      </T>
      {sent.map((s) => (
        <View key={s.id} style={{ gap: 6 }}>
          <T v="small" tone="muted">{`${KIND_LABEL[s.kind]} · ${dayMonth(s.date)}${s.audience === 'inner' ? ` · ${INNER_CIRCLE}` : ''}`}</T>
          <T>{`“${s.text}”`}</T>
          {s.people.map((person) => (
            <View key={person.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T v="small" style={{ flex: 1 }}>
                {person.name}
              </T>
              <Button small kind="text" label="Take back from them" onPress={() => act(removeSharePerson(s.id, person.id))} />
            </View>
          ))}
          <Button small kind="text" label="Take back from everyone" onPress={() => act(withdrawShare(s.id))} style={{ alignSelf: 'flex-start' }} />
        </View>
      ))}
      {error ? (
        <T v="small" tone="danger">
          {error}
        </T>
      ) : null}
    </Card>
  )
}
