// Bring something into the folder: lessons a chat wrote, a web page, a PDF, an Anki deck, a Jupyter notebook or a
// paper from SciNet.
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Link } from 'wouter'
import { useQueryClient } from '@tanstack/react-query'
import { BookOpenCheck, FileText, Globe, GraduationCap, Layers, Library, MessageSquareText, NotebookText, Sparkles, X } from 'lucide-react'
import { importApi, keys, useSession } from '../api/queries'
import { docRoute, lessonRoute } from '../lib/paths'
import { Button } from '../ui/primitives'
import type { ChatCheck, ImportResult } from '../../shared/types'
import { ChatImport, FixRequest } from './ChatImport'
import { ScinetImport } from './ScinetImport'
import { Choice } from './Choice'
import { t } from '../i18n'

type Kind = 'chat' | 'web' | 'pdf' | 'anki' | 'notebook' | 'scinet'
const KINDS = (): { id: Kind; icon: typeof Globe; label: string; hint: string; accept?: string }[] => [
  { id: 'chat', icon: MessageSquareText, label: t('From a chat'), hint: t('Lessons ChatGPT, Gemini or Claude.ai wrote with the MDlearn prompt') },
  { id: 'web', icon: Globe, label: t('Web page'), hint: t('An article, as Markdown with its math and pictures') },
  { id: 'pdf', icon: FileText, label: t('PDF'), hint: t('A paper or a chapter'), accept: '.pdf,application/pdf' },
  { id: 'anki', icon: Layers, label: t('Anki deck'), hint: t('Notes become study cards; history can come along'), accept: '.apkg' },
  { id: 'notebook', icon: NotebookText, label: t('Notebook'), hint: t('A Jupyter .ipynb with its outputs'), accept: '.ipynb' },
  { id: 'scinet', icon: Library, label: t('From SciNet'), hint: t('A paper from your own library, to study it here') },
]

