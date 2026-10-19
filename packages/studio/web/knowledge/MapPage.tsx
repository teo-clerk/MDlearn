// The map of your documents: what builds on what, prerequisites first, with how well you remember each.
// The whole folder as a layered graph (zoom and scroll), or what surrounds one document.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearch } from 'wouter'
import { Network, Minus, Plus, Maximize, ExternalLink } from 'lucide-react'
import { useMapData } from '../api/queries'
import { docRoute } from '../lib/paths'
import { prettyTitle } from '../lib/title'
import { Empty, ErrorNote, IconButton, Spinner } from '../ui/primitives'
import { BuildNote, Frame } from './Frame'
import { layoutGraph, neighbourhood, pathOf, NODE_H, NODE_W } from './layout'
import type { MapNode } from '../../shared/types'

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const dot = (m: MapNode) => (m.memory === null || !m.seen ? 'fill-transparent stroke-subtle' : m.memory >= 0.85 ? 'fill-good stroke-good' : m.memory >= 0.6 ? 'fill-warn stroke-warn' : 'fill-bad stroke-bad')
const mapRoute = (ws: string, doc?: string) => `/w/${ws}/map${doc ? `?doc=${encodeURIComponent(doc)}` : ''}`

export default function MapPage({ ws }: { ws: string }) {
  const res = useMapData(ws)
  const [, navigate] = useLocation()
  const focus = new URLSearchParams(useSearch()).get('doc')
  const [showLinks, setShowLinks] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const [zoom, setZoom] = useState<number | 'fit'>('fit')
  const box = useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = useState(900)
  useEffect(() => { document.title = 'Map · MDlearn Studio' }, [])
  useEffect(() => { setZoom('fit') }, [focus])
  useEffect(() => {
    const el = box.current; if (!el) return
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth)); ro.observe(el); setBoxW(el.clientWidth)
    return () => ro.disconnect()
  })
  const byPath = useMemo(() => new Map((res.data?.nodes ?? []).map((n) => [n.path, n])), [res.data])
  const focused = focus ? byPath.get(focus) : undefined
  const edges = useMemo(() => {
    const all = res.data?.edges ?? []
    if (focus) return neighbourhood(all, focus, { depth: 2, links: showLinks })
    return all.filter((e) => e.kind === 'prereq')
  }, [res.data, focus, showLinks])
  const layout = useMemo(() => (res.data ? layoutGraph(res.data.nodes.map((n) => ({ path: n.path, title: n.title })), edges) : null), [res.data, edges])
  const near = useMemo(() => {
    if (!hover) return null
    const s = new Set([hover]); for (const e of edges) { if (e.from === hover) s.add(e.to); if (e.to === hover) s.add(e.from) }
    return s
  }, [hover, edges])
  // the whole folder shrinks to fit (a bird's-eye view); one document's surroundings stay readable and scroll sideways on a phone
  const scale = layout ? (zoom === 'fit' ? Math.max(focus ? 0.55 : 0.2, Math.min(1, (boxW - 2) / Math.max(1, layout.width))) : zoom) : 1
  const step = (f: number) => setZoom(Math.max(0.2, Math.min(2.5, +(scale * f).toFixed(3))))
  const nPrereq = res.data?.edges.filter((e) => e.kind === 'prereq').length ?? 0
  const hint = !res.data ? undefined : focused
    ? <>Around <strong className="font-semibold text-text">{prettyTitle(focused.title)}</strong>: what it builds on to the left, what builds on it to the right.</>
    : <>Documents on the left come first. <span className="tabular">{nPrereq}</span> prerequisites{nPrereq ? '; click a document to see what surrounds it.' : ' are declared in these documents.'}</>
  return (
    <Frame wide title="Map" hint={hint}
      actions={res.data && (
        <div className="flex flex-wrap items-center gap-3">
          {focused && (
            <>
              <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-muted"><input type="checkbox" checked={showLinks} onChange={(e) => setShowLinks(e.target.checked)} className="accent-[var(--accent)]" />Include links</label>
              <Link href={docRoute(ws, focused.path)} className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-border-strong px-2.5 text-[12.5px] font-medium hover:bg-hover"><ExternalLink className="size-3.5" aria-hidden />Open</Link>
              <Link href={mapRoute(ws)} className="inline-flex h-7 items-center rounded-[6px] px-2 text-[12.5px] text-muted hover:bg-hover hover:text-text">Whole folder</Link>
            </>
          )}
          <div className="flex items-center gap-0.5" role="group" aria-label="Zoom">
            <IconButton icon={Minus} label="Zoom out" onClick={() => step(0.8)} />
            <IconButton icon={Maximize} label="Fit to width" onClick={() => setZoom('fit')} />
            <IconButton icon={Plus} label="Zoom in" onClick={() => step(1.25)} />
          </div>
        </div>
      )}>
      <BuildNote status={res.data?.status} />
      {res.isLoading && <Spinner label="Drawing the map" />}
      {res.error && <ErrorNote error={res.error} retry={() => res.refetch()} />}
      {res.data && focus && !focused && <Empty icon={Network} title="That document is not in the folder" action={<Link href={mapRoute(ws)} className="text-accent-ink underline underline-offset-2">Show the whole folder</Link>} />}
      {layout && layout.nodes.length === 0 && !res.data?.status.building && (!focus || focused) && (
        <Empty icon={Network} title={focused ? 'Nothing is connected to this document' : 'Nothing is linked yet'}>
          {focused ? 'No prerequisites or links join it to other documents.' : 'Documents that list prerequisites are drawn here.'}
        </Empty>
      )}
      {layout && layout.nodes.length > 0 && (
        <div ref={box} className="max-h-[68vh] overflow-auto rounded-[10px] border border-border bg-panel" tabIndex={0} aria-label="Map of documents">
          <svg width={layout.width * scale} height={layout.height * scale} viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-label="Documents and how they connect" className="block">
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
              const go = () => navigate(isFocus ? docRoute(ws, n.path) : mapRoute(ws, n.path))
              return (
                <g key={n.path} transform={`translate(${n.x},${n.y})`} opacity={on ? 1 : 0.2} tabIndex={0} role="link"
                  aria-label={`${prettyTitle(m.title)}${m.memory !== null && m.seen ? `, remembered ${Math.round(m.memory * 100)}%` : ''}${isFocus ? ', open it' : ', see what surrounds it'}`}
                  onMouseEnter={() => setHover(n.path)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(n.path)} onBlur={() => setHover(null)}
                  onClick={go} onDoubleClick={() => navigate(docRoute(ws, n.path))} onKeyDown={(e) => { if (e.key === 'Enter') go() }}
                  className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-focus [&:focus-visible>rect]:stroke-2">
                  <title>{`${prettyTitle(m.title)}\n${n.path}${m.lessons ? `\n${m.lessons} lessons` : ''}\nClick: what surrounds it · double-click: open`}</title>
                  <rect width={NODE_W} height={NODE_H} rx={7} className={`fill-raised ${isFocus ? 'stroke-text' : 'stroke-border-strong'}`} strokeWidth={isFocus ? 1.8 : 1} />
                  <circle cx={14} cy={NODE_H / 2} r={4} strokeWidth={1.4} className={dot(m)} />
                  <text x={26} y={NODE_H / 2 + 4} fontSize={12} className="fill-text font-ui">{clip(prettyTitle(m.title), 25)}</text>
                </g>
              )
            })}
          </svg>
        </div>
      )}
      {layout && !focus && layout.isolated.length > 0 && (
        <section className="mt-6" aria-labelledby="isolated">
          <h2 id="isolated" className="text-[13px] font-medium text-muted">Without prerequisites on either side</h2>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {layout.isolated.slice(0, 80).map((n) => <li key={n.path}><Link href={mapRoute(ws, n.path)} className="inline-block max-w-[16rem] truncate rounded-[6px] border border-border px-2 py-1 text-[12.5px] text-muted hover:bg-hover hover:text-text">{prettyTitle(n.title)}</Link></li>)}
            {layout.isolated.length > 80 && <li className="px-1 py-1 text-[12.5px] text-subtle">+{layout.isolated.length - 80} more</li>}
          </ul>
        </section>
      )}
    </Frame>
  )
}
