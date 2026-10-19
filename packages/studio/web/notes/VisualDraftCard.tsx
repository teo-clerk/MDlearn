// A visual drafted by the local model for the selected passage, already checked by the compiler.
// Nothing is written until you choose: insert it under the passage, or copy the Markdown.
import { useEffect, useState } from 'react'
import { Check, ClipboardCopy, Loader2, RotateCcw, TriangleAlert } from 'lucide-react'
import { notesApi, type VisualDraft } from '../api/queries'
import { useNotesUi } from './store'
import { VisualBlock } from '../visuals/VisualBlock'
import { Button } from '../ui/primitives'

type Kind = 'auto' | 'plot' | 'formula' | 'animate'
export function VisualDraftCard({ ws, doc, mtime }: { ws: string; doc: string; mtime: number }) {
  const { draft, setDraft } = useNotesUi()
  const [kind, setKind] = useState<Kind>('auto')
  const [r, setR] = useState<VisualDraft | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    if (!draft) return
    let live = true
    setBusy(true); setError(null); setR(null)
    notesApi.visualise(ws, doc, draft.anchor, kind).then((x) => { if (live) setR(x) }).catch((e: Error) => { if (live) setError(e.message) }).finally(() => { if (live) setBusy(false) })
    return () => { live = false }
  }, [draft, kind, ws, doc, nonce])
  if (!draft) return null
  const clean = r?.block && !r.diagnostics.length
  return (
    <div className="rounded-[8px] border border-border-strong bg-raised p-3 text-[13px] shadow-pop">
      <blockquote className="line-clamp-2 border-l border-border-strong pl-2 text-[12.5px] text-muted">{draft.anchor.quote.exact}</blockquote>
      {busy && <p className="mt-3 flex items-center gap-2 text-muted"><Loader2 className="size-4 animate-spin" aria-hidden />Drafting a {kind === 'auto' ? 'visual' : kind} with the local AI, checked by the compiler…</p>}
      {error && <p className="mt-2 text-bad" role="alert">{error}</p>}
      {r && !busy && (
        <>
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted">
            {clean ? <><Check className="size-3.5 text-good" aria-hidden />Checks pass</> : <><TriangleAlert className="size-3.5 text-warn" aria-hidden />{r.block ? `${r.diagnostics.length} problem(s) left` : 'No usable visual'}</>}
            <span>· {r.attempts} {r.attempts === 1 ? 'attempt' : 'attempts'}</span>
          </p>
          {r.block && <div className="-mx-1 [&_figure]:my-2 [&_figure]:px-2.5"><VisualBlock b={r.block} /></div>}
          {!clean && r.diagnostics.length > 0 && <ul className="mt-1 text-[12px] text-warn">{r.diagnostics.slice(0, 4).map((d, i) => <li key={i}>{d.code} {d.message}</li>)}</ul>}
          {done ? <p className="mt-2 text-[12.5px]" role="status">{done}</p> : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.block && <Button size="sm" variant="primary" onClick={async () => {
                try { const x = await notesApi.insert(ws, doc, draft.anchor.quote.exact, r.markdown, mtime); setDone(`Inserted at line ${x.line}. The page updates in a moment.`); setTimeout(() => setDraft(null), 1800) } catch (e) { setError((e as Error).message) }
              }}>Insert below the passage</Button>}
              <Button size="sm" variant="ghost" icon={ClipboardCopy} onClick={async () => { await navigator.clipboard?.writeText(r.markdown).catch(() => {}); setDone('Markdown copied.') }}>Copy</Button>
            </div>
          )}
        </>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-border pt-2 text-[12px] text-muted">
        <span className="mr-1">Try</span>
        {(['plot', 'formula', 'animate'] as const).map((k) => (
          <button key={k} disabled={busy} onClick={() => setKind(k)} className={`rounded-[5px] px-1.5 py-0.5 hover:bg-hover disabled:opacity-40 cursor-pointer ${kind === k ? 'bg-active text-text' : ''}`}>{k === 'animate' ? 'animation' : k}</button>
        ))}
        <button disabled={busy} onClick={() => setNonce((n) => n + 1)} aria-label="Draft again" className="ml-auto rounded-[5px] p-1 hover:bg-hover disabled:opacity-40 cursor-pointer"><RotateCcw className="size-3.5" aria-hidden /></button>
        <button onClick={() => setDraft(null)} className="rounded-[5px] px-1.5 py-0.5 hover:bg-hover cursor-pointer">Close</button>
      </div>
    </div>
  )
}
