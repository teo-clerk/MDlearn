// Settings → Appearance → Colour in notes. Per device, like the theme; public/theme.js sets it before the first paint.
const KEY = 'mdl-colour'
export const colourOn = () => { try { return localStorage.getItem(KEY) !== 'off' } catch { return true } }
export function applyColour(on: boolean) {
  if (on) delete document.documentElement.dataset.colour
  else document.documentElement.dataset.colour = 'off'
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* it still applies until the page reloads */ }
}
