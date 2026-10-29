// The privacy curtain's choices, in You → Privacy and choices, right below
// Keep it mild (Edwin's brief, 2026-10-29; every on/off switch lives in that
// card, 2026-10-28). On the website the lock is the browser's passkey lock;
// the cover, the quiet icon and the guest PIN belong to the phone apps.
// All of it is free (Edwin, 2026-10-29: "keep trust outside the paywall"):
// the lock, the cover, the quiet icon and the guest PIN protect the people
// who need them most. Inside the guest space nothing mentions a guest PIN.
import { useEffect, useState } from 'react'
import { Image, Modal, Platform, Pressable, View } from 'react-native'
import { appLock, saveAppLock, sealPin, type AppLock, type QuietIcon } from '@shared/appLock'
import { applyCover, checkName, chosenIcon, confirmOwner, homeScreenIcon, ownerCheck, quietIconsHere, setQuietIcon, type OwnerCheck } from '../platform/applock'
import { currentSpace, wipeGuest } from '../platform/setup'
import { brand, useTheme, typeScale } from '../theme'
import { PinPad } from '../ui/AppLockGate'
import { Button, T, Toggle } from '../ui/kit'
import { WebLockSettings } from './Browser'

const android = Platform.OS === 'android'

const ICONS: { id: QuietIcon; label: string; under: string; src: number }[] = [
  { id: 'usual', label: 'The sprout', under: android ? 'The Persona Index' : 'The sprout', src: require('../../assets/icon.png') },
  { id: 'pebble', label: 'A pebble', under: android ? 'Notes' : 'A pebble', src: require('../../assets/quiet/pebble.png') },
  { id: 'horizon', label: 'A horizon', under: android ? 'Today' : 'A horizon', src: require('../../assets/quiet/horizon.png') },
]

export function PrivacyLockChoices() {
  return Platform.OS === 'web' ? <WebLockSettings /> : <PhoneLockChoices />
}

function PhoneLockChoices() {
  const [lock, setLock] = useState<AppLock>(appLock)
  const [check, setCheck] = useState<OwnerCheck | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [settingUp, setSettingUp] = useState(false)
  const [icon, setIcon] = useState<QuietIcon>(() => chosenIcon(appLock().icon))
  const guestSpace = currentSpace() === 'guest'
  useEffect(() => {
    ownerCheck().then(setCheck)
  }, [])

  const save = (next: AppLock) => {
    saveAppLock(next)
    setLock(next)
  }
  async function turnLock(on: boolean) {
    setNote(null)
    if (on && check === 'none') return setNote('Set up a screen lock on your phone first, then come back here.')
    const r = await confirmOwner(on ? 'Turn on the lock' : 'Turn off the lock')
    if (r === 'failed') return setNote('That didn’t match, so nothing changed.')
    if (r !== 'ok') return
    if (on) return save({ ...lock, on: true })
    save({ ...lock, on: false, pin: null, guest: null })
    if (!guestSpace) wipeGuest().catch(() => {})
  }

  async function turnCover(on: boolean) {
    save({ ...lock, cover: on })
    if (!guestSpace) await applyCover(on)
  }

  async function pickIcon(id: QuietIcon) {
    if (await setQuietIcon(id)) {
      setIcon(id)
      save({ ...lock, icon: id })
    }
  }

  async function startGuest() {
    if ((await confirmOwner('Set up a guest PIN')) === 'ok') setSettingUp(true)
  }

  async function removeGuest() {
    if ((await confirmOwner('Remove the guest PIN')) !== 'ok') return
    save({ ...lock, pin: null, guest: null })
    wipeGuest().catch(() => {})
  }

  const name = check ? checkName(check) : 'your passcode'
  const lockLabel = check === 'face' || check === 'finger' ? `Lock with ${name}` : 'Lock with your passcode'
  return (
    <>
      <Toggle
        label={lockLabel}
        note={`When the app opens, or you come back after 30 seconds, it asks for ${name} first. It keeps out someone who picks up your phone while it’s unlocked.`}
        value={lock.on}
        onChange={turnLock}
      />
      {note && (
        <T v="small" tone="danger">
          {note}
        </T>
      )}
      <Toggle
        label="Hide the app in the app switcher"
        note={
          android
            ? 'When you switch away, the app switcher shows a blank card instead of your last page. This also stops screenshots inside the app.'
            : 'When you switch away, the app switcher shows a blur instead of your last page.'
        }
        value={lock.cover}
        onChange={turnCover}
      />
      {quietIconsHere() && (
        <View style={{ gap: 10, paddingVertical: 12 }}>
          <View style={{ gap: 2 }}>
            <T v="h3" style={typeScale.body}>
              A quiet app icon
            </T>
            <T v="small" tone="muted">
              {android ? 'An icon, and a name under it, that say less on your home screen.' : 'An icon that says less on your home screen. Your iPhone keeps the app’s name under it.'}
            </T>
          </View>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 12 }}>
            {ICONS.map((i) => (
              <IconTile key={i.id} label={i.label} under={i.under} src={i.src} on={icon === i.id} onPress={() => pickIcon(i.id)} />
            ))}
          </View>
          {android && icon !== homeScreenIcon(icon) && (
            <T v="small" tone="muted">
              Your home screen shows it once you leave the app.
            </T>
          )}
        </View>
      )}
      {!guestSpace && (
        <View style={{ gap: 8, paddingVertical: 12 }}>
          <View style={{ gap: 2 }}>
            <T v="h3" style={typeScale.body}>
              A guest PIN
            </T>
            <T v="small" tone="muted">
              {`If someone insists on seeing the app, unlock it with a guest PIN: it opens an empty, new-looking app instead of yours. Your own space opens only with ${name} or your own PIN.`}
            </T>
          </View>
          {lock.guest ? (
            <>
              <T v="small" bold>
                On. On the lock screen, tap Use a PIN to type either PIN.
              </T>
              <Button small kind="secondary" label="Remove the guest PIN" onPress={removeGuest} />
            </>
          ) : (
            <Button small kind="secondary" label="Set up a guest PIN" onPress={startGuest} />
          )}
        </View>
      )}
      {settingUp && (
        <GuestPinSetup
          onCancel={() => setSettingUp(false)}
          onDone={async (own, guestPin) => {
            save({ ...lock, on: true, pin: await sealPin(own), guest: await sealPin(guestPin) })
            setSettingUp(false)
          }}
        />
      )}
    </>
  )
}

