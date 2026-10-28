// Video and caption files for the players, streamed in byte ranges (HTTP 206) so a player can seek without
// loading the whole file first.
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import type { Context } from 'hono'

export const MEDIA_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg', '.mov': 'video/quicktime', '.vtt': 'text/vtt; charset=utf-8',
}

/**
 * One `Range: bytes=…` (`a-b`, `a-`, `-n`) → the inclusive byte span to send; null when it lies outside the file
 * (416); undefined when there is none or it is not a single range (then the whole file is sent).
 */
export function byteRange(header: string | undefined, size: number): [number, number] | null | undefined {
  const m = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null
  if (!m || (!m[1] && !m[2])) return undefined
  if (m[1] && m[2] && Number(m[2]) < Number(m[1])) return undefined // not a valid range: ignored (RFC 9110 §14.2)
  const [start, end] = m[1]
    ? [Number(m[1]), m[2] ? Math.min(Number(m[2]), size - 1) : size - 1]
    : [Math.max(0, size - Number(m[2])), size - 1]
  return start <= end && start < size && !(m[1] === '' && Number(m[2]) === 0) ? [start, end] : null
}

export function mediaResponse(c: Context, abs: string, size: number, type: string): Response {
  const range = byteRange(c.req.header('range'), size)
  c.header('Content-Type', type)
  c.header('Accept-Ranges', 'bytes')
  // never recompressed (that would break the byte ranges)
  c.header('Cache-Control', 'no-cache, no-transform')
  if (range === null) { c.header('Content-Range', `bytes */${size}`); return c.body(null, 416) }
  const [start, end] = range ?? [0, size - 1]
  c.header('Content-Length', String(size ? end - start + 1 : 0))
  if (range) c.header('Content-Range', `bytes ${start}-${end}/${size}`)
  if (!size) return c.body(null, 200)
  const body = Readable.toWeb(createReadStream(abs, { start, end })) as unknown as ReadableStream
  return range ? c.body(body, 206) : c.body(body, 200)
}
