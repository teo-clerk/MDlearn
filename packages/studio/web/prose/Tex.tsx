// KaTeX, rendered when the formula comes near the viewport (documents can hold hundreds) and cached by
// source. Only our own `\htmlClass{mdl-…}` is trusted (explained formulas); everything else renders as
// plain math or as a visible error with the source kept.
import { memo, useEffect, useRef, useState } from 'react'
import katex from 'katex'

const cache = new Map<string, { html: string; error?: string }>()
const trusted = (ctx: { command: string; class?: string }) => ctx.command === '\\htmlClass' && /^mdl-[a-z0-9-]{1,32}$/.test(ctx.class ?? '')
export function renderTex(tex: string, display: boolean, gaps?: Record<string, string>): { html: string; error?: string } {
  const key = `${display ? 'D' : 'I'}${gaps ? JSON.stringify(gaps) : ''}${tex}`
  const hit = cache.get(key)
  if (hit) return hit
  let out: { html: string; error?: string }
  try {
    // a gap inside a formula shows as a numbered box: [1] is answered in the field labelled 1
    const withGaps = tex.replace(/\\placeholder\[(\w+)\]\{\}/g, (_, id: string) => (gaps?.[id] ? `\\boxed{\\scriptsize\\text{${gaps[id]}}}` : '\\boxed{\\phantom{xx}}'))
    out = { html: katex.renderToString(withGaps, {
      displayMode: display, throwOnError: true, output: 'htmlAndMathml', strict: (code: string) => (code === 'htmlExtension' ? 'ignore' : 'warn'),
      trust: trusted as never, maxSize: 20, maxExpand: 2000,
    }) }
  } catch (e) {
    out = { html: '', error: (e as Error).message.replace(/^KaTeX parse error: /, '') }
  }
  if (cache.size > 5000) cache.clear()
  cache.set(key, out)
  return out
}

// one IntersectionObserver for every formula on the page
const watchers = new Map<Element, () => void>()
let observer: IntersectionObserver | undefined
const observe = (el: Element, onVisible: () => void) => {
  if (typeof IntersectionObserver === 'undefined') { onVisible(); return () => {} }
  observer ??= new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { watchers.get(e.target)?.(); watchers.delete(e.target); observer!.unobserve(e.target) }
  }, { rootMargin: '1200px 0px' })
  watchers.set(el, onVisible); observer.observe(el)
  return () => { watchers.delete(el); observer?.unobserve(el) }
}

export const Tex = memo(function Tex({ tex, display = false, eager = false, gaps }: { tex: string; display?: boolean; eager?: boolean; gaps?: Record<string, string> }) {
  const ref = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(eager || !!gaps || cache.has(`${display ? 'D' : 'I'}${tex}`))
  useEffect(() => (visible || !ref.current ? undefined : observe(ref.current, () => setVisible(true))), [visible])
  const Tag = display ? 'div' : 'span'
  if (!visible) return <Tag ref={ref as never} className={display ? 'tex tex-display tex-pending' : 'tex tex-pending'} aria-label={tex}>{display ? ' ' : tex}</Tag>
  const r = renderTex(tex, display, gaps)
  if (r.error) return <Tag className={display ? 'tex tex-display tex-error' : 'tex tex-error'} title={r.error}><code>{tex}</code></Tag>
  return <Tag className={display ? 'tex tex-display' : 'tex'} dangerouslySetInnerHTML={{ __html: r.html }} />
})
