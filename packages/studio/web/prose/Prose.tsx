// Renders compiler output (MdNode trees) as React. The compiler already dropped raw HTML and unsafe URLs;
// this renderer adds nothing executable either: no dangerouslySetInnerHTML except KaTeX's own output.
import { Fragment, lazy, Suspense, type ReactNode } from 'react'
import type { MdNode } from '@mdlearn/core'
import { Tex } from './Tex'

const CodeBlock = lazy(() => import('./CodeBlock'))
const Mermaid = lazy(() => import('./Mermaid'))
const PythonBlock = lazy(() => import('../python/PythonBlock').then((m) => ({ default: m.PythonBlock })))

export interface ProseContext {
  /** Map a relative link to an in-app route (documents) or return null to open it as a normal link. */
  linkTo?: (url: string) => string | null
  /** Map a relative image URL to a served asset URL. */
  imageSrc?: (url: string) => string
  /** A gap in text: an input in a question, an empty line in reading. */
  blank?: (id: string) => ReactNode
  /** Gaps inside a formula: their number labels, and the inputs shown right after the formula. */
  gapLabels?: Record<string, string>
  mathGaps?: (ids: string[]) => ReactNode
  /** Python blocks get Run / Edit buttons (documents and lessons, not notes). */
  runPython?: boolean
  /** Defined terms in running text: returns the decorated text for a text node, or null. */
  decorateText?: (node: MdNode) => ReactNode | null
  /** A link to another document, wrapped (for the hover card). */
  wrapLink?: (url: string, anchor: ReactNode) => ReactNode
}
const kids = (n: MdNode, cx: ProseContext) => (n.children ?? []).map((c, i) => <Node key={i} node={c} cx={cx} />)

export function Prose({ nodes, cx = {} }: { nodes: MdNode[]; cx?: ProseContext }) {
  return <>{nodes.map((n, i) => <Node key={i} node={n} cx={cx} />)}</>
}
export function Inline({ nodes, cx = {} }: { nodes: MdNode[]; cx?: ProseContext }) {
  // option text and hints: a single paragraph renders without its <p>
  const flat = nodes.length === 1 && nodes[0].type === 'paragraph' ? (nodes[0].children ?? []) : nodes
  return <>{flat.map((n, i) => <Node key={i} node={n} cx={cx} />)}</>
}

function Node({ node: n, cx }: { node: MdNode; cx: ProseContext }): ReactNode {
  switch (n.type) {
    case 'paragraph': return <p>{kids(n, cx)}</p>
    case 'heading': { const H = `h${Math.min(6, Math.max(2, Number(n.depth) || 3))}` as 'h3'; return <H>{kids(n, cx)}</H> }
    case 'text': return cx.decorateText?.(n) ?? String(n.value)
    case 'emphasis': return <em>{kids(n, cx)}</em>
    case 'strong': return <strong>{kids(n, cx)}</strong>
    case 'delete': return <del>{kids(n, cx)}</del>
    case 'inlineCode': return <code>{String(n.value)}</code>
    case 'break': return <br />
    case 'thematicBreak': return <hr />
    case 'blockquote': return <blockquote>{kids(n, cx)}</blockquote>
    case 'list': {
      const items = kids(n, cx)
      return n.ordered ? <ol start={Number(n.start) || undefined}>{items}</ol> : <ul>{items}</ul>
    }
    case 'listItem': {
      const children = n.children ?? []
      // tight lists: paragraphs render inline
      const content = n.spread ? kids(n, cx) : children.map((c, i) => (c.type === 'paragraph' ? <Fragment key={i}>{kids(c, cx)}</Fragment> : <Node key={i} node={c} cx={cx} />))
      return <li>{content}</li>
    }
    case 'table': {
      const [head, ...rows] = n.children ?? []
      const align = (n.align as (string | null)[] | undefined) ?? []
      const cells = (row: MdNode, Tag: 'th' | 'td') => (row.children ?? []).map((c, i) => <Tag key={i} style={align[i] ? { textAlign: align[i] as 'left' } : undefined}>{kids(c, cx)}</Tag>)
      return <div className="table-wrap" tabIndex={0}><table><thead><tr>{head && cells(head, 'th')}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{cells(r, 'td')}</tr>)}</tbody></table></div>
    }
    case 'math': {
      const ids = (n.blanks as string[] | undefined) ?? []
      return <>{<Tex tex={String(n.value)} display gaps={ids.length ? cx.gapLabels : undefined} />}{ids.length > 0 && cx.mathGaps?.(ids)}</>
    }
    case 'inlineMath': {
      const ids = (n.blanks as string[] | undefined) ?? []
      return <>{<Tex tex={String(n.value)} gaps={ids.length ? cx.gapLabels : undefined} />}{ids.length > 0 && cx.mathGaps?.(ids)}</>
    }
    case 'code': {
      const lang = (n.lang as string | undefined)?.toLowerCase() ?? ''
      const value = String(n.value)
      const fallback = <pre className="code"><code>{value}</code></pre>
      if (cx.runPython && (lang === 'python' || lang === 'py' || lang === 'python3')) return <Suspense fallback={fallback}><PythonBlock code={value} /></Suspense>
      if (lang === 'mermaid') return <Suspense fallback={fallback}><Mermaid source={value} /></Suspense>
      return <Suspense fallback={fallback}><CodeBlock code={value} lang={lang} /></Suspense>
    }
    case 'link': {
      const url = String(n.url ?? '')
      const internal = cx.linkTo?.(url)
      if (!url) return <span>{kids(n, cx)}</span>
      if (!internal) return <a href={url} target="_blank" rel="noopener noreferrer">{kids(n, cx)}</a>
      const a = <a href={internal}>{kids(n, cx)}</a>
      return cx.wrapLink ? cx.wrapLink(url, a) : a
    }
    case 'image': {
      const url = String(n.url ?? '')
      return url ? <img src={cx.imageSrc ? cx.imageSrc(url) : url} alt={String(n.alt ?? '')} loading="lazy" /> : null
    }
    case 'blank': return cx.blank ? cx.blank(String(n.id)) : <span className="gap" aria-label="gap" />
    case 'strayBlank': return <span className="gap" aria-label="gap" />
    case 'callout': {
      const kind = String(n.kind)
      const summary = n.summary as MdNode[] | undefined
      const body = <Prose nodes={(n.children ?? []) as MdNode[]} cx={cx} />
      return n.fold
        ? <details className={`callout callout-${kind}`}><summary>{summary ? <Inline nodes={summary} cx={cx} /> : kind}</summary>{body}</details>
        : <aside className={`callout callout-${kind}`} aria-label={kind}>{summary && <p className="callout-title"><Inline nodes={summary} cx={cx} /></p>}{body}</aside>
    }
    default: return n.children ? <>{kids(n, cx)}</> : null
  }
}
