// Any Markdown document → DocModel: headings with outline anchors (§3.1), folded <details>, prose,
// callouts and — where the author wrote them — interactive widgets. Faithful to ordinary Markdown
// (document-mode stage 0); never fails as a whole: problems become diagnostics or per-block placeholders.
import YAML from 'yaml'
import GithubSlugger from 'github-slugger'
import { toString } from 'mdast-util-to-string'
import type { Root, RootContent, PhrasingContent, Html } from 'mdast'
import { stage0 } from './stage0.js'
import { processor } from './parser.js'
import { blockBuilder, type SourceResolver } from './blocks.js'
import { outlineDoc, type DocOutline } from './importer.js'
import type { Code, Diagnostic } from './registry.js'
import type { DocBlock, MdNode } from './ast.js'

export interface DocModel {
  path: string
  title: string
  /** Parsed YAML frontmatter (house-style documents often have none). */
  frontmatter: Record<string, unknown> | null
  outline: DocOutline
  blocks: DocBlock[]
  diagnostics: Diagnostic[]
}
export interface ParseDocumentOptions { path?: string; resolveSource?: SourceResolver; checkJs?: (code: string) => string | null }

export function parseDocument(source: string, opts: ParseDocumentOptions = {}): DocModel {
  const path = opts.path ?? 'document.md'
  const s0 = stage0(source, { mode: 'document' })
  const diagnostics: Diagnostic[] = [...s0.diagnostics]
  type Pos = { position?: { start: { line: number; column: number } } } | undefined
  const lineOf = (n: Pos) => (n?.position ? s0.lineMap[n.position.start.line - 1] ?? n.position.start.line : 1)
  const diag = (code: Code, node: Pos | number, message?: string) => { diagnostics.push({ code, line: typeof node === 'number' ? node : lineOf(node), message }) }

  let frontmatter: Record<string, unknown> | null = null
  if (s0.frontmatter) {
    try {
      const raw = YAML.parse(s0.frontmatter.raw)
      frontmatter = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null
    } catch (e) { diag('E101', s0.frontmatter.line, (e as Error).message.split('\n')[0]) }
  }
  const macros = Object.fromEntries(Object.entries((frontmatter?.macros as Record<string, unknown>) ?? {}).filter(([, v]) => typeof v === 'string')) as Record<string, string>
  const lang = typeof frontmatter?.lang === 'string' ? frontmatter.lang : 'en'
  const outline = outlineDoc(source, path)
  const byLine = new Map(outline.sections.map((s) => [s.startLine, s]))
  const { clean, toBlocks } = blockBuilder({ s0, macros, lang, diag, resolveSource: opts.resolveSource, document: true, ...(opts.checkJs ? { checkJs: opts.checkJs } : {}),
    ...(typeof frontmatter?.source === 'string' ? { source: frontmatter.source } : {}) })
  const slugger = new GithubSlugger()

  const tree = processor.parse(s0.text) as Root
  let section = 'intro'
  const build = (nodes: RootContent[]): DocBlock[] => {
    const out: DocBlock[] = []
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      const line = lineOf(n)
      if (n.type === 'heading') {
        const s = byLine.get(line)
        const anchor = s?.anchor ?? slugger.slug(toString(n))
        section = anchor
        out.push({ type: 'heading', depth: n.depth, anchor, num: s?.num ?? null, text: n.children.flatMap((c) => clean(c, null)), line })
        continue
      }
      if (n.type === 'html' && /^\s*<details[\s>]/i.test(n.value)) {
        const folded = details(nodes, i)
        out.push({ ...folded.block, line })
        i = folded.end
        continue
      }
      if (n.type === 'yaml' || n.type === 'definition') continue
      for (const b of toBlocks([n], section)) out.push({ ...b, line })
    }
    return out
  }
  /** `<details>` … `</details>`, possibly split over several html nodes with Markdown in between. */
  function details(nodes: RootContent[], at: number): { block: Omit<Extract<DocBlock, { type: 'details' }>, 'line'>; end: number } {
    const open = (nodes[at] as Html).value
    const summaryHtml = /<summary>([\s\S]*?)<\/summary>/i.exec(open)?.[1] ?? 'Details'
    const inner: RootContent[] = []
    // content written inside the same html node (no blank lines) is parsed as Markdown
    const sameNode = open.replace(/^\s*<details[^>]*>/i, '').replace(/<summary>[\s\S]*?<\/summary>/i, '')
    const closesHere = /<\/details>\s*$/i.test(sameNode)
    const rest = sameNode.replace(/<\/details>\s*$/i, '').trim()
    if (rest) inner.push(...(processor.parse(rest) as Root).children)
    let end = at
    if (!closesHere) {
      let depth = 1
      for (end = at + 1; end < nodes.length; end++) {
        const x = nodes[end]
        if (x.type === 'html' && /^\s*<details[\s>]/i.test(x.value)) depth++
        if (x.type === 'html' && /<\/details>\s*$/i.test(x.value)) { depth--; if (depth === 0) break }
        inner.push(x)
      }
    }
    return { block: { type: 'details', summary: phrasing(summaryHtml), children: build(inner) }, end: Math.min(end, nodes.length - 1) }
  }
  /** Summary HTML → phrasing: tags such as <strong> become Markdown first, then parsed. */
  function phrasing(html: string): MdNode[] {
    const md = html.replace(/<\/?(strong|b)>/gi, '**').replace(/<\/?(em|i)>/gi, '*').replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`').replace(/<[^>]+>/g, '').trim()
    const para = (processor.parse(md) as Root).children[0]
    return para && 'children' in para ? (para.children as PhrasingContent[]).flatMap((c) => clean(c, null)) : []
  }

  const blocks = build(tree.children)
  const h1 = blocks.find((b): b is Extract<DocBlock, { type: 'heading' }> => b.type === 'heading' && b.depth === 1)
  const title = (typeof frontmatter?.title === 'string' && frontmatter.title) || (h1 ? toString({ type: 'paragraph', children: h1.text as PhrasingContent[] }) : '') || outline.title
  diagnostics.sort((a, b) => a.line - b.line)
  return { path, title, frontmatter, outline, blocks, diagnostics }
}
