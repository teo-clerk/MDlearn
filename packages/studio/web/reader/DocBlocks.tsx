// A document's blocks: headings with § numbers and anchors, folded details, prose, callouts, and
// authored questions you can try in place.
import { memo } from 'react'
import { ChevronRight, Link2, TriangleAlert } from 'lucide-react'
import type { Checked, DocBlock, MdNode, PosedWidget, WebAnswer } from '@mdlearn/core'
import { Prose, Inline, type ProseContext } from '../prose/Prose'
import { Practice } from '../widgets/Practice'
import { VisualBlock, VISUAL_TYPES } from '../visuals/VisualBlock'
import { t } from '../i18n'

/** "3.1 Derivation" → number "3.1" shown quietly, text "Derivation" (the number is not repeated). */
function splitNumber(num: string | null, text: MdNode[]): { num: string | null; text: MdNode[] } {
  if (!num) return { num, text }
  const first = text[0]
  if (first?.type !== 'text') return { num, text }
  const value = String(first.value)
  const m = new RegExp(`^(?:§\\s*)?${num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[.:)]?\\s+`).exec(value)
  return m ? { num, text: [{ ...first, value: value.slice(m[0].length) }, ...text.slice(1)] } : { num, text }
}
const WIDGETS = new Set(['quiz', 'cloze', 'order', 'explain', 'steps', 'code', 'match', 'sort', 'speed'])
export interface BlockEnv { cx: ProseContext; check: (widgetId: string, a: WebAnswer) => Promise<Checked>; hideTitle?: string }

export const DocBlocks = memo(function DocBlocks({ blocks, env }: { blocks: DocBlock[]; env: BlockEnv }) {
  return <>{blocks.map((b, i) => <Block key={`${b.line}-${i}`} b={b} env={env} />)}</>
})

function Block({ b, env }: { b: DocBlock; env: BlockEnv }) {
  if (b.type === 'heading') {
    const H = `h${Math.min(6, b.depth)}` as 'h2'
    const { num, text } = splitNumber(b.num, b.text)
    return (
      <H id={b.anchor} data-line={b.line} data-num={b.num ?? undefined} className="group relative">
        {num && <span className="mr-2.5 tabular font-normal text-subtle">{num}</span>}
        <Inline nodes={text} cx={env.cx} />
        <a href={`#${b.anchor}`} aria-label={t('Link to this section')} className="ml-1.5 inline-flex align-middle text-subtle opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100">
          <Link2 className="size-4" aria-hidden />
        </a>
      </H>
    )
  }
  if (b.type === 'details') {
    return (
      <details className="doc-details group/d" data-line={b.line}>
        <summary><ChevronRight className="size-4 text-muted transition-transform group-open/d:rotate-90" aria-hidden /><Inline nodes={b.summary} cx={env.cx} /></summary>
        <div className="read text-[17px]"><DocBlocks blocks={b.children} env={env} /></div>
      </details>
    )
  }
  if (b.type === 'prose') return <Prose nodes={[b.node]} cx={env.cx} />
  if (b.type === 'callout') return <Prose nodes={[b as never]} cx={env.cx} />
  if (b.type === 'read') return null
  if (b.type === 'unavailable') {
    return (
      <div className="my-4 rounded-[8px] border border-dashed border-border-strong px-4 py-3 font-ui text-[13px]" data-line={b.line}>
        <p className="flex items-center gap-1.5 text-muted"><TriangleAlert className="size-4 text-warn" aria-hidden />
          {b.codes.includes('E103') ? <>{t('Unknown block')} <code className="font-mono">:::{b.kind}</code>{t('; its content is shown as text.')}</> : <>{t('This {kind} could not be shown ({codes}). Lint the file for details.', { kind: b.kind, codes: b.codes.join(', ') })}</>}
        </p>
        {b.fallback && <div className="read mt-2 text-[16.5px]"><Prose nodes={b.fallback} cx={env.cx} /></div>}
      </div>
    )
  }
  if (VISUAL_TYPES.has(b.type)) return <VisualBlock b={b as never} cx={env.cx} />
  if (WIDGETS.has(b.type)) {
    const w = b as unknown as PosedWidget
    return <Practice widget={w} check={(a) => env.check(w.id, a)} />
  }
  return null
}
