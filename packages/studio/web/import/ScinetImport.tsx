// Import → SciNet: find a paper in your library there (by meaning or by title) and bring it in, as SciNet read it or
// read again from its PDF when the formulas matter.
import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Sigma } from 'lucide-react'
import { keys, scinetApi } from '../api/queries'
import { Button, ErrorNote, Spinner } from '../ui/primitives'
import { Command } from '../settings/Command'
import { Choice } from './Choice'
import { t, tp } from '../i18n'

type Mode = 'meaning' | 'title'
export const SCINET_START = 'uv run scinet-up'

export function ScinetImport({ paperId, onPaper, reread, onReread, canAi }: { paperId: number | null; onPaper(id: number | null): void; reread: boolean; onReread(on: boolean): void; canAi: boolean }) {
  const status = useQuery({ queryKey: keys.scinet, queryFn: scinetApi.status, retry: false })
  const [text, setText] = useState('')
  const [search, setSearch] = useState<{ q: string; mode: Mode }>({ q: '', mode: 'meaning' })
  const running = !!status.data?.running
  const papers = useQuery({ queryKey: ['scinet-papers', search.q, search.mode], enabled: running, retry: false, queryFn: () => scinetApi.papers(search.q, search.mode) })
  if (status.isLoading) return <Spinner />
  if (status.error) return <ErrorNote error={status.error} retry={() => void status.refetch()} />
  if (!running) return (
    <div className="text-[13.5px] leading-relaxed">
      <p className="font-medium">{t('SciNet is not running at {url}', { url: status.data?.url ?? '' })}</p>
      <p className="mt-1 text-muted">{t('Start it from its backend folder, then check again. If it uses another address, change it in Settings.')}</p>
      <div className="mt-2"><Command text={SCINET_START} /></div>
      <Button className="mt-3" size="sm" busy={status.isFetching} onClick={() => void status.refetch()}>{t('Check again')}</Button>
    </div>
  )
  const submit = (e: FormEvent) => { e.preventDefault(); onPaper(null); setSearch({ q: text.trim(), mode: search.mode }) }
  return (
    <>
      <form onSubmit={submit} className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} aria-label={t('Search your papers')} placeholder={t('Search your papers…')} autoFocus spellCheck={false}
          className="h-9 min-w-0 flex-1 rounded-[6px] border border-border-strong bg-bg px-3 text-[14px] outline-none placeholder:text-subtle focus:border-focus" />
        <Button type="submit" variant="secondary" icon={Search} busy={papers.isFetching}>{t('Search')}</Button>
      </form>
      <fieldset className="mt-1.5 flex flex-wrap gap-x-4">
        <legend className="sr-only">{t('How to search')}</legend>
        {([['meaning', t('By meaning')], ['title', t('By title')]] as const).map(([mode, label]) => (
          <label key={mode} className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-muted">
            <input type="radio" name="scinet-mode" checked={search.mode === mode} onChange={() => { onPaper(null); setSearch({ q: text.trim(), mode }) }} className="accent-[var(--accent)]" />{label}
          </label>
        ))}
      </fieldset>
      {status.data?.papers !== undefined && <p className="mt-1 text-[12px] text-subtle">{tp(status.data.papers, '{n} paper in SciNet', '{n} papers in SciNet')}</p>}
      {papers.error && <div className="mt-2"><ErrorNote error={papers.error} retry={() => void papers.refetch()} /></div>}
      {papers.data?.length === 0 && <p className="mt-3 text-[13px] text-muted">{t('Nothing found.')}</p>}
      {!!papers.data?.length && (
        <div role="radiogroup" aria-label={t('Papers')} className="mt-2 max-h-[220px] overflow-y-auto rounded-[8px] border border-border">
          {papers.data.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={paperId === p.id} onClick={() => onPaper(p.id)}
              className={`block w-full border-b border-border px-3 py-2 text-left last:border-b-0 cursor-pointer ${paperId === p.id ? 'bg-hover' : 'hover:bg-hover'}`}>
              <span className="block text-[13.5px] font-medium [overflow-wrap:anywhere]">{p.title}{p.year ? <span className="ml-1.5 font-normal text-muted tabular">{p.year}</span> : null}</span>
              {p.snippet && <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-muted">{p.snippet}</span>}
            </button>
          ))}
        </div>
      )}
      {paperId !== null && <Chosen id={paperId} reread={reread} onReread={onReread} canAi={canAi} />}
    </>
  )
}

function Chosen({ id, reread, onReread, canAi }: { id: number; reread: boolean; onReread(on: boolean): void; canAi: boolean }) {
  const paper = useQuery({ queryKey: ['scinet-paper', id], queryFn: () => scinetApi.paper(id), retry: false })
  if (paper.isLoading) return <div className="mt-3"><Spinner /></div>
  if (paper.error) return <div className="mt-3"><ErrorNote error={paper.error} retry={() => void paper.refetch()} /></div>
  const p = paper.data!
  const facts = [p.authors.slice(0, 3).join(', ') + (p.authors.length > 3 ? ' …' : ''), p.venue, p.pages ? tp(p.pages, '{n} page', '{n} pages') : null].filter(Boolean).join(' · ')
  return (
    <div className="mt-3">
      {facts && <p className="text-[12.5px] text-muted [overflow-wrap:anywhere]">{facts}</p>}
      <p className="mt-1 flex items-start gap-1.5 text-[12.5px] text-muted"><Sigma className="mt-px size-3.5 shrink-0" strokeWidth={2} aria-hidden />
        {p.formulas === 'latex' ? t('SciNet read its formulas as LaTeX.') : t('SciNet read the text inside the PDF, so formulas are plain text.')}</p>
      <fieldset className="mt-2"><legend className="text-[12.5px] text-muted">{t('How to bring it in')}</legend>
        <Choice name="scinet-how" checked={!reread} onChange={() => onReread(false)} title={t('As SciNet read it')} hint={t('Ready in a moment. Pictures are left out.')} />
        <Choice name="scinet-how" checked={reread} disabled={!canAi} onChange={() => onReread(true)} title={t('Read the PDF again, with Claude')} hint={canAi ? t('Formulas become LaTeX and tables stay tables. Takes minutes and uses your Claude usage.') : t('Only on the computer running MDlearn.')} />
      </fieldset>
    </div>
  )
}