export function ImportDialog({ ws, onClose }: { ws: string; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>('chat')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [quality, setQuality] = useState<'fast' | 'high'>('fast')
  const [history, setHistory] = useState(true)
  const [paperId, setPaperId] = useState<number | null>(null), [reread, setReread] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<ImportResult | null>(null)
  const [chat, setChat] = useState(''), [folder, setFolder] = useState('')
  const [check, setCheck] = useState<ChatCheck | null>(null)
  const onCheck = useCallback((c: ChatCheck | null) => setCheck(c), [])
  const picker = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const canAi = !!useSession().data?.caps.includes('ai')
  const spec = KINDS().find((k) => k.id === kind)!
  const ready = kind === 'chat' ? !!check?.files.some((f) => !f.errors && !f.exists) : kind === 'web' ? /^https?:\/\//i.test(url.trim()) : kind === 'scinet' ? paperId !== null : !!file

  const run = async () => {
    setBusy(true); setError(null)
    try {
      const r = kind === 'chat' ? await importApi.chat(ws, chat, folder || check?.folder)
        : kind === 'web' ? await importApi.web(ws, url.trim())
        : kind === 'scinet' ? await importApi.scinet(ws, paperId!, reread)
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
          <div><h2 id="import-title" className="text-[16px] font-semibold">{t('Import')}</h2><p className="mt-0.5 text-[13px] text-muted">{t('Everything is copied into this folder; nothing you already have is changed.')}</p></div>
          <button onClick={onClose} aria-label={t('Close')} className="rounded-[6px] p-1 text-muted hover:bg-hover cursor-pointer"><X className="size-4" aria-hidden /></button>
        </div>

        {done ? <Result ws={ws} r={done} canAi={canAi} onClose={onClose} onMore={() => { setDone(null); setFile(null); setUrl(''); setChat(''); setFolder(''); setPaperId(null); setReread(false) }} /> : (
          <>
            <div role="radiogroup" aria-label={t('What to import')} className="mt-4 grid grid-cols-2 gap-2">
              {KINDS().map((k) => (
                <button key={k.id} role="radio" aria-checked={kind === k.id} onClick={() => choose(k.id)}
                  className={`${k.id === 'chat' || k.id === 'scinet' ? 'col-span-2 ' : ''}flex items-start gap-2.5 rounded-[8px] border px-3 py-2.5 text-left cursor-pointer ${kind === k.id ? 'border-accent bg-accent-soft' : 'border-border hover:bg-hover'}`}>
                  <k.icon className="mt-0.5 size-4 shrink-0 text-muted" strokeWidth={1.8} aria-hidden />
                  <span><span className="block text-[13.5px] font-medium">{k.label}</span><span className="block text-[12px] leading-snug text-muted">{k.hint}</span></span>
                </button>
              ))}
            </div>

            <div className="mt-4">
              {kind === 'chat' ? <ChatImport ws={ws} text={chat} setText={setChat} folder={folder} setFolder={setFolder} onCheck={onCheck} /> : kind === 'scinet' ? <ScinetImport paperId={paperId} onPaper={setPaperId} reread={reread} onReread={setReread} canAi={canAi} /> : kind === 'web' ? (
                <>
                  <label htmlFor="import-url" className="text-[12.5px] text-muted">{t('Address')}</label>
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
                <fieldset className="mt-3"><legend className="text-[12.5px] text-muted">{t('How to read it')}</legend>
                  <Choice name="q" checked={quality === 'fast'} onChange={() => setQuality('fast')} title={t('Quick, on this computer')} hint={t('Headings, paragraphs and lists in seconds. Formulas come out as plain text.')} />
                  <Choice name="q" checked={quality === 'high'} disabled={!canAi} onChange={() => setQuality('high')} title={t('High quality, Claude reads the pages')} hint={canAi ? t('Formulas become LaTeX and tables stay tables. Takes minutes and uses your Claude usage.') : t('Only on the computer running MDlearn.')} />
                </fieldset>
              )}
              {kind === 'anki' && (
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-[13px]"><input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
                  <span>{t('Keep my review history')}<span className="block text-[12px] text-muted">{t('Cards you know in Anki stay scheduled instead of starting over.')}</span></span></label>
              )}
            </div>
            {error && <p role="alert" className="mt-3 text-[13px] text-bad">{error}</p>}
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
              <Button variant="primary" busy={busy} disabled={!ready} onClick={() => void run()}>{busy ? t('Importing…') : t('Import')}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Result({ ws, r, canAi, onClose, onMore }: { ws: string; r: ImportResult; canAi: boolean; onClose: () => void; onMore: () => void }) {
  const docs = r.files.filter((f) => f.kind === 'document'), lessons = r.files.filter((f) => f.kind === 'lesson')
  const link = (f: { path: string; kind: string }): ReactNode => (
    <li key={f.path} className="flex items-center gap-2 py-1">
      {f.kind === 'lesson' ? <GraduationCap className="size-4 shrink-0 text-muted" aria-hidden /> : <FileText className="size-4 shrink-0 text-muted" aria-hidden />}
      <Link href={f.kind === 'lesson' ? lessonRoute(ws, f.path) : docRoute(ws, f.path)} onClick={onClose} className="min-w-0 truncate underline decoration-border-strong underline-offset-2 hover:decoration-text">{f.path}</Link>
    </li>
  )
  return (
    <div className="mt-4" role="status">
      <p className="text-[14px] font-medium">{r.jobId ? t('Started') : t('Imported')}. <span className="font-normal text-muted">{r.summary}</span></p>
      <ul className="mt-2 text-[13px]">{[...docs, ...lessons].map(link)}</ul>
      {r.warnings.map((w, i) => <p key={i} className="mt-2 text-[12.5px] text-muted">{w}</p>)}
      {r.fix && <FixRequest fix={r.fix} />}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        {r.jobId && <Link href={`/w/${ws}/studio?job=${r.jobId}`} onClick={onClose} className="inline-flex h-8 items-center rounded-[6px] border border-border-strong px-3 text-[13px] font-medium hover:bg-hover">{t('Watch the job')}</Link>}
        {lessons.length > 0 && <Link href={`/w/${ws}/study`} onClick={onClose} className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-border-strong px-3 text-[13px] font-medium hover:bg-hover"><BookOpenCheck className="size-4" aria-hidden />{t('Study')}</Link>}
        {canAi && !r.jobId && docs.length === 1 && <Link href={`/w/${ws}/studio?kind=course&doc=${encodeURIComponent(docs[0].path)}`} onClick={onClose} className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-border-strong px-3 text-[13px] font-medium hover:bg-hover"><Sparkles className="size-4" aria-hidden />{t('Make a course')}</Link>}
        <Button variant="ghost" onClick={onMore}>{t('Import another')}</Button>
        <Button variant="primary" onClick={onClose}>{t('Done')}</Button>
      </div>
    </div>
  )
}
