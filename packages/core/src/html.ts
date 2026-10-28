// HTML inside Markdown (DSL v1.3, §4 and §8.12): a safe subset is rendered, everything executable is removed.
// mdast keeps raw HTML as `html` nodes, one per tag inside a paragraph and one per block in the flow. Here
// inline tags are paired with their closing tag (the Markdown between them stays Markdown) and container
// blocks (`<div>` … Markdown … `</div>`) are paired across the flow. What is left of a block is passed on
// as `htmlRaw`, which the player sanitises (DOMPurify) before showing it.
import type { Nodes, RootContent } from 'mdast'

/** Inline elements rendered as themselves (attributes filtered by `cleanAttrs`). */
export const INLINE_TAGS = new Set(['mark', 'kbd', 'sub', 'sup', 'u', 'ins', 'small', 'abbr', 'span', 'b', 'i', 's', 'q', 'cite',
  'dfn', 'var', 'samp', 'time', 'strong', 'em', 'del', 'code', 'a', 'font'])
/** Block elements that may wrap Markdown across blank lines. */
export const CONTAINER_TAGS = new Set(['div', 'section', 'article', 'aside', 'figure', 'figcaption', 'center', 'details'])
const VOID = new Set(['br', 'wbr', 'img', 'hr'])
const STYLE_PROPS = new Set(['color', 'background', 'background-color', 'font-weight', 'font-style', 'font-size', 'font-variant',
  'text-decoration', 'text-align', 'border', 'border-color', 'border-radius', 'padding', 'opacity', 'letter-spacing', 'white-space'])

