// Renders compiler output (MdNode trees) as React. The compiler already paired the safe HTML tags and dropped
// unsafe URLs; this renderer adds nothing executable either: allowlisted HTML elements are React elements, and
// the only innerHTML is KaTeX's own output and SafeHtml's DOMPurify-cleaned blocks.
import { Fragment, lazy, Suspense, type CSSProperties, type ReactNode } from 'react'
import type { MdNode } from '@mdlearn/core'
import { CONTAINER_TAGS, INLINE_TAGS, cleanStyle, isMarkTone } from '@mdlearn/core/html'
import { toneName } from './MarkLegend'
import { Tex } from './Tex'
import { SafeHtml } from './SafeHtml'
import { Picture } from './Picture'
import { Info, Lightbulb, Star, TriangleAlert, type LucideIcon } from 'lucide-react'
import { t } from '../i18n'

const CALLOUT_ICONS: Record<string, LucideIcon> = { note: Info, tip: Lightbulb, important: Star, warning: TriangleAlert }

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
/** `color: red; font-weight: 600` → React style (filtered again: the AST may come from anywhere). */
function styleOf(css: unknown): CSSProperties | undefined {
  if (typeof css !== 'string' || !css) return undefined
  const out: Record<string, string> = {}
  for (const d of cleanStyle(css).split(';')) {
    const i = d.indexOf(':')
    if (i > 0) out[d.slice(0, i).trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = d.slice(i + 1).trim()
  }
  return Object.keys(out).length ? out : undefined
}
const attrsOf = (n: MdNode) => (n.attrs ?? {}) as Record<string, string>
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
      return url ? <Picture key={url} src={cx.imageSrc ? cx.imageSrc(url) : url} alt={String(n.alt ?? '')} /> : null
    }
    case 'blank': return cx.blank ? cx.blank(String(n.id)) : <span className="gap" aria-label={t('gap')} />
    case 'strayBlank': return <span className="gap" aria-label={t('gap')} />
    case 'callout': {
      const kind = String(n.kind), Icon = CALLOUT_ICONS[kind] ?? Info
      const summary = n.summary as MdNode[] | undefined
      const body = <Prose nodes={(n.children ?? []) as MdNode[]} cx={cx} />
      return n.fold
        ? <details className={`callout callout-${kind}`}><summary><Icon className="callout-icon" strokeWidth={1.8} aria-hidden />{summary ? <Inline nodes={summary} cx={cx} /> : kind}</summary>{body}</details>
        : <aside className={`callout callout-${kind}`} aria-label={kind}><Icon className="callout-icon" strokeWidth={1.8} aria-hidden />{summary && <p className="callout-title"><Inline nodes={summary} cx={cx} /></p>}{body}</aside>
    }
    case 'htmlInline': {
      const tag = String(n.tag), a = attrsOf(n)
      const Tag = (INLINE_TAGS.has(tag) && tag !== 'a' && tag !== 'font' ? tag : 'span') as 'span'
      const tone = isMarkTone(a['data-tone']) ? a['data-tone'] : undefined
      return <Tag style={styleOf(a.style)} title={a.title ?? (tone && toneName(tone))} data-tone={tone} {...(tag === 'time' && a.datetime ? { dateTime: a.datetime } : {})}>{kids(n, cx)}</Tag>
    }
    case 'htmlBlock': {
      const tag = String(n.tag), a = attrsOf(n)
      const body = <Prose nodes={(n.children ?? []) as MdNode[]} cx={cx} />
      if (tag === 'details') {
        const summary = n.summary as MdNode[] | undefined
        return <details className="html-details" open={'open' in a} style={styleOf(a.style)}><summary>{summary ? <Inline nodes={summary} cx={cx} /> : t('Details')}</summary>{body}</details>
      }
      const Tag = (CONTAINER_TAGS.has(tag) ? tag : 'div') as 'div'
      return <Tag className="html-block" style={styleOf(a.style)} title={a.title}>{body}</Tag>
    }
    case 'htmlRaw': return <SafeHtml html={String(n.value)} cx={cx} />
    default: return n.children ? <>{kids(n, cx)}</> : null
  }
}
