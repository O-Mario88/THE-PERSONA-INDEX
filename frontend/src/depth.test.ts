import { beforeEach, describe, expect, it } from 'vitest'
import { chooseDepth, followTime, readsDeeper } from './depth'
import { loadPrefs, savePrefs } from './prefs'

beforeEach(() => localStorage.clear())

// Two reading depths across the app (Edwin's brief, 2026-10-28): Essential,
// a moment of clarity and an optional small action, or Explore deeper, the
// supporting answers and other sides. Insights and My Journey show
// everything until you ask for less (Edwin, 2026-10-28: "nothing hidden");
// the Mirror opens on its story.
describe('one reading depth for every page', () => {
  it('shows everything on Insights and My Journey, and the story first in the Mirror, until you choose', () => {
    expect(readsDeeper('insights')).toBe(true)
    expect(readsDeeper('journey')).toBe(true)
    expect(readsDeeper('mirror')).toBe(false)
  })

  it('follows how much time you said you usually have', () => {
    savePrefs({ ...loadPrefs(), time: 'minute' })
    expect(readsDeeper('insights')).toBe(false)
    savePrefs({ ...loadPrefs(), time: 'deep' })
    expect(readsDeeper('mirror')).toBe(true)
  })

  it('keeps the depth you last chose on any page, everywhere', () => {
    chooseDepth(false)
    expect(readsDeeper('insights')).toBe(false)
    chooseDepth(true)
    expect(readsDeeper('mirror')).toBe(true)
  })

  it('goes back to your time answer when you change it in My Reflection Style', () => {
    chooseDepth(true)
    savePrefs({ ...loadPrefs(), time: 'minute' })
    followTime()
    expect(readsDeeper('insights')).toBe(false)
  })

  it('reads a Mirror set to deep before there was one depth for every page', () => {
    localStorage.setItem('pi.mirror.depth', 'deep')
    expect(readsDeeper('mirror')).toBe(true)
  })
})

describe('my reflection style', () => {
  it('keeps what you find most useful and how much time you have, and nothing unknown', () => {
    savePrefs({ ...loadPrefs(), style: 'practical', time: 'minute' })
    expect(loadPrefs()).toMatchObject({ style: 'practical', time: 'minute' })
    localStorage.setItem('pi.prefs.v1', JSON.stringify({ style: 'loud', time: 'forever' }))
    expect(loadPrefs().style).toBeUndefined()
    expect(loadPrefs().time).toBeUndefined()
  })
})
