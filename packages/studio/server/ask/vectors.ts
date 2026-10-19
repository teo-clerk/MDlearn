// Meaning vectors for passages, kept beside the notes: embeddings.json (model, size, which passage each
// row is) and embeddings.bin (the numbers, unit length, row after row). A passage is identified by a hash of
// its words, so an edit re-embeds only the passages that changed.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export class VectorStore {
  private rows = new Map<string, Float32Array>()
  dim = 0
  model = ''
  private file: { json: string; bin: string }
  constructor(root: string, model: string) {
    const dir = join(root, '.mdlearn', 'index')
    this.file = { json: join(dir, 'embeddings.json'), bin: join(dir, 'embeddings.bin') }
    this.model = model
    this.load()
  }
  private load() {
    try {
      if (!existsSync(this.file.json) || !existsSync(this.file.bin)) return
      const meta = JSON.parse(readFileSync(this.file.json, 'utf8')) as { version: number; model: string; dim: number; hashes: string[] }
      if (meta.version !== 1 || meta.model !== this.model || !meta.dim) return // another model: its vectors mean something else
      const buf = readFileSync(this.file.bin)
      const all = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4))
      if (all.length < meta.hashes.length * meta.dim) return
      this.dim = meta.dim
      meta.hashes.forEach((h, i) => this.rows.set(h, all.slice(i * meta.dim, (i + 1) * meta.dim)))
    } catch { this.rows.clear(); this.dim = 0 } // unreadable: start again
  }
  has(hash: string) { return this.rows.has(hash) }
  get size() { return this.rows.size }
  set(hash: string, v: Float32Array) { if (!this.dim) this.dim = v.length; if (v.length === this.dim) this.rows.set(hash, v) }
  /** Rows for the given passages, in order, with the index of each passage that has one. */
  matrixFor(hashes: string[]): { matrix: Float32Array; owners: number[] } {
    const owners: number[] = []
    for (let i = 0; i < hashes.length; i++) if (this.rows.has(hashes[i])) owners.push(i)
    const matrix = new Float32Array(owners.length * this.dim)
    owners.forEach((o, r) => matrix.set(this.rows.get(hashes[o])!, r * this.dim))
    return { matrix, owners }
  }
  /** Write to disk, keeping only the passages in `keep` (the ones that still exist). */
  save(keep?: Set<string>) {
    if (keep) for (const h of [...this.rows.keys()]) if (!keep.has(h)) this.rows.delete(h)
    const hashes = [...this.rows.keys()]
    const bin = new Float32Array(hashes.length * this.dim)
    hashes.forEach((h, i) => bin.set(this.rows.get(h)!, i * this.dim))
    mkdirSync(join(this.file.json, '..'), { recursive: true })
    const suffix = `.${process.pid}.tmp`
    writeFileSync(this.file.bin + suffix, Buffer.from(bin.buffer, bin.byteOffset, bin.byteLength))
    writeFileSync(this.file.json + suffix, JSON.stringify({ version: 1, model: this.model, dim: this.dim, hashes }))
    renameSync(this.file.bin + suffix, this.file.bin)
    renameSync(this.file.json + suffix, this.file.json)
  }
}
