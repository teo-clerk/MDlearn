// Any Markdown file, read comfortably: math, tables, diagrams, code, folded details, § numbers; plus the
// outline (and what you remember of each section) in the side panel, and the raw source on demand.
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useSearch } from 'wouter'
import { BookOpenCheck, Code2, Ellipsis, FileText, Pencil, Sparkles, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api, qs } from '../api/client'
import { keys, notesApi, useDoc, useEngines, useLinks, useNotes, useSectionMap, useSession, useTermHovers, useTree } from '../api/queries'
import { NotesPanel, useNoteHighlights } from '../notes/NotesPanel'
import { SelectionToolbar } from '../notes/SelectionToolbar'
import { useNotesUi } from '../notes/store'
import { useUi } from '../state/ui'
import type { NoteAnchor } from '../../shared/types'
import { assetUrl, linkTarget } from '../lib/paths'
import { DocBlocks, type BlockEnv } from './DocBlocks'
import { Outline } from './Outline'
import { LinksPanel } from '../knowledge/LinksPanel'
import { PreviewLink } from '../knowledge/PreviewLink'
import { decorate } from '../knowledge/TermHint'
import { planTerms } from '../knowledge/terms'
import { PanelSlot, TopActions, TopLeft } from '../layout/Shell'
import { Button, Empty, ErrorNote, IconButton, Spinner } from '../ui/primitives'
import { Menu, MenuItem } from '../ui/Menu'
import { lastDocKey } from '../today/TodayPage'
import { duration } from '../lib/title'
import type { Checked, WebAnswer } from '@mdlearn/core'

