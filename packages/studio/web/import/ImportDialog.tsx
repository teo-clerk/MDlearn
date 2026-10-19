// Bring something into the folder: a web page, a PDF, an Anki deck or a Jupyter notebook.
import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'wouter'
import { useQueryClient } from '@tanstack/react-query'
import { BookOpenCheck, FileText, Globe, GraduationCap, Layers, NotebookText, X } from 'lucide-react'
import { importApi, keys, useSession } from '../api/queries'
import { docRoute, lessonRoute } from '../lib/paths'
import { Button } from '../ui/primitives'
import type { ImportResult } from '../../shared/types'

type Kind = 'web' | 'pdf' | 'anki' | 'notebook'
const KINDS: { id: Kind; icon: typeof Globe; label: string; hint: string; accept?: string }[] = [
  { id: 'web', icon: Globe, label: 'Web page', hint: 'An article, as Markdown with its math and pictures' },
  { id: 'pdf', icon: FileText, label: 'PDF', hint: 'A paper or a chapter', accept: '.pdf,application/pdf' },
  { id: 'anki', icon: Layers, label: 'Anki deck', hint: 'Notes become study cards; history can come along', accept: '.apkg' },
  { id: 'notebook', icon: NotebookText, label: 'Notebook', hint: 'A Jupyter .ipynb with its outputs', accept: '.ipynb' },
]

