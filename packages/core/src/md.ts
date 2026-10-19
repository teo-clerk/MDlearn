// CourseAST prose → text for surfaces that cannot typeset (terminal, plain chat).
// Math becomes Unicode where possible (σ⁰, λ⁻⁴); every gap — in text or inside a formula — is shown
// the same way, `[n]____`; answers never appear in the output.
import type { MdNode } from './ast.js'
import { texToUnicode } from './tex.js'

export interface MdOptions {
  /** Label for a blank id, e.g. `[2]____`. Default: `____`. */
  blankLabel?: (id: string) => string
  /** How to emphasise strong text. Markdown keeps `**x**`; terminals pass ANSI bold or identity. */
  bold?: (s: string) => string
  /** `tex` keeps `$…$`; `unicode` converts what it can and keeps TeX only when it cannot. */
  math?: 'tex' | 'unicode'
}

export function toMarkdown(nodes: MdNode[], opts: MdOptions = {}): string {
  return nodes.map((n) => block(n, opts)).filter((s) => s !== '').join('\n\n')
}
/** Phrasing content (option text, hint text) on one line. */
export function inlineText(nodes: MdNode[], opts: MdOptions = {}): string {
  return inline(nodes, opts).replace(/\s*\n\s*/g, ' ').trim()
}

function block(n: MdNode, o: MdOptions): string {
  const kids = (n.children ?? []) as MdNode[]
  switch (n.type) {
    case 'paragraph': return inline(kids, o)
    case 'heading': return `${'#'.repeat(Number(n.depth) || 3)} ${inline(kids, o)}`
    case 'math': {
      const body = mathText(String(n.value), o)
      return o.math === 'unicode' && body.complete ? `    ${body.text}` : `$$\n${body.text}\n$$`
    }
    case 'code': return `\`\`\`${(n.lang as string) ?? ''}\n${String(n.value)}\n\`\`\``
    case 'blockquote': return toMarkdown(kids, o).split('\n').map((l) => `> ${l}`.trimEnd()).join('\n')
    case 'list': return kids.map((li, i) => {
      const body = toMarkdown((li.children ?? []) as MdNode[], o).split('\n')
      const mark = n.ordered ? `${(Number(n.start) || 1) + i}.` : '-'
      return [`${mark} ${body[0]}`, ...body.slice(1).map((l) => `${' '.repeat(mark.length + 1)}${l}`)].join('\n')
    }).join('\n')
    case 'table': return kids.map((row, r) => {
      const cells = ((row.children ?? []) as MdNode[]).map((c) => inline((c.children ?? []) as MdNode[], o))
      const line = `| ${cells.join(' | ')} |`
      return r === 0 ? `${line}\n|${cells.map(() => '---').join('|')}|` : line
    }).join('\n')
    case 'callout': return toMarkdown(kids, o).split('\n').map((l) => `> ${l}`.trimEnd()).join('\n').replace(/^> /, `> ${String(n.kind)}: `)
    default: return inline([n], o)
  }
}
function inline(nodes: MdNode[], o: MdOptions): string {
  const bold = o.bold ?? ((s: string) => `**${s}**`)
  return nodes.map((n) => {
    const kids = (n.children ?? []) as MdNode[]
    switch (n.type) {
      case 'text': return String(n.value)
      case 'strong': return bold(inline(kids, o))
      case 'emphasis': return o.math === 'unicode' ? inline(kids, o) : `*${inline(kids, o)}*`
      case 'delete': return `~~${inline(kids, o)}~~`
      case 'inlineCode': return `\`${String(n.value)}\``
      case 'inlineMath': {
        const m = mathText(String(n.value), o)
        return o.math === 'unicode' && m.complete ? m.text : `$${m.text}$`
      }
      case 'break': return '\n'
      case 'link': return `${inline(kids, o)} (${String(n.url)})`
      case 'image': return `[image: ${String(n.alt ?? '')}]`
      case 'blank': return o.blankLabel ? o.blankLabel(String(n.id)) : '____'
      case 'strayBlank': return '____'
      default: return kids.length ? inline(kids, o) : ''
    }
  }).join('')
}
/** Formula text with gaps as `[n]____` (outside TeX, so both surfaces show the same marker). */
function mathText(value: string, o: MdOptions): { text: string; complete: boolean } {
  const GAP = '\u0000'
  const labels: string[] = []
  const withGaps = value.replace(/\\placeholder\[(\w+)\]\{\}/g, (_, id: string) => { labels.push(o.blankLabel?.(id) ?? '____'); return GAP })
  const conv = o.math === 'unicode' ? texToUnicode(withGaps) : { text: withGaps, complete: false }
  let k = 0
  return { text: conv.text.replace(new RegExp(GAP, 'g'), () => labels[k++]), complete: conv.complete }
}
