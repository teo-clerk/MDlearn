// What every importer shares: names, where files go, and the result the browser shows.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { inRoot } from '@mdlearn/core/node'
import type { Handle } from '../workspaces.js'
import { UserError } from '../workspaces.js'
import type { ImportResult } from '../../shared/types.js'

export const IMPORT_DIR = 'imports'
export const slugify = (s: string, max = 60) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) || 'untitled'

/** A path inside the folder that does not exist yet: `name.md`, then `name-2.md`, … */
export function freePath(h: Handle, dir: string, base: string, ext = '.md'): string {
  for (let n = 1; n < 1000; n++) {
    const rel = posix.join(dir, `${base}${n > 1 ? `-${n}` : ''}${ext}`)
    const abs = inRoot(h.root, rel)
    if (!abs) throw new UserError('path', 'That location is outside this folder.')
    if (!existsSync(abs)) return rel
  }
  throw new UserError('exists', 'Too many files with that name.')
}
/** Write a new file (never replaces one); returns its folder-relative path. */
export function writeNew(h: Handle, rel: string, data: string | Uint8Array): string {
  const abs = inRoot(h.root, rel)
  if (!abs) throw new UserError('path', 'That location is outside this folder.')
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, data, { flag: 'wx' })
  return rel
}
export const result = (files: ImportResult['files'], warnings: string[] = [], summary = ''): ImportResult => ({ files, warnings, summary })

/** A response body, refused once it passes `max` bytes (without reading the rest). */
export async function readCapped(res: Response, max: number, what = 'The page'): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer())
  const chunks: Uint8Array[] = []
  let n = 0
  const reader = res.body.getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    n += value.length
    if (n > max) { await reader.cancel(); throw new UserError('too-large', `${what} is larger than ${Math.round(max / 1048576)} MB.`) }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}
export const MAX_IMPORT_BYTES = 100 * 1024 * 1024

/** The first heading of a Markdown text, or null. */
export const firstHeading = (md: string) => /^#\s+(.+)$/m.exec(md)?.[1].trim() ?? null
export const escapeYaml = (s: string) => JSON.stringify(s)
export { join }
