// LaTeX: write a .tex file on the left, see its PDF on the right (tabs on a phone). Compile saves first, and
// Ctrl+S does both. Errors come back with their line (click to go there) and a sentence on what usually causes
// them; the last good PDF stays on screen meanwhile.
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useLocation, useSearch } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Ellipsis, Play } from 'lucide-react'
import { fileApi, latexApi, useSession } from '../api/queries'
import type { FileInfo, TexHint, TexProblem, TexResult, TexStatus } from '../../shared/types'
import { TopActions, TopLeft } from '../layout/Shell'
import { Button, Empty, ErrorNote, Spinner } from '../ui/primitives'
import { Menu, MenuItem } from '../ui/Menu'
import { Editor, type EditorHandle, type Problem } from '../editor/Editor'
import { latexLanguage } from './language'
import { t, tp } from '../i18n'

const PdfView = lazy(() => import('./PdfView'))
type Status = 'clean' | 'saving' | 'compiling' | 'conflict' | 'error'
const WIDE = '(min-width: 1100px)'

const HINTS: Record<TexHint, () => string> = {
  'undefined-command': () => t('A command is misspelled, or its package is not loaded with \\usepackage.'),
  'math-mode': () => t('Math such as ^, _ or \\alpha must be inside $…$.'),
  'missing-file': () => t('A file or a package was not found: check its name, or install the package.'),
  braces: () => t('A { or a } is missing or extra.'),
  'undefined-environment': () => t('This environment does not exist, or its package is not loaded.'),
  'begin-end': () => t('A \\begin{…} is closed by a different \\end{…}.'),
  alignment: () => t('& separates columns, only in a table or an aligned equation. Write \\& for the sign itself.'),
  timeout: () => t('The document took too long: look for a loop or a very large picture.'),
}

/** A path relative to the compiled file's folder, as a folder path ("a/./b/../c.tex" → "a/c.tex"). */
function within(dir: string, file: string): string {
  const out: string[] = []
  for (const s of `${dir}${file}`.split('/')) { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s) }
  return out.join('/')
}

export default function LatexPage({ ws }: { ws: string }) {
  const path = new URLSearchParams(useSearch()).get('path') ?? undefined
  const [file, setFile] = useState<FileInfo | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  useEffect(() => {
    setFile(null); setLoadError(null)
    if (path) fileApi.get(ws, path).then(setFile, setLoadError)
  }, [ws, path])
  if (!path) return <Empty title={t('No file selected')}>{t('Choose a .tex file in the sidebar.')}</Empty>
  if (loadError) return <ErrorNote error={loadError} />
  if (!file) return <div className="p-10"><Spinner label={t('Opening file')} /></div>
  return <TexWorkbench key={`${ws}:${path}`} ws={ws} initial={file} />
}

