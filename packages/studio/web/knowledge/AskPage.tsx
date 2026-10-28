// Ask your whole folder: a question, an answer from your own documents, and the passages it came from.
import { useEffect, useRef, useState } from 'react'
import { Link, useSearch } from 'wouter'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Download, Loader2, MessageSquareText, NotebookPen, Square, Trash2 } from 'lucide-react'
import { askApi, useAskHistory, useAskStatus, useSession } from '../api/queries'
import { useStream } from '../state/stream'
import { citedNumbers } from '../lib/cite'
import { docRoute } from '../lib/paths'
import { prettyTitle } from '../lib/title'
import { MiniMarkdown } from '../prose/MiniMarkdown'
import { Button, Empty, ErrorNote, IconButton, Spinner } from '../ui/primitives'
import { Frame } from './Frame'
import type { AskEntry, AskSource, AskStatus } from '../../shared/types'
import { t, tp, locale } from '../i18n'

const sourceHref = (ws: string, s: AskSource) => `${docRoute(ws, s.doc)}${s.section ? `&section=${encodeURIComponent(s.section.anchor)}` : ''}`
const fmt = new Intl.NumberFormat(locale())

export default function AskPage({ ws }: { ws: string }) {
  const status = useAskStatus(ws)
  const history = useAskHistory(ws)
  const session = useSession()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const asked = useRef(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const preset = new URLSearchParams(useSearch()).get('q')
  useEffect(() => { document.title = t('Ask · MDlearn Studio') }, [])

  const submit = async (text: string) => {
    const question = text.trim()
    if (question.length < 2 || busy) return
    setBusy(true); setError(null)
    try {
      const r = await askApi.ask(ws, question)
      qc.setQueryData<AskEntry[]>(['ask-history', ws], (old) => [r.entry, ...(old ?? []).filter((e) => e.id !== r.entry.id)])
      setQ('')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false); field.current?.focus() }
  }
  // a question handed over from the search palette is asked once
  useEffect(() => { if (preset && !asked.current && status.data?.chatReady) { asked.current = true; void submit(preset) } }, [preset, status.data?.chatReady]) // eslint-disable-line react-hooks/exhaustive-deps

  const s = status.data
  return (
    <Frame title={t('Ask')} hint={t('Questions about everything in this folder, answered from your own documents with the passages shown.')}>
      <SearchModel ws={ws} s={s} canSetup={!!session.data?.caps.includes('ai')} />
      <form onSubmit={(e) => { e.preventDefault(); void submit(q) }} className="mb-6">
        <textarea ref={field} value={q} onChange={(e) => setQ(e.target.value)} rows={2} maxLength={1000} aria-label={t('Your question')} disabled={s ? !s.chatReady : false}
          placeholder={s && !s.chatReady ? t('The local model is not available.') : t('Ask something, e.g. why does multi-looking reduce speckle?')}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(q) } }}
          className="w-full resize-y rounded-[8px] border border-border-strong bg-raised px-3.5 py-2.5 text-[15px] outline-none placeholder:text-subtle focus:border-focus disabled:opacity-60" />
        <div className="mt-2 flex items-center gap-3">
          <Button type="submit" variant="primary" busy={busy} disabled={q.trim().length < 2 || (s ? !s.chatReady : false)}>{t('Ask')}</Button>
          <span className="text-[12px] text-subtle">{t('Enter to ask · Shift+Enter for a new line')}</span>
          {!!history.data?.length && <button type="button" onClick={async () => { await askApi.remove(ws, null); await qc.invalidateQueries({ queryKey: ['ask-history', ws] }) }} className="ml-auto text-[12.5px] text-muted hover:text-text underline-offset-2 hover:underline cursor-pointer">{t('Clear history')}</button>}
        </div>
        {error && <p role="alert" className="mt-2 text-[13px] text-bad">{error}</p>}
      </form>
      {history.isLoading && <Spinner label={t('Loading')} />}
      {history.error && <ErrorNote error={history.error} retry={() => history.refetch()} />}
      {history.data && history.data.length === 0 && <Empty icon={MessageSquareText} title={t('Nothing asked yet')}>{t('Ask in your own words. The answer cites the passages it used, and each one opens in its document.')}</Empty>}
      <div className="flex flex-col gap-7">
        {history.data?.map((e) => <Entry key={e.id} ws={ws} e={e} />)}
      </div>
    </Frame>
  )
}