export interface Tag { name: string; close: boolean; attrs: Record<string, string> }
/** One HTML tag (`<span class="x">`, `</span>`, `<br/>`), or null if the string is not exactly one tag. */
export function parseTag(value: string): Tag | null {
  const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>$/.exec(value.trim())
  if (!m) return null
  const attrs: Record<string, string> = {}
  for (const a of m[3].matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? ''
  return { name: m[2].toLowerCase(), close: m[1] === '/', attrs }
}
/** `style="color: red; position: fixed"` → `color: red` (layout, positioning and anything with `url(` are dropped). */
export function cleanStyle(css: string): string {
  return css.split(';').map((d) => d.trim()).filter(Boolean).flatMap((d) => {
    const i = d.indexOf(':')
    if (i < 0) return []
    const prop = d.slice(0, i).trim().toLowerCase(), value = d.slice(i + 1).trim()
    return STYLE_PROPS.has(prop) && /^[#\w\s.,%()+-]*$/.test(value) && !/url\s*\(|expression|var\s*\(/i.test(value) ? [`${prop}: ${value}`] : []
  }).join('; ')
}
/** Attributes kept on rendered elements: title, a filtered style, `open` on details, legacy align/color. */
export function cleanAttrs(tag: Tag): Record<string, string> {
  const out: Record<string, string> = {}
  const a = tag.attrs
  if (a.title) out.title = a.title
  if (a.datetime && tag.name === 'time') out.datetime = a.datetime
  if ('open' in a && tag.name === 'details') out.open = ''
  const style = [a.style ? cleanStyle(a.style) : '', a.align && /^(left|right|center|justify)$/i.test(a.align) ? `text-align: ${a.align.toLowerCase()}` : '',
    tag.name === 'font' && a.color ? cleanStyle(`color: ${a.color}`) : '', tag.name === 'center' ? 'text-align: center' : ''].filter(Boolean).join('; ')
  if (style) out.style = style
  return out
}
/** Why this HTML must not be rendered (E107), or null. The player's sanitiser removes it either way. */
export function unsafeHtml(value: string): string | null {
  const tag = /<\s*(script|style|iframe|frame|frameset|object|embed|applet|form|input|button|textarea|select|link|meta|base)\b/i.exec(value)
  if (tag) return `<${tag[1].toLowerCase()}> is removed${/script|style/i.test(tag[1]) ? ' (put scripts and styles in an :::html block)' : ''}`
  const handler = /\s(on[a-z]+)\s*=/i.exec(value)
  if (handler) return `${handler[1]}= handler is removed`
  if (/(?:href|src|action|xlink:href)\s*=\s*["']?\s*(?:javascript|vbscript|data:text\/html)/i.test(value)) return 'script URL is removed'
  return null
}
const isComment = (n: Nodes) => n.type === 'html' && /^\s*<!--[\s\S]*-->\s*$/.test(n.value)

/** A paired inline element: its children are still mdast phrasing. */
export interface HtmlPairNode { type: 'htmlPair'; tag: Tag; children: Nodes[] }
/** Pair `<mark>` … `</mark>` siblings of a phrasing parent; unpaired tags stay as they are. */
export function pairInline(kids: Nodes[]): Nodes[] {
  const out: Nodes[] = []
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i]
    const tag = k.type === 'html' ? parseTag(k.value) : null
    if (!tag || tag.close || VOID.has(tag.name) || !INLINE_TAGS.has(tag.name) || /\/>\s*$/.test((k as { value: string }).value)) { out.push(k); continue }
    let depth = 1, j = i + 1
    for (; j < kids.length; j++) {
      const t = kids[j].type === 'html' ? parseTag((kids[j] as { value: string }).value) : null
      if (t?.name !== tag.name) continue
      if (!t.close) depth++
      else if (--depth === 0) break
    }
    if (j >= kids.length) { out.push(k); continue } // no closing tag: the tag stays literal text
    out.push({ type: 'htmlPair', tag, children: pairInline(kids.slice(i + 1, j)) } as unknown as Nodes)
    i = j
  }
  return out
}

/** A container block: the Markdown between `<div …>` and `</div>`, plus HTML left in the opening/closing nodes. */
export interface HtmlContainerNode { type: 'htmlContainer'; tag: Tag; summary?: string; children: RootContent[] }
/** The first tag of a block html node, if it opens one of `tags`. */
function opener(n: RootContent, tags: Set<string>): Tag | null {
  if (n.type !== 'html') return null
  const m = /^\s*(<[a-zA-Z][^>]*>)/.exec(n.value)
  const tag = m ? parseTag(m[1]) : null
  return tag && !tag.close && tags.has(tag.name) ? tag : null
}
const closes = (value: string, name: string) => new RegExp(`</${name}\\s*>\\s*$`, 'i').test(value)
const opens = (value: string, name: string) => (value.match(new RegExp(`<${name}[\\s>]`, 'gi')) ?? []).length
const closings = (value: string, name: string) => (value.match(new RegExp(`</${name}\\s*>`, 'gi')) ?? []).length
/**
 * Group flow-level containers. `<div>` (alone, or with HTML after it) … Markdown … `</div>` becomes one
 * `htmlContainer`; a container written entirely inside one html node stays that node (it is raw HTML).
 * Comments are dropped here (author annotations).
 */
export function groupFlowHtml(nodes: RootContent[], tags: Set<string> = CONTAINER_TAGS): RootContent[] {
  const out: RootContent[] = []
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    if (isComment(n as Nodes)) continue
    const tag = opener(n, tags)
    const value = n.type === 'html' ? n.value : ''
    if (!tag || opens(value, tag.name) <= closings(value, tag.name)) { out.push(n); continue }
    let depth = opens(value, tag.name) - closings(value, tag.name), j = i + 1
    for (; j < nodes.length && depth > 0; j++) {
      const x = nodes[j]
      if (x.type === 'html') depth += opens(x.value, tag.name) - closings(x.value, tag.name)
      if (depth <= 0) break
    }
    if (j >= nodes.length) { out.push(n); continue } // never closed: leave it raw
    const head = value.trim().replace(/^<[^>]*>/, '')
    const summary = tag.name === 'details' ? /<summary[^>]*>([\s\S]*?)<\/summary>/i.exec(head)?.[1] : undefined
    const headRest = head.replace(/<summary[^>]*>[\s\S]*?<\/summary>/i, '').trim()
    const close = nodes[j] as Extract<RootContent, { type: 'html' }>
    const tailRest = close.value.trim().replace(new RegExp(`</${tag.name}\\s*>$`, 'i'), '').trim()
    const raw = (v: string): RootContent[] => (v ? [{ type: 'html', value: v }] : [])
    const inner = groupFlowHtml([...raw(headRest), ...nodes.slice(i + 1, j), ...raw(tailRest)], tags)
    out.push({ type: 'htmlContainer', tag, ...(summary !== undefined ? { summary } : {}), children: inner } as unknown as RootContent)
    i = j
  }
  return out
}
/** Summary HTML → Markdown text (`<b>` → `**`, other tags dropped), parsed by the caller. */
export function summaryMarkdown(html: string): string {
  return html.replace(/<\/?(strong|b)>/gi, '**').replace(/<\/?(em|i)>/gi, '*').replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`').replace(/<[^>]+>/g, '').trim()
}
/** Plain text of an HTML fragment (terminal and chat surfaces). */
export function htmlText(html: string): string {
  return html.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d|figure|figcaption)>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[\u0000-\u0008\u000b-\u001f]/g, '').replace(/\n{3,}/g, '\n\n').trim()
}
