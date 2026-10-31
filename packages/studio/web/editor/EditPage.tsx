// Edit a Markdown file beside its preview. Saves never overwrite a change made elsewhere; the last 20
// versions are kept and can be brought back.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Redirect, useLocation, useSearch } from 'wouter'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, History, Plus, Save } from 'lucide-react'
import type { Checked, WebAnswer } from '@mdlearn/core'
import { fileApi, keys, useSession, useTree } from '../api/queries'
import { useUi } from '../state/ui'
import type { FileInfo, HistoryEntry, PreviewResponse } from '../../shared/types'
import { TopActions, TopLeft } from '../layout/Shell'
import { Button, Empty, ErrorNote, Spinner } from '../ui/primitives'
import { Menu, MenuItem, MenuLabel } from '../ui/Menu'
import { DocBlocks, type BlockEnv } from '../reader/DocBlocks'
import { LessonArticle } from '../lesson/LessonArticle'
import { assetUrl, docRoute, latexRoute, lessonRoute } from '../lib/paths'
import { useDebounced } from '../lib/hooks'
import { Editor, type EditorHandle, type Problem } from './Editor'
import { snippetsFor, type Snippet } from './snippets'
import { t, locale } from '../i18n'

type Status = 'clean' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error'
const PREVIEW_DELAY = 450
const at = (ms: number) => new Date(ms).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function EditPage({ ws }: { ws: string }) {
  const path = new URLSearchParams(useSearch()).get('path') ?? undefined
  const [file, setFile] = useState<FileInfo | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  useEffect(() => {
    setFile(null); setLoadError(null)
    if (path) fileApi.get(ws, path).then(setFile, setLoadError)
  }, [ws, path])
  if (!path) return <Empty title={t('No file selected')}>{t('Choose a file in the sidebar, then Edit.')}</Empty>
  if (loadError) return <ErrorNote error={loadError} />
  if (!file) return <div className="p-10"><Spinner label={t('Opening file')} /></div>
  if (file.kind === 'latex') return <Redirect to={latexRoute(ws, file.path)} replace />
  return <Workbench key={`${ws}:${path}`} ws={ws} initial={file} />
}

