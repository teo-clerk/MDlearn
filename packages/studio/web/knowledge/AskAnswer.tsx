// One question and its answer, as it streams in, with the passages it came from. The Ask page and the companion both show these.
import { useState } from 'react'
import { Link } from 'wouter'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Loader2, NotebookPen, Square, Trash2 } from 'lucide-react'
import { askApi } from '../api/queries'
import { useStream } from '../state/stream'
import { citedNumbers } from '../lib/cite'
import { docRoute, lessonRoute } from '../lib/paths'
import { prettyTitle } from '../lib/title'
import { MiniMarkdown } from '../prose/MiniMarkdown'
import { Button, IconButton } from '../ui/primitives'
import type { AskEntry, AskSource } from '../../shared/types'
import { t, tp } from '../i18n'

const isLesson = (s: AskSource) => s.doc.endsWith('.learn.md')
const sourceHref = (ws: string, s: AskSource) => (isLesson(s) ? lessonRoute(ws, s.doc) : `${docRoute(ws, s.doc)}${s.section ? `&section=${encodeURIComponent(s.section.anchor)}` : ''}`)
// the server sends a code, so these follow the language of the app; answers saved before then hold the sentence itself
const noticeText = (code: string) => ({
  words: t('Searching by words only. Download the search model for questions that use different words than the notes.'),
  partial: t('Meaning search covers part of this folder so far; the rest is found by words.'),
  model: t('The search model did not answer; this result uses words only.'),
  nothing: t('Nothing in this folder matches that question. Try other words, or check that the folder has documents.'),
}[code] ?? code)

export function AskAnswer({ ws, e, compact = false }: { ws: string; e: AskEntry; compact?: boolean }) {
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
      <h2 className={`${compact ? 'text-[13.5px]' : 'text-[15.5px]'} font-semibold leading-snug`}>{e.question}</h2>
      <div className={`mt-2 ${compact ? 'text-[14px]' : 'text-[15px]'} leading-relaxed [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5`} aria-live={streaming ? 'polite' : undefined}>
        {answer ? <MiniMarkdown text={answer} cite={cite} /> : streaming ? <span className="inline-flex items-center gap-2 text-muted"><Loader2 className="size-4 animate-spin" aria-hidden />{tp(e.sources.length, 'Reading {n} passage…', 'Reading {n} passages…')}</span> : null}
        {e.error && <p role="alert" className="text-bad">{e.error === 'Stopped.' ? t('Stopped.') : t(e.error)}</p>}
      </div>
      {e.notice && <p className="mt-1 text-[12.5px] text-subtle">{noticeText(e.notice)}</p>}
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
      {!isLesson(s) && <IconButton icon={saved ? Check : NotebookPen} label={saved ? t('Saved as a note') : t('Keep this answer as a note on this passage')} onClick={onKeep} disabled={saved} />}
    </li>
  )
}
