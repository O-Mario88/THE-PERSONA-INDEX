// "Speak instead" (Edwin's brief, 2026-10-29), beside each box where the
// person writes: their own words on a card, Reflect, Keep a moment and a
// step's private note. Speaking takes almost nothing when someone is tired
// or flooded. The screen dims into a slow breathing glow (no ticking clock,
// no waveform), the words appear as they come, and at the end the person
// keeps their exact words or a distilled version, both shown side by side.
// Speech is recognised on the phone (platform/voice.ts); no audio is kept.
import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { distil } from '@shared/distil'
import { freeLeft, isPatron, noteFreeTry } from '@shared/patron'
import { allowListening, downloadModel, startListening, voiceReady, type Listening as Session, type VoiceReady } from '../platform/voice'
import { brand, radius, useTheme, typeScale } from '../theme'
import { Icon } from './Icon'
import { Button, calmNow, feel, T } from './kit'
import { PatronNote } from './Patron'

const todayHere = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Note = 'patron' | 'model' | 'nomodel' | 'denied' | null

// Spoken words go after anything already written, within the box's limit.
export function addSpoken(current: string, spoken: string, max?: number): string {
  const joined = current.trim() ? `${current.trimEnd()} ${spoken}` : spoken
  return max ? joined.slice(0, max) : joined
}

// The button, and what it opens. onText gets the words the person chose to
// keep; the box decides where they go.
export function SpeakInstead({ onText }: { onText: (text: string) => void }) {
  const [ready, setReady] = useState<VoiceReady>('no')
  const [note, setNote] = useState<Note>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let live = true
    voiceReady().then((r) => live && setReady(r))
    return () => {
      live = false
    }
  }, [])
  if (ready === 'no') return null

  async function begin() {
    if (ready === 'model') {
      setNote('model')
      const fetched = await downloadModel()
      setNote(fetched === 'no' ? 'nomodel' : fetched === 'done' ? null : 'model')
      setReady(await voiceReady())
      return
    }
    const patron = isPatron(todayHere())
    if (!patron && freeLeft('voice') === 0) {
      setNote('patron')
      return
    }
    if (!(await allowListening())) {
      setNote('denied')
      return
    }
    if (!patron) noteFreeTry('voice')
    setNote(null)
    setOpen(true)
  }

  return (
    <View style={{ gap: 8 }}>
      <Button small kind="text" icon="mic" label="Speak instead" onPress={begin} />
      {note === 'patron' && <PatronNote text="Speaking instead of typing is part of The Persona Index Patron. Your three free tries are used." />}
      {note === 'model' && (
        <T v="small" tone="muted">
          Your phone is fetching its own speech model, so your words never leave it. Try again in a minute.
        </T>
      )}
      {note === 'nomodel' && (
        <T v="small" tone="muted">
          Speaking needs your phone’s own speech model, so your words never leave it. Tap Speak instead when you’d like to fetch it.
        </T>
      )}
      {note === 'denied' && (
        <T v="small" tone="muted">
          To speak instead, allow the microphone for The Persona Index in your phone’s settings.
        </T>
      )}
      {open && (
        <ListenSheet
          onClose={(text) => {
            setOpen(false)
            if (text) onText(text)
          }}
        />
      )}
    </View>
  )
}

type Phase = { kind: 'listening'; ending: boolean } | { kind: 'choose'; exact: string; clear: string } | { kind: 'empty' } | { kind: 'trouble'; text: string }

