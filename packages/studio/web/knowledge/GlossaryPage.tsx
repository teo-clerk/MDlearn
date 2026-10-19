// Terms the documents define, A to Z, each with its definition and where it was defined.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'wouter'
import { BookA } from 'lucide-react'
import { useGlossary } from '../api/queries'
import { docRoute } from '../lib/paths'
import { prettyTitle } from '../lib/title'
import { MiniMarkdown } from '../prose/MiniMarkdown'
import { Empty, ErrorNote, Spinner } from '../ui/primitives'
import { BuildNote, Frame, SearchField } from './Frame'
import { useDebounced } from '../lib/hooks'
import type { GlossaryTerm } from '../../shared/types'

const letterOf = (t: string) => { const c = t.replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 1).toUpperCase(); return /\p{L}/u.test(c) ? c : '#' }
const plainStart = (t: string) => t.replace(/^[^\p{L}\p{N}]+/u, '')

export default function GlossaryPage({ ws }: { ws: string }) {
  const [q, setQ] = useState('')
  const [loose, setLoose] = useState(false)
  const query = useDebounced(q, 200)
  useEffect(() => { document.title = 'Glossary · MDlearn Studio' }, [])
  const res = useGlossary(ws, query, loose)
  const groups = useMemo(() => {
    const m = new Map<string, GlossaryTerm[]>()
    for (const t of [...(res.data?.terms ?? [])].sort((a, b) => plainStart(a.term).localeCompare(plainStart(b.term), undefined, { sensitivity: 'base' }))) {
      const l = letterOf(t.term); m.set(l, [...(m.get(l) ?? []), t])
    }
    return [...m].sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
  }, [res.data])
  const total = res.data?.terms.length ?? 0
  return (
    <Frame title="Glossary" hint={res.data ? <span className="tabular">{total} {total === 1 ? 'term' : 'terms'} defined in your documents</span> : undefined}>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <SearchField value={q} onChange={setQ} placeholder="Search terms and meanings" label="Search the glossary" />
        <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-muted" title="Lines written as “term: text” are as often headings as definitions"><input type="checkbox" checked={loose} onChange={(e) => setLoose(e.target.checked)} className="accent-[var(--accent)]" />Include looser matches</label>
      </div>
      <BuildNote status={res.data?.status} />
      {res.isLoading && <Spinner label="Collecting terms" />}
      {res.error && <ErrorNote error={res.error} retry={() => res.refetch()} />}
      {res.data && total === 0 && !res.data.status.building && (
        <Empty icon={BookA} title={query ? 'No term matches' : 'No definitions found'}>
          {query ? 'Try another word.' : 'Terms written as “**term** is …”, “**term**: …” or in a Term | Meaning table appear here.'}
        </Empty>
      )}
      {groups.length > 1 && (
        <nav aria-label="Letters" className="mb-4 flex flex-wrap gap-1">
          {groups.map(([l]) => <a key={l} href={`#g-${l === '#' ? 'other' : l}`} className="inline-flex h-6 min-w-6 items-center justify-center rounded-[5px] px-1 text-[12.5px] text-muted hover:bg-hover hover:text-text">{l}</a>)}
        </nav>
      )}
      {groups.map(([l, terms]) => (
        <section key={l} aria-labelledby={`g-${l === '#' ? 'other' : l}`} className="mb-6">
          <h2 id={`g-${l === '#' ? 'other' : l}`} className="mb-1 border-b border-border pb-1 text-[13px] font-medium text-subtle">{l}</h2>
          <dl>
            {terms.map((t) => (
              <div key={t.term} className="border-b border-border/60 py-2.5 last:border-0">
                <dt className="text-[15px] font-semibold"><MiniMarkdown inline text={t.term} /></dt>
                <dd className="mt-0.5 text-[14px] leading-relaxed text-text/90"><MiniMarkdown text={t.definition} /></dd>
                <dd className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-muted">
                  {t.sources.slice(0, 4).map((s, i) => (
                    <Link key={i} href={`${docRoute(ws, s.doc)}${s.section ? `&section=${encodeURIComponent(s.section.anchor)}` : ''}`} className="hover:text-text hover:underline underline-offset-2">
                      {prettyTitle(s.docTitle)}{s.section?.num && <span className="tabular"> §{s.section.num}</span>}
                    </Link>
                  ))}
                  {t.sources.length > 4 && <span>+{t.sources.length - 4} more</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </Frame>
  )
}
