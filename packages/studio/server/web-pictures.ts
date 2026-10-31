// Pictures from the web. The page policy blocks them, so nothing in a document can reach out by itself: the server
// fetches one only when the person has allowed that site, and only from a public address, and only a real picture.
import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { UserError } from './workspaces.js'
import { readCapped } from './import/common.js'
import { MAX_PICTURE_BYTES, pictureType } from './pictures.js'

const TIMEOUT_MS = 15_000, MAX_REDIRECTS = 3
const UA = 'Mozilla/5.0 (compatible; MDlearn Studio)'
const MIME = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' } as const

const INTERNAL = new BlockList()
for (const [net, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) INTERNAL.addSubnet(net, bits, 'ipv4')
for (const [net, bits] of [['::', 127], ['64:ff9b::', 96], ['2001::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) INTERNAL.addSubnet(net, bits, 'ipv6')
const isPublic = (ip: string) => !INTERNAL.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4')

/** The network, passed in so tests never touch it. */
export interface PictureFetch { fetch: typeof fetch; resolve(host: string): Promise<string[]> }
export const realPictureFetch: PictureFetch = {
  fetch: (...args) => fetch(...args),
  resolve: async (host) => (await lookup(host, { all: true })).map((a) => a.address),
}

const notPublic = () => new UserError('not-public', 'That picture is not on a public website.')
const unavailable = () => new UserError('not-found', 'That picture could not be loaded.')

async function publicUrl(raw: string, net: PictureFetch): Promise<URL> {
  if (!URL.canParse(raw)) throw notPublic()
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.username || url.password) throw notPublic()
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const ips = isIP(host) ? [host] : await net.resolve(host).catch((): string[] => [])
  if (!ips.length || !ips.every(isPublic)) throw notPublic()
  return url
}

export async function webPicture(raw: string, net: PictureFetch = realPictureFetch): Promise<{ bytes: Uint8Array; type: string }> {
  let next = raw
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await publicUrl(next, net)
    const res = await net.fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'image/*', 'user-agent': UA } }).catch(() => { throw unavailable() })
    const moved = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
    if (moved) {
      // the person allowed this site, so it can't pass the address on to another one
      const to = URL.canParse(moved, url) ? new URL(moved, url) : null
      if (to?.hostname !== url.hostname) throw unavailable()
      next = to.href
      continue
    }
    if (!res.ok) throw unavailable()
    const bytes = await readCapped(res, MAX_PICTURE_BYTES, 'The picture')
    const type = pictureType(bytes)
    if (!type) throw new UserError('type', 'That is not a PNG, JPEG, GIF or WebP picture.')
    return { bytes, type: MIME[type] }
  }
  throw unavailable()
}
