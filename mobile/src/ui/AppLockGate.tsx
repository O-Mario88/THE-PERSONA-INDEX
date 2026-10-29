// The privacy curtain (Edwin's brief, 2026-10-29). With the lock on, the app
// opens, and comes back after 30 seconds away, behind a plain curtain with a
// single line, "A quiet space of your own", and asks for the phone's own
// check. With the cover on, the same curtain falls whenever the app leaves
// the screen. A guest PIN typed on the curtain opens the empty guest space;
// the person's own PIN or the phone's check opens theirs. Nothing here says
// that a guest space exists.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, AppState, Modal, Platform, Pressable, View } from 'react-native'
import { APPLOCK_KEY, needsUnlock, parseAppLock, pinOpens, type AppLock } from '@shared/appLock'
import { onChange } from '@shared/storage'
import { WELCOMED, NAME_KEY } from '@shared/welcomeKeys'
import { applyCover, checkName, confirmOwner, ownerCheck, type OwnerCheck } from '../platform/applock'
import { currentSpace, enterSpace, realValue, type Space } from '../platform/setup'
import { brand, font, useTheme } from '../theme'
import { Icon } from './Icon'
import { Button, calmNow, feel, T } from './kit'

const web = Platform.OS === 'web'

const realLock = (): AppLock => {
  try {
    return parseAppLock(JSON.parse(realValue(APPLOCK_KEY) ?? 'null'))
  } catch {
    return parseAppLock(null)
  }
}

const todayHere = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// The guest space looks like the app on someone's first day: welcomed, the
// same name and look, nothing answered.
function seedGuest() {
  if (localStorage.getItem(WELCOMED) !== null) return
  localStorage.setItem(WELCOMED, '1')
  localStorage.setItem('pi.signin.asked', '1')
  localStorage.setItem('pi.started', todayHere())
  const name = realValue(NAME_KEY)
  if (name) localStorage.setItem(NAME_KEY, name)
  try {
    const prefs = JSON.parse(realValue('pi.prefs.v1') ?? '{}') as Record<string, unknown>
    const look: Record<string, unknown> = {}
    for (const k of ['appearance', 'lang', 'country', 'adult']) if (prefs[k] !== undefined) look[k] = prefs[k]
    localStorage.setItem('pi.prefs.v1', JSON.stringify(look))
  } catch {
    // a fresh look, then
  }
}

export function AppLockGate({ children, onLocked, onSpace }: { children: ReactNode; onLocked?: () => void; onSpace: (s: Space) => void }) {
  const [locked, setLocked] = useState(() => !web && needsUnlock(realLock(), null))
  const [covered, setCovered] = useState(false)
  const away = useRef<number | null>(null)

  // The cover follows its switch, in the person's own space.
  useEffect(() => {
    if (web) return
    applyCover(realLock().cover)
    return onChange((k) => {
      if (k === APPLOCK_KEY && currentSpace() === 'real') applyCover(realLock().cover)
    })
  }, [])

  useEffect(() => {
    if (web) return
    const sub = AppState.addEventListener('change', (s) => {
      const l = realLock()
      if (s === 'background') away.current = Date.now()
      if (s !== 'active') {
        if (l.on || l.cover) setCovered(true)
        return
      }
      const gone = away.current === null ? 0 : Date.now() - away.current
      away.current = null
      if (needsUnlock(l, gone)) setLocked(true)
      setCovered(false)
    })
    return () => sub.remove()
  }, [])

  // The launch needn't wait for today when the curtain is what shows.
  useEffect(() => {
    if (locked) onLocked?.()
  }, [locked, onLocked])

  const open = useCallback(
    async (s: Space) => {
      if (s !== currentSpace()) {
        await enterSpace(s)
        if (s === 'guest') seedGuest()
        onSpace(s)
      }
      setLocked(false)
      setCovered(false)
    },
    [onSpace],
  )

  if (web) return <>{children}</>
  return (
    <View style={{ flex: 1 }}>
      {children}
      {covered && !locked && <Curtain />}
      {locked && (
        <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={() => {}}>
          <Curtain lock={realLock()} onOpen={open} />
        </Modal>
      )}
    </View>
  )
}

