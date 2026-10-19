// Every display formula in the folder, with where it comes from and the sentence that leads to it.
import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { Check, Copy, ExternalLink, Sigma } from 'lucide-react'
import { useFormulas, useTree } from '../api/queries'
import { docRoute } from '../lib/paths'
import { prettyTitle } from '../lib/title'
import { Tex } from '../prose/Tex'
import { MiniMarkdown } from '../prose/MiniMarkdown'
import { Empty, ErrorNote, IconButton, Spinner } from '../ui/primitives'
import { BuildNote, Frame, SearchField } from './Frame'
import { useDebounced } from '../lib/hooks'
import type { FormulaItem } from '../../shared/types'

const PAGE = 40

export default function FormulasPage({ ws }: { ws: string }) {
  const [q, setQ] = useState('')
  const [doc, setDoc] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const query = useDebounced(q, 200)
  useEffect(() => { setLimit(PAGE) }, [query, doc])
  useEffect(() => { document.title = 'Formulas · MDlearn Studio' }, [])
  const res = useFormulas(ws, query, doc, limit)
  const tree = useTree(ws)
  const data = res.data
  return (
    <Frame title="Formulas" hint={data ? <span className="tabular">{data.total} {data.total === 1 ? 'formula' : 'formulas'}{query || doc ? ' match' : ' in this folder'}</span> : undefined}>
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchField value={q} onChange={setQ} placeholder="Search by words or TeX, e.g. gamma or \frac" label="Search formulas" />
        <select value={doc} onChange={(e) => setDoc(e.target.value)} aria-label="Document" className="h-9 max-w-[16rem] rounded-[6px] border border-border-strong bg-raised px-2 text-[13.5px]">
          <option value="">All documents</option>
          {data?.docs.map((d) => <option key={d.path} value={d.path}>{prettyTitle(d.title)} ({d.count})</option>)}
        </select>
      </div>
      <BuildNote status={data?.status} />
      {res.isLoading && <Spinner label="Collecting formulas" />}
      {res.error && <ErrorNote error={res.error} retry={() => res.refetch()} />}
      {data && data.items.length === 0 && !data.status.building && (
        <Empty icon={Sigma} title={query || doc ? 'No formula matches' : 'No formulas yet'}>
          {query || doc ? 'Try fewer words, or search for a symbol such as \\sigma.' : `Display formulas ($$ … $$) in ${tree.data?.name ?? 'your documents'} will be collected here.`}
        </Empty>
      )}
      <ul className="flex flex-col gap-3">
        {data?.items.map((f) => <FormulaCard key={f.id} ws={ws} f={f} />)}
      </ul>
      {data && data.total > data.items.length && (
        <button onClick={() => setLimit((l) => l + PAGE)} className="mt-4 h-8 rounded-[6px] border border-border-strong px-3 text-[13px] hover:bg-hover cursor-pointer">Show {Math.min(PAGE, data.total - data.items.length)} more</button>
      )}
    </Frame>
  )
}

function FormulaCard({ ws, f }: { ws: string; f: FormulaItem }) {
  const [copied, setCopied] = useState(false)
  const href = `${docRoute(ws, f.doc)}${f.section ? `&section=${encodeURIComponent(f.section.anchor)}` : ''}`
  const copy = async () => { try { await navigator.clipboard.writeText(f.tex); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard unavailable: nothing to do */ } }
  return (
    <li className="rounded-[8px] border border-border bg-raised px-4 py-3">
      <div className="overflow-x-auto py-1" tabIndex={0} aria-label={`Formula: ${f.tex}`}><Tex tex={f.tex} display /></div>
      {f.lead && <p className="mt-1 text-[13px] text-muted"><MiniMarkdown inline text={f.lead} /></p>}
      <div className="mt-2 flex items-center gap-1.5 text-[12.5px] text-muted">
        <Link href={href} className="min-w-0 truncate hover:text-text hover:underline underline-offset-2">
          {prettyTitle(f.docTitle)}{f.section && <> · <span className="tabular">§{f.section.num ?? ''}</span> {prettyTitle(f.section.title)}</>}
        </Link>
        <span className="ml-auto flex shrink-0 gap-0.5">
          <IconButton icon={copied ? Check : Copy} label={copied ? 'Copied' : 'Copy TeX'} onClick={() => void copy()} />
          <Link href={href} aria-label="Open in the document" title="Open in the document" className="inline-flex size-7 items-center justify-center rounded-[6px] text-muted hover:bg-hover hover:text-text"><ExternalLink className="size-4" strokeWidth={1.8} aria-hidden /></Link>
        </span>
      </div>
    </li>
  )
}
