// AI Studio: ask Claude Code to build or improve the course; every job is visible, stoppable, undoable.
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearch } from 'wouter'
import { GraduationCap, Layers, PencilLine, Sparkles, Wand2 } from 'lucide-react'
import { jobsApi, useEngines, useJobs, useSession, useTree, type JobRequest } from '../api/queries'
import { Button, ErrorNote } from '../ui/primitives'
import { TopLeft } from '../layout/Shell'
import { JobView, StatusChip } from './JobView'
import { BatchView, FolderCourse } from './BatchView'
import { useEngineInfo } from './engine'
import { LANGS, currentLang, t, tp, locale } from '../i18n'

type Kind = 'course' | 'folder' | 'improve' | 'custom'
export default function StudioPage({ ws }: { ws: string }) {
  const params = new URLSearchParams(useSearch())
  const jobId = params.get('job') ?? undefined
  const batchId = params.get('batch') ?? undefined
  const [, navigate] = useLocation()
  const jobs = useJobs(ws)
  const session = useSession()
  useEffect(() => { document.title = t('AI Studio · MDlearn Studio') }, [])
  if (session.data && !session.data.caps.includes('ai')) return <ErrorNote error={new Error(t('AI jobs can only be started on the computer running MDlearn Studio.'))} />
  return (
    <div className="mx-auto max-w-[860px] px-6 pb-24 pt-6 sm:px-10">
      <TopLeft><span className="px-1 text-[13px] text-muted">{t('AI Studio')}</span></TopLeft>
      {batchId ? <BatchView ws={ws} id={batchId} onBack={() => navigate(`/w/${ws}/studio`)} /> : jobId ? <JobView ws={ws} id={jobId} onBack={() => navigate(`/w/${ws}/studio`)} /> : (
        <>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{t('AI Studio')}</h1>
          <p className="mt-1 max-w-[60ch] text-[14px] text-muted">{t('Claude Code writes lessons into your')} <code className="font-mono text-[12.5px]">learn/</code> {t('folder using the MDlearn skills. It never edits your notes, every change is checked by the compiler, and any job can be undone.')}</p>
          <EngineLine />
          <NewJob ws={ws} onStarted={(id) => navigate(`/w/${ws}/studio?job=${id}`)} onBatch={(id) => navigate(`/w/${ws}/studio?batch=${id}`)} params={params} />
          <h2 className="mt-12 text-[13px] font-medium text-muted">{t('Recent jobs')}</h2>
          {jobs.data?.length === 0 && <p className="mt-2 text-[13.5px] text-muted">{t('No jobs yet.')}</p>}
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {jobs.data?.map((j) => (
              <li key={j.id}>
                <button onClick={() => navigate(`/w/${ws}/studio?job=${j.id}`)} className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-hover cursor-pointer">
                  <StatusChip status={j.status} undone={j.undone} />
                  <span className="min-w-0 flex-1 truncate text-[14px]">{j.title}</span>
                  <span className="shrink-0 tabular text-[12px] text-muted">{j.files.length ? `${tp(j.files.length, '{n} file', '{n} files')} · ` : ''}{new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(j.created)}</span>
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
      <span className="inline-flex items-center gap-1.5"><span className={`size-[7px] rounded-full ${e.claude?.available ? 'bg-good' : 'bg-bad'}`} aria-hidden />{e.claude?.available ? `Claude Code ${e.claude.version ?? ''} ready` : e.claude?.error ?? t('Checking Claude Code…')}</span>
      <span className="inline-flex items-center gap-1.5"><span className={`size-[7px] rounded-full ${e.local?.available ? 'bg-good' : 'bg-subtle'}`} aria-hidden />{e.local?.available ? `Local AI ${e.local.model} ready` : e.local?.error ?? t('Local AI not found')}</span>
    </p>
  )
}

function NewJob({ ws, onStarted, onBatch, params }: { ws: string; onStarted: (id: string) => void; onBatch: (id: string) => void; params: URLSearchParams }) {
  const tree = useTree(ws)
  const engines = useEngines()
  const [kind, setKind] = useState<Kind>((params.get('kind') as Kind) ?? 'course')
  const [doc, setDoc] = useState(params.get('doc') ?? '')
  const [source, setSource] = useState<'topic' | 'doc'>(params.get('doc') ? 'doc' : 'topic')
  // the course language starts as the interface language (English means: the language of the topic)
  const [topic, setTopic] = useState({ topic: '', level: 'beginner' as 'beginner' | 'intermediate' | 'advanced', language: currentLang() === 'en' ? '' : LANGS.find((l) => l.code === currentLang())!.english, minutes: 45, notes: '' })
  const [lesson, setLesson] = useState(params.get('lesson') ?? '')
  const [focus, setFocus] = useState<'all' | 'questions' | 'clarity' | 'lint'>('all')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const docs = useMemo(() => [...(tree.data?.docs ?? [])].sort((a, b) => a.path.localeCompare(b.path)), [tree.data])
  const lessons = useMemo(() => docs.flatMap((d) => d.lessons.map((l) => ({ ...l, doc: d.title || d.path }))), [docs])
  const req: JobRequest | null = kind === 'course' && source === 'topic'
    ? (topic.topic.trim().length > 1 ? { recipe: 'course.topic', topic: topic.topic.trim(), level: topic.level, minutes: topic.minutes, ...(topic.language.trim() ? { language: topic.language.trim() } : {}), ...(topic.notes ? { notes: topic.notes } : {}) } : null)
    : kind === 'course' ? (doc ? { recipe: 'course.create', doc } : null)
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
    <section className="mt-8 rounded-[10px] border border-border p-5" aria-label={t('New job')}>
      <div role="tablist" className="flex flex-wrap gap-1">
        {tab('course', GraduationCap, t('Create a course'))}
        {tab('folder', Layers, t('Whole folder'))}
        {tab('improve', PencilLine, t('Improve a lesson'))}
        {tab('custom', Wand2, t('Something else'))}
      </div>
      <div className="mt-4">
        {kind === 'course' && (
          <div role="radiogroup" aria-label={t('Build the course from')} className="mb-3 flex gap-1.5">
            {(['topic', 'doc'] as const).map((k) => (
              <label key={k} className={`cursor-pointer rounded-[6px] border px-2.5 py-1 text-[13px] ${source === k ? 'border-text bg-hover' : 'border-border hover:bg-hover'}`}>
                <input type="radio" name="source" value={k} checked={source === k} onChange={() => setSource(k)} className="sr-only" />
                {k === 'topic' ? t('Any topic') : t('One of my documents')}
              </label>
            ))}
          </div>
        )}
        {kind === 'course' && <p className="text-[13px] text-muted">{t('Have the files from a class?')} <Link href={`/start?ws=${ws}&add=1`} className="underline underline-offset-2 hover:text-text">{t('Make a course from them')}</Link></p>}
        {kind === 'course' && source === 'topic' && (
          <div className="flex flex-col gap-3">
            <label className="block text-[13px] font-medium">{t('What do you want to learn?')}
              <input value={topic.topic} onChange={(e) => setTopic({ ...topic, topic: e.target.value })} placeholder={t('e.g. Orbital mechanics for machine-learning engineers')}
                className={`mt-1.5 ${select} px-3`} />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block text-[13px] font-medium">{t('Level')}
                <select value={topic.level} onChange={(e) => setTopic({ ...topic, level: e.target.value as typeof topic.level })} className={`mt-1.5 ${select}`}>
                  <option value="beginner">{t('Beginner')}</option><option value="intermediate">{t('Intermediate')}</option><option value="advanced">{t('Advanced')}</option>
                </select>
              </label>
              <label className="block text-[13px] font-medium">{t('Study time (minutes)')}
                <input type="number" min={5} max={600} step={5} value={topic.minutes} onChange={(e) => setTopic({ ...topic, minutes: Math.max(5, Math.min(600, Number(e.target.value) || 45)) })} className={`mt-1.5 ${select} tabular`} />
              </label>
              <label className="block text-[13px] font-medium">{t('Language')}
                <input value={topic.language} onChange={(e) => setTopic({ ...topic, language: e.target.value })} placeholder={t('Same as the topic')} className={`mt-1.5 ${select}`} />
              </label>
            </div>
            <label className="block text-[13px] font-medium">{t('Notes to build from (optional)')}
              <select value={topic.notes} onChange={(e) => setTopic({ ...topic, notes: e.target.value })} className={`mt-1.5 ${select}`}>
                <option value="">{t('None: from general knowledge, with sources to check')}</option>
                {docs.map((d) => <option key={d.path} value={d.path}>{d.title || d.path}</option>)}
              </select>
              <span className="mt-1.5 block text-[12.5px] font-normal text-muted">{t('The course goes into a new folder named after the topic. Without notes, Claude flags claims worth checking and lists sources.')}</span>
            </label>
          </div>
        )}
        {kind === 'course' && source === 'doc' && (
          <label className="block text-[13px] font-medium">{t('From which document?')}
            <select value={doc} onChange={(e) => setDoc(e.target.value)} className={`mt-1.5 ${select}`}>
              <option value="">{t('Choose a document…')}</option>
              {docs.map((d) => <option key={d.path} value={d.path}>{d.title || d.path}{d.lessons.length ? ` (${d.lessons.length} lessons already)` : ''}</option>)}
            </select>
            <span className="mt-1.5 block text-[12.5px] font-normal text-muted">{t('Splits the document into lessons of about 2,500 words, one card per subsection, each linked to its section and ending with a question.')}</span>
          </label>
        )}
        {kind === 'folder' && <FolderCourse ws={ws} onStarted={onBatch} />}
        {kind === 'improve' && (
          <div className="flex flex-col gap-3">
            <label className="block text-[13px] font-medium">{t('Which lesson?')}
              <select value={lesson} onChange={(e) => setLesson(e.target.value)} className={`mt-1.5 ${select}`}>
                <option value="">{t('Choose a lesson…')}</option>
                {lessons.map((l) => <option key={l.path} value={l.path}>{l.title} — {l.doc}{l.errors ? ` · ${l.errors} errors` : ''}</option>)}
              </select>
            </label>
            <fieldset><legend className="text-[13px] font-medium">{t('Focus')}</legend>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(['all', 'questions', 'clarity', 'lint'] as const).map((f) => (
                  <label key={f} className={`cursor-pointer rounded-[6px] border px-2.5 py-1 text-[13px] ${focus === f ? 'border-text bg-hover' : 'border-border hover:bg-hover'}`}>
                    <input type="radio" name="focus" value={f} checked={focus === f} onChange={() => setFocus(f)} className="sr-only" />
                    {f === 'all' ? t('Everything') : f === 'questions' ? t('Better questions') : f === 'clarity' ? t('Clearer text') : t('Fix problems')}
                  </label>
                ))}
              </div>
            </fieldset>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={t('Anything else? (optional)')} aria-label={t('Extra instructions')} className="rounded-[6px] border border-border-strong bg-bg px-2.5 py-2 text-[14px] outline-none focus:border-text" />
          </div>
        )}
        {kind === 'custom' && (
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} aria-label={t('What should Claude do?')}
            placeholder={t('e.g. Add a lesson of ten flashcard-style questions on the radar equation, or: make every quiz in 04_sar harder.')}
            className="w-full rounded-[6px] border border-border-strong bg-bg px-2.5 py-2 text-[14px] outline-none focus:border-text" />
        )}
      </div>
      {!!error && <ErrorNote error={error} />}
      {kind !== 'folder' && (
        <div className="mt-4 flex items-center gap-3">
          <Button variant="primary" icon={Sparkles} busy={busy} disabled={!req || engines.isLoading} onClick={start}>{t('Start')}</Button>
          <span className="text-[12.5px] text-muted">{t('Runs on your Claude subscription; uses your usage limits.')}</span>
        </div>
      )}
    </section>
  )
}
