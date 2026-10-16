import { CLOSED, forgetLocal, pruneLocal, SKIPPED } from './api'
import { addDays, dateOf, daysBetween, keys, load, loadJSON, onOtherTab, remove, save } from './storage'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const k of keys()) remove(k)
})

describe('storage on this phone', () => {
  it('saves, reads and removes, and lists only its own keys', () => {
    save('pi.a', '1')
    localStorage.setItem('someone-else', 'x')
    expect(load('pi.a')).toBe('1')
    expect(keys()).toEqual(['pi.a'])
    remove('pi.a')
    expect(load('pi.a')).toBeNull()
  })

  it('keeps a value in memory for the visit when local storage is full, and never throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(() => save('pi.full', 'kept')).not.toThrow()
    expect(load('pi.full')).toBe('kept')
    expect(keys('pi.full')).toEqual(['pi.full'])
    remove('pi.full')
    expect(load('pi.full')).toBeNull()
  })

  it('reads a value that is not JSON as nothing', () => {
    save('pi.bad', '{oops')
    expect(loadJSON('pi.bad')).toBeNull()
  })

  it("follows the app's keys changed by another tab, and stops when asked", () => {
    const seen: (string | null)[] = []
    const stop = onOtherTab((k) => seen.push(k))
    window.dispatchEvent(new StorageEvent('storage', { key: 'pi.choice.q' }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'another-app' }))
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    stop()
    window.dispatchEvent(new StorageEvent('storage', { key: 'pi.choice.q' }))
    expect(seen).toEqual(['pi.choice.q', null])
  })

  it('counts days across months and years', () => {
    expect(dateOf('2026-10-12-q-dishes')).toBe('2026-10-12')
    expect(dateOf('q-dishes')).toBeNull()
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetween('2026-10-15', '2026-10-08')).toBe(-7)
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
})

const words = (date: string) => JSON.stringify({ questionId: `${date}-q`, date, prompt: 'P', words: 'Mine' })

describe('clearing what has outlived its use', () => {
  const today = '2026-10-15'

  it('keeps each kind only as long as it says, and leaves the rest alone', () => {
    const kept = {
      'pi.words.2026-09-11-q': words('2026-09-11'), // 34 days, inside five weeks
      'pi.draft.2026-10-14-q': 'half', // yesterday's draft
      'pi.choice.2026-10-07-q': 'a', // eight days
      'pi.rated.2026-10-07-q': '1',
      'pi.edition.2026-10-14': '{}',
      'pi.edition.2026-10-16': '{}',
      'pi.pick.2026-10-14': '[]',
      'pi.pick.2026-10-15.pm': '[]',
      'pi.device.v1': 'v2.pass',
      'pi.prefs.v1': '{}',
      'pi.history.v1': '{}',
      'pi.moves.v1': '[]',
    }
    const gone = {
      'pi.words.2026-09-09-q': words('2026-09-09'), // 36 days
      'pi.words.2026-10-15-bad': '{not words',
      'pi.draft.2026-10-13-q': 'old half',
      'pi.choice.2026-10-06-q': 'a', // nine days
      'pi.pending.2026-10-06-q': '{}',
      'pi.at.2026-10-06-q': '1',
      'pi.rated.2026-10-06-q': '1',
      'pi.edition.2026-10-13': '{}',
      'pi.edition.2026-10-17': '{}',
      'pi.pick.2026-10-13': '[]',
      'pi.pick.2026-10-13.pm': '[]',
    }
    for (const [k, v] of Object.entries({ ...kept, ...gone })) save(k, v)
    pruneLocal(today, 35)
    expect(keys().sort()).toEqual(Object.keys(kept).sort())
  })

  it('keeps own words for the time chosen in Settings', () => {
    save('pi.words.2026-10-07-q', words('2026-10-07'))
    pruneLocal(today, 35)
    expect(load('pi.words.2026-10-07-q')).not.toBeNull()
    pruneLocal(today, 7)
    expect(load('pi.words.2026-10-07-q')).toBeNull()
  })
})

describe('deleting from this phone', () => {
  const today = '2026-10-15'
  const everything = () => {
    save('pi.device.v1', 'v2.pass')
    save('pi.choice.2026-10-15-q', 'a')
    save('pi.choice.2026-10-14-q', 'b')
    save('pi.choice.2026-10-15-skipped', SKIPPED)
    save('pi.choice.2026-10-13-q', 'c')
    save('pi.words.2026-10-15-q', words('2026-10-15'))
    save('pi.history.v1', '{}')
    save('pi.moves.v1', '[]')
    save('pi.prefs.v1', '{}')
    save('pi.draft.2026-10-15-r', 'half')
  }

  // A question answered today or yesterday still takes votes, and the
  // server still counts this phone's vote on it: it stays closed, with
  // nothing kept of what was chosen, so it is not answered twice.
  it('clears everything but a closed mark on questions still open, and the pass', () => {
    everything()
    forgetLocal(today)
    expect(Object.fromEntries(keys().sort().map((k) => [k, load(k)]))).toEqual({
      'pi.choice.2026-10-14-q': CLOSED,
      'pi.choice.2026-10-15-q': CLOSED,
      'pi.device.v1': 'v2.pass',
    })
  })

  it('also drops the pass when everything is deleted on the server too', () => {
    everything()
    forgetLocal(today, true)
    expect(keys().sort()).toEqual(['pi.choice.2026-10-14-q', 'pi.choice.2026-10-15-q'])
  })
})
