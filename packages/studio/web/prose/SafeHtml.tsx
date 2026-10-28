// A block of raw HTML from a document, made safe to show in the page: DOMPurify with an allowlist (HTML, SVG,
// SVG filters), then our own rules on top. No scripts, styles, frames, forms or event handlers; no `class`
// or `id` that could reach the app's own styles or elements (SVG ids are kept, prefixed per block, so
// gradients and markers still work); inline styles limited to the same safe properties as the compiler;
// relative images served from the folder; links open in a new tab. The page CSP blocks scripts as a second
// layer. This and KaTeX are the only places that set innerHTML.
import { useId, useMemo } from 'react'
import DOMPurify from 'dompurify'
import { cleanStyle } from '@mdlearn/core/html'
import type { ProseContext } from './Prose'

const SVG_NS = 'http://www.w3.org/2000/svg'
const FORBID_TAGS = ['style', 'script', 'noscript', 'template', 'form', 'input', 'button', 'textarea', 'select', 'option', 'iframe', 'frame', 'frameset', 'object', 'embed', 'link', 'meta', 'base', 'dialog']
const FORBID_ATTR = ['class', 'srcset', 'ping', 'formaction', 'action', 'autofocus', 'tabindex', 'contenteditable', 'slot', 'is', 'popover']

export function sanitizeHtml(html: string, cx: ProseContext, prefix: string): string {
  const purify = DOMPurify(window)
  purify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element
    if (el.hasAttribute('style')) { const s = cleanStyle(el.getAttribute('style') ?? ''); if (s) el.setAttribute('style', s); else el.removeAttribute('style') }
    const inSvg = el.namespaceURI === SVG_NS
    if (el.hasAttribute('id')) { if (inSvg) el.setAttribute('id', `${prefix}${el.getAttribute('id')}`); else el.removeAttribute('id') }
    if (inSvg) {
      for (const a of [...el.attributes]) {
        if (/url\(\s*#/.test(a.value)) el.setAttribute(a.name, a.value.replace(/url\(\s*#/g, `url(#${prefix}`))
        if ((a.name === 'href' || a.name === 'xlink:href') && a.value.startsWith('#')) el.setAttribute(a.name, `#${prefix}${a.value.slice(1)}`)
      }
    }
    if (el.tagName === 'IMG' && el.getAttribute('src') && cx.imageSrc && !/^(https?:|data:|blob:)/i.test(el.getAttribute('src')!)) el.setAttribute('src', cx.imageSrc(el.getAttribute('src')!))
    if (el.tagName === 'A' && el.getAttribute('href')) {
      const url = el.getAttribute('href')!
      const internal = url.startsWith('#') ? null : cx.linkTo?.(url)
      if (internal) el.setAttribute('href', internal)
      else if (!url.startsWith('#')) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer') }
    }
  })
  return purify.sanitize(html, { USE_PROFILES: { html: true, svg: true, svgFilters: true }, FORBID_TAGS, FORBID_ATTR, ALLOW_DATA_ATTR: false, ADD_ATTR: ['target'] })
}

export function SafeHtml({ html, cx, inline }: { html: string; cx: ProseContext; inline?: boolean }) {
  const prefix = `h${useId().replace(/[^a-zA-Z0-9]/g, '')}-`
  const clean = useMemo(() => sanitizeHtml(html, cx, prefix), [html, cx, prefix])
  const Tag = inline ? 'span' : 'div'
  return <Tag className={inline ? 'html-inline' : 'html-block'} dangerouslySetInnerHTML={{ __html: clean }} />
}