function ListenSheet({ onClose }: { onClose: (text: string | null) => void }) {
  const p = useTheme()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const [phase, setPhase] = useState<Phase>({ kind: 'listening', ending: false })
  const [words, setWords] = useState('')
  const [round, setRound] = useState(0)
  const session = useRef<Session | null>(null)
  const heard = useRef('')
  const closed = useRef(false)

  useEffect(() => {
    // Each round is its own listening; a round that was replaced says nothing more.
    let live = true
    heard.current = ''
    setWords('')
    setPhase({ kind: 'listening', ending: false })
    AccessibilityInfo.announceForAccessibility('Listening')
    session.current = startListening({
      onWords: (w) => {
        if (!live) return
        heard.current = w
        setWords(w)
      },
      onEnd: (trouble) => {
        if (!live || closed.current) return
        const said = heard.current.trim()
        if (trouble === 'denied') setPhase({ kind: 'trouble', text: 'To speak instead, allow the microphone and speech recognition for The Persona Index in your phone’s settings.' })
        else if (!said) setPhase(trouble ? { kind: 'trouble', text: 'I couldn’t hear that just now. Please try again.' } : { kind: 'empty' })
        else setPhase({ kind: 'choose', exact: said, clear: distil(said) })
      },
    })
    return () => {
      live = false
      session.current?.cancel()
    }
  }, [round])

  function close(text: string | null) {
    closed.current = true
    session.current?.cancel()
    if (text) feel('done')
    onClose(text)
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close(null)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(11, 28, 44, 0.55)', justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={() => close(null)} />
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: p.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: insets.bottom + 24,
            gap: 16,
            maxHeight: height * 0.88,
            width: '100%',
            maxWidth: 640,
            alignSelf: 'center',
          }}
        >
          {phase.kind === 'listening' && (
            <>
              <View style={{ alignItems: 'center', gap: 10 }}>
                <Breath />
                <T v="h3" center>
                  {phase.ending ? 'Finishing…' : 'Listening'}
                </T>
                <T v="small" tone="muted" center>
                  Say it the way it comes. It stays on this phone, and no recording is kept.
                </T>
              </View>
              <ScrollView style={{ maxHeight: 180 }}>
                <T tone={words ? 'text' : 'muted'} style={typeScale.reading}>
                  {words || '…'}
                </T>
              </ScrollView>
              <Button
                wide
                label="I’m done"
                busy={phase.ending}
                onPress={() => {
                  setPhase({ kind: 'listening', ending: true })
                  session.current?.stop()
                }}
              />
              <Button kind="text" label="Cancel" onPress={() => close(null)} style={{ alignSelf: 'center' }} />
            </>
          )}

          {phase.kind === 'choose' && (
            <ScrollView contentContainerStyle={{ gap: 12 }}>
              <T v="h3">Which would you like to keep?</T>
              <Choice label="Your exact words" text={phase.exact} action="Keep my exact words" onKeep={() => close(phase.exact)} />
              {phase.clear && phase.clear !== phase.exact && <Choice label="A clearer thought, in your words" text={phase.clear} action="Keep this" onKeep={() => close(phase.clear)} />}
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20 }}>
                <Button kind="text" label="Speak again" onPress={() => setRound((n) => n + 1)} />
                <Button kind="text" label="Cancel" onPress={() => close(null)} />
              </View>
            </ScrollView>
          )}

          {(phase.kind === 'empty' || phase.kind === 'trouble') && (
            <>
              <T center>{phase.kind === 'empty' ? 'I didn’t catch anything that time.' : phase.text}</T>
              <Button wide label="Speak again" onPress={() => setRound((n) => n + 1)} />
              <Button kind="text" label="Cancel" onPress={() => close(null)} style={{ alignSelf: 'center' }} />
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

function Choice({ label, text, action, onKeep }: { label: string; text: string; action: string; onKeep: () => void }) {
  const p = useTheme()
  return (
    <View style={{ gap: 8, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: p.line, backgroundColor: p.bg }}>
      <T v="label">{label}</T>
      <T>{text}</T>
      <Button small kind="secondary" label={action} onPress={onKeep} />
    </View>
  )
}

// A slow glow that rises and falls like a breath, under the mic. Still when
// the phone asks for less motion.
function Breath() {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (calmNow()) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    )
    // A frame after mount, so Android doesn't lose it (mobile/DESIGN.md).
    const id = requestAnimationFrame(() => loop.start())
    return () => {
      cancelAnimationFrame(id)
      loop.stop()
    }
  }, [v])
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.08] })
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] })
  return (
    <View style={{ width: 132, height: 132, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: 132, height: 132, borderRadius: 66, backgroundColor: brand.sprout, opacity, transform: [{ scale }] }} />
      {/* Positioned too, so on the web the mic paints above the glow, as on a phone. */}
      <View style={{ position: 'relative', width: 64, height: 64, borderRadius: 32, backgroundColor: brand.night, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="mic" size={28} color={brand.sprout} />
      </View>
    </View>
  )
}
