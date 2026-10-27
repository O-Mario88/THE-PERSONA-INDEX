// The one-time welcome: what the app is, in
// three lines, and an optional first name, before the very first sitting.
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, View } from 'react-native'
import { MAX_NAME } from '@shared/welcomeKeys'
import { Button, Field, Page, T } from '../ui/kit'
import { Disc } from '../ui/parts'
import type { IconName } from '../ui/Icon'

const POINTS: { icon: IconName; title: string; line: string }[] = [
  { icon: 'insights', title: 'See your patterns', line: 'What you reached for and how you are changing, week by week.' },
  { icon: 'connect', title: 'Hear how others see you', line: 'Three friends, blended, so no single answer can be traced.' },
  { icon: 'heart', title: 'One small step at a time', line: 'No streaks, no scores. A missed day undoes nothing.' },
]

export function Welcome({ onBegin }: { onBegin: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Page>
        <T v="label" tone="text">
          The Persona Index
        </T>
        <View style={{ gap: 12, marginTop: 24 }}>
          <T v="display" style={{ fontSize: 40, lineHeight: 44 }}>
            A calmer you starts with reflection.
          </T>
          <T tone="text2" style={{ fontSize: 18, lineHeight: 27 }}>
            Three questions in the morning, three in the evening, and a mirror of your own answers on Sunday.
          </T>
        </View>
        <View style={{ gap: 20, marginVertical: 12 }}>
          {POINTS.map((pt) => (
            <View key={pt.title} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
              <Disc icon={pt.icon} size={44} />
              <View style={{ flex: 1, gap: 2 }}>
                <T v="h3">{pt.title}</T>
                <T tone="muted">{pt.line}</T>
              </View>
            </View>
          ))}
        </View>
        <Field
          label="What should I call you? (optional)"
          value={name}
          maxLength={MAX_NAME}
          autoComplete="given-name"
          textContentType="givenName"
          placeholder="Your first name"
          onChangeText={setName}
          returnKeyType="go"
          onSubmitEditing={() => onBegin(name.trim())}
        />
        <Button wide label="Begin your first reflection" onPress={() => onBegin(name.trim())} />
        <T v="small" tone="muted" center>
          🔒 Private to you. Your name stays on this phone. No account needed.
        </T>
      </Page>
    </KeyboardAvoidingView>
  )
}
