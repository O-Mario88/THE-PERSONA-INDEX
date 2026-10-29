import { afterEach, describe, expect, it, vi } from 'vitest'
import { listen } from './speech'

type Result = { isFinal: boolean; 0: { transcript: string } }
const result = (transcript: string, isFinal: boolean): Result => ({ isFinal, 0: { transcript } })

// A stand-in for the browser's recogniser that sends what the test says.
class FakeRecognition {
  static last: FakeRecognition | null = null
  onresult: ((e: { resultIndex: number; results: Result[] }) => void) | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  lang = ''
  continuous = false
  interimResults = false
  processLocally = false
  constructor() {
    FakeRecognition.last = this
  }
  start() {}
  stop() {
    this.onend?.()
  }
  send(resultIndex: number, results: Result[]) {
    this.onresult?.({ resultIndex, results })
  }
}

afterEach(() => vi.unstubAllGlobals())

// Speak instead shows the words as they come, and keeps each finished
// phrase once (Edwin's brief, 2026-10-29).
describe('dictation on the device', () => {
  it('hands over each finished phrase once, even when the browser sends it again, and the phrase still being heard as it changes', () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition)
    const done: string[] = []
    const heard: string[] = []
    listen(
      (t) => done.push(t),
      () => {},
      (t) => heard.push(t),
    )
    const r = FakeRecognition.last as FakeRecognition
    expect(r.processLocally).toBe(true)
    expect(r.interimResults).toBe(true)
    r.send(0, [result('Today at work', false)])
    r.send(0, [result('Today at work I felt tired.', true), result('My', false)])
    r.send(0, [result('Today at work I felt tired.', true), result('My manager asked.', true)])
    expect(done).toEqual(['Today at work I felt tired.', 'My manager asked.'])
    expect(heard).toEqual(['Today at work', 'My', ''])
  })
})
