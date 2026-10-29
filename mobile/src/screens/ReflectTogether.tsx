// Reflect together (Edwin, 2026-10-29), the signature way to connect: send a
// trusted person a question, both answer privately first, and each chooses
// whether to reveal. Only when both reveal does either see the other's
// answer, with one gentle line and one question to ask each other. A
// different answer is as welcome as a matching one; nothing is scored.
import { useState } from 'react'
import { Modal, Platform, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { togetherResult } from '@shared/sharing'
import { answerReflectTogether, askReflectTogether, leaveReflectTogether, revealReflectTogether, type FriendView, type RTItem, type RTQuestion } from '@shared/social'
import { dayMonth } from '@shared/reflect'
import { gutter, useTheme } from '../theme'
import { Button, Card, feel, Option, T, Tinted } from '../ui/kit'
import { Avatar } from '../ui/parts'

const labelOf = (q: RTQuestion | undefined, id: string) => q?.options.find((o) => o.id === id)?.label ?? ''

// Choosing a question and answering it privately, before it is sent.
export function ReflectTogetherSheet({ friend, questions, onClose, onSent }: { friend: FriendView; questions: RTQuestion[]; onClose: () => void; onSent: () => void }) {
  const p = useTheme()
  const insets = useSafeAreaInsets()
  const [q, setQ] = useState<RTQuestion | null>(null)
  const [mine, setMine] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle')
  const first = friend.name.split(' ')[0]
  async function send() {
    if (!q || !mine) return
    setState('busy')
    try {
      await askReflectTogether(friend.id, q.id, mine)
      feel('done')
      setState('sent')
      onSent()
    } catch {
      setState('failed')
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
            <T v="title" style={{ flex: 1 }}>{`Reflect together with ${first}`}</T>
            <Button kind="text" label="Close" onPress={onClose} />
          </View>
          {state === 'sent' ? (
            <View style={{ gap: 10 }}>
              <T tone="text2">{`Sent. ${first} answers privately too. Neither of you sees the other’s answer unless you both choose to reveal it.`}</T>
              <Button wide label="Done" onPress={onClose} />
            </View>
          ) : !q ? (
            <>
              <T tone="text2">{`Pick a question. You both answer privately first, then each choose whether to reveal.`}</T>
              {questions.map((x) => (
                <Option key={x.id} label={x.prompt} onPress={() => setQ(x)} />
              ))}
            </>
          ) : (
            <>
              <T v="h3">{q.prompt}</T>
              <T v="small" tone="muted">{`Your answer, privately. ${first} won’t see it unless you both reveal.`}</T>
              {q.options.map((o) => (
                <Option key={o.id} label={o.label} chosen={mine === o.id} onPress={() => setMine(o.id)} />
              ))}
              <Button wide label={`Send to ${first}`} busy={state === 'busy'} disabled={!mine} onPress={send} />
              <Button kind="text" label="Choose another question" onPress={() => (setQ(null), setMine(''))} />
              {state === 'failed' && (
                <T v="small" tone="danger" center>
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

// One reflection, in Shared with you: answer, choose to reveal, and see what
// you both chose once you both revealed.
export function TogetherCard({ item, question, isNew, onChanged }: { item: RTItem; question: RTQuestion | undefined; isNew: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const first = item.with.name.split(' ')[0]
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
  const result = item.mine && item.theirs && question ? togetherResult(question, item.mine, item.theirs) : null
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={item.with.name} size={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="h3">{item.with.name}</T>
          <T v="small" tone="muted">{`${item.asked ? `You invited ${first} to reflect together` : `${first} invited you to reflect together`} · ${dayMonth(item.date)}`}</T>
        </View>
        {isNew ? (
          <T v="tiny" bold tone="accent">
            New
          </T>
        ) : null}
      </View>
      <T v="h3">{question?.prompt ?? ''}</T>

      {!item.mine ? (
        <>
          <T v="small" tone="muted">{`Answer privately. ${first} won’t see it unless you both reveal.`}</T>
          {question?.options.map((o) => (
            <Option key={o.id} label={o.label} onPress={() => (busy ? undefined : act(answerReflectTogether(item.id, o.id)))} />
          ))}
        </>
      ) : result ? (
        <View style={{ gap: 8 }}>
          <T>{`You chose “${labelOf(question, item.mine)}”. ${first} chose “${labelOf(question, item.theirs)}”.`}</T>
          <T tone="text2">{result.line}</T>
          <Tinted tone="blue">
            <T v="small" bold>
              A question for the two of you
            </T>
            <T>{result.prompt}</T>
          </Tinted>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <T v="small" tone="text2">{`You answered “${labelOf(question, item.mine)}”, privately.`}</T>
          {!item.iRevealed && !item.iKept ? (
            <>
              <T v="small" bold>
                Reveal your answer?
              </T>
              <T v="small" tone="muted">{`It shows only if ${first} reveals theirs too.`}</T>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Button small label="Reveal mine" busy={busy} onPress={() => act(revealReflectTogether(item.id, true))} />
                <Button small kind="secondary" label="Keep it private" onPress={() => act(revealReflectTogether(item.id, false))} />
              </View>
            </>
          ) : item.iKept ? (
            <T v="small" tone="muted">
              You kept your answer private.
            </T>
          ) : item.theyKept ? (
            <T v="small" tone="muted">{`${first} kept their answer private. That’s fine.`}</T>
          ) : !item.theyAnswered ? (
            <T v="small" tone="muted">{`${first} hasn’t answered yet.`}</T>
          ) : (
            <T v="small" tone="muted">{`Waiting for ${first} to choose whether to reveal.`}</T>
          )}
        </View>
      )}
      <Button small kind="text" label="Remove" onPress={() => act(leaveReflectTogether(item.id))} style={{ alignSelf: 'flex-start' }} />
      {error ? (
        <T v="small" tone="danger">
          {error}
        </T>
      ) : null}
    </Card>
  )
}