/** The optional download that makes search understand meaning, and how far indexing has come. */
function SearchModel({ ws, s, canSetup }: { ws: string; s?: AskStatus; canSetup: boolean }) {
  const qc = useQueryClient()
  const [err, setErr] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  if (!s) return null
  const start = async () => {
    setStarting(true); setErr(null)
    try { qc.setQueryData(['ask-status', ws], await askApi.setup(ws)) } catch (e) { setErr((e as Error).message) } finally { setStarting(false) }
  }
  const working = !!s.pulling || s.building
  const incomplete = s.installed && s.indexed < s.total && !working
  if (s.installed && !working && !incomplete && !s.error) return null
  return (
    <section aria-label={t('Search model')} className="mb-5 rounded-[8px] border border-border bg-panel px-4 py-3 text-[13.5px]">
      {s.reading && <p role="status" className="text-muted">{t('Reading your documents…')}</p>}
      {!s.installed && !s.pulling && (
        <>
          <p className="font-medium">{t('Search by meaning')}</p>
          <p className="mt-0.5 text-muted">Questions are matched by words now. A small search model ({s.size}, downloaded once through Ollama) also finds passages that use other words.</p>
          {!s.ollama && <p className="mt-1.5 text-muted">{t('Ollama is not running; start it to download.')}</p>}
          {s.ollama && (canSetup
            ? <Button className="mt-2.5" size="sm" icon={Download} busy={starting} onClick={() => void start()}>{t('Download {model}', { model: s.model })}</Button>
            : <p className="mt-1.5 text-muted">{t('Download it from the computer that runs MDlearn.')}</p>)}
        </>
      )}
      {s.pulling && (
        <div role="status" aria-live="polite">
          <p className="font-medium">{t('Downloading {model}', { model: s.model })}{s.pulling.percent !== undefined ? ` · ${s.pulling.percent}%` : ''}</p>
          {s.pulling.percent !== undefined && <div className="mt-2 h-[3px] w-full overflow-hidden rounded bg-active"><div className="h-full bg-text transition-[width]" style={{ width: `${s.pulling.percent}%` }} /></div>}
          <p className="mt-1.5 text-muted">{s.pulling.status}</p>
        </div>
      )}
      {s.building && (
        <div role="status" aria-live="polite">
          <p className="flex items-center gap-2 font-medium"><Loader2 className="size-4 animate-spin text-muted" aria-hidden />{t('Indexing passages')} · <span className="tabular">{t('{done} of {total}', { done: fmt.format(s.indexed), total: fmt.format(s.total) })}</span></p>
          <p className="mt-0.5 text-muted">{t('You can ask meanwhile; what is not indexed yet is found by words.')}</p>
        </div>
      )}
      {incomplete && (
        <p className="flex flex-wrap items-center gap-3"><span className="text-muted tabular">{tp(s.total - s.indexed, '{n} passage is not indexed for meaning search yet.', '{n} passages are not indexed for meaning search yet.')}</span>
          {canSetup && <Button size="sm" busy={starting} onClick={() => void start()}>{t('Index now')}</Button>}</p>
      )}
      {(s.error || err) && <p role="alert" className="mt-1.5 text-bad">{s.error ?? err}</p>}
    </section>
  )
}

