// The one-time welcome (Edwin's words, 2026-10-27): what the app is for,
// and an optional first name, before the very first sitting.
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, View } from 'react-native'
import { MAX_NAME } from '@shared/welcomeKeys'
import { Button, Field, Page, T } from '../ui/kit'

export function Welcome({ onBegin }: { onBegin: (name: string) => void }) {
  const [name, setName] = useState('')
  const begin = () => onBegin(name.trim())
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Page>
        <T v="label" tone="text">
          Welcome to The Persona Index
        </T>
        <View style={{ gap: 16, marginTop: 24 }}>
          <T v="display" style={{ fontSize: 35, lineHeight: 40 }}>
            Discover yourself. Find what works. Live a little better every day.
          </T>
          <T tone="text2" style={{ fontSize: 16, lineHeight: 24 }}>
            Understand why you feel, think, and act the way you do. Discover your strengths, learn from others' experiences, and find small ways to bring more happiness,
            confidence, and peace into your life.
          </T>
          <T tone="muted">Just a few minutes a day. No pressure. No judgment. Just meaningful discoveries about you.</T>
        </View>
        <View style={{ gap: 12, marginTop: 12 }}>
          <T v="h3">Let's make this personal. What should we call you?</T>
          <Field
            label="Your first name"
            value={name}
            maxLength={MAX_NAME}
            autoComplete="given-name"
            textContentType="givenName"
            placeholder="Enter your name"
            onChangeText={setName}
            returnKeyType="go"
            onSubmitEditing={begin}
          />
        </View>
        <Button wide label="Start My Journey" iconAfter="arrow" onPress={begin} />
        <T v="small" tone="muted" center style={{ fontStyle: 'italic' }}>
          Every great change begins with understanding yourself.
        </T>
      </Page>
    </KeyboardAvoidingView>
  )
}
