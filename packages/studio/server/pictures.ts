// Pictures pasted or dropped into the editor: checked by their first bytes, then kept in assets/<document>/.
import { posix } from 'node:path'
import type { Handle } from './workspaces.js'
import { UserError } from './workspaces.js'
import { freePath, slugify, writeNew } from './import/common.js'

export const MAX_PICTURE_BYTES = 20 * 1024 * 1024

const startsWith = (b: Uint8Array, bytes: number[], at = 0) => bytes.every((x, i) => b[at + i] === x)
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
/** The picture's file extension, from its content: a name or a browser's type says nothing about what it holds. */
export function pictureType(b: Uint8Array): 'png' | 'jpg' | 'gif' | 'webp' | null {
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'jpg'
  if (startsWith(b, ascii('GIF87a')) || startsWith(b, ascii('GIF89a'))) return 'gif'
  if (startsWith(b, ascii('RIFF')) && startsWith(b, ascii('WEBP'), 8)) return 'webp'
  return null
}

/** Save a picture for a document; `url` is what the document's Markdown should link to. */
export function savePicture(h: Handle, docRel: string, bytes: Uint8Array): { path: string; url: string } {
  const type = pictureType(bytes)
  if (!type) throw new UserError('type', 'That is not a PNG, JPEG, GIF or WebP picture.')
  const name = slugify(posix.basename(docRel).replace(/(\.learn)?\.(md|markdown)$/i, ''), 48) || 'note'
  const path = writeNew(h, freePath(h, posix.join('assets', name), 'image', `.${type}`), bytes)
  return { path, url: posix.relative(posix.dirname(docRel), path) }
}
