// The 3D graph (3d-force-graph, three.js), loaded only when you switch to 3D: the same nodes and colours as
// spheres you can orbit; the name of the hovered one is shown by GraphCanvas. It never turns by itself.
import ForceGraph3D, { type ForceGraph3DInstance } from '3d-force-graph'
import { emphasis, linkEmphasis, memoryTone, nodeVal, type GLink, type GNode } from './graph'
import { withAlpha } from './graphColors'
import { isTap, layoutMotion, moveMs, type Mount } from './graphEngine'

type N = GNode & { x?: number; y?: number; z?: number }
type L = Omit<GLink, 'source' | 'target'> & { source: string | N; target: string | N }
const REL = 4
const idOf = (end: string | N) => (typeof end === 'string' ? end : end.id)
const endRadius = (end: string | N) => (typeof end === 'string' ? REL : Math.sqrt(nodeVal(end)) * REL)

export const mount: Mount = (host, state, events) => {
  // the constructor's type takes no node type; the instance type does
  const fg = new ForceGraph3D(host, { controlType: 'orbit' }) as unknown as ForceGraph3DInstance<N, L>
  let fit: boolean = true
  const moved = () => { fit = false }
  host.addEventListener('wheel', moved, { passive: true })
  host.addEventListener('pointerdown', moved)

  const nodeColor = (n: N) => {
    const { view, colors: c } = state.current
    const tone = n.kind === 'doc' ? memoryTone(n) : null
    const base = n.id === view.selected ? c.focus : tone === null ? c.muted : tone === 'none' ? c.subtle : c[tone]
    return emphasis(view, n.id) === 'dim' ? withAlpha(base, 0.15) : base
  }
  const linkColor = (l: L) => {
    const { view, colors: c } = state.current
    const em = linkEmphasis(view, idOf(l.source), idOf(l.target))
    const base = l.kind === 'prereq' ? c.muted : c.borderStrong
    return em === 'dim' ? withAlpha(base, 0.1) : em === 'lit' ? c.accent : base
  }
  const restyle = () => { fg.backgroundColor(state.current.colors.panel).nodeColor(nodeColor).linkColor(linkColor).linkDirectionalArrowColor(linkColor) }

  fg.nodeId('id').nodeLabel(() => '').linkLabel(() => '').showNavInfo(false)
    .nodeRelSize(REL).nodeVal(nodeVal).nodeResolution(14).nodeOpacity(1).linkOpacity(0.7)
    .linkDirectionalArrowLength((l) => (l.kind === 'prereq' ? 3.5 : 0)).linkDirectionalArrowRelPos(1)
    .onNodeHover((n) => events.onHover(n?.id ?? null))
    .onNodeClick((n, ev) => events.onClick(n.id, isTap(ev)))
    .onBackgroundClick(() => events.onBackground())
    .onEngineStop(() => { if (fit) { fg.zoomToFit(moveMs(state.current, 500), 40); fit = false } })
  restyle()
  fg.d3Force('charge')?.strength((n: N) => -40 - 14 * nodeVal(n))
  fg.d3Force('link')?.distance((l: L) => endRadius(l.source) + endRadius(l.target) + (l.kind === 'lesson' ? 8 : 36))

  return {
    setData(data) {
      const prev = new Map(fg.graphData().nodes.map((n) => [n.id, n]))
      fit = true
      layoutMotion(fg, state.current)
      fg.graphData({
        nodes: data.nodes.map((n) => { const p = prev.get(n.id); return p ? { ...n, x: p.x, y: p.y, z: p.z } : { ...n } }),
        links: data.links.map((l) => ({ ...l })),
      })
    },
    restyle,
    resize(width, height) { fg.width(width).height(height) },
    center(id) {
      const n = fg.graphData().nodes.find((x) => x.id === id)
      if (!n) return
      fit = false
      const at = { x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 }
      const k = 1 + 90 / Math.max(1, Math.hypot(at.x, at.y, at.z))
      fg.cameraPosition({ x: at.x * k, y: at.y * k, z: at.z * k }, at, moveMs(state.current, 800))
    },
    fit() { fit = false; fg.zoomToFit(moveMs(state.current, 400), 40) },
    destroy() {
      host.removeEventListener('wheel', moved); host.removeEventListener('pointerdown', moved)
      const renderer = fg.renderer()
      fg._destructor()
      renderer.dispose(); renderer.forceContextLoss()
      host.replaceChildren()
    },
  }
}