export function ImportDialog({ ws, onClose }: { ws: string; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>('web')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [quality, setQuality] = useState<'fast' | 'high'>('fast')
  const [history, setHistory] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<ImportResult | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const canAi = !!useSession().data?.caps.includes('ai')
  const spec = KINDS.find((k) => k.id === kind)!
  const ready = kind === 'web' ? /^https?:\/\//i.test(url.trim()) : !!file

  const run = async () => {
    setBusy(true); setError(null)
    try {
      const r = kind === 'web' ? await importApi.web(ws, url.trim())
        : kind === 'pdf' ? await importApi.file(ws, quality === 'high' ? 'pdf-quality' : 'pdf-fast', file!)
        : kind === 'anki' ? await importApi.file(ws, 'anki', file!, { keepHistory: String(history) })
        : await importApi.file(ws, 'notebook', file!)
      setDone(r)
      void qc.invalidateQueries({ queryKey: keys.tree(ws) })
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const choose = (k: Kind) => { setKind(k); setFile(null); setError(null); if (picker.current) picker.current.value = '' }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/25 px-4 py-[8vh]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
        className="w-full max-w-[560px] rounded-[10px] border border-border bg-raised p-5 shadow-pop">
        <div className="flex items-start justify-between gap-3">
          <div><h2 id="import-title" className="text-[16px] font-semibold">Import</h2><p className="mt-0.5 text-[13px] text-muted">Everything is copied into this folder; nothing you already have is changed.</p></div>
          <button onClick={onClose} aria-label="Close" className="rounded-[6px] p-1 text-muted hover:bg-hover cursor-pointer"><X className="size-4" aria-hidden /></button>
        </div>

        {done ? <Result ws={ws} r={done} onClose={onClose} onMore={() => { setDone(null); setFile(null); setUrl('') }} /> : (
          <>
            <div role="radiogroup" aria-label="What to import" className="mt-4 grid grid-cols-2 gap-2">
              {KINDS.map((k) => (
                <button key={k.id} role="radio" aria-checked={kind === k.id} onClick={() => choose(k.id)}
                  className={`flex items-start gap-2.5 rounded-[8px] border px-3 py-2.5 text-left cursor-pointer ${kind === k.id ? 'border-text bg-hover' : 'border-border hover:bg-hover'}`}>
                  <k.icon className="mt-0.5 size-4 shrink-0 text-muted" strokeWidth={1.8} aria-hidden />
                  <span><span className="block text-[13.5px] font-medium">{k.label}</span><span className="block text-[12px] leading-snug text-muted">{k.hint}</span></span>
                </button>
              ))}
            </div>

            <div className="mt-4">
              {kind === 'web' ? (
                <>
                  <label htmlFor="import-url" className="text-[12.5px] text-muted">Address</label>
                  <input id="import-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" autoFocus spellCheck={false}
                    onKeyDown={(e) => { if (e.key === 'Enter' && ready && !busy) void run() }}
                    className="mt-1 h-9 w-full rounded-[6px] border border-border-strong bg-bg px-3 text-[14px] outline-none placeholder:text-subtle focus:border-focus" />
                </>
              ) : (
                <>
                  <input ref={picker} type="file" accept={spec.accept} className="sr-only" aria-label={`Choose a ${spec.label} file`} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  <button onClick={() => picker.current?.click()} className="flex h-9 w-full items-center rounded-[6px] border border-dashed border-border-strong px-3 text-left text-[13.5px] text-muted hover:bg-hover cursor-pointer">
                    {file ? <span className="truncate text-text">{file.name} <span className="text-muted tabular">· {(file.size / 1048576).toFixed(file.size > 1048576 ? 1 : 2)} MB</span></span> : `Choose a ${spec.accept?.split(',')[0]} file…`}
                  </button>
                </>
              )}
              {kind === 'pdf' && (
                <fieldset className="mt-3"><legend className="text-[12.5px] text-muted">How to read it</legend>
                  <Choice name="q" checked={quality === 'fast'} onChange={() => setQuality('fast')} title="Quick, on this computer" hint="Headings, paragraphs and lists in seconds. Formulas come out as plain text." />
                  <Choice name="q" checked={quality === 'high'} disabled={!canAi} onChange={() => setQuality('high')} title="High quality, Claude reads the pages" hint={canAi ? 'Formulas become LaTeX and tables stay tables. Takes minutes and uses your Claude usage.' : 'Only on the computer running MDlearn.'} />
                </fieldset>
              )}
              {kind === 'anki' && (
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-[13px]"><input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
                  <span>Keep my review history<span className="block text-[12px] text-muted">Cards you know in Anki stay scheduled instead of starting over.</span></span></label>
              )}
            </div>
            {error && <p role="alert" className="mt-3 text-[13px] text-bad">{error}</p>}
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button variant="primary" busy={busy} disabled={!ready} onClick={() => void run()}>{busy ? 'Importing…' : 'Import'}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Choice({ name, checked, disabled, onChange, title, hint }: { name: string; checked: boolean; disabled?: boolean; onChange: () => void; title: string; hint: string }) {
  return (
    <label className={`mt-1.5 flex items-start gap-2 text-[13px] ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} className="mt-0.5 accent-[var(--accent)]" />
      <span><span className="block font-medium">{title}</span><span className="block text-[12px] leading-snug text-muted">{hint}</span></span>
    </label>
  )
}

function Result({ ws, r, onClose, onMore }: { ws: string; r: ImportResult; onClose: () => void; onMore: () => void }) {
  const docs = r.files.filter((f) => f.kind === 'document'), lessons = r.files.filter((f) => f.kind === 'lesson')
  const link = (f: { path: string; kind: string }): ReactNode => (
    <li key={f.path} className="flex items-center gap-2 py-1">
      {f.kind === 'lesson' ? <GraduationCap className="size-4 shrink-0 text-muted" aria-hidden /> : <FileText className="size-4 shrink-0 text-muted" aria-hidden />}
      <Link href={f.kind === 'lesson' ? lessonRoute(ws, f.path) : docRoute(ws, f.path)} onClick={onClose} className="min-w-0 truncate underline decoration-border-strong underline-offset-2 hover:decoration-text">{f.path}</Link>
    </li>
  )
  return (
    <div className="mt-4" role="status">
      <p className="text-[14px] font-medium">{r.jobId ? 'Started' : 'Imported'}. <span className="font-normal text-muted">{r.summary}</span></p>
      <ul className="mt-2 text-[13px]">{[...docs, ...lessons].map(link)}</ul>
      {r.warnings.map((w, i) => <p key={i} className="mt-2 text-[12.5px] text-muted">{w}</p>)}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        {r.jobId && <Link href={`/w/${ws}/studio?job=${r.jobId}`} onClick={onClose} className="inline-flex h-8 items-center rounded-[6px] border border-border-strong px-3 text-[13px] font-medium hover:bg-hover">Watch the job</Link>}
        {lessons.length > 0 && <Link href={`/w/${ws}/study`} onClick={onClose} className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-border-strong px-3 text-[13px] font-medium hover:bg-hover"><BookOpenCheck className="size-4" aria-hidden />Study</Link>}
        <Button variant="ghost" onClick={onMore}>Import another</Button>
        <Button variant="primary" onClick={onClose}>Done</Button>
      </div>
    </div>
  )
}
