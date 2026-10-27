// The sign-up page after the first glimpse, and signing in from You. No
// password: a 6-digit code to an email
// or a phone, or Apple and Google through their own sheets (idSignIn.ts).
// Only the ways the server can really use are shown.
import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ApiError } from '@shared/api'
import * as AppleAuthentication from 'expo-apple-authentication'
import { patchAccount, sendCode, signInMethods, signInWithID, verifyCode, type AccountView, type SignInMethods } from '@shared/social'
import { Cancelled, appProviders, appleToken, googleToken, type IdToken, type Providers } from '../platform/idSignIn'
import { doneWithGoogleReturn, takeGoogleReturn } from '../platform/googleWeb'
import { font, gutter, radius, useTheme } from '../theme'
import { Button, Field, T } from '../ui/kit'
import { Icon } from '../ui/Icon'

const ERRORS: Record<string, string> = {
  invalid_id_token: 'That sign-in didn’t go through. Try again, or use a code instead.',
  invalid_address: 'That doesn’t look like an email, or a phone number with its country code (+256…).',
  wrong_code: 'That code didn’t match. Check the newest message, or send a new code.',
  rate_limited: 'Too many tries. Wait a few minutes, then try again.',
  sign_in_unavailable: 'Signing in isn’t switched on here yet. Everything stays on this phone.',
  invalid_name: 'A name of 1 to 40 letters, please.',
  invalid_handle: 'A handle of 3 to 20 letters, numbers or underscores.',
  handle_taken: 'That handle is taken. Try another.',
}

const why = (e: unknown) =>
  e instanceof ApiError ? (ERRORS[e.code] ?? 'Something went wrong. Try again in a moment.') : 'You seem to be offline. Try again soon.'

type Step = { at: 'start' } | { at: 'code'; address: string; kind: 'email' | 'phone' } | { at: 'name'; me: AccountView }

export type SignUpPage = { label: string; title: string; lead: string; head: string; points?: string[] }

