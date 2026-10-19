import { describe, it, expect } from 'vitest'
import { Bm25, fuse, nearest, normalise, tokenize } from '../server/ask/search'

describe('tokenize', () => {
  it('lowercases, drops stop words, accents and TeX, and stems lightly', () => {
    expect(tokenize('The Reflections of $\\sigma^0$ in Radar Images')).toEqual(['reflection', 'radar', 'image'])
    expect(tokenize('Résolution, résolutions')).toEqual(['resolution', 'resolution'])
  })
})
describe('Bm25', () => {
  const docs = ['Speckle is granular noise from coherent summation of echoes in radar images.', 'The radar equation relates received power to range and cross-section.', 'Cloud screening with thresholds on optical reflectance.']
  const bm = new Bm25(docs)
  it('ranks the passage that has the rare words first', () => {
    expect(bm.search('what is speckle noise', 3)[0].index).toBe(0)
    expect(bm.search('received power range', 3)[0].index).toBe(1)
  })
  it('returns nothing when no word matches, and respects the limit', () => {
    expect(bm.search('zebra', 3)).toEqual([])
    expect(bm.search('radar', 1)).toHaveLength(1)
  })
})
describe('nearest and fuse', () => {
  const unit = (...v: number[]) => normalise(v)
  const m = new Float32Array([...unit(1, 0), ...unit(0, 1), ...unit(1, 1)])
  it('orders by cosine similarity', () => {
    expect(nearest(m, 2, unit(1, 0.1), 3).map((x) => x.index)).toEqual([0, 2, 1])
    expect(nearest(m, 2, unit(1, 0), 3, (i) => i !== 0).map((x) => x.index)).toEqual([2, 1])
  })
  it('fuses rankings: a passage both lists like beats one that only one likes', () => {
    const a = [{ index: 5, score: 9 }, { index: 1, score: 8 }, { index: 2, score: 7 }]
    const b = [{ index: 1, score: 0.9 }, { index: 7, score: 0.8 }, { index: 5, score: 0.1 }]
    const top = fuse([a, b], 3).map((x) => x.index)
    expect(top.slice(0, 2).sort()).toEqual([1, 5])
    expect(fuse([], 3)).toEqual([])
  })
  it('normalises zero vectors without NaN', () => { expect([...normalise([0, 0])]).toEqual([0, 0]) })
})
