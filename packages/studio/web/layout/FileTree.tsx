// The folder's Markdown files as a tree (folders → documents → their companion lessons).
import { useContext, useEffect, useMemo, useRef } from 'react'
import { Link, useLocation, useSearch } from 'wouter'
import { ChevronRight, FileCode, FileText, Folder, GraduationCap, TriangleAlert } from 'lucide-react'
import type { TexDoc, Tree, TreeDoc } from '../../shared/types'
import { docRoute, latexRoute, lessonRoute } from '../lib/paths'
import { Spinner } from '../ui/primitives'
import { ArrivalsContext, isCourse, useTreeRows } from './useTreeRows'
import { t } from '../i18n'

interface Dir { name: string; path: string; dirs: Map<string, Dir>; docs: TreeDoc[] }
function build(docs: TreeDoc[]): Dir {
  const root: Dir = { name: '', path: '', dirs: new Map(), docs: [] }
  for (const d of docs) {
    const parts = d.path.split('/')
    let cur = root
    for (const [i, p] of parts.slice(0, -1).entries()) {
      if (!cur.dirs.has(p)) cur.dirs.set(p, { name: p, path: parts.slice(0, i + 1).join('/'), dirs: new Map(), docs: [] })
      cur = cur.dirs.get(p)!
    }
    cur.docs.push(d)
  }
  return root
}
const label = (d: TreeDoc) => (isCourse(d.path) && d.title) || d.path.split('/').pop()!.replace(/\.(md|markdown)$/i, '').replace(/[_-]+/g, ' ')
/** A quiet mark on a file that arrived while you were here, until you open it. */
function useArrived(path: string, active: boolean) {
  const { fresh, seen } = useContext(ArrivalsContext)
  useEffect(() => { if (active) seen(path) }, [active, path, seen])
  return fresh.has(path)
}
const NewMark = () => <span role="img" aria-label={t('New')} title={t('New')} className="ml-auto size-1.5 shrink-0 rounded-full bg-accent" />

export function FileTree({ ws, tree, loading, error }: { ws: string; tree?: Tree; loading: boolean; error: unknown }) {
  const root = useMemo(() => build(tree?.docs ?? []), [tree])
  const box = useRef<HTMLDivElement>(null)
  const { open, toggle, arrivals } = useTreeRows(tree, box)
  if (loading) return <div className="px-2 py-2"><Spinner label={t('Reading folder')} /></div>
  if (error) return <p className="px-2 py-2 text-[13px] text-bad">{(error as Error).message}</p>
  if (!tree?.docs.length && !tree?.orphanLessons.length && !tree?.latex.length) return <p className="px-2 py-2 text-[13px] text-muted">{t('No Markdown files in this folder.')}</p>
  return (
    <ArrivalsContext.Provider value={arrivals}>
    <div ref={box} role="tree" aria-label={t('Files')} className="text-[13.5px]">
      <p className="px-2 pb-1 pt-3 text-[11.5px] font-medium text-muted">{t('Files')}</p>
      <DirView ws={ws} dir={root} depth={0} open={open} toggle={toggle} />
      {!!tree?.orphanLessons.length && (
        <>
          <p className="px-2 pb-1 pt-4 text-[11.5px] font-medium text-muted">{t('Lessons')}</p>
          {tree.orphanLessons.map((l) => <LessonRow key={l.path} ws={ws} lesson={l} depth={0} />)}
        </>
      )}
      {!!tree?.duplicateLessons.length && (
        <p role="status" className="px-2 pt-3 text-[12px] text-warn" title={tree.duplicateLessons[0].paths.join('\n')}>
          {t('Two lessons have the id {id}, so they share their progress. Give one a different id in its frontmatter.', { id: tree.duplicateLessons[0].id })}
        </p>
      )}
      {!!tree?.latex.length && (
        <>
          <p className="px-2 pb-1 pt-4 text-[11.5px] font-medium text-muted">{t('LaTeX')}</p>
          {tree.latex.map((d) => <TexRow key={d.path} ws={ws} doc={d} />)}
        </>
      )}
    </div>
    </ArrivalsContext.Provider>
  )
}

