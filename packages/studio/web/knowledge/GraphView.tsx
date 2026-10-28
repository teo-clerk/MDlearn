// The map's graph view, like Obsidian's: every document a dot sized by its words and coloured by how well you
// remember it, prerequisites as arrows, links dashed. Hovering lights what a document connects to and a click opens
// it; around one document (?doc=) it shows what lies a few steps away. 2D, or 3D loaded on demand. The panel beside
// it (search, the chosen document and its neighbours) is the keyboard way through.
import { useEffect, useMemo, useRef, useState, type FormEvent, type Ref } from 'react'
import { Link, useLocation } from 'wouter'
import { Maximize, Network, X } from 'lucide-react'
import { docRoute, lessonRoute, mapRoute } from '../lib/paths'
import { prettyTitle } from '../lib/title'
import { Empty, IconButton } from '../ui/primitives'
import { GraphCanvas } from './GraphCanvas'
import { adjacency, buildGraph, DEFAULT_FILTERS, matchesQuery, memoryTone, neighboursOf, type GNode, type GraphData, type GraphFilters } from './graph'
import { useGraphColors } from './graphColors'
import type { MapNode, MapResponse } from '../../shared/types'
import { t, tp } from '../i18n'

type Mode = '2d' | '3d'
const MODE_KEY = 'mdl-graph-mode', FILTERS_KEY = 'mdl-graph-filters'
const MAX_LISTED = 8, MAX_RESULTS = 12
const button = 'inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-[12.5px] font-medium'

// ---- per-device choices (localStorage; a private window just forgets them)
function load<T>(key: string, parse: (raw: unknown) => T | null, fallback: T): T {
  try { const raw = localStorage.getItem(key); return (raw === null ? null : parse(JSON.parse(raw))) ?? fallback } catch { return fallback }
}
function save(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode: this visit only */ } }
const parseMode = (v: unknown): Mode | null => (v === '2d' || v === '3d' ? v : null)
function parseFilters(v: unknown): GraphFilters | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const pick = (k: keyof GraphFilters) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : DEFAULT_FILTERS[k])
  return { links: pick('links'), prereqs: pick('prereqs'), lessons: pick('lessons'), orphans: pick('orphans') }
}

function memoryText(n: GNode): string {
  if (n.kind === 'lesson') return t('Lesson')
  return memoryTone(n) === 'none' ? t('No cards studied yet') : t('Remembered {pct}%', { pct: Math.round((n.memory ?? 0) * 100) })
}
const describe = (n: GNode) => [memoryText(n), n.kind === 'doc' && n.lessons ? tp(n.lessons, '{n} lesson', '{n} lessons') : '', t('click to open')].filter(Boolean).join(' · ')
const routeOf = (ws: string, n: GNode) => (n.kind === 'lesson' ? lessonRoute(ws, n.id) : docRoute(ws, n.id))