function Workbench({ ws, initial }: { ws: string; initial: FileInfo }) {
  const { path } = initial
  const kind = initial.kind === 'lesson' ? 'lesson' : 'doc'
  const [, navigate] = useLocation()
  const qc = useQueryClient()
  const session = useSession()
  const tree = useTree(ws)
  const handle = useRef<EditorHandle>(null)
  const notify = useUi((u) => u.notify)
  const addPicture = async (file: File) => {
    try { return (await fileApi.picture(ws, path, file)).url } catch (e) { notify((e as Error).message); return null }
  }
  const [text, setText] = useState(initial.text)
  const savedText = useRef(initial.text)
  const baseMtime = useRef(initial.mtime)
  const [status, setStatus] = useState<Status>('clean')
  const [error, setError] = useState<string | null>(null)
  const [restored, setRestored] = useState<string | null>(null)
  const [pane, setPane] = useState<'write' | 'preview'>('write')
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [checksOpen, setChecksOpen] = useState(false)
  const dirty = text !== savedText.current
  const canWrite = !!session.data?.caps.includes('write')
  const back = kind === 'lesson' ? lessonRoute(ws, path) : docRoute(ws, path)

  // ---- preview of what is typed (the last good one stays while the next is computed)
  const delayed = useDebounced(text, PREVIEW_DELAY)
  useEffect(() => {
    let current = true
    fileApi.preview(ws, path, delayed).then((r) => { if (current) { setPreview(r); setPreviewError(null) } }, (e: Error) => { if (current) setPreviewError(e.message) })
    return () => { current = false }
  }, [ws, path, delayed])
  const problems = useMemo<Problem[]>(() => (preview?.diagnostics ?? []).filter((d) => /^[EW]/.test(d.code)).map((d) => ({ line: d.line, severity: d.code.startsWith('E') ? 'error' : 'warning', message: `${d.code}${d.message ? `: ${d.message}` : ''}` })), [preview])
  const errors = problems.filter((p) => p.severity === 'error').length

  // ---- saving
  const save = useCallback(async (overwrite = false) => {
    if (!canWrite) return
    setStatus('saving'); setError(null)
    try {
      const r = await fileApi.save(ws, { path, text, baseMtime: baseMtime.current, ...(overwrite ? { overwrite: true } : {}) })
      savedText.current = text; baseMtime.current = r.mtime; setRestored(null)
      setStatus('saved'); setTimeout(() => setStatus((s) => (s === 'saved' ? 'clean' : s)), 1800)
      void qc.invalidateQueries({ queryKey: keys.tree(ws) })
    } catch (e) {
      const err = e as Error & { code?: string }
      if (err.code === 'conflict') setStatus('conflict'); else { setStatus('error'); setError(err.message) }
    }
  }, [canWrite, text, ws, path, qc])
  const saveRef = useRef(save); saveRef.current = save
  useEffect(() => { setStatus((s) => (s === 'saving' || s === 'conflict' || s === 'error' ? s : text !== savedText.current ? 'dirty' : s === 'saved' ? s : 'clean')) }, [text])

  // ---- the file changed somewhere else while this tab was in the background
  useEffect(() => {
    const check = async () => {
      try {
        const now = await fileApi.get(ws, path)
        if (Math.abs(now.mtime - baseMtime.current) <= 1) return
        if (text === savedText.current) { savedText.current = now.text; baseMtime.current = now.mtime; handle.current?.setText(now.text); setText(now.text) } else setStatus('conflict')
      } catch { /* the file is gone or unreadable: saving will say so */ }
    }
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [ws, path, text])
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
  const leave = () => { if (!dirty || window.confirm(t('Leave without saving your changes?'))) navigate(back) }
  const insert = (s: Snippet) => handle.current?.insert(s.text)
  const [versions, setVersions] = useState<HistoryEntry[] | null>(null)
  const restore = async (v: HistoryEntry) => {
    const r = await fileApi.version(ws, path, v.id)
    handle.current?.setText(r.text); setText(r.text); setRestored(at(v.at))
  }

  const env = useMemo<BlockEnv>(() => ({
    cx: { imageSrc: (url) => assetUrl(ws, path, url), linkTo: () => null },
    check: async (_id: string, _a: WebAnswer): Promise<Checked> => { throw new Error(t('Save the file to try its questions.')) },
  }), [ws, path])
  const source = tree.data?.docs.find((d) => d.lessons.some((l) => l.path === path))

  const statusText = { clean: t('Saved'), dirty: t('Unsaved changes'), saving: t('Saving…'), saved: t('Saved'), conflict: t('Changed elsewhere'), error: t('Not saved') }[status]
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopLeft>
        <nav aria-label={t('File')} className="flex min-w-0 items-center gap-2 px-1 text-[13px]">
          <span className="truncate text-muted">{path}</span>
          <span role="status" className={`shrink-0 text-[12px] ${status === 'dirty' || status === 'conflict' || status === 'error' ? 'text-warn' : 'text-subtle'}`}>{statusText}</span>
        </nav>
      </TopLeft>
      <TopActions>
        <Menu label={t('Insert')} icon={Plus}>
          {(close) => ([t('Questions'), t('Visuals'), t('Text')] as const).map((g) => {
            const items = snippetsFor(kind).filter((s) => s.group === g)
            return items.length ? <div key={g}><MenuLabel>{g}</MenuLabel>{items.map((s) => <MenuItem key={s.id} hint={s.hint} onClick={() => { insert(s); close() }}>{s.label}</MenuItem>)}</div> : null
          })}
        </Menu>
        <Menu label={t('History')} icon={History} onOpen={() => { setVersions(null); fileApi.history(ws, path).then(setVersions, () => setVersions([])) }}>
          {(close) => (
            <>
              <MenuLabel>{t('Earlier versions')}</MenuLabel>
              {versions === null && <p className="px-2.5 py-2 text-[12.5px] text-muted">{t('Loading…')}</p>}
              {versions?.length === 0 && <p className="px-2.5 py-2 text-[12.5px] text-muted">{t('Each save keeps the version before it. None yet.')}</p>}
              {versions?.map((v) => <MenuItem key={v.id} hint={`${(v.size / 1024).toFixed(1)} kB`} onClick={() => { void restore(v); close() }}>{at(v.at)}</MenuItem>)}
            </>
          )}
        </Menu>
        <Button size="sm" variant="primary" icon={status === 'saved' ? Check : Save} busy={status === 'saving'} disabled={!dirty || !canWrite} onClick={() => void save()}>{t('Save')}</Button>
        <Button size="sm" variant="ghost" onClick={leave}>{t('Done')}</Button>
      </TopActions>

      {status === 'conflict' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-border bg-warn-soft px-4 py-2 text-[13px]">
          <AlertTriangle className="size-4 text-warn" aria-hidden /><span className="flex-1">{t('This file changed on disk after you opened it. Saving now would overwrite that change.')}</span>
          <Button size="sm" onClick={() => void reloadFromDisk()}>{t('Load the file as it is now')}</Button>
          <Button size="sm" variant="secondary" onClick={() => void save(true)}>{t('Save mine over it')}</Button>
        </div>
      )}
      {status === 'error' && error && <p role="alert" className="border-b border-border bg-bad-soft px-4 py-2 text-[13px]">{error}</p>}
      {restored && <p role="status" className="border-b border-border bg-panel px-4 py-1.5 text-[12.5px] text-muted">{t('Showing the version from {when}. Save to keep it, or Undo (Ctrl+Z) to go back.', { when: restored })}</p>}

      <div className="flex shrink-0 gap-1 border-b border-border px-3 py-1.5 min-[1100px]:hidden" role="tablist" aria-label={t('Editor view')}>
        {(['write', 'preview'] as const).map((p) => <button key={p} role="tab" aria-selected={pane === p} onClick={() => setPane(p)} className={`h-7 rounded-[6px] px-3 text-[12.5px] font-medium cursor-pointer ${pane === p ? 'bg-active' : 'text-muted hover:bg-hover'}`}>{p === 'write' ? t('Write') : t('Preview')}</button>)}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 min-[1100px]:grid-cols-2">
        <section aria-label={t('Source')} className={`${pane === 'write' ? 'flex' : 'hidden'} min-h-0 flex-col border-border min-[1100px]:flex min-[1100px]:border-r`}>
          <div className="min-h-0 flex-1 px-3">
            <Editor ref={handle} initial={initial.text} onChange={setText} onSave={() => void saveRef.current()} onPicture={addPicture} problems={problems} ariaLabel={t('Markdown source of {path}', { path })} />
          </div>
          <div className="shrink-0 border-t border-border px-3 py-1.5 text-[12.5px]">
            <button type="button" onClick={() => setChecksOpen((o) => !o)} aria-expanded={checksOpen} className="inline-flex items-center gap-2 text-muted hover:text-text cursor-pointer">
              {problems.length === 0 ? <span>{t('No problems found')}</span> : <span className="tabular">{errors > 0 ? `${errors} ${errors === 1 ? 'error' : 'errors'}` : ''}{errors > 0 && problems.length > errors ? ', ' : ''}{problems.length > errors ? `${problems.length - errors} warnings` : ''}</span>}
            </button>
            {checksOpen && problems.length > 0 && (
              <ul className="mt-1 max-h-40 overflow-y-auto">{problems.map((p, i) => <li key={i}><button type="button" onClick={() => handle.current?.jumpTo(p.line)} className="flex w-full gap-2 rounded px-1 py-0.5 text-left hover:bg-hover cursor-pointer"><span className="w-10 shrink-0 tabular text-subtle">line {p.line}</span><span className={p.severity === 'error' ? 'text-bad' : 'text-warn'}>{p.message}</span></button></li>)}</ul>
            )}
          </div>
        </section>
        <section aria-label={t('Preview')} className={`${pane === 'preview' ? 'block' : 'hidden'} min-h-0 overflow-y-auto bg-bg min-[1100px]:block`}>
          {previewError && <p role="alert" className="m-4 text-[13px] text-bad">{previewError}</p>}
          {!preview && !previewError && <div className="p-6"><Spinner label={t('Preparing the preview')} /></div>}
          {preview?.kind === 'doc' && preview.doc && (
            <article className="mx-auto max-w-[760px] px-5 pb-16 pt-2" lang={typeof preview.doc.frontmatter?.lang === 'string' ? preview.doc.frontmatter.lang : undefined}>
              <div className="read"><DocBlocks blocks={preview.doc.blocks} env={env} /></div>
            </article>
          )}
          {preview?.kind === 'lesson' && (preview.lesson?.lesson
            ? <LessonArticle ws={ws} lesson={preview.lesson.lesson} source={source ? { path: source.path, title: source.title } : undefined} env={env} compact />
            : <Empty title={t('This lesson cannot be shown yet')}>{t('Fix the errors listed under the editor.')}</Empty>)}
        </section>
      </div>
    </div>
  )
}
