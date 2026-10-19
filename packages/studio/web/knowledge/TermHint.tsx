// A defined term in running text: dotted underline, and its definition on hover or focus.
import type { ReactNode } from 'react'
import type { MdNode } from '@mdlearn/core'
import { prettyTitle } from '../lib/title'
import { MiniMarkdown } from '../prose/MiniMarkdown'
import { Hoverable } from './HoverCard'
import type { TermPlan } from './terms'

export function decorate(plan: TermPlan | null): ((n: MdNode) => ReactNode | null) | undefined {
  if (!plan) return undefined
  return (n) => {
    const spans = plan.get(n)
    if (!spans?.length) return null
    const text = String(n.value), out: ReactNode[] = []
    let at = 0
    spans.forEach((s, i) => {
      if (s.start > at) out.push(text.slice(at, s.start))
      const src = s.term.sources[0]
      out.push(
        <Hoverable key={i} className="term" tabIndex={0} card={() => (
          <>
            <p className="font-semibold">{s.term.term}</p>
            <div className="mt-1 text-text/90"><MiniMarkdown text={s.term.definition} /></div>
            {src && <p className="mt-2 text-[12px] text-muted">{prettyTitle(src.docTitle)}{src.section?.num ? <span className="tabular"> §{src.section.num}</span> : null}</p>}
          </>
        )}>{text.slice(s.start, s.end)}</Hoverable>,
      )
      at = s.end
    })
    if (at < text.length) out.push(text.slice(at))
    return <>{out}</>
  }
}
