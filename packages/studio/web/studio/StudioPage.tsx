// AI Studio: ask Claude Code to build or improve the course; every job is visible, stoppable, undoable.
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearch } from 'wouter'
import { GraduationCap, Layers, PencilLine, Sparkles, Wand2 } from 'lucide-react'
import { jobsApi, useEngines, useJobs, useSession, useTree, type JobRequest } from '../api/queries'
import { Button, ErrorNote } from '../ui/primitives'
import { TopLeft } from '../layout/Shell'
import { JobView, StatusChip } from './JobView'
import { BatchView, FolderCourse } from './BatchView'
import { useEngineInfo } from './engine'

type Kind = 'course' | 'folder' | 'improve' | 'custom'
export default function StudioPage({ ws }: { ws: string }) {
  const params = new URLSearchParams(useSearch())
  const jobId = params.get('job') ?? undefined
  const batchId = params.get('batch') ?? undefined
  const [, navigate] = useLocation()
  const jobs = useJobs(ws)
  const session = useSession()
  useEffect(() => { document.title = 'AI Studio · MDlearn Studio' }, [])
  if (session.data && !session.data.caps.includes('ai')) return <ErrorNote error={new Error('AI jobs can only be started on the computer running MDlearn Studio.')} />
  return (
    <div className="mx-auto max-w-[860px] px-6 pb-24 pt-6 sm:px-10">
      <TopLeft><span className="px-1 text-[13px] text-muted">AI Studio</span></TopLeft>
      {batchId ? <BatchView ws={ws} id={batchId} onBack={() => navigate(`/w/${ws}/studio`)} /> : jobId ? <JobView ws={ws} id={jobId} onBack={() => navigate(`/w/${ws}/studio`)} /> : (
        <>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">AI Studio</h1>
          <p className="mt-1 max-w-[60ch] text-[14px] text-muted">Claude Code writes lessons into your <code className="font-mono text-[12.5px]">learn/</code> folder using the MDlearn skills. It never edits your notes, every change is checked by the compiler, and any job can be undone.</p>
          <EngineLine />
          <NewJob ws={ws} onStarted={(id) => navigate(`/w/${ws}/studio?job=${id}`)} onBatch={(id) => navigate(`/w/${ws}/studio?batch=${id}`)} params={params} />
          <h2 className="mt-12 text-[13px] font-medium text-muted">Recent jobs</h2>
          {jobs.data?.length === 0 && <p className="mt-2 text-[13.5px] text-muted">No jobs yet.</p>}
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {jobs.data?.map((j) => (
              <li key={j.id}>
                <button onClick={() => navigate(`/w/${ws}/studio?job=${j.id}`)} className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-hover cursor-pointer">
                  <StatusChip status={j.status} undone={j.undone} />
                  <span className="min-w-0 flex-1 truncate text-[14px]">{j.title}</span>
                  <span className="shrink-0 tabular text-[12px] text-muted">{j.files.length ? `${j.files.length} ${j.files.length === 1 ? 'file' : 'files'} · ` : ''}{new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(j.created)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function EngineLine() {
  const e = useEngineInfo()
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
      <span className="inline-flex items-center gap-1.5"><span className={`size-[7px] rounded-full ${e.claude?.available ? 'bg-good' : 'bg-bad'}`} aria-hidden />{e.claude?.available ? `Claude Code ${e.claude.version ?? ''} ready` : e.claude?.error ?? 'Checking Claude Code…'}</span>
      <span className="inline-flex items-center gap-1.5"><span className={`size-[7px] rounded-full ${e.local?.available ? 'bg-good' : 'bg-subtle'}`} aria-hidden />{e.local?.available ? `Local AI ${e.local.model} ready` : e.local?.error ?? 'Local AI not found'}</span>
    </p>
  )
}

function NewJob({ ws, onStarted, onBatch, params }: { ws: string; onStarted: (id: string) => void; onBatch: (id: string) => void; params: URLSearchParams }) {
  const tree = useTree(ws)
  const engines = useEngines()
  const [kind, setKind] = useState<Kind>((params.get('kind') as Kind) ?? 'course')
  const [doc, setDoc] = useState(params.get('doc') ?? '')
  const [lesson, setLesson] = useState(params.get('lesson') ?? '')
  const [focus, setFocus] = useState<'all' | 'questions' | 'clarity' | 'lint'>('all')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const docs = useMemo(() => [...(tree.data?.docs ?? [])].sort((a, b) => a.path.localeCompare(b.path)), [tree.data])
  const lessons = useMemo(() => docs.flatMap((d) => d.lessons.map((l) => ({ ...l, doc: d.title || d.path }))), [docs])
  const req: JobRequest | null = kind === 'course' ? (doc ? { recipe: 'course.create', doc } : null)
    : kind === 'improve' ? (lesson ? { recipe: 'lesson.improve', lesson, focus, note: text } : null)
      : text.trim().length > 2 ? { recipe: 'custom', request: text.trim() } : null
  const start = async () => {
    if (!req) return
    setBusy(true); setError(null)
    try { onStarted((await jobsApi.start(ws, req)).id) } catch (e) { setError(e) } finally { setBusy(false) }
  }
  const tab = (k: Kind, icon: typeof Sparkles, label: string) => {
    const Icon = icon
    return (
      <button role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
        className={`flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[13.5px] font-medium cursor-pointer ${kind === k ? 'bg-active text-text' : 'text-muted hover:bg-hover'}`}>
        <Icon className="size-4" strokeWidth={1.8} aria-hidden />{label}
      </button>
    )
  }
  const select = 'h-9 w-full rounded-[6px] border border-border-strong bg-bg px-2.5 text-[14px] outline-none focus:border-text'
  return (
    <section className="mt-8 rounded-[10px] border border-border p-5" aria-label="New job">
      <div role="tablist" className="flex flex-wrap gap-1">
        {tab('course', GraduationCap, 'Create a course')}
        {tab('folder', Layers, 'Whole folder')}
        {tab('improve', PencilLine, 'Improve a lesson')}
        {tab('custom', Wand2, 'Something else')}
      </div>
      <div className="mt-4">
        {kind === 'course' && (
          <label className="block text-[13px] font-medium">From which document?
            <select value={doc} onChange={(e) => setDoc(e.target.value)} className={`mt-1.5 ${select}`}>
              <option value="">Choose a document…</option>
              {docs.map((d) => <option key={d.path} value={d.path}>{d.title || d.path}{d.lessons.length ? ` (${d.lessons.length} lessons already)` : ''}</option>)}
            </select>
            <span className="mt-1.5 block text-[12.5px] font-normal text-muted">Splits the document into lessons of about 2,500 words, one card per subsection, each linked to its section and ending with a question.</span>
          </label>
        )}
        {kind === 'folder' && <FolderCourse ws={ws} onStarted={onBatch} />}
        {kind === 'improve' && (
          <div className="flex flex-col gap-3">
            <label className="block text-[13px] font-medium">Which lesson?
              <select value={lesson} onChange={(e) => setLesson(e.target.value)} className={`mt-1.5 ${select}`}>
                <option value="">Choose a lesson…</option>
                {lessons.map((l) => <option key={l.path} value={l.path}>{l.title} — {l.doc}{l.errors ? ` · ${l.errors} errors` : ''}</option>)}
              </select>
            </label>
            <fieldset><legend className="text-[13px] font-medium">Focus</legend>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(['all', 'questions', 'clarity', 'lint'] as const).map((f) => (
                  <label key={f} className={`cursor-pointer rounded-[6px] border px-2.5 py-1 text-[13px] ${focus === f ? 'border-text bg-hover' : 'border-border hover:bg-hover'}`}>
                    <input type="radio" name="focus" value={f} checked={focus === f} onChange={() => setFocus(f)} className="sr-only" />
                    {f === 'all' ? 'Everything' : f === 'questions' ? 'Better questions' : f === 'clarity' ? 'Clearer text' : 'Fix problems'}
                  </label>
                ))}
              </div>
            </fieldset>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Anything else? (optional)" aria-label="Extra instructions" className="rounded-[6px] border border-border-strong bg-bg px-2.5 py-2 text-[14px] outline-none focus:border-text" />
          </div>
        )}
        {kind === 'custom' && (
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} aria-label="What should Claude do?"
            placeholder="e.g. Add a lesson of ten flashcard-style questions on the radar equation, or: make every quiz in 04_sar harder."
            className="w-full rounded-[6px] border border-border-strong bg-bg px-2.5 py-2 text-[14px] outline-none focus:border-text" />
        )}
      </div>
      {!!error && <ErrorNote error={error} />}
      {kind !== 'folder' && (
        <div className="mt-4 flex items-center gap-3">
          <Button variant="primary" icon={Sparkles} busy={busy} disabled={!req || engines.isLoading} onClick={start}>Start</Button>
          <span className="text-[12.5px] text-muted">Runs on your Claude subscription; uses your usage limits.</span>
        </div>
      )}
    </section>
  )
}
