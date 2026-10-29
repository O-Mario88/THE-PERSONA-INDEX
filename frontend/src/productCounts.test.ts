import { beforeEach, describe, expect, it } from 'vitest'
import { loadPrefs, savePrefs, withSharing } from './prefs'
import { countEvent, flushCounts, noteMirrorWeek } from './productCounts'

// Edwin, 2026-10-29: the five signals as anonymous counts, never anyone's
// writing, and only once the person said yes to "Count how I use the app".
describe('anonymous product counts', () => {
  let sent: string[] = []
  const send = async (e: string) => {
    sent.push(e)
  }
  const yes = () => savePrefs(withSharing(loadPrefs(), { answers: false, helped: false, use: true }))

  beforeEach(() => {
    localStorage.clear()
    sent = []
  })

  it('sends nothing until the person says yes', () => {
    countEvent('brief_used', send)
    noteMirrorWeek('2026-10-19', send)
    noteMirrorWeek('2026-10-26', send)
    expect(sent).toEqual([])
  })

  it('sends a brief being used each time, and only the event name', () => {
    yes()
    countEvent('brief_used', send)
    countEvent('brief_used', send)
    expect(sent).toEqual(['brief_used', 'brief_used'])
  })

  it('sends the first useful result once per phone', () => {
    yes()
    countEvent('first_result', send)
    countEvent('first_result', send)
    expect(sent).toEqual(['first_result'])
  })

  it('sends a return for another Mirror once, on the second different week', () => {
    yes()
    noteMirrorWeek('2026-10-19', send)
    noteMirrorWeek('2026-10-19', send)
    expect(sent).toEqual([])
    noteMirrorWeek('2026-10-26', send)
    noteMirrorWeek('2026-11-02', send)
    expect(sent).toEqual(['second_mirror'])
  })

  // The first result usually comes before the question about counting, so it
  // waits on the phone and is sent once if the person later says yes.
  it('holds the first result on the phone until the person says yes, then sends it once', () => {
    countEvent('first_result', send)
    countEvent('brief_used', send)
    flushCounts(send)
    expect(sent).toEqual([])
    yes()
    flushCounts(send)
    flushCounts(send)
    countEvent('first_result', send)
    expect(sent).toEqual(['first_result'])
  })
})
