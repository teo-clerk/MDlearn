// The 2D graph (force-graph on a canvas): circles sized by words and coloured by memory, labels when zoomed in or
// lit, prerequisites as arrows and links as dashed lines.
import ForceGraph from 'force-graph'
import { emphasis, linkEmphasis, memoryTone, nodeVal, type GLink, type GNode } from './graph'
import { withAlpha } from './graphColors'
import { clip, isTap, layoutMotion, moveMs, type Mount } from './graphEngine'

type N = GNode & { x?: number; y?: number }
type L = Omit<GLink, 'source' | 'target'> & { source: string | N; target: string | N }
/** Radius of a node of weight 1, in graph units. */
const REL = 4
/** Zoomed in at least this far, every document is labelled (otherwise only the lit ones). */
const LABEL_ZOOM = 1.5
/** Fitting a handful of documents never zooms in further than this, so they keep a reading size. */
const FIT_MAX = 2.4
const FIT_PAD = 48
const idOf = (end: string | N) => (typeof end === 'string' ? end : end.id)
const radius = (n: N) => Math.sqrt(nodeVal(n)) * REL
const endRadius = (end: string | N) => (typeof end === 'string' ? REL : radius(end))

export const mount: Mount = (host, state, events) => {
  const fg = new ForceGraph<N, L>(host)
  // the smallest area that picks a node, in screen pixels: larger for a finger
  const minHit = matchMedia('(pointer: coarse)').matches ? 16 : 7
  // 'now': fit as soon as there are positions; 'settle': fit again once the layout stops, unless the reader moved it
  let fit: 'now' | 'settle' | null = 'now'
  const fitNow = (ms: number) => {
    const b = fg.getGraphBbox(), dur = moveMs(state.current, ms)
    if (!b) return
    const k = Math.min((fg.width() - 2 * FIT_PAD) / Math.max(1, b.x[1] - b.x[0]), (fg.height() - 2 * FIT_PAD) / Math.max(1, b.y[1] - b.y[0]))
    if (k <= FIT_MAX) fg.zoomToFit(dur, FIT_PAD)
    else fg.centerAt((b.x[0] + b.x[1]) / 2, (b.y[0] + b.y[1]) / 2, dur).zoom(FIT_MAX, dur)
  }
  const moved = () => { if (fit === 'settle') fit = null }
  host.addEventListener('wheel', moved, { passive: true })
  host.addEventListener('pointerdown', moved)

  const drawNode = (n: N, ctx: CanvasRenderingContext2D, scale: number) => {
    const { view, colors: c } = state.current
    const em = emphasis(view, n.id)
    const r = radius(n), x = n.x ?? 0, y = n.y ?? 0
    ctx.globalAlpha = em === 'dim' ? 0.16 : 1
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI)
    const tone = n.kind === 'doc' ? memoryTone(n) : null
    if (tone === null) { ctx.fillStyle = c.muted; ctx.fill() }
    else if (tone === 'none') { ctx.fillStyle = c.panel; ctx.fill(); ctx.lineWidth = 1.4 / scale; ctx.strokeStyle = c.subtle; ctx.stroke() }
    else { ctx.fillStyle = c[tone]; ctx.fill() }
    const ring = n.id === view.selected ? c.focus : n.id === view.focus ? c.text : view.matches?.has(n.id) ? c.accent : null
    if (ring) { ctx.beginPath(); ctx.arc(x, y, r + 3 / scale, 0, 2 * Math.PI); ctx.lineWidth = 2 / scale; ctx.strokeStyle = ring; ctx.stroke() }
    if (em === 'lit' || n.id === view.focus || (n.kind === 'doc' && em === 'normal' && scale >= LABEL_ZOOM)) {
      const size = 12 / scale
      ctx.font = `${em === 'lit' ? 500 : 400} ${size}px ${c.font}`
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillStyle = em === 'lit' || n.id === view.focus ? c.text : c.muted
      ctx.fillText(clip(n.title, 36), x, y + r + 3 / scale)
    }
    ctx.globalAlpha = 1
  }
  const linkColor = (l: L) => {
    const { view, colors: c } = state.current
    const em = linkEmphasis(view, idOf(l.source), idOf(l.target))
    const base = l.kind === 'prereq' ? c.muted : l.kind === 'lesson' ? c.border : c.borderStrong
    return em === 'dim' ? withAlpha(base, 0.15) : em === 'lit' ? c.accent : base
  }

  fg.nodeId('id').nodeLabel(() => '').linkLabel(() => '')
    .nodeRelSize(REL).nodeVal(nodeVal)
    .nodeCanvasObject(drawNode)
    .nodePointerAreaPaint((n, color, ctx, scale) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(n.x ?? 0, n.y ?? 0, Math.max(radius(n), minHit / scale), 0, 2 * Math.PI); ctx.fill() })
    .linkColor(linkColor).linkDirectionalArrowColor(linkColor)
    .linkWidth((l) => (linkEmphasis(state.current.view, idOf(l.source), idOf(l.target)) === 'lit' ? 1.8 : 1))
    .linkLineDash((l) => (l.kind === 'link' ? [3, 2] : null))
    .linkDirectionalArrowLength((l) => (l.kind === 'prereq' ? 4 : 0)).linkDirectionalArrowRelPos(1)
    .minZoom(0.1).maxZoom(8)
    .onNodeHover((n) => events.onHover(n?.id ?? null))
    .onNodeClick((n, ev) => events.onClick(n.id, isTap(ev)))
    .onBackgroundClick(() => events.onBackground())
    .onEngineTick(() => { if (fit === 'now') { fitNow(0); fit = 'settle' } })
    .onEngineStop(() => { if (fit) { fitNow(500); fit = null } })
  // bigger documents push harder and sit further from their neighbours, so circles do not overlap
  fg.d3Force('charge')?.strength((n: N) => -40 - 14 * nodeVal(n))
  fg.d3Force('link')?.distance((l: L) => endRadius(l.source) + endRadius(l.target) + (l.kind === 'lesson' ? 8 : 36))

  return {
    setData(data) {
      const prev = new Map(fg.graphData().nodes.map((n) => [n.id, n]))
      fit = 'now'
      layoutMotion(fg, state.current)
      fg.graphData({
        nodes: data.nodes.map((n) => { const p = prev.get(n.id); return p ? { ...n, x: p.x, y: p.y } : { ...n } }),
        links: data.links.map((l) => ({ ...l })),
      })
    },
    restyle() { fg.nodeCanvasObject(drawNode) },
    resize(width, height) { fg.width(width).height(height) },
    center(id) {
      const n = fg.graphData().nodes.find((x) => x.id === id)
      if (!n) return
      fit = null
      fg.centerAt(n.x, n.y, moveMs(state.current, 600)).zoom(Math.max(fg.zoom(), 2.2), moveMs(state.current, 600))
    },
    fit() { fit = null; fitNow(400) },
    destroy() {
      host.removeEventListener('wheel', moved); host.removeEventListener('pointerdown', moved)
      fg._destructor(); host.replaceChildren()
    },
  }
}
