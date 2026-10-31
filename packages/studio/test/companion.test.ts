import { describe, it, expect } from 'vitest'
import { FRAMES, GRID, toPath } from '../web/companion/sprites'

describe('the pixel companion', () => {
  it.each(Object.entries(FRAMES))('%s has two different frames inside its grid', (_, { frames }) => {
    expect(toPath(frames[0])).not.toBe(toPath(frames[1]))
    for (const cells of frames) for (const [x, y] of cells) {
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(GRID)
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThan(GRID)
    }
  })
  it('keeps nothing but its picture: each state looks different from the others', () => {
    const looks = Object.values(FRAMES).map((f) => toPath(f.frames[0]))
    expect(new Set(looks).size).toBe(looks.length)
  })
})
