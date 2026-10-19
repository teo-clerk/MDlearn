// One AI job: live log, files it changed (with their lint result), stop / undo / follow-up.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'wouter'
import { ArrowLeft, CircleCheck, CircleX, FilePlus2, FilePen, Loader2, OctagonX, RotateCcw, ShieldAlert, TriangleAlert } from 'lucide-react'
import { jobsApi, useJob } from '../api/queries'
import { docRoute, lessonRoute } from '../lib/paths'
import { Button, ErrorNote, Spinner } from '../ui/primitives'
import { MiniMarkdown } from '../prose/MiniMarkdown'
import type { JobEvent, JobStatus } from '../../shared/types'

export function StatusChip({ status, undone }: { status: JobStatus; undone?: boolean }) {
  const label = undone ? 'undone' : status
  const cls = undone ? 'text-muted' : status === 'done' ? 'text-good' : status === 'failed' ? 'text-bad' : status === 'running' ? 'text-text' : 'text-muted'
  return (
    <span className={`inline-flex w-[84px] shrink-0 items-center gap-1 text-[12.5px] font-medium ${cls}`}>
      {status === 'running' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : status === 'done' && !undone ? <CircleCheck className="size-3.5" aria-hidden /> : status === 'failed' ? <CircleX className="size-3.5" aria-hidden /> : null}
      {label}
    </span>
  )
}

