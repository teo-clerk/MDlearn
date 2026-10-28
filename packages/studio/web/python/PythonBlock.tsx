// A ```python block in a document that you can run, edit and run again. Cells share one interpreter.
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { ChevronsDown, Loader2, Pencil, Play, RotateCcw } from 'lucide-react'
import { python, usePython, type RunOutput } from './runtime'
import { t } from '../i18n'

const CodeBlock = lazy(() => import('../prose/CodeBlock'))
const registry = new Map<HTMLElement, () => string>()

export function PythonBlock({ code }: { code: string }) {
  const root = useRef<HTMLElement>(null)
  const [src, setSrc] = useState(code)
  const [editing, setEditing] = useState(false)
  const [output, setOutput] = useState<RunOutput[]>([])
  const [figures, setFigures] = useState<string[]>([])
  const [value, setValue] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ran, setRan] = useState(false)
  const [mine, setMine] = useState(false)
  const status = usePython()
  const srcRef = useRef(src)
  srcRef.current = src
  useEffect(() => { setSrc(code) }, [code])
  useEffect(() => { const el = root.current; if (!el) return; registry.set(el, () => srcRef.current); return () => { registry.delete(el) } }, [])

  const run = async (text = srcRef.current, quiet = false) => {
    setMine(true); setOutput([]); setFigures([]); setValue(null); setError(null); setRan(true)
    const r = await python.run(text, quiet ? undefined : (o) => setOutput((x) => [...x, o]))
    if (quiet) setOutput(r.output)
    setFigures(r.figures); setValue(r.value); setError(r.error); setMine(false)
  }
  /** Earlier blocks on the page first (like running a notebook down to here), then this one. */
  const runAbove = async () => {
    const all = [...registry.keys()].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    for (const el of all) { if (el === root.current) break; const r = await python.run(registry.get(el)!()); if (r.error) { setError(`${t('An earlier block failed:')}\n${r.error}`); setRan(true); return } }
    await run()
  }
  const busy = mine && status.state !== 'idle'
  const btn = 'inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[12.5px] font-medium text-muted hover:bg-hover hover:text-text disabled:opacity-40 cursor-pointer'
  return (
    <figure ref={root} data-py className="not-prose my-5 overflow-hidden rounded-[8px] border border-border bg-code font-ui focus-within:border-focus">
      {editing
        ? <textarea value={src} onChange={(e) => setSrc(e.target.value)} spellCheck={false} aria-label={t('Python code')} rows={Math.min(24, src.split('\n').length + 1)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.shiftKey || e.ctrlKey || e.metaKey)) { e.preventDefault(); void run() } }}
            className="block w-full resize-y bg-transparent px-3.5 py-3 font-mono text-[13px] leading-[1.6] outline-none" />
        : <Suspense fallback={<pre className="code"><code>{src}</code></pre>}><CodeBlock code={src} lang="python" bare /></Suspense>}
      <div className="flex items-center gap-0.5 border-t border-border bg-bg/60 px-1.5 py-1">
        <button className={btn} onClick={() => void run()} disabled={busy} aria-label={t('Run this block')}>{busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Play className="size-3.5" aria-hidden />}{t('Run')}</button>
        <button className={btn} onClick={() => void runAbove()} disabled={busy} title={t('Run the earlier Python blocks on this page first, then this one')}><ChevronsDown className="size-3.5" aria-hidden />{t('Run from the top')}</button>
        <button className={btn} onClick={() => setEditing((e) => !e)} aria-pressed={editing}><Pencil className="size-3.5" aria-hidden />{editing ? t('Done editing') : t('Edit')}</button>
        <button className={btn} onClick={() => { python.restart(); setOutput([]); setFigures([]); setValue(null); setError(null); setRan(false) }} title={t('Forget all variables')}><RotateCcw className="size-3.5" aria-hidden />{t('Restart')}</button>
        {busy && <span className="ml-auto pr-2 text-[12px] text-muted" role="status">{status.status || t('Working…')}</span>}
        {!busy && editing && <span className="ml-auto pr-2 text-[11.5px] text-subtle">{t('Shift+Enter runs')}</span>}
      </div>
      {ran && (output.length > 0 || figures.length > 0 || value !== null || error) && (
        <div className="border-t border-border bg-bg px-3.5 py-2.5 text-[13px]" aria-live="polite">
          {output.length > 0 && <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-[1.55]">{output.map((o, i) => <span key={i} className={o.stream === 'stderr' ? 'text-bad' : ''}>{o.text}{'\n'}</span>)}</pre>}
          {value !== null && <pre className="whitespace-pre-wrap font-mono text-[12.5px] text-muted">{value}</pre>}
          {figures.map((f, i) => <img key={i} src={`data:image/png;base64,${f}`} alt={`Figure ${i + 1} drawn by the code`} className="mt-2 max-w-full rounded-[6px] bg-white" />)}
          {error && <pre role="alert" className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap font-mono text-[12px] leading-[1.5] text-bad">{friendly(error)}</pre>}
        </div>
      )}
    </figure>
  )
}
/** A Python traceback without the interpreter's own frames, and a hint when a library is missing. */
export function friendly(err: string): string {
  const lines = err.trim().split('\n')
  const kept: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*File "[^"]*(_pyodide|python3\d+\.zip)[^"]*"/.test(lines[i])) { // an interpreter frame and the source lines under it
      while (i + 1 < lines.length && /^\s{3,}/.test(lines[i + 1])) i++
      continue
    }
    kept.push(lines[i].replace(/File "<exec>", /, ''))
  }
  const missing = /ModuleNotFoundError: No module named '([^']+)'/.exec(err)
  const tail = kept.length > 12 ? ['…', ...kept.slice(-11)].join('\n') : kept.join('\n')
  return missing ? `${tail}\n\n“${missing[1].split('.')[0]}” is not available in the browser. numpy, scipy, pandas, matplotlib, scikit-learn, xarray, rasterio, geopandas, shapely and about 300 more are; deep-learning frameworks (torch, tensorflow) are not.` : tail
}
