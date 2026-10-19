// "New note": asks for a name (and folder), creates the file and opens it in the editor.
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { fileApi } from '../api/queries'
import { Button } from '../ui/primitives'

const titleOf = (path: string) => path.split('/').pop()!.replace(/\.md$/i, '').replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase())

export function NewNote({ ws, folder, onClose }: { ws: string; folder: string; onClose: () => void }) {
  const [name, setName] = useState(`${folder ? `${folder}/` : ''}untitled.md`)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [, navigate] = useLocation()
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus(); input.current?.setSelectionRange(name.lastIndexOf('/') + 1, name.length - 3) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const create = async () => {
    const path = /\.md$/i.test(name.trim()) ? name.trim() : `${name.trim()}.md`
    setBusy(true); setError(null)
    try { await fileApi.create(ws, path, `# ${titleOf(path)}\n\n`); onClose(); navigate(`/w/${ws}/edit?path=${encodeURIComponent(path)}`) }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 px-4 pt-[16vh]" onMouseDown={onClose}>
      <form role="dialog" aria-modal="true" aria-label="New note" onMouseDown={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void create() }}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
        className="w-full max-w-md rounded-[10px] border border-border bg-raised p-4 shadow-pop">
        <h2 className="text-[15px] font-semibold">New note</h2>
        <label className="mt-3 block text-[12.5px] text-muted" htmlFor="new-note-name">File name, with a folder if you like</label>
        <input id="new-note-name" ref={input} value={name} onChange={(e) => setName(e.target.value)} spellCheck={false}
          className="mt-1 h-9 w-full rounded-[6px] border border-border-strong bg-bg px-3 font-mono text-[13px] outline-none focus:border-focus" />
        {error && <p role="alert" className="mt-2 text-[13px] text-bad">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!name.trim()}>Create and edit</Button>
        </div>
      </form>
    </div>
  )
}