/** Remount with `key={focus}` to start afresh around another document. */
export function GraphView({ ws, data, focused }: { ws: string; data: MapResponse; focused: MapNode | undefined }) {
  const [, navigate] = useLocation()
  const colors = useGraphColors()
  const focus = focused?.path ?? null
  const [mode, setModeState] = useState<Mode>(() => load(MODE_KEY, parseMode, '2d'))
  const [filters, setFilters] = useState<GraphFilters>(() => load(FILTERS_KEY, parseFilters, DEFAULT_FILTERS))
  const [depth, setDepth] = useState(1)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(focus)
  const [center, setCenter] = useState<{ id: string } | null>(null)
  const [fitSignal, setFitSignal] = useState(0)
  const [failed, setFailed] = useState<Mode | null>(null)
  // after choosing, focus moves to the chosen document's heading (which also brings it into view on a phone,
  // where the panel is below the drawing); after closing it, back to the search
  const [focusTo, setFocusTo] = useState<{ to: 'chosen' | 'search' } | null>(null)
  const chosenHeading = useRef<HTMLHeadingElement>(null), searchBox = useRef<HTMLInputElement>(null)
  useEffect(() => { if (focusTo) (focusTo.to === 'chosen' ? chosenHeading : searchBox).current?.focus() }, [focusTo])

  const pretty = useMemo(() => ({ edges: data.edges, nodes: data.nodes.map((n) => ({ ...n, title: prettyTitle(n.title) })) }), [data])
  const graph = useMemo(() => buildGraph(pretty, filters, focus ? { path: focus, depth } : undefined), [pretty, filters, focus, depth])
  const adj = useMemo(() => adjacency(graph), [graph])
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph])
  const results = useMemo(() => (query.trim() ? graph.nodes.filter((n) => matchesQuery(n.title, query)) : null), [graph, query])
  // nothing found: the graph stays as it is rather than dimming everything
  const matches = useMemo(() => (results?.length ? new Set(results.map((n) => n.id)) : null), [results])
  const chosen = selected ? byId.get(selected) : undefined
  const view = useMemo(() => ({ selected: chosen?.id ?? null, focus, matches, adjacency: adj }), [chosen, focus, matches, adj])

  const setMode = (m: Mode) => { setModeState(m); save(MODE_KEY, m); setFailed(null) }
  const setFilter = (k: keyof GraphFilters, on: boolean) => { const next = { ...filters, [k]: on }; setFilters(next); save(FILTERS_KEY, next) }
  const choose = (id: string) => { setSelected(id); setCenter({ id }); setQuery(''); setFocusTo({ to: 'chosen' }) }
  const tapped = (id: string | null) => { setSelected(id); if (id) setFocusTo({ to: 'chosen' }) }
  const close = () => { setSelected(null); setFocusTo({ to: 'search' }) }
  const onFail = () => { setFailed(mode); if (mode === '3d') { setModeState('2d'); save(MODE_KEY, '2d') } }
  const submit = (e: FormEvent) => { e.preventDefault(); if (results?.[0]) choose(results[0].id) }
  const filter = (k: keyof GraphFilters, label: string) => (
    <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-muted">
      <input type="checkbox" checked={filters[k]} onChange={(e) => setFilter(k, e.target.checked)} className="accent-[var(--accent)]" />{label}
    </label>
  )
  return (
    <div className="grid gap-x-5 gap-y-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div role="group" aria-label={t('Graph view')} className="inline-flex rounded-[7px] border border-border p-0.5">
            {(['2d', '3d'] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
                className={`h-7 cursor-pointer rounded-[5px] px-2.5 text-[12.5px] font-medium ${mode === m ? 'bg-active text-text' : 'text-muted hover:text-text'}`}>{m === '2d' ? '2D' : '3D'}</button>
            ))}
          </div>
          <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <legend className="sr-only">{t('Show')}</legend>
            {filter('prereqs', t('Prerequisites'))}{filter('links', t('Links'))}{filter('lessons', t('Lessons'))}{!focus && filter('orphans', t('Unconnected'))}
          </fieldset>
          {focus && (
            <label className="flex items-center gap-2 text-[13px] text-muted">{t('Steps away')}
              <input type="range" min={1} max={3} value={depth} onChange={(e) => setDepth(Number(e.target.value))} aria-valuetext={tp(depth, '{n} step', '{n} steps')} className="w-20 accent-[var(--accent)]" />
              <span className="w-3 tabular-nums text-text" aria-hidden>{depth}</span>
            </label>
          )}
        </div>
        {failed && <p role="status" className="mb-2 text-[12.5px] text-muted">{failed === '3d' ? t('The 3D view could not start here (it needs WebGL), so the graph is shown in 2D.') : t('The graph could not be drawn. The Layers view shows the same documents.')}</p>}
        {graph.nodes.length === 0
          ? <Empty icon={Network} title={t('Nothing to draw with these filters')} />
          : failed === '2d' ? null : <GraphCanvas data={graph} mode={mode} view={view} colors={colors} center={center} fitSignal={fitSignal} describe={describe}
              onOpen={(n) => navigate(routeOf(ws, n))} onSelect={tapped} onFail={onFail}
              controls={<IconButton icon={Maximize} label={t('Fit the whole graph')} onClick={() => setFitSignal((n) => n + 1)} className="bg-raised/80" />} />}
        <Legend />
      </div>
      <aside aria-label={t('Graph details')} className="min-w-0">
        <form role="search" onSubmit={submit}>
          <input ref={searchBox} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Find a document')} aria-label={t('Find a document in the graph')}
            className="h-9 w-full rounded-[6px] border border-border-strong bg-raised px-3 text-[14px] outline-none placeholder:text-subtle focus:border-focus" />
        </form>
        {results
          ? <Results results={results} onChoose={choose} />
          : chosen
            ? <Details ws={ws} node={chosen} graph={graph} byId={byId} isFocus={chosen.id === focus} onChoose={choose} onClose={close} headingRef={chosenHeading} />
            : <Summary graph={graph} />}
      </aside>
    </div>
  )
}

function Results({ results, onChoose }: { results: GNode[]; onChoose: (id: string) => void }) {
  return (
    <div className="mt-3">
      <p className="text-[12px] text-muted" role="status">{results.length ? tp(results.length, '{n} match', '{n} matches') : t('Nothing matches')}</p>
      <ul className="mt-1 space-y-0.5">
        {results.slice(0, MAX_RESULTS).map((n) => (
          <li key={n.id}><button type="button" onClick={() => onChoose(n.id)} className="w-full cursor-pointer truncate rounded-[5px] px-1.5 py-1 text-left text-[13px] hover:bg-hover">{n.title}</button></li>
        ))}
        {results.length > MAX_RESULTS && <li className="px-1.5 text-[12px] text-subtle">{t('+{n} more', { n: results.length - MAX_RESULTS })}</li>}
      </ul>
    </div>
  )
}

