// A course for many documents: pick the documents, then watch them being built one after another.
import { useState } from 'react'
import { Link } from 'wouter'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CircleCheck, CircleX, Loader2, OctagonX, Play, Sparkles } from 'lucide-react'
import { batchApi, useBatch, useBatchCandidates, useBatches } from '../api/queries'
import { Button, ErrorNote, Spinner } from '../ui/primitives'
import { prettyTitle } from '../lib/title'
import type { Batch, BatchDoc } from '../../shared/types'
import { t, tp } from '../i18n'

const MODELS = () => [
  { id: 'sonnet', label: 'Sonnet', hint: t('Careful and quick; the default') },
  { id: 'haiku', label: 'Haiku', hint: t('Fastest and lightest on your usage; plainer questions') },
  { id: 'opus', label: 'Opus', hint: t('Deepest, slowest, heaviest on your usage') },
] as const

/** The "whole folder" tab of a new job. */
export function FolderCourse({ ws, onStarted }: { ws: string; onStarted: (id: string) => void }) {
  const cand = useBatchCandidates(ws)
  const batches = useBatches(ws)
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [model, setModel] = useState<'sonnet' | 'haiku' | 'opus'>('sonnet')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  if (cand.isLoading) return <Spinner label={t('Looking for documents without lessons')} />
  if (cand.error) return <ErrorNote error={cand.error} retry={() => cand.refetch()} />
  const docs = cand.data ?? []
  const sel = picked ?? new Set(docs.map((d) => d.path))
  const chosen = docs.filter((d) => sel.has(d.path))
  const lessonCount = chosen.reduce((n, d) => n + d.lessons, 0), wordCount = chosen.reduce((n, d) => n + d.words, 0)
  const toggle = (p: string) => setPicked(() => { const n = new Set(sel); if (n.has(p)) n.delete(p); else n.add(p); return n })
  const running = batches.data?.find((b) => b.status === 'running')
  const start = async () => { setBusy(true); setError(null); try { onStarted((await batchApi.start(ws, chosen.map((d) => d.path), model)).id) } catch (e) { setError(e) } finally { setBusy(false) } }
  if (!docs.length) return <p className="text-[13.5px] text-muted">{t('Every document in this folder already has lessons. Use “Improve a lesson” to refine them.')}</p>
  return (
    <div>
      <p className="text-[13px] text-muted">{t('These documents have no lessons yet. Each becomes its own course job, one after another; you can stop and continue later, and undo any of them.')}</p>
      <div className="mt-3 flex items-center justify-between text-[12.5px]">
        <span className="tabular text-muted">{t('{done} of {total} chosen', { done: chosen.length, total: docs.length })} · {tp(lessonCount, '{n} lesson', '{n} lessons')} · {tp(wordCount, '{n} word', '{n} words')}</span>
        <span className="flex gap-3"><button className="underline underline-offset-2 hover:text-text cursor-pointer" onClick={() => setPicked(new Set(docs.map((d) => d.path)))}>{t('All')}</button><button className="underline underline-offset-2 hover:text-text cursor-pointer" onClick={() => setPicked(new Set())}>{t('None')}</button></span>
      </div>
      <ul className="mt-2 max-h-[40vh] divide-y divide-border overflow-y-auto rounded-[8px] border border-border" aria-label={t('Documents without lessons')}>
        {docs.map((d) => (
          <li key={d.path}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-hover">
              <input type="checkbox" checked={sel.has(d.path)} onChange={() => toggle(d.path)} className="accent-[var(--accent)]" />
              <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px]">{prettyTitle(d.title)}</span><span className="block truncate text-[11.5px] text-subtle">{d.path}</span></span>
              <span className="shrink-0 text-right tabular text-[12px] text-muted">{tp(d.words, '{n} word', '{n} words')}<br />{tp(d.lessons, '{n} lesson', '{n} lessons')}</span>
            </label>
          </li>
        ))}
      </ul>
      <fieldset className="mt-4"><legend className="text-[13px] font-medium">{t('Model')}</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {MODELS().map((m) => (
            <label key={m.id} title={m.hint} className={`cursor-pointer rounded-[6px] border px-2.5 py-1 text-[13px] ${model === m.id ? 'border-accent bg-accent-soft' : 'border-border hover:bg-hover'}`}>
              <input type="radio" name="batch-model" checked={model === m.id} onChange={() => setModel(m.id)} className="sr-only" />{m.label}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-[12.5px] text-muted">{MODELS().find((m) => m.id === model)!.hint}.</p>
      </fieldset>
      {!!error && <ErrorNote error={error} />}
      {running && <p className="mt-3 text-[13px] text-muted">{t('A batch is already running.')} <Link href={`/w/${ws}/studio?batch=${running.id}`} className="underline underline-offset-2">{t('Open it')}</Link>.</p>}
      <div className="mt-4 flex items-center gap-3">
        <Button variant="primary" icon={Sparkles} busy={busy} disabled={!chosen.length || !!running} onClick={() => void start()}>{tp(chosen.length, 'Build {n} course', 'Build {n} courses')}</Button>
        <span className="text-[12.5px] text-muted">{t('Each document takes a few minutes of your Claude usage.')}</span>
      </div>
    </div>
  )
}

const label = (status: BatchDoc['status']) => ({ pending: t('waiting'), running: t('building'), done: t('done'), failed: t('failed'), skipped: t('skipped'), cancelled: t('stopped') })[status]
function DocRow({ ws, d }: { ws: string; d: BatchDoc }) {
  const cls = d.status === 'done' ? 'text-good' : d.status === 'failed' ? 'text-bad' : d.status === 'running' ? 'text-text' : 'text-muted'
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className={`inline-flex w-[84px] shrink-0 items-center gap-1 text-[12.5px] font-medium ${cls}`}>
        {d.status === 'running' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : d.status === 'done' ? <CircleCheck className="size-3.5" aria-hidden /> : d.status === 'failed' ? <CircleX className="size-3.5" aria-hidden /> : null}{label(d.status)}
      </span>
      <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px]">{prettyTitle(d.title)}</span>{d.note && <span className="block truncate text-[12px] text-muted">{d.note}</span>}</span>
      <span className="shrink-0 tabular text-[12px] text-muted">{tp(d.lessons, '{n} lesson', '{n} lessons')}</span>
      {d.jobId && <Link href={`/w/${ws}/studio?job=${d.jobId}`} className="shrink-0 text-[12.5px] underline decoration-border-strong underline-offset-2 hover:decoration-text">{t('Job')}</Link>}
    </li>
  )
}

