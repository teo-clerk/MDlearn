// The studio can read your files and (later) start AI jobs, so it must not be drivable by other web
// pages or other devices. Defences, in order: Host allowlist (DNS rebinding), LAN token (other devices),
// same-origin + `X-MDL` header on every change (CSRF), strict headers, capability gate per client.
import { timingSafeEqual } from 'node:crypto'
import { networkInterfaces, hostname } from 'node:os'
import type { Context, MiddlewareHandler } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { getConnInfo } from '@hono/node-server/conninfo'
import type { Capability } from '../shared/types.js'

export interface SecurityOptions {
  port: number
  /** Accept connections from other devices (with the token). */
  lan: boolean
  /** Give LAN clients every capability (default: read, study, notes, local AI questions). */
  lanFull: boolean
  /** 32-byte random token for LAN clients. */
  token: string
  /** Dev mode relaxes the page CSP for Vite's HMR client. */
  dev?: boolean
}
const LOCAL_CAPS: Capability[] = ['read', 'study', 'notes', 'askLocal', 'write', 'ai', 'fs']
const LAN_CAPS: Capability[] = ['read', 'study', 'notes', 'askLocal']
const COOKIE = 'mdl_t'

export const lanAddresses = (): string[] =>
  Object.values(networkInterfaces()).flat().filter((a): a is NonNullable<typeof a> => !!a && a.family === 'IPv4' && !a.internal).map((a) => a.address)
export function allowedHosts(o: Pick<SecurityOptions, 'lan'>): Set<string> {
  const hosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
  if (o.lan) for (const h of [...lanAddresses(), hostname(), `${hostname()}.local`]) hosts.add(h.toLowerCase())
  return hosts
}
const isLoopback = (addr: string | undefined) => !addr || addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }
const fail = (c: Context, status: 401 | 403 | 415, code: string, message: string) => c.json({ error: { code, message } }, status)

export function clientOf(c: Context): 'local' | 'lan' {
  let addr: string | undefined
  try { addr = getConnInfo(c).remote.address } catch { addr = undefined } // app.request() in tests has no socket
  return isLoopback(addr) ? 'local' : 'lan'
}
export const capsOf = (c: Context, o: SecurityOptions): Capability[] => (clientOf(c) === 'local' || o.lanFull ? LOCAL_CAPS : LAN_CAPS)

export function security(o: SecurityOptions): MiddlewareHandler {
  const hosts = allowedHosts(o)
  return async (c, next) => {
    // 1. Host allowlist: a page on evil.com resolving to 127.0.0.1 (DNS rebinding) still sends Host: evil.com
    const host = (c.req.header('host') ?? '').toLowerCase()
    const name = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0]
    if (!hosts.has(name)) return fail(c, 403, 'host', 'This address is not allowed. Open MDlearn Studio at the URL printed in the terminal.')
    // 2. Other devices need the token (exchanged once for an HttpOnly cookie, so it leaves the URL)
    if (clientOf(c) === 'lan') {
      if (!o.lan) return fail(c, 403, 'lan-off', 'MDlearn Studio is not shared on the network. Start it with --lan.')
      const url = new URL(c.req.url)
      // the sandboxes (simulations, Python) have an opaque origin (no cookies) and hold no data: they need no token
      if (url.pathname.startsWith('/sandbox/')) { await next(); return }
      if (url.pathname === '/api/auth') {
        const t = url.searchParams.get('t') ?? ''
        if (!same(t, o.token)) return fail(c, 401, 'token', 'This link is not valid any more. Use the link or QR code printed in the terminal.')
        setCookie(c, COOKIE, o.token, { httpOnly: true, sameSite: 'Strict', path: '/', maxAge: 60 * 60 * 24 * 30 })
        c.header('Referrer-Policy', 'no-referrer')
        return c.redirect('/', 302)
      }
      if (!same(getCookie(c, COOKIE) ?? '', o.token)) return fail(c, 401, 'token', 'Open MDlearn Studio with the link or QR code printed in the terminal.')
    }
    // 3. Changes must come from our own page: same origin and the custom header (forces a CORS preflight we never allow)
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      const origin = c.req.header('origin')
      const own = `${new URL(c.req.url).protocol}//${host}` // the origin this page was loaded from (Host already vetted)
      const site = c.req.header('sec-fetch-site')
      if ((origin && origin !== own) || (site && site !== 'same-origin' && site !== 'none')) return fail(c, 403, 'origin', 'Request from another site refused.')
      if (c.req.header('x-mdl') !== '1') return fail(c, 403, 'header', 'Missing X-MDL header.')
      const type = c.req.header('content-type') ?? ''
      if (!/^application\/json\b/.test(type) && !/^multipart\/form-data\b/.test(type)) return fail(c, 415, 'content-type', 'Send JSON.')
    }
    if (c.req.method === 'OPTIONS') return c.body(null, 204) // no CORS headers: cross-origin preflights fail
    await next()
    // 4. Headers
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'no-referrer')
    c.header('Cross-Origin-Opener-Policy', 'same-origin')
    c.header('X-Frame-Options', 'SAMEORIGIN')
    if (!c.res.headers.has('Content-Security-Policy')) c.header('Content-Security-Policy', pageCsp(!!o.dev))
  }
}
export function pageCsp(dev: boolean): string {
  return [
    "default-src 'self'", `script-src 'self'${dev ? " 'unsafe-inline'" : ''}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
    "font-src 'self' data:", `connect-src 'self'${dev ? ' ws: wss:' : ''}`, "media-src 'self'",
    // the only outside pages a document can open in place: YouTube (privacy-enhanced domain) and Vimeo players,
    // loaded only when the reader presses play
    "frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com", "worker-src 'self' blob:",
    "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'self'",
  ].join('; ')
}
/** Route guard: 403 unless this client has the capability. */
export const need = (cap: Capability, o: SecurityOptions): MiddlewareHandler => async (c, next) => {
  if (!capsOf(c, o).includes(cap)) return fail(c, 403, 'capability', 'Not available from this device. Use the computer running MDlearn Studio.')
  await next()
}
