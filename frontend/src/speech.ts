// Speak (Reflect): dictation on the device only. The mic shows only
// where the browser says it can recognise speech locally (the Web Speech
// API's processLocally); anywhere else it stays hidden, because speech sent
// to a recogniser's server would carry the person's writing off the phone.
// No audio is kept, and the words land in the editor, still editable.

type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  processLocally?: boolean
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}
type RecognitionClass = {
  new (): Recognition
  available?: (o: { langs: string[]; processLocally: boolean }) => Promise<string>
}

function recognitionClass(): RecognitionClass | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const lang = () => (typeof navigator !== 'undefined' && navigator.language) || 'en-GB'

// localSpeech resolves true only when this browser can recognise the
// person's language on the device, already downloaded.
export async function localSpeech(): Promise<boolean> {
  const C = recognitionClass()
  if (!C || typeof C.available !== 'function') return false
  try {
    return (await C.available({ langs: [lang()], processLocally: true })) === 'available'
  } catch {
    return false
  }
}

// listen starts on-device dictation, handing each finished phrase to onText.
// It returns the function that stops it.
export function listen(onText: (text: string) => void, onEnd: () => void): () => void {
  const C = recognitionClass()
  if (!C) {
    onEnd()
    return () => {}
  }
  const r = new C()
  r.lang = lang()
  r.continuous = true
  r.interimResults = false
  r.processLocally = true
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim())
  }
  r.onend = onEnd
  r.onerror = onEnd
  r.start()
  return () => r.stop()
}
