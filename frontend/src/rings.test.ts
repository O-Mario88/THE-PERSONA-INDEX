import { beforeEach, describe, expect, it } from 'vitest'
import { loadRings, placeIn, RING_NAMES, ringOf } from './rings'

describe('the three circles', () => {
  beforeEach(() => localStorage.clear())

  it('puts everyone in the outer circle until the person places them', () => {
    expect(ringOf(loadRings(), 'kofi')).toBe('outer')
  })

  it('keeps where each person was placed, on this phone only', () => {
    placeIn('kofi', 'inner')
    placeIn('nakato', 'middle')
    const rings = loadRings()
    expect(ringOf(rings, 'kofi')).toBe('inner')
    expect(ringOf(rings, 'nakato')).toBe('middle')
    expect(JSON.parse(localStorage.getItem('pi.rings')!)).toEqual({ kofi: 'inner', nakato: 'middle' })
  })

  it('names the circles by what they mean', () => {
    expect(RING_NAMES.inner).toBe('Inner circle')
    expect(RING_NAMES.middle).toBe('Close')
    expect(RING_NAMES.outer).toBe('Wider circle')
  })
})
