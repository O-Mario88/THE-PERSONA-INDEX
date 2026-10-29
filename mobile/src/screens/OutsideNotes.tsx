// The Outside Mirror as named notes (Edwin, 2026-10-29): "here is something a
// trusted person has noticed or appreciated about you". An occasional
// invitation with a concrete prompt; the friend writes a few words with their
// name on them, or quietly declines; the person keeps the note, dismisses it,
// or reflects on it. Never anonymous, never a verdict about who someone is.
import { useEffect, useState } from 'react'
import { Modal, Platform, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  askOutside,
  declineOutside,
  getCircle,
  getOutside,
  keepOutside,
  writeOutside,
  type FriendView,
  type OutsideInvite,
  type OutsideNote,
  type OutsidePrompt,
  type OutsideView,
} from '@shared/social'
import { dayMonth } from '@shared/reflect'
import { useAccount } from '@shared/useAccount'
import { font, gutter, radius, typeScale, useTheme } from '../theme'
import { Button, Card, feel, Option, T } from '../ui/kit'
import { Avatar } from '../ui/parts'
import { TextInput } from '../ui/textScale'
import { ApiError } from '@shared/api'

const NOTE_MAX = 300
const promptText = (prompts: OutsidePrompt[], id: string) => prompts.find((p) => p.id === id)?.text ?? ''

function useAct(onChanged: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const act = async (p: Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await p
      feel('done')
      onChanged()
    } catch {
      setError('That didn’t go through. Try again in a moment.')
    }
    setBusy(false)
  }
  return { busy, error, act }
}

