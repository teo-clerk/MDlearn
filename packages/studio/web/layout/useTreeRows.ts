// Which rows of the file tree are open, and which files have just arrived. A course and the folders around it start open
// and what you close stays closed, until something new lands in it: an AI writing from a terminal never told anyone.
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Tree, TreeDoc } from '../../shared/types'

const KEY = 'mdl-tree'
const load = (): Set<string> => { try { return new Set(JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as string[]) } catch { return new Set() } }
const save = (s: Set<string>) => { try { sessionStorage.setItem(KEY, JSON.stringify([...s])) } catch { /* ignore */ } }
const folders = (path: string) => path.split('/').slice(0, -1).map((_, i, all) => all.slice(0, i + 1).join('/'))
export const isCourse = (path: string) => path.split('/').pop()!.toLowerCase() === 'course.md'
export const isNote = (d: TreeDoc) => d.notes > 0 && !isCourse(d.path)
/** Class files you gave are not news; what the AI makes from them is. */
const isSource = (path: string) => /(^|\/)sources\//.test(path)

/** Every file the tree shows, and the rows that must be open for it to be seen. */
function placed(tree: Tree): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const d of tree.docs) {
    out.set(d.path, folders(d.path))
    for (const l of d.lessons) out.set(l.path, [...folders(d.path), d.path])
  }
  for (const l of tree.orphanLessons) out.set(l.path, [])
  return out
}

export interface Arrivals { fresh: Set<string>; seen(path: string): void }
export const ArrivalsContext = createContext<Arrivals>({ fresh: new Set(), seen: () => {} })

export function useTreeRows(tree: Tree | undefined, box: React.RefObject<HTMLElement | null>) {
  /** Rows set apart from how they start. A list saved before courses started open means the same thing. */
  const [changed, setChanged] = useState<Set<string>>(load)
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const starts = useMemo(() => new Set((tree?.docs ?? []).filter((d) => isCourse(d.path)).flatMap((d) => [...folders(d.path), d.path])), [tree])
  const open = useMemo(() => new Set([...starts, ...changed].filter((p) => starts.has(p) !== changed.has(p))), [starts, changed])
  const toggle = useCallback((p: string) => setChanged((now) => {
    const next = new Set(now)
    if (!next.delete(p)) next.add(p)
    save(next)
    return next
  }), [])
  const known = useRef<{ root: string; paths: Set<string> } | null>(null)
  useEffect(() => {
    if (!tree) return
    const all = placed(tree)
    const before = known.current?.root === tree.root ? known.current.paths : null
    known.current = { root: tree.root, paths: new Set(all.keys()) }
    const arrived = before ? [...all.keys()].filter((p) => !before.has(p) && !isSource(p)) : []
    if (!arrived.length) return
    setFresh((now) => new Set([...now, ...arrived]))
    setChanged((now) => {
      const next = new Set(now)
      for (const row of new Set(arrived.flatMap((p) => all.get(p)!))) if (starts.has(row)) next.delete(row); else next.add(row)
      save(next)
      return next
    })
  }, [tree, starts])
  useEffect(() => {
    if (fresh.size) requestAnimationFrame(() => box.current?.querySelector('[data-arrived]')?.scrollIntoView({ block: 'nearest' }))
  }, [fresh, box])
  const seen = useCallback((path: string) => setFresh((now) => {
    if (!now.has(path)) return now
    const next = new Set(now)
    next.delete(path)
    return next
  }), [])
  const arrivals = useMemo(() => ({ fresh, seen }), [fresh, seen])
  return { open, toggle, arrivals }
}
