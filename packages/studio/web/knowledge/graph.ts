// The graph view's data: which documents (and, if asked, lessons) are drawn and how they connect, for the whole
// folder or around one document, plus what is lit while you hover. Pure, so the 2D and the 3D drawing share it.
import type { MapNode, MapResponse } from '../../shared/types'

export type EdgeKind = 'link' | 'prereq' | 'lesson'
export interface GraphFilters { links: boolean; prereqs: boolean; lessons: boolean; orphans: boolean }
export const DEFAULT_FILTERS: GraphFilters = { links: true, prereqs: true, lessons: false, orphans: true }
/** A drawn node: a document, or a lesson of `doc`. `degree` counts its connections to other documents. */
export interface GNode { id: string; kind: 'doc' | 'lesson'; title: string; words: number; memory: number | null; seen: number; lessons: number; doc: string; degree: number }
export interface GLink { source: string; target: string; kind: EdgeKind }
export interface GraphData { nodes: GNode[]; links: GLink[] }

export type Tone = 'none' | 'good' | 'warn' | 'bad'
/** How well a document is remembered, with the map's thresholds (no cards studied yet: none). */
export const memoryTone = (m: Pick<MapNode, 'memory' | 'seen'>): Tone =>
  m.memory === null || !m.seen ? 'none' : m.memory >= 0.85 ? 'good' : m.memory >= 0.6 ? 'warn' : 'bad'

/** Node weight (the drawn radius grows with its square root): gently larger for longer documents, small lessons. */
export const nodeVal = (n: Pick<GNode, 'kind' | 'words'>): number => (n.kind === 'lesson' ? 0.35 : Math.min(12, 1 + Math.sqrt(n.words) / 12))

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
/** Search: a title contains the query, ignoring case and accents. An empty query matches nothing. */
export function matchesQuery(title: string, query: string): boolean {
  const q = fold(query.trim())
  return q.length > 0 && fold(title).includes(q)
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** The kept connections between documents: one line per pair, a prerequisite wins over a plain link. */
function connections(data: Pick<MapResponse, 'nodes' | 'edges'>, filters: GraphFilters): GLink[] {
  const known = new Set(data.nodes.map((n) => n.path))
  const usable = data.edges.filter((e) => e.from !== e.to && known.has(e.from) && known.has(e.to))
  const prereqs = filters.prereqs ? usable.filter((e) => e.kind === 'prereq') : []
  const joined = new Set(prereqs.map((e) => pairKey(e.from, e.to)))
  const links: GLink[] = prereqs.map((e) => ({ source: e.from, target: e.to, kind: 'prereq' }))
  if (filters.links) {
    for (const e of usable) {
      if (e.kind !== 'link' || joined.has(pairKey(e.from, e.to))) continue
      joined.add(pairKey(e.from, e.to))
      links.push({ source: e.from, target: e.to, kind: 'link' })
    }
  }
  return links
}

/** Everything within `depth` steps of `start`, following connections in either direction. */
function around(links: GLink[], start: string, depth: number): Set<string> {
  const seen = new Set([start])
  let frontier = [start]
  for (let i = 0; i < depth && frontier.length; i++) {
    const next: string[] = []
    for (const l of links) {
      for (const [a, b] of [[l.source, l.target], [l.target, l.source]]) {
        if (frontier.includes(a) && !seen.has(b)) { seen.add(b); next.push(b) }
      }
    }
    frontier = next
  }
  return seen
}

/**
 * The nodes and links to draw. Without `focus`, the whole folder (documents with no connection only when
 * `filters.orphans`); with it, the documents within `focus.depth` steps of that one. Always fresh objects: the
 * drawing libraries write positions into them.
 */
export function buildGraph(data: Pick<MapResponse, 'nodes' | 'edges'>, filters: GraphFilters, focus?: { path: string; depth: number }): GraphData {
  const all = connections(data, filters)
  const degree = new Map<string, number>()
  for (const l of all) for (const id of [l.source, l.target]) degree.set(id, (degree.get(id) ?? 0) + 1)
  const keep = focus
    ? (data.nodes.some((n) => n.path === focus.path) ? around(all, focus.path, focus.depth) : new Set<string>())
    : new Set(data.nodes.filter((n) => filters.orphans || degree.has(n.path)).map((n) => n.path))
  const docs = data.nodes.filter((n) => keep.has(n.path))
  const nodes: GNode[] = docs.map((n) => ({ id: n.path, kind: 'doc', title: n.title, words: n.words, memory: n.memory, seen: n.seen, lessons: n.lessons, doc: n.path, degree: degree.get(n.path) ?? 0 }))
  const links = all.filter((l) => keep.has(l.source) && keep.has(l.target))
  if (filters.lessons) {
    for (const d of docs) {
      for (const l of d.lessonList) {
        nodes.push({ id: l.path, kind: 'lesson', title: l.title, words: 0, memory: null, seen: 0, lessons: 0, doc: d.path, degree: 1 })
        links.push({ source: d.path, target: l.path, kind: 'lesson' })
      }
    }
  }
  return { nodes, links }
}

/** Every node's neighbours, whatever the kind of connection. */
export function adjacency(g: GraphData): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>(g.nodes.map((n) => [n.id, new Set<string>()]))
  for (const l of g.links) { adj.get(l.source)?.add(l.target); adj.get(l.target)?.add(l.source) }
  return adj
}

/** What one node builds on, what builds on it, what it links with, and its lessons. */
export function neighboursOf(g: GraphData, id: string): { buildsOn: string[]; leadsTo: string[]; linked: string[]; lessons: string[] } {
  const out = { buildsOn: [] as string[], leadsTo: [] as string[], linked: [] as string[], lessons: [] as string[] }
  for (const l of g.links) {
    if (l.kind === 'prereq' && l.target === id) out.buildsOn.push(l.source)
    else if (l.kind === 'prereq' && l.source === id) out.leadsTo.push(l.target)
    else if (l.kind === 'link' && (l.source === id || l.target === id)) out.linked.push(l.source === id ? l.target : l.source)
    else if (l.kind === 'lesson' && l.source === id) out.lessons.push(l.target)
  }
  return out
}

/** What the drawing needs to know about the reader's attention. */
export interface GraphView { hover: string | null; selected: string | null; focus: string | null; matches: Set<string> | null; adjacency: Map<string, Set<string>> }
export type Emphasis = 'lit' | 'normal' | 'dim'
/** The hovered (else the chosen) node and its neighbours are lit and the rest dimmed; else the search results are. */
export function emphasis(v: GraphView, id: string): Emphasis {
  const active = v.hover ?? v.selected
  if (active) return id === active || v.adjacency.get(active)?.has(id) ? 'lit' : 'dim'
  if (v.matches) return v.matches.has(id) ? 'lit' : 'dim'
  return 'normal'
}
export function linkEmphasis(v: GraphView, a: string, b: string): Emphasis {
  const active = v.hover ?? v.selected
  if (active) return a === active || b === active ? 'lit' : 'dim'
  if (v.matches) return v.matches.has(a) || v.matches.has(b) ? 'normal' : 'dim'
  return 'normal'
}
