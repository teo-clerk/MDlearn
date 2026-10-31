// Start page. The first time it says what MDlearn does and offers one clear way in; after that, recent folders come first.
import { useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { ArrowRight, Clock, FileInput, FileText, FolderOpen, GraduationCap, Presentation, Upload } from 'lucide-react'
import { helpApi, importApi, useOpenFolder, useSession, useUpload, useWorkspaces } from '../api/queries'
import { useUi } from '../state/ui'
import { CLASS_ACCEPT, fromDrop, fromInput, nameFor, toForm, type Picked } from '../lib/upload'
import { Button, Spinner, ErrorNote } from '../ui/primitives'
import { OpenFolderDialog } from './OpenFolderDialog'
import { t, tp, locale } from '../i18n'

const ago = (when: number) => {
  const m = Math.round((Date.now() - when) / 6e4)
  const rel = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto', style: 'short' })
  return m < 2 ? rel.format(0, 'second') : m < 60 ? rel.format(-m, 'minute') : m < 1440 ? rel.format(-Math.round(m / 60), 'hour') : new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(when)
}

export function Home() {
  const session = useSession()
  const recents = useWorkspaces()
  const upload = useUpload()
  const openFolder = useOpenFolder()
  const [, navigate] = useLocation()
  const [browsing, setBrowsing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const filesInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const canFs = session.data?.caps.includes('fs')
  const setImportOpen = useUi((u) => u.setImportOpen)
  const setClassFiles = useUi((u) => u.setClassFiles)
  /** Markdown is notes to open; a PDF or a PowerPoint in the drop means a class's files. */
  const dropped = async (data: DataTransfer) => {
    const picked = await fromDrop(data, CLASS_ACCEPT)
    if (picked.some((p) => /\.(pdf|pptx?|docx?|odt|odp)$/i.test(p.path))) { setClassFiles(picked.map((p) => p.file)); navigate('/start') }
    else send(picked)
  }
  const startImport = async () => { const f = await importApi.folder(); setImportOpen(true); navigate(`/w/${f.id}`) }
  const [tutorialError, setTutorialError] = useState<string | null>(null)
  const openTutorial = async () => {
    setTutorialError(null)
    try { const w = await helpApi.tutorial(); navigate(`/w/${w.id}/doc?path=${encodeURIComponent('00-start-here.md')}`) } catch (e) { setTutorialError((e as Error).message) }
  }

  const send = (picked: Picked[]) => {
    if (!picked.length) return
    upload.mutate(toForm(picked, nameFor(picked)), { onSuccess: (r) => navigate(`/w/${r.id}`) })
  }
  const isNew = recents.data?.length === 0
  const recent = (
    <section className="mt-8" aria-labelledby="recents">
      <h2 id="recents" className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted"><Clock className="size-3.5" aria-hidden />{t('Recent')}</h2>
      {recents.isLoading && <div className="mt-3"><Spinner /></div>}
      <ul className="mt-2 divide-y divide-border border-y border-border">
        {recents.data?.map((w) => (
          <li key={w.id}>
            <a href={`/w/${w.id}`} onClick={(e) => { e.preventDefault(); navigate(`/w/${w.id}`) }} className="flex items-center gap-3 px-1 py-2.5 hover:bg-hover">
              <FileText className="size-4 shrink-0 text-subtle" strokeWidth={1.7} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{w.name}</span>
                {w.root && <span className="block truncate text-[12px] text-muted">{w.root}</span>}
              </span>
              <span className="shrink-0 text-right tabular text-[12px] text-muted">{tp(w.docs, '{n} document', '{n} documents')}{w.lessons ? ` · ${tp(w.lessons, '{n} lesson', '{n} lessons')}` : ''}<br />{ago(w.lastOpened)}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
  return (
    <div className={`h-full overflow-y-auto overscroll-contain bg-bg print:h-auto print:overflow-visible ${dragging ? 'outline-2 -outline-offset-8 outline-accent' : ''}`}
      onDragOver={(e) => { if (canFs) { e.preventDefault(); setDragging(true) } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false) }}
      onDrop={async (e) => { if (!canFs) return; e.preventDefault(); setDragging(false); await dropped(e.dataTransfer) }}>
      <div className="mx-auto max-w-[680px] px-6 pb-16 pt-[10vh]">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="size-7" />
          <h1 className="text-[22px] font-semibold tracking-[-0.015em]">{t('MDlearn Studio')}</h1>
        </div>
        <p className="mt-2 max-w-[52ch] text-[14.5px] leading-relaxed text-muted">{t('Turn your class files into short lessons, and study them a few minutes a day.')}</p>

        {canFs && isNew && (
          <ol className="mt-6 flex flex-col gap-2 text-[13.5px] sm:flex-row sm:gap-6">
            {[t('Add the files from your class'), t('An AI writes the lessons'), t('Study a few minutes a day')].map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold tabular text-accent-ink" aria-hidden>{i + 1}</span>{step}
              </li>
            ))}
          </ol>
        )}
        {!isNew && recent}
        {!canFs && isNew && <p className="mt-6 text-[13.5px] text-muted">{t('Folders you open appear here.')}</p>}

        {canFs && (
          <Link href="/start" className="mt-6 flex items-center gap-3.5 rounded-[10px] bg-accent p-4 text-on-accent transition-[filter] duration-150 hover:brightness-[1.06]">
            <Presentation className="size-6 shrink-0" strokeWidth={1.5} aria-hidden />
            <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">{t('Make a course from my class files')}</span>
              <span className="block text-[13px]">{t('PDF, PowerPoint, Word or pictures. Your AI writes the lessons, and you study them here.')}</span></span>
            <ArrowRight className="size-5 shrink-0" strokeWidth={1.6} aria-hidden />
          </Link>
        )}
        {canFs && (
          <button onClick={() => void openTutorial()} className="mt-3 flex w-full items-center gap-3 rounded-[10px] border border-border-strong px-4 py-3 text-left hover:bg-hover cursor-pointer">
            <GraduationCap className="size-5 shrink-0 text-muted" strokeWidth={1.8} aria-hidden />
            <span className="min-w-0 flex-1"><span className="block text-[14px] font-medium">{t('New here? Open the tutorial')}</span>
              <span className="block text-[12.5px] text-muted">{t('A small folder that shows how MDlearn works, with every kind of question, game and animation to try.')}</span></span>
          </button>
        )}
        {tutorialError && <p className="mt-2 text-[13px] text-bad" role="alert">{tutorialError}</p>}

        {canFs && (
          <section className="mt-8" aria-labelledby="have-notes">
            <h2 id="have-notes" className="text-[12.5px] font-medium text-muted">{t('Already have notes?')}</h2>
            <ul className="mt-2 divide-y divide-border border-y border-border">
              <li>
                <button onClick={() => setBrowsing(true)} className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-hover cursor-pointer">
                  <FolderOpen className="size-4 shrink-0 text-muted" strokeWidth={1.7} aria-hidden />
                  <span className="min-w-0 flex-1"><span className="block text-[14px] font-medium">{t('Open a folder')}</span>
                    <span className="block text-[12.5px] text-muted">{t('Use your notes where they are. Changes on disk show up live.')}</span></span>
                </button>
              </li>
              <li>
                <button onClick={() => void startImport()} className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-hover cursor-pointer">
                  <FileInput className="size-4 shrink-0 text-muted" strokeWidth={1.7} aria-hidden />
                  <span className="min-w-0 flex-1"><span className="block text-[14px] font-medium">{t('Import something')}</span>
                    <span className="block text-[12.5px] text-muted">{t('A PDF, a web page, an Anki deck or a notebook.')}</span></span>
                </button>
              </li>
              <li className="flex items-center gap-3 px-1 py-2.5">
                <Upload className="size-4 shrink-0 text-muted" strokeWidth={1.7} aria-hidden />
                <span className="min-w-0 flex-1"><span className="block text-[14px] font-medium">{t('Drop Markdown files or a folder')}</span>
                  <span className="block text-[12.5px] text-muted">
                    {t('Copied into your library. Or choose')}{' '}
                    <button onClick={() => folderInput.current?.click()} className="underline underline-offset-2 hover:text-text cursor-pointer">{t('a folder')}</button>
                    {' / '}
                    <button onClick={() => filesInput.current?.click()} className="underline underline-offset-2 hover:text-text cursor-pointer">{t('files')}</button>.
                  </span></span>
                <input ref={filesInput} type="file" multiple accept=".md,.markdown,.txt,.png,.jpg,.jpeg,.gif,.webp" hidden onChange={(e) => send(fromInput(e.target.files))} />
                <input ref={folderInput} type="file" hidden {...{ webkitdirectory: '' }} onChange={(e) => send(fromInput(e.target.files))} />
              </li>
            </ul>
          </section>
        )}
        {upload.isPending && <div className="mt-4"><Spinner label={t('Copying files…')} /></div>}
        {upload.error && <ErrorNote error={upload.error} />}
        {openFolder.error && <ErrorNote error={openFolder.error} />}
      </div>
      {browsing && <OpenFolderDialog onClose={() => setBrowsing(false)} onOpen={(path) => openFolder.mutate(path, { onSuccess: (r) => { setBrowsing(false); navigate(`/w/${r.id}`) } })} busy={openFolder.isPending} />}
    </div>
  )
}