function DirView({ ws, dir, depth, open, toggle }: { ws: string; dir: Dir; depth: number; open: Set<string>; toggle: (p: string) => void }) {
  const dirs = [...dir.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))
  const docs = [...dir.docs].sort((a, b) => a.path.localeCompare(b.path))
  return (
    <>
      {dirs.map((d) => {
        const isOpen = open.has(d.path)
        return (
          <div key={d.path} role="treeitem" aria-expanded={isOpen}>
            <button onClick={() => toggle(d.path)} style={{ paddingLeft: 8 + depth * 14 }}
              className="flex h-7 w-full items-center gap-1.5 rounded-[5px] pr-2 text-left text-text/85 hover:bg-hover cursor-pointer">
              <ChevronRight className={`size-3.5 shrink-0 text-subtle transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} aria-hidden />
              <Folder className="size-[15px] shrink-0 text-muted" strokeWidth={1.7} aria-hidden />
              <span className="truncate">{d.name}</span>
            </button>
            {isOpen && <div role="group"><DirView ws={ws} dir={d} depth={depth + 1} open={open} toggle={toggle} /></div>}
          </div>
        )
      })}
      {docs.map((d) => <DocRow key={d.path} ws={ws} doc={d} depth={depth} open={open} toggle={toggle} />)}
    </>
  )
}

function DocRow({ ws, doc, depth, open, toggle }: { ws: string; doc: TreeDoc; depth: number; open: Set<string>; toggle: (p: string) => void }) {
  const [location] = useLocation()
  const search = useSearch()
  const active = location.endsWith('/doc') && new URLSearchParams(search).get('path') === doc.path
  const isOpen = open.has(doc.path)
  const hasLessons = doc.lessons.length > 0
  const arrived = useArrived(doc.path, active)
  return (
    <div role="treeitem" aria-expanded={hasLessons ? isOpen : undefined} data-arrived={arrived || undefined}>
      <div className={`group flex h-7 items-center rounded-[5px] ${active ? 'bg-active' : 'hover:bg-hover'}`} style={{ paddingLeft: 8 + depth * 14 }}>
        {hasLessons
          ? <button onClick={() => toggle(doc.path)} aria-label={isOpen ? t('Hide lessons') : t('Show lessons')} className="flex size-4 shrink-0 items-center justify-center rounded text-subtle hover:text-text cursor-pointer">
              <ChevronRight className={`size-3.5 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} aria-hidden />
            </button>
          : <span className="size-4 shrink-0" />}
        <Link href={docRoute(ws, doc.path)} title={doc.title || doc.path} aria-current={active ? 'page' : undefined}
          className={`ml-1 flex min-w-0 flex-1 items-center gap-1.5 pr-2 ${active ? 'font-medium text-text' : 'text-text/85'}`}>
          <FileText className="size-[15px] shrink-0 text-muted" strokeWidth={1.7} aria-hidden />
          <span className="truncate">{label(doc)}</span>
          {arrived && <NewMark />}
          {doc.due > 0 && <span className="ml-auto shrink-0 tabular text-[11.5px] text-muted" title={`${doc.due} cards due`}>{doc.due}</span>}
        </Link>
      </div>
      {hasLessons && isOpen && <div role="group">{doc.lessons.map((l) => <LessonRow key={l.path} ws={ws} lesson={l} depth={depth + 1} />)}</div>}
    </div>
  )
}

function TexRow({ ws, doc }: { ws: string; doc: TexDoc }) {
  const [location] = useLocation()
  const search = useSearch()
  const active = location.endsWith('/latex') && new URLSearchParams(search).get('path') === doc.path
  return (
    <Link href={latexRoute(ws, doc.path)} role="treeitem" title={doc.path} aria-current={active ? 'page' : undefined}
      className={`flex h-7 items-center gap-1.5 rounded-[5px] pl-2 pr-2 ${active ? 'bg-active font-medium text-text' : 'text-text/80 hover:bg-hover'}`}>
      <FileCode className="size-[15px] shrink-0 text-subtle" strokeWidth={1.7} aria-hidden />
      <span className="truncate">{doc.title}</span>
      {doc.title !== doc.path.split('/').pop()?.replace(/\.tex$/i, '') && <span className="ml-auto shrink-0 truncate pl-2 text-[11.5px] text-subtle">{doc.path.split('/').pop()}</span>}
    </Link>
  )
}

function LessonRow({ ws, lesson, depth }: { ws: string; lesson: TreeDoc['lessons'][number]; depth: number }) {
  const [location] = useLocation()
  const search = useSearch()
  const active = location.endsWith('/lesson') && new URLSearchParams(search).get('path') === lesson.path
  const arrived = useArrived(lesson.path, active)
  return (
    <Link href={lessonRoute(ws, lesson.path)} role="treeitem" title={lesson.title} aria-current={active ? 'page' : undefined} data-arrived={arrived || undefined}
      style={{ paddingLeft: 8 + depth * 14 + 20 }}
      className={`flex h-7 items-center gap-1.5 rounded-[5px] pr-2 ${active ? 'bg-active font-medium text-text' : 'text-text/80 hover:bg-hover'}`}>
      <GraduationCap className="size-[15px] shrink-0 text-subtle" strokeWidth={1.7} aria-hidden />
      <span className="truncate">{lesson.title}</span>
      {arrived && <NewMark />}
      {lesson.errors > 0 && <TriangleAlert className="ml-auto size-3.5 shrink-0 text-bad" aria-label={`${lesson.errors} errors`} />}
    </Link>
  )
}
