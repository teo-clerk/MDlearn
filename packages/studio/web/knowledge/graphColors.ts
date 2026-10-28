// The graph is drawn on a canvas, which cannot use the stylesheet: it reads the theme's colours from the CSS
// variables, and reads them again when the theme or the accent changes.
import { useEffect, useState } from 'react'

export interface GraphColors {
  text: string; muted: string; subtle: string; border: string; borderStrong: string; panel: string
  good: string; warn: string; bad: string; focus: string; accent: string; font: string
}
const VARS: Record<keyof GraphColors, string> = {
  text: '--text', muted: '--muted', subtle: '--subtle', border: '--border', borderStrong: '--border-strong', panel: '--panel',
  good: '--good', warn: '--warn', bad: '--bad', focus: '--focus', accent: '--accent', font: '--font-ui',
}

export function readGraphColors(): GraphColors {
  const s = getComputedStyle(document.documentElement)
  return Object.fromEntries(Object.entries(VARS).map(([k, v]) => [k, s.getPropertyValue(v).trim()])) as unknown as GraphColors
}

/** The current colours, updated when the theme (data-theme, the system setting) or the accent (inline style) changes. */
export function useGraphColors(): GraphColors {
  const [colors, setColors] = useState(readGraphColors)
  useEffect(() => {
    const update = () => setColors((old) => { const next = readGraphColors(); return JSON.stringify(next) === JSON.stringify(old) ? old : next })
    const mo = new MutationObserver(update)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] })
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', update)
    return () => { mo.disconnect(); mq.removeEventListener('change', update) }
  }, [])
  return colors
}

/** A #rrggbb colour made transparent; any other colour string is returned unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color)
  if (!m) return color
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
