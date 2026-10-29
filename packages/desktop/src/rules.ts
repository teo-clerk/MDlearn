// The desktop app's small decisions, kept apart from Electron so they can be tested: reading the server's
// address from its output, and where a link may open.

/**
 * The line the server prints once it listens, with the token the app gave it (so no other line it prints can
 * stand in for it): `MDLEARN_READY <token> http://localhost:4757/`. The address comes back as 127.0.0.1, where the
 * server listens: `localhost` may also mean ::1, where another program could.
 */
export function readyUrl(output: string, token: string): string | null {
  if (!token) return null
  for (const line of output.split('\n')) {
    const m = /^MDLEARN_READY (\S+) http:\/\/(?:localhost|127\.0\.0\.1):(\d{2,5})\/\s*$/.exec(line)
    if (m && m[1] === token) return `http://127.0.0.1:${m[2]}/`
  }
  return null
}

export type Opening = { where: 'window' | 'external'; url: string } | { where: 'deny' }
/**
 * Studio's own pages open in an app window (a PDF in a new tab, say); web and mail links in the browser or mail
 * app, as parsed (that is what was checked); anything else (file:, javascript:, other schemes, user:pass@) nowhere.
 */
export function openingFor(url: string, appOrigin: string): Opening {
  let u: URL
  try { u = new URL(url) } catch { return { where: 'deny' } }
  if (u.origin === appOrigin) return { where: 'window', url: u.href }
  if (u.username || u.password) return { where: 'deny' }
  return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:' ? { where: 'external', url: u.href } : { where: 'deny' }
}

/** A saved window position is used only if it is still on a screen (a monitor may have gone). */
export interface Bounds { x: number; y: number; width: number; height: number }
/** The four numbers of a saved position, and nothing else the file may hold. */
export function boundsFrom(saved: unknown): Bounds | null {
  const o = (saved ?? {}) as Record<string, unknown>
  const [x, y, width, height] = [o.x, o.y, o.width, o.height]
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
  return ok(x) && ok(y) && ok(width) && ok(height) ? { x, y, width, height } : null
}
export function onScreen(saved: Bounds, screens: Bounds[]): boolean {
  return saved.width >= 400 && saved.height >= 300 && screens.some((s) =>
    saved.x + 40 >= s.x && saved.y + 20 >= s.y && saved.x + 40 <= s.x + s.width && saved.y + 20 <= s.y + s.height)
}
