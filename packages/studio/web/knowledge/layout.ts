// Lays the documents out as a left-to-right graph: what you read first on the left.
import dagre from '@dagrejs/dagre'

export interface GNode { path: string; title: string }
export interface GEdge { from: string; to: string; kind: 'link' | 'prereq' }
export interface Placed { path: string; title: string; x: number; y: number; w: number; h: number }
export interface Routed { from: string; to: string; kind: 'link' | 'prereq'; points: { x: number; y: number }[] }
export interface Layout { width: number; height: number; nodes: Placed[]; edges: Routed[]; isolated: GNode[] }

export const NODE_W = 188
export const NODE_H = 34
const MARGIN = 24

/** Documents with no edge in `edges` are returned separately instead of being scattered over the graph. */
export function layoutGraph(nodes: GNode[], edges: GEdge[]): Layout {
  const known = new Set(nodes.map((n) => n.path))
  const kept = edges.filter((e) => e.from !== e.to && known.has(e.from) && known.has(e.to))
  const connected = new Set(kept.flatMap((e) => [e.from, e.to]))
  const g = new dagre.graphlib.Graph({ multigraph: false })
  g.setGraph({ rankdir: 'LR', nodesep: 12, ranksep: 70, marginx: MARGIN, marginy: MARGIN, ranker: 'network-simplex' })
  g.setDefaultEdgeLabel(() => ({}))
  const shown = nodes.filter((n) => connected.has(n.path))
  for (const n of shown) g.setNode(n.path, { width: NODE_W, height: NODE_H })
  for (const e of kept) if (!g.hasEdge(e.from, e.to)) g.setEdge(e.from, e.to, { kind: e.kind })
  dagre.layout(g)
  const placed = shown.map((n) => { const p = g.node(n.path); return { path: n.path, title: n.title, x: p.x - NODE_W / 2, y: p.y - NODE_H / 2, w: NODE_W, h: NODE_H } })
  const routed = g.edges().map((e) => {
    const l = g.edge(e) as unknown as { points: { x: number; y: number }[]; kind?: 'link' | 'prereq' }
    const kind = kept.find((k) => k.from === e.v && k.to === e.w)?.kind ?? 'link'
    return { from: e.v, to: e.w, kind, points: l.points }
  })
  const dim = g.graph()
  return { width: (dim.width ?? 0) || 0, height: (dim.height ?? 0) || 0, nodes: placed, edges: routed, isolated: nodes.filter((n) => !connected.has(n.path)) }
}

/** A smooth SVG path through dagre's edge points. */
export function pathOf(points: { x: number; y: number }[]): string {
  if (points.length < 2) return ''
  let d = `M${points[0].x},${points[0].y}`
  if (points.length === 2) return `${d}L${points[1].x},${points[1].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const m = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 }
    d += `Q${points[i].x},${points[i].y} ${m.x},${m.y}`
  }
  const last = points[points.length - 1]
  return `${d}L${last.x},${last.y}`
}

/**
 * What surrounds one document: everything it builds on (prerequisites, up to `depth` steps back), everything
 * built on it (up to `depth` steps forward) and, with `links`, the documents it links to or that link to it.
 */
export function neighbourhood(edges: GEdge[], focus: string, opts: { depth?: number; links?: boolean } = {}): GEdge[] {
  const depth = opts.depth ?? 3
  const keep = new Map<string, GEdge>()
  const add = (e: GEdge) => keep.set(`${e.from}>${e.to}`, e)
  const prereq = edges.filter((e) => e.kind === 'prereq')
  const walk = (dir: 'back' | 'forward') => {
    let frontier = new Set([focus]); const seen = new Set([focus])
    for (let i = 0; i < depth && frontier.size; i++) {
      const next = new Set<string>()
      for (const e of prereq) {
        const [a, b] = dir === 'back' ? [e.to, e.from] : [e.from, e.to]
        if (frontier.has(a)) { add(e); if (!seen.has(b)) { seen.add(b); next.add(b) } }
      }
      frontier = next
    }
  }
  walk('back'); walk('forward')
  if (opts.links) for (const e of edges) if (e.from === focus || e.to === focus) add(e)
  return [...keep.values()]
}
