// The folder's Markdown files as a tree (folders → documents → their companion lessons).
import { useMemo, useState } from 'react'
import { Link, useLocation, useSearch } from 'wouter'
import { ChevronRight, FileText, Folder, GraduationCap, TriangleAlert } from 'lucide-react'
import type { Tree, TreeDoc } from '../../shared/types'
import { docRoute, lessonRoute } from '../lib/paths'
import { Spinner } from '../ui/primitives'
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
const label = (d: TreeDoc) => d.path.split('/').pop()!.replace(/\.(md|markdown)$/i, '').replace(/[_-]+/g, ' ')
const loadOpen = (): Set<string> => { try { return new Set(JSON.parse(sessionStorage.getItem('mdl-tree') ?? '[]') as string[]) } catch { return new Set() } }

export function FileTree({ ws, tree, loading, error }: { ws: string; tree?: Tree; loading: boolean; error: unknown }) {
  const root = useMemo(() => build(tree?.docs ?? []), [tree])
  const [open, setOpen] = useState<Set<string>>(loadOpen)
  const toggle = (p: string) => setOpen((s) => {
    const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p)
    try { sessionStorage.setItem('mdl-tree', JSON.stringify([...n])) } catch { /* ignore */ }
    return n
  })
  if (loading) return <div className="px-2 py-2"><Spinner label={t('Reading folder')} /></div>
  if (error) return <p className="px-2 py-2 text-[13px] text-bad">{(error as Error).message}</p>
  if (!tree?.docs.length && !tree?.orphanLessons.length) return <p className="px-2 py-2 text-[13px] text-muted">{t('No Markdown files in this folder.')}</p>
  return (
    <div role="tree" aria-label={t('Files')} className="text-[13.5px]">
      <p className="px-2 pb-1 pt-3 text-[11.5px] font-medium text-muted">{t('Files')}</p>
      <DirView ws={ws} dir={root} depth={0} open={open} toggle={toggle} />
      {!!tree?.orphanLessons.length && (
        <>
          <p className="px-2 pb-1 pt-4 text-[11.5px] font-medium text-muted">{t('Lessons')}</p>
          {tree.orphanLessons.map((l) => <LessonRow key={l.path} ws={ws} lesson={l} depth={0} />)}
        </>
      )}
    </div>
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
  return (
    <div role="treeitem" aria-expanded={hasLessons ? isOpen : undefined}>
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
          {doc.due > 0 && <span className="ml-auto shrink-0 tabular text-[11.5px] text-muted" title={`${doc.due} cards due`}>{doc.due}</span>}
        </Link>
      </div>
      {hasLessons && isOpen && <div role="group">{doc.lessons.map((l) => <LessonRow key={l.path} ws={ws} lesson={l} depth={depth + 1} />)}</div>}
    </div>
  )
}

function LessonRow({ ws, lesson, depth }: { ws: string; lesson: TreeDoc['lessons'][number]; depth: number }) {
  const [location] = useLocation()
  const search = useSearch()
  const active = location.endsWith('/lesson') && new URLSearchParams(search).get('path') === lesson.path
  return (
    <Link href={lessonRoute(ws, lesson.path)} role="treeitem" title={lesson.title} aria-current={active ? 'page' : undefined}
      style={{ paddingLeft: 8 + depth * 14 + 20 }}
      className={`flex h-7 items-center gap-1.5 rounded-[5px] pr-2 ${active ? 'bg-active font-medium text-text' : 'text-text/80 hover:bg-hover'}`}>
      <GraduationCap className="size-[15px] shrink-0 text-subtle" strokeWidth={1.7} aria-hidden />
      <span className="truncate">{lesson.title}</span>
      {lesson.errors > 0 && <TriangleAlert className="ml-auto size-3.5 shrink-0 text-bad" aria-label={`${lesson.errors} errors`} />}
    </Link>
  )
}
