// The map's layered view: what builds on what, prerequisites first, with how well you remember each. The whole
// folder as a layered graph (zoom and scroll), or what surrounds one document. Every document is a link, so it
// works with the keyboard and a screen reader.
import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from 'react'
import { Link, useLocation } from 'wouter'
import { Network, Minus, Plus, Maximize, ExternalLink } from 'lucide-react'
import { docRoute, mapRoute } from '../lib/paths'
import { prettyTitle } from '../lib/title'
import { Empty, IconButton } from '../ui/primitives'
import { layoutGraph, neighbourhood, pathOf, NODE_H, NODE_W } from './layout'
import { memoryTone, type Tone } from './graph'
import type { MapNode, MapResponse } from '../../shared/types'
import { t, tp } from '../i18n'

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const DOT: Record<Tone, string> = { none: 'fill-transparent stroke-subtle', good: 'fill-good stroke-good', warn: 'fill-warn stroke-warn', bad: 'fill-bad stroke-bad' }
const layersRoute = (ws: string, doc?: string) => mapRoute(ws, doc, 'layers')
/** Below this scale the 12px labels are unreadable: the map opens here and scrolls instead of shrinking further. */
const READABLE = 0.8

export function LayersView({ ws, data, focus, focused }: { ws: string; data: MapResponse; focus: string | null; focused: MapNode | undefined }) {
  const [, navigate] = useLocation()
  const [showLinks, setShowLinks] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const [zoom, setZoom] = useState<number | 'fit' | 'auto'>('auto')
  const box = useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = useState(900)
  useEffect(() => { setZoom('auto') }, [focus])
  useEffect(() => {
    const el = box.current; if (!el) return
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth)); ro.observe(el); setBoxW(el.clientWidth)
    return () => ro.disconnect()
  })
  const byPath = useMemo(() => new Map(data.nodes.map((n) => [n.path, n])), [data])
  const edges = useMemo(() => (focus ? neighbourhood(data.edges, focus, { depth: 2, links: showLinks }) : data.edges.filter((e) => e.kind === 'prereq')), [data, focus, showLinks])
  const layout = useMemo(() => layoutGraph(data.nodes.map((n) => ({ path: n.path, title: n.title })), edges), [data, edges])
  const near = useMemo(() => {
    if (!hover) return null
    const s = new Set([hover]); for (const e of edges) { if (e.from === hover) s.add(e.to); if (e.to === hover) s.add(e.from) }
    return s
  }, [hover, edges])
  // 'auto' opens readable (drag or scroll to move around); 'fit' is the bird's-eye view, labelled on hover
  const fit = Math.max(focus ? 0.55 : 0.2, Math.min(1, (boxW - 2) / Math.max(1, layout.width)))
  const scale = zoom === 'fit' ? fit : zoom === 'auto' ? Math.max(fit, READABLE) : zoom
  const pan = useDragPan(box)
  const step = (f: number) => setZoom(Math.max(0.2, Math.min(2.5, +(scale * f).toFixed(3))))
  if (focus && !focused) return null
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
        {focused && (
          <>
            <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-muted"><input type="checkbox" checked={showLinks} onChange={(e) => setShowLinks(e.target.checked)} className="accent-[var(--accent)]" />{t('Include links')}</label>
            <Link href={docRoute(ws, focused.path)} className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-border-strong px-2.5 text-[12.5px] font-medium hover:bg-hover"><ExternalLink className="size-3.5" aria-hidden />{t('Open')}</Link>
          </>
        )}
        {layout.nodes.length > 0 && (
          <div className="flex items-center gap-0.5" role="group" aria-label={t('Zoom')}>
            <IconButton icon={Minus} label={t('Zoom out')} onClick={() => step(0.8)} />
            <IconButton icon={Maximize} label={t('Whole map at once')} onClick={() => setZoom('fit')} />
            <IconButton icon={Plus} label={t('Zoom in')} onClick={() => step(1.25)} />
          </div>
        )}
      </div>
      {layout.nodes.length === 0 && !data.status.building && (
        <Empty icon={Network} title={focused ? t('Nothing is connected to this document') : t('Nothing is linked yet')}>
          {focused ? t('No prerequisites or links join it to other documents.') : t('Documents that list prerequisites are drawn here.')}
        </Empty>
      )}
      {layout.nodes.length > 0 && (
        <div ref={box} {...pan} className="max-h-[68vh] cursor-grab overflow-auto rounded-[10px] border border-border bg-panel active:cursor-grabbing" tabIndex={0} aria-label={t('Map of documents (drag to move around)')}>
          <svg width={layout.width * scale} height={layout.height * scale} viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-label={t('Documents and how they connect')} className="block">
            <defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L8,4L0,8z" className="fill-muted" /></marker></defs>
            {layout.edges.map((e) => {
              const on = !near || e.from === hover || e.to === hover
              return <path key={`${e.from}>${e.to}`} d={pathOf(e.points)} fill="none" strokeWidth={near && on ? 1.8 : 1} strokeDasharray={e.kind === 'link' ? '3 3' : undefined}
                className={e.kind === 'prereq' ? 'stroke-muted' : 'stroke-border-strong'} opacity={on ? 1 : 0.1} markerEnd={e.kind === 'prereq' ? 'url(#arrow)' : undefined} />
            })}
            {layout.nodes.map((n) => {
              const m = byPath.get(n.path)!
              const on = !near || near.has(n.path)
              const isFocus = n.path === focus
              const go = () => navigate(isFocus ? docRoute(ws, n.path) : layersRoute(ws, n.path))
              return (
                <g key={n.path} transform={`translate(${n.x},${n.y})`} opacity={on ? 1 : 0.2} tabIndex={0} role="link"
                  aria-label={[prettyTitle(m.title), m.memory !== null && m.seen ? t('remembered {pct}%', { pct: Math.round(m.memory * 100) }) : '', isFocus ? t('open it') : t('see what surrounds it')].filter(Boolean).join(', ')}
                  onMouseEnter={() => setHover(n.path)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(n.path)} onBlur={() => setHover(null)}
                  onClick={go} onDoubleClick={() => navigate(docRoute(ws, n.path))} onKeyDown={(e) => { if (e.key === 'Enter') go() }}
                  className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-focus [&:focus-visible>rect]:stroke-2">
                  <title>{`${prettyTitle(m.title)}\n${n.path}${m.lessons ? `\n${tp(m.lessons, '{n} lesson', '{n} lessons')}` : ''}\n${t('Click: what surrounds it · double-click: open')}`}</title>
                  <rect width={NODE_W} height={NODE_H} rx={7} className={`fill-raised ${isFocus ? 'stroke-text' : 'stroke-border-strong'}`} strokeWidth={isFocus ? 1.8 : 1} />
                  <circle cx={14} cy={NODE_H / 2} r={4} strokeWidth={1.4} className={DOT[memoryTone(m)]} />
                  <text x={26} y={NODE_H / 2 + 4} fontSize={12} className="fill-text font-ui">{clip(prettyTitle(m.title), 25)}</text>
                </g>
              )
            })}
            {hover && scale < READABLE && (() => {
              // zoomed out: the hovered document's name at a readable size
              const n = layout.nodes.find((x) => x.path === hover)
              if (!n) return null
              const fs = 12 / scale, label = prettyTitle(byPath.get(n.path)!.title)
              return (
                <g transform={`translate(${n.x},${n.y - fs * 2.2})`} pointerEvents="none" aria-hidden>
                  <rect width={label.length * fs * 0.56 + fs * 1.4} height={fs * 1.9} rx={fs * 0.4} className="fill-raised stroke-border-strong" strokeWidth={1 / scale} />
                  <text x={fs * 0.7} y={fs * 1.3} fontSize={fs} className="fill-text font-ui">{label}</text>
                </g>
              )
            })()}
          </svg>
        </div>
      )}
      {!focus && layout.isolated.length > 0 && (
        <section className="mt-6" aria-labelledby="isolated">
          <h2 id="isolated" className="text-[13px] font-medium text-muted">{t('Without prerequisites on either side')}</h2>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {layout.isolated.slice(0, 80).map((n) => <li key={n.path}><Link href={layersRoute(ws, n.path)} title={prettyTitle(n.title)} className="inline-block max-w-[22rem] truncate rounded-[6px] border border-border px-2 py-1 text-[12.5px] text-muted hover:bg-hover hover:text-text">{prettyTitle(n.title)}</Link></li>)}
            {layout.isolated.length > 80 && <li className="px-1 py-1 text-[12.5px] text-subtle">{t('+{n} more', { n: layout.isolated.length - 80 })}</li>}
          </ul>
        </section>
      )}
    </>
  )
}

/** Drag the map with the mouse to scroll it (touch already scrolls); a drag never counts as a click on a document. */
function useDragPan(box: RefObject<HTMLDivElement | null>) {
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null)
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || !box.current) return
      drag.current = { x: e.clientX, y: e.clientY, left: box.current.scrollLeft, top: box.current.scrollTop, moved: false }
    },
    onPointerMove: (e: PointerEvent) => {
      const d = drag.current, el = box.current
      if (!d || !el || !(e.buttons & 1)) return
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return
      d.moved = true
      el.scrollLeft = d.left - (e.clientX - d.x); el.scrollTop = d.top - (e.clientY - d.y)
    },
    onPointerUp: () => { setTimeout(() => { drag.current = null }, 0) },
    onClickCapture: (e: MouseEvent) => { if (drag.current?.moved) { e.stopPropagation(); e.preventDefault() } },
  }
}
