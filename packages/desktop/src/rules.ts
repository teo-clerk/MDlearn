// The desktop app's small decisions, kept apart from Electron so they can be tested: reading the server's
// address from its output, and where a link may open.

/** The line the server prints once it listens: `MDLEARN_READY http://localhost:4757/`. */
export function readyUrl(output: string): string | null {
  const m = /^MDLEARN_READY (http:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}\/)\s*$/m.exec(output)
  return m ? m[1] : null
}

/**
 * Studio's own pages open in an app window (a PDF in a new tab, say); web and mail links in the browser or mail
 * app; anything else (file:, javascript:, other schemes) nowhere.
 */
export function openingFor(url: string, appOrigin: string): 'window' | 'external' | 'deny' {
  let u: URL
  try { u = new URL(url) } catch { return 'deny' }
  if (u.origin === appOrigin) return 'window'
  return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:' ? 'external' : 'deny'
}

/** A saved window position is used only if it is still on a screen (a monitor may have gone). */
export interface Bounds { x: number; y: number; width: number; height: number }
export function onScreen(saved: Bounds, screens: Bounds[]): boolean {
  return saved.width >= 400 && saved.height >= 300 && screens.some((s) =>
    saved.x + 40 >= s.x && saved.y + 20 >= s.y && saved.x + 40 <= s.x + s.width && saved.y + 20 <= s.y + s.height)
}