function TexWorkbench({ ws, initial }: { ws: string; initial: FileInfo }) {
  const { path } = initial
  const [, navigate] = useLocation()
  const session = useSession()
  const canWrite = !!session.data?.caps.includes('write')
  const engines = useQuery({ queryKey: ['latex-status'], queryFn: () => latexApi.status(), enabled: canWrite })
  const [checking, setChecking] = useState(false)
  const handle = useRef<EditorHandle>(null)
  const [language] = useState(latexLanguage)
  const [text, setText] = useState(initial.text)
  const savedText = useRef(initial.text)
  const baseMtime = useRef(initial.mtime)
  const [status, setStatus] = useState<Status>('clean')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [result, setResult] = useState<(TexResult & { target: string }) | null>(null)
  const [pane, setPane] = useState<'source' | 'pdf'>('source')
  const [problemsOpen, setProblemsOpen] = useState(true)
  const dirty = text !== savedText.current
  const target = result?.target ?? path
  const dir = target.includes('/') ? target.slice(0, target.lastIndexOf('/') + 1) : ''
  const pathOf = (p: TexProblem) => (p.file ? within(dir, p.file) : target)
  const problems = result?.problems ?? []
  const errors = problems.filter((p) => p.severity === 'error').length
  const here: Problem[] = problems.filter((p) => p.line && pathOf(p) === path).map((p) => ({ line: p.line!, severity: p.severity, message: p.message }))
  const noEngine = !!engines.data && !engines.data.engines.length

  const compile = async (overwrite = false) => {
    if (!canWrite || status === 'saving' || status === 'compiling') return
    setError(null); setNotice(null)
    try {
      const now = text
      if (now !== savedText.current || overwrite) {
        setStatus('saving')
        const r = await fileApi.save(ws, { path, text: now, baseMtime: baseMtime.current, ...(overwrite ? { overwrite: true } : {}) })
        savedText.current = now; baseMtime.current = r.mtime
      }
      setStatus('compiling')
      const r = await latexApi.compile(ws, path)
      setResult(r); setStatus('clean'); setProblemsOpen(!r.ok)
      if (r.ok && !window.matchMedia(WIDE).matches) setPane('pdf')
    } catch (e) {
      const err = e as Error & { code?: string }
      if (err.code === 'conflict') setStatus('conflict'); else { setStatus('error'); setError(err.message) }
    }
  }
  const compileRef = useRef(compile); compileRef.current = compile

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const reloadFromDisk = async () => {
    const now = await fileApi.get(ws, path)
    savedText.current = now.text; baseMtime.current = now.mtime; handle.current?.setText(now.text); setText(now.text); setStatus('clean')
  }
  const savePdf = async () => {
    try { setNotice(t('Saved {file} next to the .tex file.', { file: (await latexApi.savePdf(ws, target)).path })) } catch (e) { setError((e as Error).message) }
  }
  const go = (p: TexProblem) => {
    const file = pathOf(p)
    if (file === path) { setPane('source'); if (p.line) handle.current?.jumpTo(p.line) } else navigate(`/w/${ws}/latex?path=${encodeURIComponent(file)}`)
  }
  const statusText = status === 'saving' ? t('Saving…') : status === 'compiling' ? t('Compiling…') : status === 'conflict' ? t('Changed on disk') : status === 'error' ? t('Not compiled')
    : dirty ? t('Unsaved changes') : result ? (result.ok ? t('Compiled in {s} s', { s: (result.ms / 1000).toFixed(1) }) : tp(errors, '{n} error', '{n} errors')) : ''

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopLeft>
        <nav aria-label={t('File')} className="flex min-w-0 items-center gap-2 px-1 text-[13px]">
          <span className="truncate text-muted">{path}</span>
          <span role="status" className={`shrink-0 text-[12px] ${dirty || status === 'conflict' || status === 'error' || (result && !result.ok) ? 'text-warn' : 'text-subtle'}`}>{statusText}</span>
        </nav>
      </TopLeft>
      <TopActions>
        <Menu iconOnly label={t('PDF')} icon={Ellipsis}>
          {(close) => (
            <>
              <MenuItem onClick={() => { close(); window.location.assign(latexApi.pdfUrl(ws, target, { download: true })) }}>{t('Download the PDF')}</MenuItem>
              <MenuItem onClick={() => { close(); window.open(latexApi.pdfUrl(ws, target, { v: result?.pdf?.at }), '_blank', 'noopener') }}>{t('Open the PDF in a new tab')}</MenuItem>
              {canWrite && <MenuItem hint={t('{file}, replacing an earlier copy', { file: target.replace(/\.tex$/i, '.pdf') })} onClick={() => { close(); void savePdf() }}>{t('Save the PDF next to the file')}</MenuItem>}
            </>
          )}
        </Menu>
        {canWrite && <Button size="sm" variant="primary" icon={Play} busy={status === 'saving' || status === 'compiling'} disabled={noEngine} title={t('Save and compile (Ctrl+S)')} onClick={() => void compile()}>{t('Compile')}</Button>}
      </TopActions>

      {status === 'conflict' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-border bg-warn-soft px-4 py-2 text-[13px]">
          <AlertTriangle className="size-4 text-warn" aria-hidden /><span className="flex-1">{t('This file changed on disk after you opened it. Saving now would overwrite that change.')}</span>
          <Button size="sm" onClick={() => void reloadFromDisk()}>{t('Load the file as it is now')}</Button>
          <Button size="sm" variant="secondary" onClick={() => void compile(true)}>{t('Save mine over it')}</Button>
        </div>
      )}
      {status === 'error' && error && <p role="alert" className="border-b border-border bg-bad-soft px-4 py-2 text-[13px]">{error}</p>}
      {notice && <p role="status" className="border-b border-border bg-panel px-4 py-1.5 text-[12.5px] text-muted">{notice}</p>}

      <div className="flex shrink-0 gap-1 border-b border-border px-3 py-1.5 min-[1100px]:hidden" role="tablist" aria-label={t('Editor view')}>
        {(['source', 'pdf'] as const).map((p) => <button key={p} role="tab" aria-selected={pane === p} onClick={() => setPane(p)} className={`h-7 rounded-[6px] px-3 text-[12.5px] font-medium cursor-pointer ${pane === p ? 'bg-active' : 'text-muted hover:bg-hover'}`}>{p === 'source' ? t('Source') : t('PDF')}</button>)}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 min-[1100px]:grid-cols-2">
        <section aria-label={t('Source')} className={`${pane === 'source' ? 'flex' : 'hidden'} min-h-0 flex-col border-border min-[1100px]:flex min-[1100px]:border-r`}>
          <div className="min-h-0 flex-1 px-3">
            <Editor ref={handle} initial={initial.text} onChange={setText} onSave={() => void compileRef.current()} problems={here} language={language} ariaLabel={t('LaTeX source of {path}', { path })} />
          </div>
          {result && <Problems problems={problems} log={result.log} open={problemsOpen} setOpen={setProblemsOpen} pathOf={pathOf} go={go} />}
        </section>
        <section aria-label={t('PDF')} className={`${pane === 'pdf' ? 'block' : 'hidden'} min-h-0 min-[1100px]:block`}>
          {noEngine ? <InstallHelp install={engines.data!.install} checking={checking} onCheck={() => { setChecking(true); void latexApi.status(true).then(() => engines.refetch()).finally(() => setChecking(false)) }} />
            : <Suspense fallback={<div className="p-8"><Spinner /></div>}><PdfView url={latexApi.pdfUrl(ws, target, { v: result?.pdf?.at })} missing={<p className="text-[14px] text-muted">{canWrite ? t('Compile to see the PDF (Ctrl+S).') : t('No PDF yet. Compile on the computer running MDlearn Studio.')}</p>} /></Suspense>}
        </section>
      </div>
    </div>
  )
}

