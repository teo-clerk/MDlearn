// Pick a folder on this computer (browsers cannot hand a folder path to a page, so the server lists them).
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUp, Folder, GraduationCap, X } from 'lucide-react'
import { browseFolders } from '../api/queries'
import { Button, IconButton, Spinner } from '../ui/primitives'

export function OpenFolderDialog({ onClose, onOpen, busy }: { onClose(): void; onOpen(path: string): void; busy: boolean }) {
  const [path, setPath] = useState<string | undefined>(undefined)
  const [typed, setTyped] = useState('')
  const dlg = useRef<HTMLDialogElement>(null)
  const q = useQuery({ queryKey: ['browse', path ?? ''], queryFn: () => browseFolders(path) })
  useEffect(() => { dlg.current?.showModal() }, [])
  useEffect(() => { if (q.data) setTyped(q.data.path) }, [q.data])
  return (
    <dialog ref={dlg} onClose={onClose} aria-labelledby="open-title"
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-[10px] border border-border bg-raised p-0 text-text shadow-pop backdrop:bg-black/30">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 id="open-title" className="text-[14px] font-semibold">Open a folder</h2>
        <IconButton icon={X} label="Close" onClick={() => dlg.current?.close()} />
      </div>
      <form className="flex gap-2 px-4 pt-3" onSubmit={(e) => { e.preventDefault(); setPath(typed) }}>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Folder path" spellCheck={false}
          className="h-8 min-w-0 flex-1 rounded-[6px] border border-border-strong bg-bg px-2.5 font-mono text-[12.5px] outline-none focus:border-text" />
        <Button type="submit" size="sm">Go</Button>
      </form>
      <div className="h-[340px] overflow-y-auto px-2 py-2">
        {q.isLoading && <div className="p-3"><Spinner /></div>}
        {q.error && <p className="p-3 text-[13px] text-bad">{(q.error as Error).message}</p>}
        {q.data?.parent && (
          <button onClick={() => setPath(q.data!.parent!)} className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13.5px] text-muted hover:bg-hover cursor-pointer">
            <ArrowUp className="size-4" strokeWidth={1.8} aria-hidden />Up one level
          </button>
        )}
        {q.data?.entries.length === 0 && <p className="p-3 text-[13px] text-muted">No subfolders here.</p>}
        {q.data?.entries.map((e) => (
          <button key={e.path} onClick={() => setPath(e.path)} onDoubleClick={() => onOpen(e.path)}
            className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13.5px] hover:bg-hover cursor-pointer">
            <Folder className="size-4 shrink-0 text-muted" strokeWidth={1.7} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{e.name}</span>
            {e.hasLearn && <GraduationCap className="size-3.5 shrink-0 text-muted" aria-label="has lessons" />}
            {e.mdFiles > 0 && <span className="shrink-0 tabular text-[12px] text-muted">{e.mdFiles} .md</span>}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
        <p className="min-w-0 truncate font-mono text-[12px] text-muted">{q.data?.path}</p>
        <Button variant="primary" busy={busy} disabled={!q.data} onClick={() => q.data && onOpen(q.data.path)}>Open this folder</Button>
      </div>
    </dialog>
  )
}
