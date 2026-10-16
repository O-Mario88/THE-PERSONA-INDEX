import { beforeEach, describe, expect, it } from 'vitest'
import type { Question } from './api'
import { inOrder } from './order'

const question = (id: string): Question => ({
  id,
  prompt: 'When do you wash the dishes?',
  options: [
    { id: 'a', label: 'Right away', depth: 1 },
    { id: 'b', label: 'Before bed', depth: 2 },
    { id: 'c', label: 'Next morning', depth: 3 },
    { id: 'd', label: 'When I run out', depth: 4 },
  ],
})

describe('the order answers are shown in', () => {
  beforeEach(() => localStorage.clear())

  it('is never shallow to deep, so the first answer does not give the game away', () => {
    for (let n = 0; n < 300; n++) {
      const depths = inOrder(question(`q-${n}`)).map((o) => o.depth)
      expect(depths).not.toEqual([1, 2, 3, 4])
      expect([...depths].sort()).toEqual([1, 2, 3, 4])
    }
  })

  it('stays the same for a phone and a question, whichever day it comes round', () => {
    const first = inOrder(question('2026-10-12-q-dishes')).map((o) => o.id)
    expect(inOrder(question('2026-11-30-q-dishes')).map((o) => o.id)).toEqual(first)
    expect(inOrder(question('q-dishes')).map((o) => o.id)).toEqual(first)
  })

  it('differs between phones', () => {
    const orders = new Set<string>()
    for (let n = 0; n < 20; n++) {
      localStorage.clear()
      orders.add(inOrder(question('q-dishes')).map((o) => o.id).join())
    }
    expect(orders.size).toBeGreaterThan(1)
  })
})