const fmt = new Intl.NumberFormat()
export default function Reader({ ws }: { ws: string }) {
  const params = new URLSearchParams(useSearch())
  const path = params.get('path') ?? undefined
  const section = params.get('section')
  const doc = useDoc(ws, path)
  const tree = useTree(ws)
  const [, navigate] = useLocation()
  const [source, setSource] = useState(false)
  const [article, setArticle] = useState<HTMLElement | null>(null)
  const { panelTab, setPanelTab, termHints, setTermHints } = useUi()
  const session = useSession()
  const canAi = !!session.data?.caps.includes('ai')
  const canWrite = !!session.data?.caps.includes('write')
  const notes = useNotes(ws, path)
  const engines = useEngines()
  const { setDraft, setActive } = useNotesUi()
  const qc = useQueryClient()
  const [askError, setAskError] = useState<string | null>(null)
  useEffect(() => { setDraft(null) }, [path, setDraft])
  useNoteHighlights(ws, path, source ? null : article)
  const onSelection = async (kind: 'note' | 'ask' | 'explain' | 'visual' | 'card', anchor: NoteAnchor) => {
    if (!path) return
    setPanelTab('notes'); setAskError(null)
    if (kind !== 'explain') { setDraft({ anchor, mode: kind }); return } // note, ask and visual open a card beside the passage
    try {
      const r = await notesApi.ask(ws, { doc: path, anchor, mode: 'explain' })
      setActive(r.note.id)
      await qc.invalidateQueries({ queryKey: keys.notes(ws, path) })
    } catch (e) { setAskError((e as Error).message) }
  }
  const entry = tree.data?.docs.find((d) => d.path === path)
  const map = useSectionMap(ws, entry?.lessons.length ? path : undefined)

  useEffect(() => { if (path) try { localStorage.setItem(lastDocKey(ws), path) } catch { /* ignore */ } }, [ws, path])
  useEffect(() => { setSource(false) }, [path])
  useEffect(() => { if (doc.data) document.title = `${doc.data.title} · MDlearn Studio` }, [doc.data])
  // jump to ?section=3.1 (search results) or #anchor once the document is on screen
  useEffect(() => {
    if (!doc.data) return
    const target = section ? doc.data.outline.sections.find((s) => s.num === section || s.anchor === section)?.anchor : decodeURIComponent(location.hash.slice(1))
    if (target) requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: 'start' }))
    else document.getElementById('main')?.scrollTo({ top: 0 })
  }, [doc.data?.path, section]) // eslint-disable-line react-hooks/exhaustive-deps

  const links = useLinks(ws, path)
  const hovers = useTermHovers(ws, termHints)
  const plan = useMemo(() => (termHints && doc.data && path && hovers.data?.terms.length ? planTerms(doc.data.blocks, hovers.data.terms, path) : null), [termHints, doc.data, path, hovers.data])
  const env = useMemo<BlockEnv | null>(() => !path ? null : ({
    cx: {
      linkTo: (url) => linkTarget(ws, path, url), imageSrc: (url) => assetUrl(ws, path, url), runPython: true,
      decorateText: decorate(plan), wrapLink: (url, a) => <PreviewLink ws={ws} from={path} url={url}>{a}</PreviewLink>,
    },
    check: async (widgetId: string, answer: WebAnswer) => (await api.post<{ checked: Checked }>(`/api/w/${ws}/doc/check`, { path, widgetId, answer })).checked,
  }), [ws, path, plan])

  if (!path) return <Empty icon={FileText} title="No document selected">Choose a file in the sidebar.</Empty>
  const crumbs = path.split('/')
  return (
    <>
      <TopLeft>
        <nav aria-label="Path" className="flex min-w-0 items-center gap-1 px-1 text-[13px] text-muted">
          <Link href={`/w/${ws}`} className="shrink-0 hover:text-text">{tree.data?.name ?? 'Folder'}</Link>
          {crumbs.map((c, i) => <span key={i} className={`flex min-w-0 items-center gap-1 ${i < crumbs.length - 1 ? 'max-[700px]:hidden' : ''}`}><span className="text-subtle">/</span><span className={`truncate ${i === crumbs.length - 1 ? 'text-text' : ''}`}>{c}</span></span>)}
        </nav>
      </TopLeft>
      <TopActions>
        {!!entry?.lessons.length && <Button size="sm" variant="ghost" icon={BookOpenCheck} onClick={() => navigate(`/w/${ws}/study?doc=${encodeURIComponent(path)}`)}>Study</Button>}
        {canAi && entry && !entry.lessons.length && <Button size="sm" variant="ghost" icon={Sparkles} onClick={() => navigate(`/w/${ws}/studio?kind=course&doc=${encodeURIComponent(path)}`)}>Make a course</Button>}
        {canWrite && <Link href={`/w/${ws}/edit?path=${encodeURIComponent(path)}`} aria-label="Edit this file" title="Edit this file" className="inline-flex size-7 items-center justify-center rounded-[6px] text-muted hover:bg-hover hover:text-text"><Pencil className="size-4" strokeWidth={1.8} aria-hidden /></Link>}
        <Menu iconOnly label="More" icon={Ellipsis}>
          {(close) => (
            <>
              <MenuItem hint="Formulas and defined terms of this document" onClick={() => { close(); navigate(`/w/${ws}/sheet?path=${encodeURIComponent(path)}`) }}>Cheat sheet</MenuItem>
              <MenuItem onClick={() => { close(); window.print() }}>Print this document</MenuItem>
              {canWrite && !!entry?.lessons.length && <MenuItem hint="Study cards as an .apkg file" onClick={() => { close(); window.location.assign(`/api/w/${ws}/export/anki?scope=${encodeURIComponent(path)}`) }}>Export the study cards to Anki</MenuItem>}
              <MenuItem hint={termHints ? 'On: hover a dotted word for its definition' : 'Off'} onClick={() => { close(); setTermHints(!termHints) }}>{termHints ? 'Stop underlining defined terms' : 'Underline defined terms'}</MenuItem>
            </>
          )}
        </Menu>
        <IconButton icon={source ? X : Code2} label={source ? 'Back to the formatted view' : 'Show Markdown source'} active={source} onClick={() => setSource((s) => !s)} />
      </TopActions>
      {doc.data && (
        <PanelSlot>
          <div role="tablist" aria-label="Side panel" className="flex h-11 shrink-0 items-center gap-1 px-2.5">
            {(['outline', 'notes', 'links'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={panelTab === t} onClick={() => setPanelTab(t)}
                className={`h-7 rounded-[6px] px-2.5 text-[12.5px] font-medium cursor-pointer ${panelTab === t ? 'bg-active text-text' : 'text-muted hover:bg-hover'}`}>
                {t === 'outline' ? 'Outline' : t === 'links' ? <>Links{links.data && links.data.backlinks.length ? <span className="ml-1 tabular text-subtle">{links.data.backlinks.length}</span> : null}</> : <>Notes{notes.data?.length ? <span className="ml-1 tabular text-subtle">{notes.data.length}</span> : null}</>}
              </button>
            ))}
          </div>
          {askError && <p role="alert" className="mx-3 mb-2 rounded-[6px] bg-bad-soft px-2.5 py-1.5 text-[12.5px]">{askError}</p>}
          {panelTab === 'outline'
            ? <div className="min-h-0 flex-1 overflow-y-auto"><Outline outline={doc.data.outline} memory={map.data} /></div>
            : panelTab === 'links' ? <LinksPanel ws={ws} path={path} />
            : <NotesPanel ws={ws} doc={path} article={source ? null : article} mtime={doc.data.mtime} />}
        </PanelSlot>
      )}
      {!source && <SelectionToolbar root={article} onAction={(k, a) => void onSelection(k, a)} canAsk={!!engines.data?.local.available} />}
      {doc.isLoading && <div className="p-10"><Spinner label="Opening document" /></div>}
      {doc.error && <ErrorNote error={doc.error} retry={() => doc.refetch()} />}
      {doc.data && env && (source ? <Source ws={ws} path={path} /> : (
        <article className="mx-auto max-w-[760px] px-6 pb-[30vh] pt-4 sm:px-12" lang={typeof doc.data.frontmatter?.lang === 'string' ? doc.data.frontmatter.lang : undefined}>
          <header className="mb-8">
            <h1 className="font-ui text-[32px] font-bold leading-[1.2] tracking-[-0.022em] text-balance">{doc.data.title}</h1>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 tabular text-[13px] text-muted">
              {doc.data.outline.timeMin && <span>{duration(doc.data.outline.timeMin)}</span>}
              {doc.data.outline.level && <span className="capitalize">{doc.data.outline.level}</span>}
              <span>{fmt.format(doc.data.outline.words)} words</span>
              {!!entry?.lessons.length && <span>{entry.lessons.length} {entry.lessons.length === 1 ? 'lesson' : 'lessons'} · {entry.cards} cards</span>}
              {doc.data.diagnostics.some((d) => d.code.startsWith('E')) && <span title={doc.data.diagnostics.filter((d) => d.code.startsWith('E')).map((d) => `line ${d.line}: ${d.code} ${d.message ?? ''}`).join('\n')}>{doc.data.diagnostics.filter((d) => d.code.startsWith('E')).length} formatting problems</span>}
            </p>
          </header>
          <div className="read" ref={setArticle}>
            <DocBlocks blocks={doc.data.blocks.filter((b, i) => !(i < 3 && b.type === 'heading' && b.depth === 1))} env={env} />
          </div>
        </article>
      ))}
    </>
  )
}

function Source({ ws, path }: { ws: string; path: string }) {
  const raw = useQuery({ queryKey: ['raw', ws, path], queryFn: async () => { const r = await fetch(`/api/w/${ws}/raw?${qs({ path })}`); if (!r.ok) throw new Error(`Could not load the source (${r.status}).`); return r.text() } })
  if (raw.isLoading) return <div className="p-10"><Spinner /></div>
  if (raw.error) return <ErrorNote error={raw.error} />
  const lines = (raw.data ?? '').split('\n')
  return (
    <div className="mx-auto max-w-[980px] px-4 pb-20 pt-2">
      <pre className="overflow-x-auto rounded-[8px] border border-border bg-code py-3 font-mono text-[12.5px] leading-[1.65]" aria-label="Markdown source">
        {lines.map((l, i) => <div key={i} className="flex"><span className="w-12 shrink-0 select-none pr-4 text-right tabular text-subtle">{i + 1}</span><span className="whitespace-pre pr-4">{l || ' '}</span></div>)}
      </pre>
    </div>
  )
}
