// The cards of Connect (Edwin, 2026-10-29): something a friend deliberately
// shared, with their name, who it was shared with, what kind of response
// would feel helpful, and a private thread between the two of you. Replies
// are a gentle opening or a few words of your own; nobody else sees them,
// and there are no counts, reactions or rankings anywhere.
import { useState } from 'react'
import { View } from 'react-native'
import { postNote, type NoteKind, type NoteView, type SentShareView, type ShareKind, type ShareMode, type ShareView } from '@shared/social'
import { dayMonth } from '@shared/reflect'
import { radius, useTheme, typeScale, font } from '../theme'
import { Button, Card, Chip, feel, T } from '../ui/kit'
import { Avatar } from '../ui/parts'
import { TextInput } from '../ui/textScale'

export const KIND_LABEL: Record<ShareKind, string> = {
  helped: 'What helped me',
  win: 'A win',
  reflection: 'A reflection',
  answer: 'An answer',
  mirror: 'From my Mirror',
}

// What the person sharing would like back, in their friend's eyes.
export const MODE_LINE: Record<ShareMode, (name: string) => string> = {
  share: (n) => `${n} just wanted to share this.`,
  encourage: (n) => `${n} would like some encouragement.`,
  celebrate: (n) => `${n} would like to celebrate this with you.`,
  experience: (n) => `${n} would welcome your experience.`,
  talk: (n) => `${n} would like to talk.`,
}

export const NOTE_TEXT: Record<Exclude<NoteKind, 'words'>, string> = {
  resonated: 'This resonated with me.',
  talk: 'Would you like to talk about it?',
  similar: 'Something similar happened to me.',
  encourage: 'Sending you encouragement.',
  celebrate: 'Celebrating this with you.',
}

// The openings offered first, shaped by what would feel helpful.
const OPENINGS: Record<ShareMode, Exclude<NoteKind, 'words'>[]> = {
  share: ['resonated', 'similar'],
  encourage: ['encourage', 'resonated'],
  celebrate: ['celebrate', 'resonated'],
  experience: ['similar', 'resonated'],
  talk: ['talk', 'resonated'],
}

const WORDS_MAX = 300

function Thread({ notes }: { notes: NoteView[] }) {
  const p = useTheme()
  if (notes.length === 0) return null
  return (
    <View style={{ gap: 8 }} accessibilityLabel="Your private replies">
      {notes.map((n) => (
        <View
          key={n.id}
          style={{
            alignSelf: n.mine ? 'flex-end' : 'flex-start',
            maxWidth: '88%',
            backgroundColor: n.mine ? p.surface2 : p.surface,
            borderWidth: 1,
            borderColor: p.line,
            borderRadius: radius.md,
            padding: 10,
            gap: 2,
          }}
        >
          <T v="tiny" tone="muted">{`${n.mine ? 'You' : n.from} · ${dayMonth(n.date)}`}</T>
          <T>{n.kind === 'words' ? (n.text ?? '') : NOTE_TEXT[n.kind]}</T>
        </View>
      ))}
    </View>
  )
}

// A reply box: the openings, or a few words of your own.
function Reply({ openings, onSend, label = 'Write a few words' }: { openings: Exclude<NoteKind, 'words'>[]; onSend: (kind: NoteKind, text?: string) => Promise<boolean>; label?: string }) {
  const p = useTheme()
  const [writing, setWriting] = useState(false)
  const [words, setWords] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const send = async (kind: NoteKind, text?: string) => {
    setBusy(true)
    setError('')
    const ok = await onSend(kind, text)
    setBusy(false)
    if (!ok) return setError('That didn’t go through. Try again in a moment.')
    feel('done')
    setWords('')
    setWriting(false)
  }
  return (
    <View style={{ gap: 8 }}>
      {writing ? (
        <>
          <TextInput
            value={words}
            onChangeText={(t) => setWords(t.slice(0, WORDS_MAX))}
            placeholder="A few words, just for them"
            placeholderTextColor={p.muted}
            multiline
            accessibilityLabel="Your reply"
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
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Button small label="Send" busy={busy} disabled={!words.trim()} onPress={() => send('words', words)} />
            <Button small kind="text" label="Cancel" onPress={() => setWriting(false)} />
          </View>
        </>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {openings.map((k) => (
            <Chip key={k} label={NOTE_TEXT[k]} onPress={() => (busy ? undefined : send(k))} />
          ))}
          <Chip label={label} onPress={() => setWriting(true)} />
        </View>
      )}
      {error ? (
        <T v="small" tone="danger">
          {error}
        </T>
      ) : null}
    </View>
  )
}

function Header({ name, kind, date, isNew }: { name: string; kind: ShareKind; date: string; isNew?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Avatar name={name} size={40} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="h3">{name}</T>
        <T v="small" tone="muted">{`${KIND_LABEL[kind]} · Shared with you · ${dayMonth(date)}`}</T>
      </View>
      {isNew ? (
        <T v="tiny" bold tone="accent">
          New
        </T>
      ) : null}
    </View>
  )
}

export function ReceivedCard({ share, isNew, onChanged }: { share: ShareView; isNew: boolean; onChanged: () => void }) {
  const first = share.from.name.split(' ')[0]
  return (
    <Card style={{ gap: 12 }}>
      <Header name={share.from.name} kind={share.kind} date={share.date} isNew={isNew} />
      <T v="quote">{`“${share.text}”`}</T>
      <T v="small" tone="text2">
        {MODE_LINE[share.mode](first)}
      </T>
      <Thread notes={share.notes} />
      {share.replies ? (
        <Reply
          // An opening already sent in this thread isn't offered again.
          openings={OPENINGS[share.mode].filter((k) => !share.notes.some((n) => n.mine && n.kind === k))}
          onSend={async (kind, text) => {
            const ok = await postNote(share.id, { kind, text }).then(
              () => true,
              () => false,
            )
            if (ok) onChanged()
            return ok
          }}
        />
      ) : (
        <T v="small" tone="muted">{`${first} shared this without asking for replies.`}</T>
      )}
    </Card>
  )
}

// Replies to something you shared, grouped under it: one private thread per
// person, each answered in its own place.
export function RepliesCard({ share, isNew, onChanged }: { share: SentShareView; isNew: boolean; onChanged: () => void }) {
  const people = share.people.filter((x) => x.notes.length > 0)
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T v="small" tone="muted" style={{ flex: 1 }}>{`Replies to what you shared · ${dayMonth(share.date)}`}</T>
        {isNew ? (
          <T v="tiny" bold tone="accent">
            New
          </T>
        ) : null}
      </View>
      <T v="quote">{`“${share.text}”`}</T>
      {people.map((person) => (
        <View key={person.id} style={{ gap: 8 }}>
          <T v="h3">{person.name}</T>
          <Thread notes={person.notes} />
          <Reply
            openings={[]}
            label={`Reply to ${person.name.split(' ')[0]}`}
            onSend={async (kind, text) => {
              const ok = await postNote(share.id, { kind, text, with: person.id }).then(
                () => true,
                () => false,
              )
              if (ok) onChanged()
              return ok
            }}
          />
        </View>
      ))}
    </Card>
  )
}