function IconTile({ label, under, src, on, onPress }: { label: string; under: string; src: number; on: boolean; onPress: () => void }) {
  const p = useTheme()
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label} onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <View style={{ padding: 3, borderRadius: 19, borderWidth: 2, borderColor: on ? p.lime : 'transparent' }}>
        <Image source={src} style={{ width: 58, height: 58, borderRadius: 14 }} />
      </View>
      <T v="tiny" center>
        {under}
      </T>
    </Pressable>
  )
}

type Step = 'own' | 'own2' | 'guest' | 'guest2'

// Choosing the two PINs: the person's own first, then the guest's, each typed
// twice, and never the same.
function GuestPinSetup({ onDone, onCancel }: { onDone: (own: string, guest: string) => void; onCancel: () => void }) {
  const p = useTheme()
  const [step, setStep] = useState<Step>('own')
  const [own, setOwn] = useState('')
  const [guestPin, setGuestPin] = useState('')
  const [error, setError] = useState('')
  const TITLES: Record<Step, string> = {
    own: 'Choose your own PIN',
    own2: 'Type your own PIN again',
    guest: 'Now choose a guest PIN',
    guest2: 'Type the guest PIN again',
  }
  // Each answer moves on, or goes back with a word on why.
  async function done(pin: string): Promise<boolean> {
    const go = (next: Step, why = '') => {
      setStep(next)
      setError(why)
      return !why
    }
    if (step === 'own') {
      setOwn(pin)
      return go('own2')
    }
    if (step === 'own2') return pin === own ? go('guest') : go('own', 'That didn’t match. Choose your own PIN again.')
    if (step === 'guest') {
      if (pin === own) return go('guest', 'Choose a guest PIN different from your own.')
      setGuestPin(pin)
      return go('guest2')
    }
    if (pin !== guestPin) return go('guest', 'That didn’t match. Choose the guest PIN again.')
    onDone(own, guestPin)
    return true
  }
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: p.dark ? brand.night : p.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
        <T v="small" tone="muted" center style={{ maxWidth: 320 }}>
          Four digits each. Your own PIN opens your space; the guest PIN opens an empty one.
        </T>
        <T v="small" tone="danger" center style={{ minHeight: 18 }}>
          {error}
        </T>
        <PinPad title={TITLES[step]} night={p.dark} wrong="" onDone={done} onCancel={onCancel} />
      </View>
    </Modal>
  )
}
