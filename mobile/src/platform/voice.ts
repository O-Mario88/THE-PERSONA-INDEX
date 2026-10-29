// Speak instead (Edwin's brief, 2026-10-29): the phone's own speech
// recogniser, on the phone only. An iPhone uses Apple's on-device
// recognition, an Android phone its offline model for the person's language,
// and the website the browser's local recognition (shared speech.ts). Where a
// phone could only recognise speech by sending it to a server, the mic
// doesn't show: that would carry the person's words off the phone. No audio
// is kept anywhere.
import { Platform } from 'react-native'
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition'
import { uiLanguage } from '@shared/i18n'
import { locale } from '@shared/locale'
import { listen, localSpeech } from '@shared/speech'

const web = Platform.OS === 'web'

// ready: speak now; model: an Android phone has to download its offline
// speech model first (from the phone's maker, with nothing of the person's);
// no: this phone can't recognise speech on the device.
export type VoiceReady = 'ready' | 'model' | 'no'

const languageOf = (tag: string) => tag.toLowerCase().split(/[-_]/)[0]

// The language the person speaks: the app's own when they chose one,
// otherwise the phone's.
function speechTag(): string {
  const tag = locale()
  return languageOf(tag) === uiLanguage() ? tag : uiLanguage()
}

export async function voiceReady(): Promise<VoiceReady> {
  if (web) return (await localSpeech()) ? 'ready' : 'no'
  try {
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable() || !ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) return 'no'
    if (Platform.OS !== 'android') return 'ready'
    const { installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({})
    return installedLocales.some((l) => languageOf(l) === languageOf(speechTag())) ? 'ready' : 'model'
  } catch {
    return 'no'
  }
}

export async function downloadModel(): Promise<void> {
  if (Platform.OS === 'android') await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: speechTag() })
}

// The phone's own question, for the microphone only. Recognition on the
// device needs no speech permission, so the iPhone's speech prompt, which
// says speech goes to Apple, never shows.
export async function allowListening(): Promise<boolean> {
  if (web) return true
  try {
    return (await ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync()).granted
  } catch {
    return false
  }
}

export type Trouble = 'denied' | 'failed'
export type Heard = { onWords: (text: string) => void; onEnd: (trouble?: Trouble) => void }
export type Listening = { stop: () => void; cancel: () => void }

// startListening hands over the words so far as they come (the finished
// phrases, then the one still being heard) and says when it has ended.
export function startListening(h: Heard): Listening {
  let final = ''
  let partial = ''
  const show = () => h.onWords([final, partial].filter(Boolean).join(' '))
  const settle = (t: string) => {
    final = [final, t.trim()].filter(Boolean).join(' ')
    partial = ''
    show()
  }
  if (web) {
    const stop = listen(
      settle,
      () => h.onEnd(),
      (t) => {
        partial = t
        show()
      },
    )
    return { stop, cancel: stop }
  }
  let over = false
  const subs = [
    ExpoSpeechRecognitionModule.addListener('result', (e) => {
      const t = e.results[0]?.transcript ?? ''
      if (e.isFinal) settle(t)
      else {
        partial = t.trim()
        show()
      }
    }),
    ExpoSpeechRecognitionModule.addListener('error', (e) =>
      done(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : e.error === 'aborted' || e.error === 'no-speech' ? undefined : 'failed'),
    ),
    ExpoSpeechRecognitionModule.addListener('end', () => done()),
  ]
  function done(trouble?: Trouble) {
    if (over) return
    over = true
    for (const s of subs) s.remove()
    h.onEnd(trouble)
  }
  try {
    ExpoSpeechRecognitionModule.start({ lang: speechTag(), interimResults: true, continuous: true, requiresOnDeviceRecognition: true, addsPunctuation: true })
  } catch {
    done('failed')
  }
  return {
    stop: () => ExpoSpeechRecognitionModule.stop(),
    cancel: () => {
      ExpoSpeechRecognitionModule.abort()
      done()
    },
  }
}
