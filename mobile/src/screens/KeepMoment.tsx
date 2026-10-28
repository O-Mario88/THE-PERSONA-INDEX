// Keep a moment (Edwin's brief, 2026-10-28): something worth remembering, in a
// sentence or two, kept with your private writing (shared moments.ts). The
// words are kept as a draft while you type, so closing the app loses nothing.
import { useState } from 'react'
import { View } from 'react-native'
import { recalledDraft, saveDraft } from '@shared/api'
import { keepMoment, MOMENT_MAX } from '@shared/moments'
import { PRIVACY_LINE } from '@shared/words'
import { Button, Field, Private, T } from '../ui/kit'

const DRAFT = 'moment'

export function KeepMoment({ today }: { today: string }) {
  const [text, setText] = useState(() => recalledDraft(DRAFT))
  const [kept, setKept] = useState(false)
  if (kept) return <T tone="text2">Kept with your reflections. It can come back in your Mirror if you let your reflections in.</T>
  return (
    <View style={{ gap: 8 }}>
      <T v="h3">Something worth remembering?</T>
      <Field
        label="Keep it in a sentence or two"
        placeholder="Today, I managed to say no without feeling guilty."
        value={text}
        maxLength={MOMENT_MAX}
        multiline
        onChangeText={(t) => {
          setText(t)
          saveDraft(DRAFT, t)
        }}
      />
      <Private>{PRIVACY_LINE}</Private>
      <Button
        small
        label="Keep this moment"
        disabled={!text.trim()}
        style={{ alignSelf: 'flex-start' }}
        onPress={() => {
          keepMoment(text, today)
          saveDraft(DRAFT, '')
          setKept(true)
        }}
      />
    </View>
  )
}