function Entry({ ws, e }: { ws: string; e: AskEntry }) {
  const streamed = useStream((x) => x.text[e.id])
  const streaming = !e.done
  const answer = e.done ? e.answer : streamed ?? ''
  const cited = citedNumbers(answer, e.sources.length)
  const qc = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const byN = new Map(e.sources.map((s) => [s.n, s]))
  const other = e.sources.filter((s) => !cited.includes(s.n))
  const cite = (n: number) => {
    const s = byN.get(n)
    return s ? <Link href={sourceHref(ws, s)} title={`${prettyTitle(s.docTitle)}${s.section?.num ? ` §${s.section.num}` : ''}`} className="mx-px rounded px-0.5 text-[0.82em] tabular text-muted no-underline hover:bg-hover hover:text-text">[{n}]</Link> : `[${n}]`
  }
  const keep = async (n: number) => {
    setError(null)
    try { await askApi.saveNote(ws, e.id, n); setSaved(n) } catch (x) { setError((x as Error).message) }
  }
  return (
    <article aria-label={e.question}>
      <h2 className="text-[15.5px] font-semibold leading-snug">{e.question}</h2>
      <div className="mt-2 text-[15px] leading-relaxed [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5" aria-live={streaming ? 'polite' : undefined}>
        {answer ? <MiniMarkdown text={answer} cite={cite} /> : streaming ? <span className="inline-flex items-center gap-2 text-muted"><Loader2 className="size-4 animate-spin" aria-hidden />{tp(e.sources.length, 'Reading {n} passage…', 'Reading {n} passages…')}</span> : null}
        {e.error && <p role="alert" className="text-bad">{e.error}</p>}
      </div>
      {e.notice && <p className="mt-1 text-[12.5px] text-subtle">{e.notice}</p>}
      {cited.length > 0 && (
        <ol className="mt-3 flex flex-col gap-1.5 text-[13px]" aria-label={t('Sources')}>
          {cited.map((n) => <SourceRow key={n} ws={ws} s={byN.get(n)!} saved={saved === n} onKeep={() => void keep(n)} />)}
        </ol>
      )}
      {other.length > 0 && !streaming && (
        <details className="mt-2 text-[13px]">
          <summary className="cursor-pointer text-muted hover:text-text">{cited.length ? t('Other passages searched') : t('Passages searched')} <span className="tabular">({other.length})</span></summary>
          <ol className="mt-1.5 flex flex-col gap-1.5">{other.map((s) => <SourceRow key={s.n} ws={ws} s={s} saved={saved === s.n} onKeep={() => void keep(s.n)} />)}</ol>
        </details>
      )}
      {error && <p role="alert" className="mt-1 text-[12.5px] text-bad">{error}</p>}
      <div className="mt-2 flex items-center gap-0.5 text-muted">
        {streaming
          ? <Button size="sm" variant="ghost" icon={Square} onClick={() => void askApi.stop(ws, e.id)}>{t('Stop')}</Button>
          : <>
              <IconButton icon={copied ? Check : Copy} label={copied ? t('Copied') : t('Copy the answer')} onClick={async () => { try { await navigator.clipboard.writeText(e.answer); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard unavailable */ } }} />
              <IconButton icon={Trash2} label={t('Remove from history')} onClick={async () => { await askApi.remove(ws, e.id); await qc.invalidateQueries({ queryKey: ['ask-history', ws] }) }} />
            </>}
      </div>
    </article>
  )
}

function SourceRow({ ws, s, saved, onKeep }: { ws: string; s: AskSource; saved: boolean; onKeep: () => void }) {
  return (
    <li className="flex items-start gap-2.5 rounded-[6px] border border-border px-3 py-2">
      <span className="mt-px w-5 shrink-0 tabular text-[12px] text-subtle">[{s.n}]</span>
      <div className="min-w-0 flex-1">
        <Link href={sourceHref(ws, s)} className="font-medium hover:underline underline-offset-2">{prettyTitle(s.docTitle)}{s.section && <span className="font-normal text-muted"> · {s.section.num && <span className="tabular">§{s.section.num} </span>}{prettyTitle(s.section.title)}</span>}</Link>
        <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted">{s.snippet}</p>
      </div>
      <IconButton icon={saved ? Check : NotebookPen} label={saved ? t('Saved as a note') : t('Keep this answer as a note on this passage')} onClick={onKeep} disabled={saved} />
    </li>
  )
}