export function BatchView({ ws, id, onBack }: { ws: string; id: string; onBack(): void }) {
  const q = useBatch(ws, id)
  const qc = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (q.isLoading) return <Spinner />
  if (q.error || !q.data) return <ErrorNote error={q.error} />
  const b: Batch = q.data
  const done = b.docs.filter((d) => d.status === 'done' || d.status === 'skipped').length
  const left = b.docs.some((d) => d.status === 'pending' || d.status === 'failed' || d.status === 'cancelled')
  const act = async (name: string, fn: () => Promise<Batch>) => { setBusy(name); setError(null); try { qc.setQueryData(['batch', ws, id], await fn()) } catch (e) { setError((e as Error).message) } finally { setBusy(null) } }
  return (
    <div>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted hover:text-text cursor-pointer"><ArrowLeft className="size-4" aria-hidden />{t('AI Studio')}</button>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.015em]">{tp(b.docs.length, 'Course for {n} document', 'Courses for {n} documents')}</h1>
          <p role="status" className="mt-1 text-[13px] text-muted tabular">{b.status === 'running' ? t('Building') : b.status === 'done' ? t('Finished') : t('Stopped')} · {t('{done} of {total} done', { done, total: b.docs.length })} · {b.model}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {b.status === 'running' && <Button variant="danger" icon={OctagonX} busy={busy === 'stop'} onClick={() => void act('stop', () => batchApi.stop(ws, id))}>{t('Stop')}</Button>}
          {b.status !== 'running' && left && <Button variant="primary" icon={Play} busy={busy === 'resume'} onClick={() => void act('resume', () => batchApi.resume(ws, id))}>{t('Continue')}</Button>}
        </div>
      </div>
      <div className="mt-3 h-[3px] w-full overflow-hidden rounded bg-active" aria-hidden><div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(100 * done / b.docs.length)}%` }} /></div>
      {error && <p role="alert" className="mt-3 text-[13px] text-bad">{error}</p>}
      {b.error && <p role="alert" className="mt-3 text-[13px] text-bad">{b.error}</p>}
      <ul className="mt-4 divide-y divide-border rounded-[8px] border border-border" aria-label={t('Documents')}>{b.docs.map((d) => <DocRow key={d.path} ws={ws} d={d} />)}</ul>
      {b.status === 'done' && <p className="mt-4 text-[13.5px] text-muted">{t('All done.')} <Link href={`/w/${ws}/study`} className="underline underline-offset-2 hover:text-text">{t('Start studying')}</Link> {t('or open any job above to review or undo it.')}</p>}
    </div>
  )
}
