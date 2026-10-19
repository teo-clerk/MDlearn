// CourseAST prose → the small HTML Anki cards use. Math stays TeX in Anki's own delimiters (\( … \) and
// \[ … \]); gaps become what the caller asks for (nothing, a cloze, or the answer).
import type { MdNode } from '@mdlearn/core'

export interface HtmlOptions {
  /** What a gap (`blank` node, `\placeholder[id]{}` in math) turns into; `tex` is true inside a formula. */
  blank?: (id: string, tex: boolean) => string
}
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function toHtml(nodes: MdNode[], o: HtmlOptions = {}): string { return nodes.map((n) => block(n, o)).join('') }
export function inlineHtml(nodes: MdNode[], o: HtmlOptions = {}): string { return nodes.map((n) => inline(n, o)).join('') }

const kids = (n: MdNode) => (n.children ?? []) as MdNode[]
function texOf(value: string, o: HtmlOptions): string {
  return value.replace(/\\placeholder\[(\w+)\]\{\}/g, (_, id: string) => o.blank?.(id, true) ?? '\\boxed{\\phantom{xx}}')
}
function block(n: MdNode, o: HtmlOptions): string {
  switch (n.type) {
    case 'paragraph': return `<p>${inlineHtml(kids(n), o)}</p>`
    case 'heading': return `<p><b>${inlineHtml(kids(n), o)}</b></p>`
    case 'math': return `<div>\\[${esc(texOf(String(n.value), o))}\\]</div>`
    case 'code': return `<pre><code>${esc(String(n.value))}</code></pre>`
    case 'blockquote': return `<blockquote>${toHtml(kids(n), o)}</blockquote>`
    case 'list': { const tag = n.ordered ? 'ol' : 'ul'; return `<${tag}>${kids(n).map((li) => `<li>${liHtml(li, o)}</li>`).join('')}</${tag}>` }
    case 'table': {
      const [head, ...rows] = kids(n)
      const cells = (r: MdNode, t: 'th' | 'td') => kids(r).map((c) => `<${t}>${inlineHtml(kids(c), o)}</${t}>`).join('')
      return `<table border="1" cellpadding="4">${head ? `<tr>${cells(head, 'th')}</tr>` : ''}${rows.map((r) => `<tr>${cells(r, 'td')}</tr>`).join('')}</table>`
    }
    case 'thematicBreak': return '<hr>'
    case 'callout': return `<blockquote>${toHtml(kids(n), o)}</blockquote>`
    default: return inline(n, o)
  }
}
/** A list item: a single paragraph is shown inline. */
const liHtml = (li: MdNode, o: HtmlOptions) => { const c = kids(li); return c.length === 1 && c[0].type === 'paragraph' ? inlineHtml(kids(c[0]), o) : toHtml(c, o) }
function inline(n: MdNode, o: HtmlOptions): string {
  switch (n.type) {
    case 'text': return esc(String(n.value))
    case 'emphasis': return `<i>${inlineHtml(kids(n), o)}</i>`
    case 'strong': return `<b>${inlineHtml(kids(n), o)}</b>`
    case 'delete': return `<s>${inlineHtml(kids(n), o)}</s>`
    case 'inlineCode': return `<code>${esc(String(n.value))}</code>`
    case 'inlineMath': return `\\(${esc(texOf(String(n.value), o))}\\)`
    case 'break': return '<br>'
    case 'link': return inlineHtml(kids(n), o) // a card is read alone: the link text is enough
    case 'image': return n.alt ? `[${esc(String(n.alt))}]` : ''
    case 'blank': return o.blank?.(String(n.id), false) ?? '____'
    case 'strayBlank': return '____'
    case 'paragraph': return inlineHtml(kids(n), o)
    default: return n.children ? inlineHtml(kids(n), o) : ''
  }
}
