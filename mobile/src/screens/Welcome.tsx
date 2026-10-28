// The one-time welcome (Edwin's design, 2026-10-29): over the same sunrise
// as the loading page it follows, the logo, "A more intentional you, starts
// here.", an optional first name and one clear action. Light in dark mode
// too, like the sunrise behind it. The name stays on this phone (Shell.tsx).
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { tr } from '@shared/i18n'
import { MAX_NAME } from '@shared/welcomeKeys'
import { brand, light, serif, ThemeProvider } from '../theme'
import { Dawn } from '../ui/Dawn'
import { Button, Field, T } from '../ui/kit'
import { Lockup } from '../ui/Logo'

const COLUMN = 380
const ASK = 'First, what should we call you?'

export function Welcome({ onBegin }: { onBegin: (name: string) => void }) {
  const [name, setName] = useState('')
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const column = Math.min(width - 48, COLUMN)
  const begin = () => onBegin(name.trim())
  return (
    <ThemeProvider palette={light}>
      <StatusBar style="dark" />
      <View style={styles.page}>
        <Dawn />
        <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 }]}
          >
            <View style={{ width: column }}>
              <Lockup mark={Math.round(column * 0.27)} words={Math.round(column * 0.62)} />
              <Text accessibilityRole="header" style={styles.heading}>
                {tr('A more intentional you, starts here.')}
              </Text>
              <View style={styles.rule} />
              <T v="h3" style={styles.ask}>
                {ASK}
              </T>
              <Field
                accessibilityLabel={tr(ASK)}
                value={name}
                maxLength={MAX_NAME}
                autoComplete="given-name"
                textContentType="givenName"
                placeholder="Your first name"
                onChangeText={setName}
                returnKeyType="go"
                onSubmitEditing={begin}
              />
              <Button kind="sprout" wide label="Begin My Journey" iconAfter="arrow" onPress={begin} style={styles.button} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </ThemeProvider>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  heading: { fontFamily: serif, fontSize: 34, lineHeight: 42, color: brand.ink, textAlign: 'center', marginTop: 30 },
  rule: { height: StyleSheet.hairlineWidth * 2, backgroundColor: light.lineStrong, opacity: 0.7, marginTop: 24, marginBottom: 26 },
  ask: { color: brand.ink, marginBottom: 10 },
  button: { marginTop: 18, minHeight: 52 },
})
