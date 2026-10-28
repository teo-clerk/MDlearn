// A lesson as one page: its cards in order, each question tryable in place. Used by the lesson page and by
// the editor's preview.
import { Link } from 'wouter'
import { FileText } from 'lucide-react'
import type { DocBlock } from '@mdlearn/core'
import type { LessonResponse } from '../../shared/types'
import { DocBlocks, type BlockEnv } from '../reader/DocBlocks'
import { Inline } from '../prose/Prose'
import { docRoute } from '../lib/paths'
import { levelName, prettyTitle } from '../lib/title'
import { t, tp } from '../i18n'

type L = NonNullable<LessonResponse['lesson']>
export function LessonArticle({ ws, lesson: l, source, env, compact }: { ws: string; lesson: L; source?: { path: string; title: string }; env: BlockEnv; compact?: boolean }) {
  return (
    <article className={`mx-auto max-w-[760px] ${compact ? 'px-5 pb-16 pt-2' : 'px-6 pb-[30vh] pt-4 sm:px-12'}`}>
    <header className="mb-8">
      <h1 className="font-ui text-[30px] font-bold leading-[1.2] tracking-[-0.02em] text-balance">{prettyTitle(l.title)}</h1>
      <p className="mt-2 flex flex-wrap gap-x-3 tabular text-[13px] text-muted">
        <span>{tp(l.cards.length, '{n} card', '{n} cards')}</span><span>{t('about {n} min', { n: l.time ?? l.timeEstimate })}</span>{l.level && <span>{levelName(l.level)}</span>}
        {source && <Link href={docRoute(ws, source.path)} className="inline-flex items-center gap-1 underline decoration-border-strong underline-offset-2 hover:text-text"><FileText className="size-3.5" aria-hidden />{source.title || source.path}</Link>}
      </p>
      {l.goals.length > 0 && <ul className="mt-4 list-disc pl-5 text-[14px] text-text/85">{l.goals.map((g, i) => <li key={i}>{g}</li>)}</ul>}
    </header>
    <div className="read">
      {env && <DocBlocks blocks={l.intro.map((b) => ({ ...b, line: 0 })) as DocBlock[]} env={env} />}
      {l.cards.map((c) => {
        const reads = c.blocks.flatMap((b) => (b.type === 'read' ? b.refs : []))
        return (
          <section key={c.id} id={c.id} className="mt-10 border-t border-border pt-6">
            <h2 className="!mt-0"><Inline nodes={[{ type: 'text', value: prettyTitle(c.title) }]} /></h2>
            {reads.length > 0 && source && (
              <p className="font-ui text-[12.5px] text-muted">{t('From')} {reads.map((r, i) => <Link key={i} href={`${docRoute(ws, source.path)}&section=${encodeURIComponent(r.section)}`} className="underline decoration-border-strong underline-offset-2 hover:text-text">§{r.section}{r.title ? ` ${r.title}` : ''}</Link>).reduce<React.ReactNode[]>((acc, x, i) => (i ? [...acc, ', ', x] : [x]), [])}</p>
            )}
            {env && <DocBlocks blocks={c.blocks.map((b) => ({ ...b, line: 0 })) as DocBlock[]} env={env} />}
          </section>
        )
      })}
    </div>
    </article>
  )
}
