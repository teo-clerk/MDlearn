import { describe, it, expect } from 'vitest'
import { ACCENTS, accentTokens, accentVars, contrast, hex, oklchToRgb, parseHex, rgbToOklch, LIGHT_BG, DARK_BG, type Accent } from '../web/lib/accent'

// Every accent, preset or picked by hand, must keep text and buttons readable (4.5:1) and focus rings visible
// (3:1) in both themes.
const CUSTOM: Accent[] = ['#ff0000', '#00ff00', '#ffff00', '#0000ff', '#00ffff', '#ff00ff', '#888888', '#000000', '#ffffff', '#ff8800', '#7a5cff']

describe('accent colours', () => {
  for (const accent of [...ACCENTS.map((a) => a.id), ...CUSTOM]) {
    it(`${accent} passes contrast in light and dark`, () => {
      for (const [mode, bg] of [['light', LIGHT_BG], ['dark', DARK_BG]] as const) {
        const t = accentTokens(accent, mode)
        if (!t) { expect(accent).toBe('graphite'); continue }
        expect(contrast(t.accent, bg), `${mode} accent on background`).toBeGreaterThanOrEqual(4.5)
        expect(contrast(t['on-accent'], t.accent), `${mode} text on accent`).toBeGreaterThanOrEqual(4.5)
        expect(contrast(t['accent-ink'], bg), `${mode} accent text`).toBeGreaterThanOrEqual(4.5)
        expect(contrast(t.focus, bg), `${mode} focus ring`).toBeGreaterThanOrEqual(3)
      }
    })
  }
  it('graphite is the stylesheet default, so it sets nothing', () => {
    expect(accentVars('graphite')).toEqual({})
    expect(Object.keys(accentVars('blue'))).toContain('--accent-l')
    expect(Object.keys(accentVars('blue'))).toContain('--focus-d')
  })
  it('keeps the hue of a picked colour', () => {
    const picked = rgbToOklch(parseHex('#2f6fd6')!)
    const made = rgbToOklch(parseHex(accentTokens('#2f6fd6', 'light')!.accent)!)
    expect(Math.abs(made.h - picked.h)).toBeLessThan(8)
    expect(hex(oklchToRgb(picked.L, picked.C, picked.h))).toBe('#2f6fd6')
  })
})
