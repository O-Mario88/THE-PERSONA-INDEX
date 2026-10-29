import { beforeEach, describe, expect, it } from 'vitest'
import { CIRCLE_ACCESS, CONNECTION, INNER_CIRCLE, innerCircle, isInner, setInner } from './rings'

// Edwin, 2026-10-29: circles are about permission, not popularity. Everyone
// is a Connection; the closest people are the Inner Circle. No numbered
// levels, and nobody else ever learns who is in it.
describe('Connection and Inner Circle', () => {
  beforeEach(() => localStorage.clear())

  it('makes everyone a Connection until the person adds them to the Inner Circle', () => {
    expect(isInner('kofi')).toBe(false)
    setInner('kofi', true)
    expect(isInner('kofi')).toBe(true)
    expect(innerCircle()).toEqual(['kofi'])
    setInner('kofi', false)
    expect(innerCircle()).toEqual([])
  })

  it('keeps the Inner Circle on this phone only', () => {
    setInner('kofi', true)
    setInner('nakato', true)
    expect(JSON.parse(localStorage.getItem('pi.rings')!)).toEqual({ kofi: 'inner', nakato: 'inner' })
  })

  it('reads the older three circles as Inner Circle or Connection', () => {
    localStorage.setItem('pi.rings', JSON.stringify({ kofi: 'inner', nakato: 'middle', amara: 'outer', x: 'nonsense' }))
    expect(innerCircle()).toEqual(['kofi'])
    expect(isInner('nakato')).toBe(false)
  })

  it('says plainly what each can see', () => {
    expect([CONNECTION, INNER_CIRCLE]).toEqual(['Connection', 'Inner Circle'])
    expect(CIRCLE_ACCESS.map((a) => a.who)).toEqual(['Connection', 'Inner Circle', 'Selected person'])
    expect(CIRCLE_ACCESS[0].sees).toBe('Your name and anything you deliberately send them.')
  })
})