function Problems({ problems, log, open, setOpen, pathOf, go }: { problems: TexProblem[]; log: string; open: boolean; setOpen(o: boolean): void; pathOf(p: TexProblem): string; go(p: TexProblem): void }) {
  const errors = problems.filter((p) => p.severity === 'error').length
  const warnings = problems.length - errors
  const summary = !problems.length ? t('No problems found') : [errors ? tp(errors, '{n} error', '{n} errors') : '', warnings ? tp(warnings, '{n} warning', '{n} warnings') : ''].filter(Boolean).join(', ')
  return (
    <div className="max-h-[45%] shrink-0 overflow-y-auto border-t border-border px-3 py-1.5 text-[12.5px]">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={`inline-flex items-center gap-2 cursor-pointer hover:text-text ${errors ? 'text-bad' : 'text-muted'}`}>{summary}</button>
      {open && (
        <>
          {problems.length > 0 && (
            <ul className="mt-1 flex flex-col">
              {problems.map((p, i) => (
                <li key={i}>
                  <button type="button" onClick={() => go(p)} className="flex w-full gap-2 rounded px-1 py-0.5 text-left hover:bg-hover cursor-pointer">
                    <span className="w-28 shrink-0 truncate tabular text-subtle">{p.line ? `${pathOf(p).split('/').pop()}:${p.line}` : ''}</span>
                    <span className="min-w-0">
                      <span className={p.severity === 'error' ? 'text-bad' : 'text-warn'}>{p.message}</span>
                      {p.hint && <span className="block text-muted">{HINTS[p.hint]()}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <details className="mt-1.5">
            <summary className="cursor-pointer text-muted hover:text-text">{t('Full log')}</summary>
            <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded-[6px] bg-panel p-2 font-mono text-[11.5px] text-muted">{log}</pre>
          </details>
        </>
      )}
    </div>
  )
}

function InstallHelp({ install, checking, onCheck }: { install: TexStatus['install']; checking: boolean; onCheck(): void }) {
  return (
    <div className="mx-auto max-w-md px-6 py-10 text-[14px]">
      <h2 className="text-[15px] font-semibold">{t('No LaTeX engine on this computer yet')}</h2>
      <p className="mt-2 text-muted">{t('MDlearn compiles with Tectonic or TeX Live. Tectonic is one small program that downloads only the packages a document uses.')}</p>
      {install.command && (
        <>
          <p className="mt-4 text-[12.5px] text-muted">{t('Install it in a terminal:')}</p>
          <code className="mt-1 block select-all rounded-[6px] border border-border bg-raised px-3 py-2 font-mono text-[13px]">{install.command}</code>
        </>
      )}
      <p className="mt-3"><a href={install.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text">{t('Other ways to install it')}</a></p>
      <Button className="mt-5" busy={checking} onClick={onCheck}>{t('Check again')}</Button>
    </div>
  )
}
