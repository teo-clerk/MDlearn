// The accent colour (Settings → Appearance): one hue becomes the five accent tokens for the light and the dark
// theme, each checked for contrast (text and buttons 4.5:1, focus rings 3:1). The tokens are set as
// --accent-l / --accent-d … custom properties on <html>; app.css falls back to graphite without them. They are
// cached in localStorage so public/theme.js can set them before the first paint.

export type AccentId = 'graphite' | 'blue' | 'green' | 'violet' | 'amber' | 'rose'
/** A preset id, or a custom colour as #rrggbb. */
export type Accent = AccentId | `#${string}`
export const ACCENTS: { id: AccentId; hue: number; chroma: number }[] = [
  { id: 'graphite', hue: 0, chroma: 0 },
  { id: 'blue', hue: 255, chroma: 0.13 },
  { id: 'green', hue: 150, chroma: 0.11 },
  { id: 'violet', hue: 295, chroma: 0.13 },
  { id: 'amber', hue: 65, chroma: 0.12 },
  { id: 'rose', hue: 10, chroma: 0.13 },
]
const KEY = 'mdl-accent', VARS_KEY = 'mdl-accent-vars'
export const LIGHT_BG = '#ffffff', DARK_BG = '#191919'
const TOKENS = ['accent', 'accent-ink', 'accent-soft', 'on-accent', 'focus'] as const
const MIN_TEXT = 4.6, MIN_FOCUS = 3.2

// ---------------------------------------------------------------- colour maths (OKLab, sRGB, WCAG contrast)
type Rgb = [number, number, number]
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
function oklchToLinear(L: number, C: number, h: number): Rgb {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
}
const inGamut = (c: Rgb) => c.every((x) => x >= -1e-4 && x <= 1 + 1e-4)
/** OKLCH → sRGB (0–1), lowering the chroma until the colour fits the sRGB gamut. */
export function oklchToRgb(L: number, C: number, h: number): Rgb {
  let lo = 0, hi = C, lin = oklchToLinear(L, C, h)
  if (!inGamut(lin)) {
    for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (inGamut(oklchToLinear(L, mid, h))) lo = mid; else hi = mid }
    lin = oklchToLinear(L, lo, h)
  }
  return lin.map((x) => Math.min(1, Math.max(0, fromLinear(x)))) as Rgb
}
export function rgbToOklch([r, g, b]: Rgb): { L: number; C: number; h: number } {
  const [lr, lg, lb] = [r, g, b].map(toLinear)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { L, C: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}
export const hex = (c: Rgb) => `#${c.map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`
export const parseHex = (s: string): Rgb | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(s.trim())
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255) as Rgb : null
}
const luminance = (c: Rgb) => { const [r, g, b] = c.map(toLinear); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
/** WCAG 2 contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(parseHex(a)!), luminance(parseHex(b)!)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

// ---------------------------------------------------------------- tokens
export type Tokens = Record<(typeof TOKENS)[number], string>
/** The lightest (light theme) or darkest (dark theme) tone of a hue that still reads well on its background. */
function tone(hue: number, chroma: number, mode: 'light' | 'dark'): string {
  const bg = mode === 'light' ? LIGHT_BG : DARK_BG
  // light: walk down from a mid tone until white text on it and it on white both pass; dark: walk up
  for (let i = 0; i <= 60; i++) {
    const L = mode === 'light' ? 0.62 - i * 0.006 : 0.7 + i * 0.004
    const c = hex(oklchToRgb(L, chroma, hue))
    if (contrast(c, bg) >= MIN_TEXT) return c
  }
  return mode === 'light' ? '#2c2c2b' : '#e7e6e2'
}
const soft = (c: string, alpha: number) => { const [r, g, b] = parseHex(c)!.map((x) => Math.round(x * 255)); return `rgb(${r} ${g} ${b} / ${alpha})` }

/** The accent tokens for one theme; null for graphite, which is app.css's own default. */
export function accentTokens(accent: Accent, mode: 'light' | 'dark'): Tokens | null {
  let hue: number, chroma: number
  const preset = ACCENTS.find((a) => a.id === accent)
  if (preset) { if (preset.id === 'graphite') return null; ({ hue, chroma } = preset) }
  else {
    const rgb = parseHex(accent)
    if (!rgb) return null
    const o = rgbToOklch(rgb)
    hue = o.h; chroma = Math.min(o.C, 0.2)
  }
  const bg = mode === 'light' ? LIGHT_BG : DARK_BG
  const accentColor = tone(hue, chroma, mode)
  // on the accent: white in light mode, the dark background in dark mode (both pass by construction of tone())
  const onAccent = mode === 'light' ? LIGHT_BG : DARK_BG
  const focus = contrast(accentColor, bg) >= MIN_FOCUS ? accentColor : (mode === 'light' ? '#2c2c2b' : '#e7e6e2')
  return { accent: accentColor, 'accent-ink': accentColor, 'accent-soft': soft(accentColor, mode === 'light' ? 0.12 : 0.18), 'on-accent': onAccent, focus }
}
/** Swatch colour for a preset: its light-theme accent (graphite: the stylesheet's own). */
export const swatch = (id: AccentId) => accentTokens(id, 'light')?.accent ?? '#2c2c2b'

/** The custom properties to set on <html>: --accent-l, --accent-d, --focus-l … (empty for graphite). */
export function accentVars(accent: Accent): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [mode, suffix] of [['light', 'l'], ['dark', 'd']] as const) {
    const t = accentTokens(accent, mode)
    if (t) for (const k of TOKENS) out[`--${k}-${suffix}`] = t[k]
  }
  return out
}

export function savedAccent(): Accent {
  try { const s = localStorage.getItem(KEY); if (s && (ACCENTS.some((a) => a.id === s) || parseHex(s))) return s as Accent } catch { /* private mode */ }
  return 'graphite'
}
/** Apply an accent now and remember it on this device (theme.js re-applies it before the next first paint). */
export function applyAccent(accent: Accent): void {
  const root = document.documentElement.style
  for (const k of TOKENS) for (const s of ['l', 'd']) root.removeProperty(`--${k}-${s}`)
  const vars = accentVars(accent)
  for (const [k, v] of Object.entries(vars)) root.setProperty(k, v)
  try {
    if (accent === 'graphite') { localStorage.removeItem(KEY); localStorage.removeItem(VARS_KEY) }
    else { localStorage.setItem(KEY, accent); localStorage.setItem(VARS_KEY, JSON.stringify(vars)) }
  } catch { /* private mode: this visit only */ }
}