export function JobView({ ws, id, onBack }: { ws: string; id: string; onBack(): void }) {
  const job = useJob(ws, id)
  const [msg, setMsg] = useState<string | null>(null)
  const [follow, setFollow] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const log = useRef<HTMLOListElement>(null)
  useEffect(() => { log.current?.lastElementChild?.scrollIntoView({ block: 'nearest' }) }, [job.data?.events.length])
  if (job.isLoading) return <Spinner />
  if (job.error) return <ErrorNote error={job.error} />
  const j = job.data!
  const live = j.status === 'running' || j.status === 'queued'
  const act = async (name: string, fn: () => Promise<string | null>) => { setBusy(name); setMsg(null); try { setMsg(await fn()) } catch (e) { setMsg((e as Error).message) } finally { setBusy(null) } }
  return (
    <div>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted hover:text-text cursor-pointer"><ArrowLeft className="size-4" aria-hidden />All jobs</button>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-[-0.015em]">{j.title}</h1>
          <p className="mt-1 flex items-center gap-3 text-[12.5px] text-muted"><StatusChip status={j.status} undone={j.undone} /><span>{j.engine}</span>{j.finished && <span className="tabular">{Math.max(1, Math.round((j.finished - j.created) / 1000))} s</span>}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {live && <Button variant="danger" icon={OctagonX} busy={busy === 'stop'} onClick={() => act('stop', async () => ((await jobsApi.cancel(ws, id)).stopped ? 'Stopping…' : 'It had already finished.'))}>Stop</Button>}
          {!live && !j.undone && j.files.length > 0 && (
            <Button icon={RotateCcw} busy={busy === 'undo'} onClick={() => act('undo', async () => {
              const r = await jobsApi.undo(ws, id)
              return `Undone: ${r.restored.length} restored, ${r.removed.length} removed.${r.skipped.length ? ` Kept ${r.skipped.length} file(s) you edited since: ${r.skipped.join(', ')}.` : ''}`
            })}>Undo all changes</Button>
          )}
        </div>
      </div>
      {msg && <p role="status" className="mt-3 rounded-[6px] bg-hover px-3 py-2 text-[13px]">{msg}</p>}
      {j.error && <p role="alert" className="mt-3 rounded-[6px] bg-bad-soft px-3 py-2 text-[13px]">{j.error}</p>}

      {j.files.length > 0 && (
        <section className="mt-6" aria-labelledby="files">
          <h2 id="files" className="text-[13px] font-medium text-muted">Changed files</h2>
          <ul className="mt-2 divide-y divide-border rounded-[8px] border border-border">
            {j.files.map((f) => {
              const lint = j.lint.find((l) => l.path === f.path)
              const Icon = f.change === 'created' ? FilePlus2 : FilePen
              return (
                <li key={f.path} className="flex items-center gap-2.5 px-3 py-2 text-[13.5px]">
                  <Icon className="size-4 shrink-0 text-muted" strokeWidth={1.7} aria-label={f.change} />
                  <Link href={f.path.endsWith('.learn.md') ? lessonRoute(ws, f.path) : docRoute(ws, f.path)} className="min-w-0 flex-1 truncate underline decoration-border-strong underline-offset-2 hover:decoration-text">{f.path}</Link>
                  {lint && (lint.errors || lint.warnings
                    ? <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-warn"><TriangleAlert className="size-3.5" aria-hidden />{lint.errors} errors · {lint.warnings} warnings</span>
                    : <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-good"><CircleCheck className="size-3.5" aria-hidden />checks pass</span>)}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="mt-6" aria-labelledby="log">
        <h2 id="log" className="text-[13px] font-medium text-muted">What happened</h2>
        <ol ref={log} className="mt-2 max-h-[52vh] overflow-y-auto rounded-[8px] border border-border bg-panel px-3 py-2 text-[13px]" aria-live="polite">
          {j.events.length === 0 && <li className="py-1 text-muted">{j.status === 'queued' ? 'Waiting for the previous job to finish…' : 'Starting Claude Code…'}</li>}
          {j.events.map((e, i) => <LogLine key={i} e={e} />)}
          {live && j.events.length > 0 && <li className="flex items-center gap-1.5 py-1 text-muted"><Loader2 className="size-3.5 animate-spin" aria-hidden />Working…</li>}
        </ol>
      </section>
      {j.summary && !live && <section className="mt-6"><h2 className="text-[13px] font-medium text-muted">Claude’s summary</h2><div className="prose-note mt-2 text-[14px]"><MiniMarkdown text={j.summary} /></div></section>}

      {!live && j.sessionId && !j.undone && (
        <form className="mt-8 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (follow.trim().length < 2) return; await act('follow', async () => { const n = await jobsApi.followup(ws, id, follow.trim()); setFollow(''); location.assign(`/w/${ws}/studio?job=${n.id}`); return null }) }}>
          <input value={follow} onChange={(e) => setFollow(e.target.value)} placeholder="Ask for a change, e.g. “now add a worked example to card 3”" aria-label="Follow-up request"
            className="h-9 min-w-0 flex-1 rounded-[6px] border border-border-strong bg-bg px-3 text-[14px] outline-none focus:border-text" />
          <Button type="submit" variant="primary" busy={busy === 'follow'} disabled={follow.trim().length < 2}>Continue</Button>
        </form>
      )}
    </div>
  )
}

function LogLine({ e }: { e: JobEvent }) {
  switch (e.kind) {
    case 'tool': return <li className="py-0.5 text-text/85">{e.label}</li>
    case 'text': return <li className="prose-note py-1 text-text"><MiniMarkdown text={e.text} /></li>
    case 'file': return null
    case 'lint': return <li className={`py-0.5 ${e.errors || e.warnings ? 'text-warn' : 'text-good'}`}>Checked {e.path}: {e.errors} errors, {e.warnings} warnings</li>
    case 'denied': return <li className="flex items-center gap-1.5 py-0.5 text-warn"><ShieldAlert className="size-3.5" aria-hidden />Refused {e.tool}: {e.reason}</li>
    case 'usage': return <li className="py-0.5 tabular text-muted">{e.turns} steps · {Math.round(e.durationMs / 1000)} s</li>
    case 'limit': return <li className="py-0.5 text-warn">{e.message}</li>
    case 'status': return e.message ? <li className="py-0.5 text-muted">{e.message}</li> : null
    case 'session': return null
  }
}
