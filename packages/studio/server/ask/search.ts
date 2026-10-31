// Finding passages: BM25 over words, cosine over meaning vectors, and reciprocal-rank fusion of the two.
const STOP = new Set(('a an and are as at be but by can do does for from has have how i if in into is it its of on or so such than that the their then there these they this to was were what when where which who why will with you your ' +
  'about after also any been being both did each more most not only other over same some their them through very we would').split(/\s+/))
const strip = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
/** Words of a text; TeX between $…$ is left out (its commands would match everything). */
export function tokenize(text: string): string[] {
  const words = strip(text.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$/g, ' ')).match(/[\p{L}\p{N}]+/gu) ?? []
  return words.filter((w) => w.length >= 2 && !STOP.has(w)).map(stem)
}
/** A very light stemmer: plurals and -ing/-ed, enough that "reflections" finds "reflection". */
function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2)
  if (w.length > 4 && /(?:[sxz]|ch|sh)es$/.test(w)) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

export interface Scored { index: number; score: number }

export class Bm25 {
  private tf: Map<string, number>[] = []
  private len: number[] = []
  private df = new Map<string, number>()
  private avg = 1
  constructor(texts: string[], private k1 = 1.4, private b = 0.75) {
    for (const t of texts) {
      const tokens = tokenize(t), counts = new Map<string, number>()
      for (const w of tokens) counts.set(w, (counts.get(w) ?? 0) + 1)
      this.tf.push(counts); this.len.push(tokens.length)
      for (const w of counts.keys()) this.df.set(w, (this.df.get(w) ?? 0) + 1)
    }
    this.avg = this.len.reduce((a, b) => a + b, 0) / Math.max(1, this.len.length) || 1
  }
  search(query: string, limit: number): Scored[] {
    const terms = [...new Set(tokenize(query))]
    const n = this.tf.length
    const out: Scored[] = []
    for (let i = 0; i < n; i++) {
      let score = 0
      for (const w of terms) {
        const f = this.tf[i].get(w)
        if (!f) continue
        const df = this.df.get(w) ?? 0
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5))
        score += idf * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * this.len[i] / this.avg))
      }
      if (score > 0) out.push({ index: i, score })
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit)
  }
}

/** Cosine similarity of unit vectors laid end to end in `matrix` (dim values each) with `query`. */
export function nearest(matrix: Float32Array, dim: number, query: Float32Array, limit: number, allowed?: (index: number) => boolean): Scored[] {
  const n = Math.floor(matrix.length / dim)
  const out: Scored[] = []
  for (let i = 0; i < n; i++) {
    if (allowed && !allowed(i)) continue
    let dot = 0
    const o = i * dim
    for (let j = 0; j < dim; j++) dot += matrix[o + j] * query[j]
    out.push({ index: i, score: dot })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit)
}

/** Reciprocal rank fusion: a passage ranked high by either list ranks high overall. */
export function fuse(lists: Scored[][], limit: number, k = 60): Scored[] {
  const score = new Map<number, number>()
  for (const list of lists) list.forEach((s, rank) => score.set(s.index, (score.get(s.index) ?? 0) + 1 / (k + rank + 1)))
  return [...score].map(([index, score]) => ({ index, score })).sort((a, b) => b.score - a.score).slice(0, limit)
}

/** The direction a group of rows points in together: their mean, at unit length. */
export function centroid(matrix: Float32Array, dim: number): Float32Array {
  const sum = new Float32Array(dim)
  for (let i = 0; i < matrix.length; i++) sum[i % dim] += matrix[i]
  return normalise(sum)
}

export function normalise(v: number[] | Float32Array): Float32Array {
  const out = new Float32Array(v.length)
  let sum = 0
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i]
  const norm = Math.sqrt(sum) || 1
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm
  return out
}
