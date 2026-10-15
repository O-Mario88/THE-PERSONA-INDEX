import { withCrowd } from './api'

describe('with or against the crowd', () => {
  it('counts an answer at least an even share of players picked as with the crowd', () => {
    // Two options: half. Three: a third. Four: a quarter.
    expect(withCrowd(100, 200, 2)).toBe(true)
    expect(withCrowd(99, 200, 2)).toBe(false)
    expect(withCrowd(100, 300, 3)).toBe(true)
    expect(withCrowd(100, 301, 3)).toBe(false)
    expect(withCrowd(35, 101, 3)).toBe(true)
    expect(withCrowd(25, 100, 4)).toBe(true)
    expect(withCrowd(20, 102, 4)).toBe(false)
  })
})
