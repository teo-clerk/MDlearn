// Start page: open a folder in place, upload/drop files, or pick up a recent folder.
import { useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { FolderOpen, Upload, Clock, FileText } from 'lucide-react'
import { importApi, useOpenFolder, useSession, useUpload, useWorkspaces } from '../api/queries'
import { useUi } from '../state/ui'
import { fromDrop, fromInput, nameFor, toForm, type Picked } from '../lib/upload'
import { Button, Spinner, ErrorNote } from '../ui/primitives'
import { OpenFolderDialog } from './OpenFolderDialog'

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 6e4)
  return m < 2 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(t)
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
  const startImport = async () => { const f = await importApi.folder(); setImportOpen(true); navigate(`/w/${f.id}`) }

  const send = (picked: Picked[]) => {
    if (!picked.length) return
    upload.mutate(toForm(picked, nameFor(picked)), { onSuccess: (r) => navigate(`/w/${r.id}`) })
  }
  return (
    <div className="min-h-full bg-bg"
      onDragOver={(e) => { if (canFs) { e.preventDefault(); setDragging(true) } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false) }}
      onDrop={async (e) => { if (!canFs) return; e.preventDefault(); setDragging(false); send(await fromDrop(e.dataTransfer)) }}>
      <div className="mx-auto max-w-[680px] px-6 pb-16 pt-[12vh]">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="size-7" />
          <h1 className="text-[22px] font-semibold tracking-[-0.015em]">MDlearn Studio</h1>
        </div>
        <p className="mt-2 max-w-[52ch] text-[14.5px] leading-relaxed text-muted">
          Read a folder of Markdown notes with math, tables and diagrams; study it with spaced repetition; and let AI turn it into an interactive course.
        </p>

        {canFs && (
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <button onClick={() => setBrowsing(true)} className="group rounded-[8px] border border-border p-4 text-left hover:bg-hover cursor-pointer">
              <FolderOpen className="size-5 text-muted" strokeWidth={1.6} aria-hidden />
              <p className="mt-2.5 text-[14px] font-medium">Open a folder</p>
              <p className="mt-0.5 text-[13px] text-muted">Use your notes where they are. Changes on disk show up live.</p>
            </button>
            <div className={`rounded-[8px] border border-dashed p-4 ${dragging ? 'border-text bg-hover' : 'border-border-strong'}`}>
              <Upload className="size-5 text-muted" strokeWidth={1.6} aria-hidden />
              <p className="mt-2.5 text-[14px] font-medium">Drop Markdown files or a folder</p>
              <p className="mt-0.5 text-[13px] text-muted">
                Copied into your library. Or choose{' '}
                <button onClick={() => folderInput.current?.click()} className="underline underline-offset-2 hover:text-text cursor-pointer">a folder</button>
                {' / '}
                <button onClick={() => filesInput.current?.click()} className="underline underline-offset-2 hover:text-text cursor-pointer">files</button>.
              </p>
              <input ref={filesInput} type="file" multiple accept=".md,.markdown,.txt,.png,.jpg,.jpeg,.gif,.webp" hidden onChange={(e) => send(fromInput(e.target.files))} />
              <input ref={folderInput} type="file" hidden {...{ webkitdirectory: '' }} onChange={(e) => send(fromInput(e.target.files))} />
            </div>
          </div>
        )}
        {canFs && (
          <p className="mt-4 text-[13.5px] text-muted">
            Or <button onClick={() => void startImport()} className="underline underline-offset-2 hover:text-text cursor-pointer">import a PDF, a web page, an Anki deck or a notebook</button> into your library.
          </p>
        )}
        {upload.isPending && <div className="mt-4"><Spinner label="Copying files…" /></div>}
        {upload.error && <ErrorNote error={upload.error} />}
        {openFolder.error && <ErrorNote error={openFolder.error} />}

        <section className="mt-10" aria-labelledby="recents">
          <h2 id="recents" className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted"><Clock className="size-3.5" aria-hidden />Recent</h2>
          {recents.isLoading && <div className="mt-3"><Spinner /></div>}
          {recents.data?.length === 0 && <p className="mt-3 text-[13.5px] text-muted">Folders you open appear here.</p>}
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {recents.data?.map((w) => (
              <li key={w.id}>
                <a href={`/w/${w.id}`} onClick={(e) => { e.preventDefault(); navigate(`/w/${w.id}`) }} className="flex items-center gap-3 px-1 py-2.5 hover:bg-hover">
                  <FileText className="size-4 shrink-0 text-subtle" strokeWidth={1.7} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{w.name}</span>
                    {w.root && <span className="block truncate text-[12px] text-muted">{w.root}</span>}
                  </span>
                  <span className="shrink-0 text-right tabular text-[12px] text-muted">{w.docs} docs{w.lessons ? ` · ${w.lessons} lessons` : ''}<br />{ago(w.lastOpened)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {browsing && <OpenFolderDialog onClose={() => setBrowsing(false)} onOpen={(path) => openFolder.mutate(path, { onSuccess: (r) => { setBrowsing(false); navigate(`/w/${r.id}`) } })} busy={openFolder.isPending} />}
    </div>
  )
}