export function SignUp({ page, onDone, onNotNow, notNow }: { page: SignUpPage; onDone: (me: AccountView) => void; onNotNow: () => void; notNow: string }) {
  const p = useTheme()
  const insets = useSafeAreaInsets()
  const [methods, setMethods] = useState<SignInMethods | null>(null)
  const [providers, setProviders] = useState<Providers>({ google: false, apple: false })
  const [step, setStep] = useState<Step>({ at: 'start' })
  const [via, setVia] = useState<'email' | 'phone' | 'whatsapp'>('email')
  const [address, setAddress] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    signInMethods().then(
      async (m) => {
        const pr = await appProviders(m)
        if (!live) return
        setProviders(pr)
        setMethods(m)
      },
      () => live && setMethods({ email: false, phone: false, google: false, apple: false }),
    )
    return () => {
      live = false
    }
  }, [])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(why(e))
    } finally {
      setBusy(false)
    }
  }
  const finish = (me: AccountView) => (me.name ? onDone(me) : setStep({ at: 'name', me }))
  const withID = (provider: 'google' | 'apple', get: () => Promise<IdToken>) =>
    run(async () => {
      let t: IdToken
      try {
        t = await get()
      } catch (e) {
        if (e instanceof Cancelled) return
        throw new ApiError(400, 'invalid_id_token')
      }
      if (t.givenName) setName(t.givenName)
      finish((await signInWithID(provider, t.token)).account)
    })
  // Back from Google on the website: finish signing in with its token.
  useEffect(() => {
    const back = takeGoogleReturn()
    if (!back) return
    doneWithGoogleReturn()
    if ('token' in back) withID('google', async () => back)
    else if (back.error !== 'cancelled') setError("Google didn't confirm it was you. Please try again.")
    // Once, when the page comes back from Google.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const codes = !!methods && (methods.email || methods.phone)
  const oneTap = providers.apple || providers.google
  const none = !!methods && !codes && !oneTap
  const kind = methods && !methods.email ? (via === 'email' ? 'phone' : via) : methods && !methods.phone ? 'email' : via
  const tabs: { id: 'email' | 'phone' | 'whatsapp'; name: string }[] = [
    { id: 'email', name: 'Email' },
    { id: 'phone', name: 'Phone' },
    { id: 'whatsapp', name: 'WhatsApp' },
  ]

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: p.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ backgroundColor: p.navy, paddingHorizontal: gutter, paddingTop: Math.max(insets.top, 20) + 16, paddingBottom: 28, gap: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 16, color: p.onNavy }}>P</Text>
            <T v="label" tone="onNavy">
              The Persona Index
            </T>
          </View>
          <T v="label" style={{ color: p.brandLime }}>
            {page.label}
          </T>
          <T v="display" tone="onNavy" style={{ fontSize: 40, lineHeight: 44 }}>
            {page.title}
          </T>
          <T tone="onNavy2" style={{ fontSize: 18, lineHeight: 27 }}>
            {page.lead}
          </T>
          {page.points && (
            <View style={{ gap: 10 }}>
              {page.points.map((pt) => (
                <View key={pt} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <Icon name="check" size={16} color={p.brandLime} />
                  <T tone="onNavy2" style={{ flex: 1 }}>
                    {pt}
                  </T>
                </View>
              ))}
            </View>
          )}
          <T v="tiny" tone="onNavy2">
            3 questions a morning, 3 an evening · personaindex.com
          </T>
        </View>

        <View style={{ paddingHorizontal: gutter, paddingTop: 28, gap: 16, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
          {step.at === 'start' && (
            <>
              <View style={{ gap: 4 }}>
                <T v="title">{page.head}</T>
                <T tone="muted">No password. One tap or a code.</T>
              </View>
              {!methods && <T tone="muted">One moment…</T>}
              {none && <T tone="text2">{ERRORS.sign_in_unavailable}</T>}
              {methods && providers.apple && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={p.dark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={radius.md}
                  style={{ height: 52, width: '100%', opacity: busy ? 0.6 : 1 }}
                  onPress={() => !busy && withID('apple', appleToken)}
                />
              )}
              {methods && providers.google && (
                <Button wide kind="outline" label="Continue with Google" disabled={busy} onPress={() => withID('google', () => googleToken(methods))} />
              )}
              {codes && oneTap && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: p.line }} />
                  <T v="small" tone="muted">
                    or with a code
                  </T>
                  <View style={{ flex: 1, height: 1, backgroundColor: p.line }} />
                </View>
              )}
              {codes && (
                <>
                  {methods.email && methods.phone && (
                    <View style={{ flexDirection: 'row', backgroundColor: p.surface2, borderRadius: radius.md, padding: 4 }}>
                      {tabs.map((t) => (
                        <Pressable
                          key={t.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected: via === t.id }}
                          onPress={() => setVia(t.id)}
                          style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.sm, backgroundColor: via === t.id ? p.surface : 'transparent' }}
                        >
                          <Text style={{ fontFamily: font.bold, fontSize: 15, color: via === t.id ? p.text : p.muted }}>{t.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  <Field
                    label={kind === 'email' ? 'Email address' : kind === 'whatsapp' ? 'WhatsApp number, with its country code' : 'Phone number, with its country code'}
                    value={address}
                    onChangeText={setAddress}
                    placeholder={kind === 'email' ? 'ama@example.com' : '+256 …'}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType={kind === 'email' ? 'email-address' : 'phone-pad'}
                    textContentType={kind === 'email' ? 'emailAddress' : 'telephoneNumber'}
                  />
                  <Button
                    wide
                    label="Send my 6-digit code"
                    busy={busy}
                    disabled={!address.trim()}
                    onPress={() =>
                      run(async () => {
                        const a = address.trim()
                        const { kind: k } = await sendCode(a)
                        setCode('')
                        setStep({ at: 'code', address: a, kind: k })
                      })
                    }
                  />
                </>
              )}
            </>
          )}

          {step.at === 'code' && (
            <>
              <T v="label">{step.kind === 'phone' ? 'Check your messages' : 'Check your email'}</T>
              <T v="title">We sent a 6-digit code to {step.address}</T>
              <T tone="muted">It works for 10 minutes. Nothing to type back, just the six digits.</T>
              <Field
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                accessibilityLabel="The code"
                style={{ fontSize: 28, letterSpacing: 12, textAlign: 'center', fontFamily: font.bold }}
              />
              <T v="small" tone="muted">
                This device will be added to your account. You can sign it out any time from You.
              </T>
              <Button wide label="Continue" busy={busy} disabled={code.length !== 6} onPress={() => run(async () => finish((await verifyCode(step.address, code.trim())).account))} />
              <Button kind="text" label="Use a different address" onPress={() => setStep({ at: 'start' })} />
            </>
          )}

          {step.at === 'name' && (
            <>
              <T v="title">What should friends call you?</T>
              <T tone="muted">A display name and a handle are the only two things friends ever see.</T>
              <Field label="Display name" value={name} onChangeText={setName} maxLength={40} textContentType="givenName" />
              <Field label="Handle for invites (optional)" value={handle} onChangeText={setHandle} maxLength={21} placeholder="@ama" autoCapitalize="none" />
              <Button
                wide
                label="Done"
                busy={busy}
                disabled={!name.trim()}
                onPress={() =>
                  run(async () => onDone(await patchAccount({ name: name.trim(), ...(handle.trim() ? { handle: handle.trim().replace(/^@/, '') } : {}) })))
                }
              />
              <Button kind="text" label="Later" onPress={() => onDone(step.me)} />
            </>
          )}

          {error ? <T tone="danger">{error}</T> : null}

          <View style={{ height: 1, backgroundColor: p.line, marginVertical: 4 }} />
          <T v="small" tone="muted">
            Signing in syncs your encrypted Notebook to this device. We keep a display name, a handle and that bundle — nothing else.
          </T>
          {step.at === 'start' && <Button kind="text" label={notNow} onPress={onNotNow} />}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
