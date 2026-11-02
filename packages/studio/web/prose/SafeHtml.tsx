// A block of raw HTML from a document, made safe to show in the page: DOMPurify with an allowlist (HTML, SVG,
// SVG filters), then our own rules on top. No scripts, styles, frames, forms or event handlers; no `class`
// or `id` that could reach the app's own styles or elements (SVG ids are kept, prefixed per block, so
// gradients and markers still work); inline styles limited to the same safe properties as the compiler;
// relative images served from the folder; links open in a new tab. The page CSP blocks scripts as a second
// layer. This and KaTeX are the only places that set innerHTML.
import { useEffect, useId, useMemo, useRef, type SyntheticEvent } from 'react'
import DOMPurify from 'dompurify'
import { cleanStyle } from '@mdlearn/core/html'
import type { ProseContext } from './Prose'
import { heldPicture, replaceFailedPicture } from './Picture'
import { fromWeb, loadWebPicture, siteOf, useAllowedSites } from './webPictures'

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
    if (el.tagName === 'IMG') {
      el.setAttribute('tabindex', '0')
      const src = el.getAttribute('src') ?? ''
      if (fromWeb(src)) { el.setAttribute('data-web-src', src); el.removeAttribute('src') } // SafeHtml brings it in once its site is allowed
    }
    if (el.tagName === 'IMG' && el.getAttribute('src') && cx.imageSrc && !/^(https?:|data:|blob:)/i.test(el.getAttribute('src')!)) el.setAttribute('src', cx.imageSrc(el.getAttribute('src')!))
    if (el.tagName === 'A' && el.getAttribute('href')) {
      const url = el.getAttribute('href')!
      const internal = url.startsWith('#') ? null : cx.linkTo?.(url)
      if (internal) el.setAttribute('href', internal)
      else if (!url.startsWith('#')) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer') }
    }
  })
  return purify.sanitize(html, { USE_PROFILES: { html: true, svg: true, svgFilters: true }, FORBID_TAGS, FORBID_ATTR, ALLOW_DATA_ATTR: false, ADD_ATTR: ['target', 'data-tone'] })
}

export function SafeHtml({ html, cx, inline }: { html: string; cx: ProseContext; inline?: boolean }) {
  const prefix = `h${useId().replace(/[^a-zA-Z0-9]/g, '')}-`
  const clean = useMemo(() => sanitizeHtml(html, cx, prefix), [html, cx, prefix])
  const box = useRef<HTMLElement>(null)
  const sites = useAllowedSites()
  useEffect(() => {
    let live = true
    for (const img of box.current?.querySelectorAll<HTMLImageElement>('img[data-web-src]') ?? []) {
      const src = img.dataset.webSrc!
      if (img.nextElementSibling?.classList.contains('picture-held')) img.nextElementSibling.remove()
      img.hidden = !sites.includes(siteOf(src))
      if (img.hidden) img.after(heldPicture(src, img.alt))
      else loadWebPicture(src).then((url) => { if (live) img.src = url }, () => { if (live) replaceFailedPicture(img) })
    }
    return () => { live = false }
  }, [clean, sites])
  const Tag = inline ? 'span' : 'div'
  const onError = (e: SyntheticEvent) => { if (e.target instanceof HTMLImageElement) replaceFailedPicture(e.target) }
  return <Tag ref={box as never} className={inline ? 'html-inline' : 'html-block'} onErrorCapture={onError} dangerouslySetInnerHTML={{ __html: clean }} />
}