// Someone asked you to write them a note.
export function InviteCard({ invite, prompts, isNew, onChanged }: { invite: OutsideInvite; prompts: OutsidePrompt[]; isNew: boolean; onChanged: () => void }) {
  const p = useTheme()
  const [words, setWords] = useState('')
  const { busy, error, act } = useAct(onChanged)
  const first = invite.from.name.split(' ')[0]
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={invite.from.name} size={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="h3">{invite.from.name}</T>
          <T v="small" tone="muted">{`Asked you for a note · ${dayMonth(invite.date)}`}</T>
        </View>
        {isNew ? (
          <T v="tiny" bold tone="accent">
            New
          </T>
        ) : null}
      </View>
      <T v="h3">{promptText(prompts, invite.promptId)}</T>
      <T v="small" tone="muted">{`${first} will see your name with it. Only ${first} sees it.`}</T>
      <TextInput
        value={words}
        onChangeText={(t) => setWords(t.slice(0, NOTE_MAX))}
        placeholder="A few honest, kind words"
        placeholderTextColor={p.muted}
        multiline
        accessibilityLabel={`Your note for ${first}`}
        style={{
          minHeight: 80,
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
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Button small label="Send" busy={busy} disabled={!words.trim()} onPress={() => act(writeOutside(invite.id, words))} />
        <Button small kind="text" label="Not now" onPress={() => act(declineOutside(invite.id))} />
      </View>
      {error ? (
        <T v="small" tone="danger">
          {error}
        </T>
      ) : null}
    </Card>
  )
}

// A note someone wrote about you: keep it, dismiss it, or reflect on it.
export function NoteCard({
  note,
  prompts,
  isNew,
  onChanged,
  onReflect,
}: {
  note: OutsideNote
  prompts: OutsidePrompt[]
  isNew?: boolean
  onChanged: () => void
  onReflect?: (prompt: string) => void
}) {
  const { busy, error, act } = useAct(onChanged)
  const first = note.from.name.split(' ')[0]
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={note.from.name} size={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="h3">{note.from.name}</T>
          <T v="small" tone="muted">{`A note for you · ${dayMonth(note.date)}`}</T>
        </View>
        {isNew ? (
          <T v="tiny" bold tone="accent">
            New
          </T>
        ) : null}
      </View>
      <T v="small" tone="muted">
        {promptText(prompts, note.promptId)}
      </T>
      <T v="quote">{`“${note.text}”`}</T>
      <T v="small" tone="muted">
        One person’s view, given with care. You decide what it means.
      </T>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {!note.kept && <Button small label="Keep it" busy={busy} onPress={() => act(keepOutside(note.id, true))} />}
        {onReflect && <Button small kind="secondary" label="Reflect on it" onPress={() => onReflect(`${first} wrote: “${note.text}” What do you make of it?`)} />}
        <Button small kind="text" label="Dismiss" onPress={() => act(keepOutside(note.id, false))} />
      </View>
      {error ? (
        <T v="small" tone="danger">
          {error}
        </T>
      ) : null}
    </Card>
  )
}

// Asking one person for a note, with a concrete prompt.
export function AskNoteSheet({ friend, prompts, onClose, onSent }: { friend: FriendView; prompts: OutsidePrompt[]; onClose: () => void; onSent: () => void }) {
  const p = useTheme()
  const insets = useSafeAreaInsets()
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'failed' | 'asked'>('idle')
  const first = friend.name.split(' ')[0]
  async function ask(promptId: string) {
    setState('busy')
    try {
      await askOutside(friend.id, promptId)
      feel('done')
      setState('sent')
      onSent()
    } catch (e) {
      setState(e instanceof ApiError && e.status === 409 ? 'asked' : 'failed')
    }
  }
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: gutter,
            paddingTop: Platform.OS === 'ios' ? 20 : Math.max(insets.top, 16) + 4,
            paddingBottom: insets.bottom + 40,
            gap: 16,
            width: '100%',
            maxWidth: 640,
            alignSelf: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <T v="title" style={{ flex: 1 }}>{`Ask ${first} for a note`}</T>
            <Button kind="text" label="Close" onPress={onClose} />
          </View>
          {state === 'sent' ? (
            <View style={{ gap: 10 }}>
              <T tone="text2">{`Asked. If ${first} writes something, it comes to you with their name on it. They can also say not now.`}</T>
              <Button wide label="Done" onPress={onClose} />
            </View>
          ) : (
            <>
              <T tone="text2">{`Pick one question. ${first} answers in a few words, with their name on it, and only you see it.`}</T>
              {prompts.map((x) => (
                <Option key={x.id} label={x.text} onPress={() => (state === 'busy' ? undefined : ask(x.id))} />
              ))}
              {state === 'asked' && <T v="small" tone="muted">{`You already asked ${first}. One question at a time.`}</T>}
              {state === 'failed' && (
                <T v="small" tone="danger">
                  That didn’t go through. Try again in a moment.
                </T>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}

// In the Mirror: the notes you kept, and asking someone you trust for one.
export function OutsideNotesSection({ onReflect }: { onReflect?: (prompt: string) => void }) {
  const me = useAccount()
  const [view, setView] = useState<OutsideView | null>(null)
  const [friends, setFriends] = useState<FriendView[]>([])
  const [asking, setAsking] = useState<FriendView | null>(null)
  const [choosing, setChoosing] = useState(false)
  const load = () =>
    getOutside().then(
      (v) => setView(v),
      () => setView(null),
    )
  useEffect(() => {
    if (!me) return
    load()
    getCircle().then(
      (c) => setFriends(c.friends.filter((f) => !f.muted && f.connect)),
      () => {},
    )
  }, [me])
  if (!me) return <T tone="text2">With a free account, you can ask the people you trust what they notice about you. Their notes come with their names, and only you see them.</T>
  if (!view) return null
  const notes = view.notes
  return (
    <View style={{ gap: 12 }}>
      <T v="small" tone="muted">
        Notes from people you invited, with their names. One person’s view each, never a verdict.
      </T>
      {notes.map((n) => (
        <NoteCard key={n.id} note={n} prompts={view.prompts} onChanged={load} onReflect={onReflect} />
      ))}
      {notes.length === 0 && <T tone="text2">No notes yet. Ask someone you trust what they notice, when you’re ready.</T>}
      {view.asked.length > 0 && <T v="small" tone="muted">{`Waiting to hear from ${view.asked.map((a) => a.with.name.split(' ')[0]).join(', ')}.`}</T>}
      {choosing ? (
        <View style={{ gap: 8 }}>
          {friends.map((f) => (
            <Option key={f.id} label={f.name} onPress={() => (setAsking(f), setChoosing(false))} />
          ))}
          {friends.length === 0 && (
            <T v="small" tone="muted">
              Nobody to ask yet. Invite someone you trust on Connect.
            </T>
          )}
        </View>
      ) : (
        <Button small kind="secondary" label="Ask someone for a note" onPress={() => setChoosing(true)} style={{ alignSelf: 'flex-start' }} />
      )}
      {asking && <AskNoteSheet friend={asking} prompts={view.prompts} onClose={() => setAsking(null)} onSent={load} />}
    </View>
  )
}