function Details({ ws, node, graph, byId, isFocus, onChoose, onClose, headingRef }: { ws: string; node: GNode; graph: GraphData; byId: Map<string, GNode>; isFocus: boolean; onChoose: (id: string) => void; onClose: () => void; headingRef: Ref<HTMLHeadingElement> }) {
  const nb = neighboursOf(graph, node.id)
  const groups: [string, string[]][] = [[t('Builds on'), nb.buildsOn], [t('Leads to'), nb.leadsTo], [t('Linked with'), nb.linked], [t('Lessons'), nb.lessons]]
  return (
    <section aria-labelledby="graph-chosen" className="mt-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11.5px] font-medium uppercase tracking-[0.04em] text-subtle">{node.kind === 'lesson' ? t('Lesson') : t('Document')}</p>
          <h2 id="graph-chosen" ref={headingRef} tabIndex={-1} className="mt-0.5 scroll-mt-16 text-[15px] font-semibold leading-snug outline-none">{node.title}</h2>
        </div>
        <IconButton icon={X} label={t('Close')} onClick={onClose} />
      </div>
      <p className="mt-1 text-[12.5px] text-muted">{[memoryText(node), node.kind === 'doc' && node.lessons ? tp(node.lessons, '{n} lesson', '{n} lessons') : ''].filter(Boolean).join(' · ')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={routeOf(ws, node)} className={`${button} bg-accent text-on-accent hover:brightness-[1.06]`}>{t('Open')}</Link>
        {node.kind === 'doc' && !isFocus && <Link href={mapRoute(ws, node.id)} className={`${button} border border-border-strong hover:bg-hover`}>{t('Graph around it')}</Link>}
      </div>
      {groups.filter(([, ids]) => ids.length > 0).map(([label, ids]) => (
        <div key={label} className="mt-4">
          <h3 className="text-[12px] font-medium text-muted">{label}</h3>
          <ul className="mt-1 space-y-0.5">
            {ids.slice(0, MAX_LISTED).map((id) => (
              <li key={id}><button type="button" onClick={() => onChoose(id)} className="w-full cursor-pointer truncate rounded-[5px] px-1.5 py-1 text-left text-[13px] hover:bg-hover">{byId.get(id)?.title ?? id}</button></li>
            ))}
            {ids.length > MAX_LISTED && <li className="px-1.5 text-[12px] text-subtle">{t('+{n} more', { n: ids.length - MAX_LISTED })}</li>}
          </ul>
        </div>
      ))}
    </section>
  )
}

function Summary({ graph }: { graph: GraphData }) {
  const docs = graph.nodes.filter((n) => n.kind === 'doc').length
  const lines = graph.links.filter((l) => l.kind !== 'lesson').length
  return (
    <div className="mt-4 space-y-2 text-[13px] text-muted">
      <p className="text-text">{tp(docs, '{n} document', '{n} documents')} · {tp(lines, '{n} connection', '{n} connections')}</p>
      <p>{t('Hover a document to light up what it connects to, and click to open it. Drag to move around; scroll or pinch to zoom. On a touch screen, tap a document to see it here.')}</p>
      <p>{t('To go through the documents with the keyboard, use the search above or the Layers view.')}</p>
    </div>
  )
}

function Legend() {
  const dot = (cls: string) => <span className={`inline-block size-2.5 shrink-0 rounded-full ${cls}`} aria-hidden />
  const line = (dash?: string) => <svg width="18" height="6" aria-hidden className="shrink-0"><line x1="0" y1="3" x2="18" y2="3" strokeWidth="1.5" strokeDasharray={dash} className={dash ? 'stroke-border-strong' : 'stroke-muted'} /></svg>
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted" aria-label={t('Legend')}>
      <li className="flex items-center gap-1.5">{dot('bg-good')}{t('Remembered well')}</li>
      <li className="flex items-center gap-1.5">{dot('bg-warn')}{t('Fading')}</li>
      <li className="flex items-center gap-1.5">{dot('bg-bad')}{t('Needs review')}</li>
      <li className="flex items-center gap-1.5">{dot('border border-subtle')}{t('No cards studied yet')}</li>
      <li className="flex items-center gap-1.5">{line()}{t('Prerequisite')}</li>
      <li className="flex items-center gap-1.5">{line('3 2')}{t('Link')}</li>
    </ul>
  )
}