// The curtain. Without `lock` it is only a cover; with it, it asks.
function Curtain({ lock, onOpen }: { lock?: AppLock; onOpen?: (s: Space) => void }) {
  const p = useTheme()
  const [check, setCheck] = useState<OwnerCheck>('passcode')
  const [pin, setPin] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const asked = useRef(false)

  const ask = useCallback(async () => {
    if (!onOpen) return
    setNote(null)
    const r = await confirmOwner('Open your space')
    if (r === 'ok') onOpen('real')
    else if (r === 'failed') setNote('That didn’t open it. Please try again.')
  }, [onOpen])

  useEffect(() => {
    if (!lock) return
    ownerCheck().then(setCheck)
    // Ask straight away once the app is on the screen.
    const go = () => {
      if (asked.current || AppState.currentState !== 'active') return
      asked.current = true
      ask()
    }
    go()
    const sub = AppState.addEventListener('change', go)
    return () => sub.remove()
  }, [lock, ask])

  const night = p.dark
  return (
    <View
      accessibilityViewIsModal
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: night ? brand.night : p.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 24 }}
    >
      <T v="title" center style={{ color: night ? brand.onNight : p.text }}>
        A quiet space of your own
      </T>
      {lock && !pin && (
        <View style={{ alignItems: 'center', gap: 12 }}>
          <Button label={check === 'passcode' || check === 'none' ? 'Open' : `Open with ${checkName(check)}`} onPress={ask} />
          {(lock.pin || lock.guest) && <Button kind="text" label="Use a PIN" onPress={() => setPin(true)} />}
          {note && (
            <T v="small" tone="danger" center>
              {note}
            </T>
          )}
        </View>
      )}
      {lock && pin && (
        <PinPad
          title="Your PIN"
          night={night}
          onDone={async (digits) => {
            const s = await pinOpens(digits, lock)
            if (!s) return false
            onOpen?.(s)
            return true
          }}
          onCancel={() => setPin(false)}
        />
      )}
    </View>
  )
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

// Four digits on a calm keypad. onDone says whether the PIN was right; a
// wrong one shakes the dots and clears them.
export function PinPad({
  title,
  night,
  onDone,
  onCancel,
  wrong = 'That PIN didn’t open it.',
}: {
  title: string
  night?: boolean
  onDone: (pin: string) => Promise<boolean>
  onCancel?: () => void
  wrong?: string
}) {
  const p = useTheme()
  const [digits, setDigits] = useState('')
  const [miss, setMiss] = useState(false)
  const shake = useRef(new Animated.Value(0)).current
  const ink = night ? brand.onNight : p.text

  async function press(k: string) {
    if (k === '') return
    feel('select')
    if (k === 'del') return setDigits((d) => d.slice(0, -1))
    const next = (digits + k).slice(0, 4)
    setDigits(next)
    setMiss(false)
    if (next.length < 4) return
    if (await onDone(next)) return setDigits('')
    setMiss(true)
    setDigits('')
    if (calmNow()) return
    Animated.sequence([10, -10, 6, -6, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 60, useNativeDriver: true }))).start()
  }

  return (
    <View style={{ alignItems: 'center', gap: 18 }}>
      <T v="h3" style={{ color: ink }}>
        {title}
      </T>
      <Animated.View accessibilityLabel={`${digits.length} of 4 digits`} style={{ flexDirection: 'row', gap: 16, transform: [{ translateX: shake }] }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: ink, backgroundColor: i < digits.length ? ink : 'transparent' }} />
        ))}
      </Animated.View>
      <T v="small" tone="danger" style={{ minHeight: 18 }}>
        {miss ? wrong : ''}
      </T>
      <View style={{ width: 264, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        {KEYS.map((k, i) =>
          k === '' ? (
            <View key={i} style={{ width: 72, height: 72 }} />
          ) : (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={k === 'del' ? 'Delete' : k}
              onPress={() => press(k)}
              style={(s) => ({
                width: 72,
                height: 72,
                borderRadius: 36,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: s.pressed ? (night ? '#1c3346' : p.surface2) : 'transparent',
              })}
            >
              {k === 'del' ? <Icon name="back" size={22} color={ink} /> : <T style={{ fontFamily: font.semibold, fontSize: 28, lineHeight: 34, color: ink }}>{k}</T>}
            </Pressable>
          ),
        )}
      </View>
      {onCancel && <Button kind="text" label="Cancel" onPress={onCancel} style={{ alignSelf: 'center' }} />}
    </View>
  )
}
