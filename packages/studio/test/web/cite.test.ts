import { describe, it, expect } from 'vitest'
import { citedNumbers } from '../../web/lib/cite'
describe('citedNumbers', () => {
  it('lists each cited source once, in order, ignoring numbers that are not sources', () => {
    expect(citedNumbers('A [2] and [1], again [2], and [7] or [0].', 3)).toEqual([2, 1])
    expect(citedNumbers('nothing', 3)).toEqual([])
  })
})
