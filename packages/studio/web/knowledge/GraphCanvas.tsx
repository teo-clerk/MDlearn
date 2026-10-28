// Hosts the 2D or the 3D drawing, each loaded on demand (3D brings three.js, so only when you switch to it), and
// shows the hovered node's name beside the pointer. The canvas is for the mouse and touch; the panel beside it
// and the Layers view are the keyboard and screen-reader ways in.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { reducedMotion } from '../widgets/motion'
import { Spinner } from '../ui/primitives'
import type { GNode, GraphData, GraphView } from './graph'
import type { GraphColors } from './graphColors'
import type { Engine, EngineState } from './graphEngine'
import { t } from '../i18n'

interface Props {
  data: GraphData
  mode: '2d' | '3d'
  view: Omit<GraphView, 'hover'>
  colors: GraphColors
  /** Move the camera to this node; a new object for each request. */
  center: { id: string } | null
  /** Changes when the whole graph should be fitted into view. */
  fitSignal: number
  describe: (n: GNode) => string
  onOpen: (n: GNode) => void
  onSelect: (id: string | null) => void
  onFail: (error: unknown) => void
  /** Buttons shown in the top-right corner of the drawing. */
  controls?: ReactNode
}

export function GraphCanvas({ data, mode, view, colors, center, fitSignal, describe, onOpen, onSelect, onFail, controls }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const engine = useRef<Engine | null>(null)
  const [ready, setReady] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  // touch has no hover: the panel shows the tapped node, so no name follows the finger
  const [touch, setTouch] = useState(false)
  // what the engine reads on each frame, and the latest callbacks for its events: kept current after each render
  const state = useRef<EngineState>({ view: { ...view, hover: null }, colors, reduced: reducedMotion() })
  const latest = useRef({ data, onOpen, onSelect, onFail })
  useLayoutEffect(() => { latest.current = { data, onOpen, onSelect, onFail } })
  useLayoutEffect(() => {
    state.current = { view: { ...view, hover }, colors, reduced: reducedMotion() }
    engine.current?.restyle()
  }, [ready, hover, view, colors])

  useEffect(() => {
    let cancelled = false, eng: Engine | null = null
    setReady(false)
    const load = mode === '3d' ? import('./graphEngine3d') : import('./graphEngine2d')
    load.then(({ mount }) => {
      if (cancelled || !host.current || !wrap.current) return
      eng = mount(host.current, state, {
        onHover: setHover,
        onClick: (id, touch) => {
          const n = latest.current.data.nodes.find((x) => x.id === id)
          if (n) { if (touch) latest.current.onSelect(id); else latest.current.onOpen(n) }
        },
        onBackground: () => latest.current.onSelect(null),
      })
      eng.resize(wrap.current.clientWidth, wrap.current.clientHeight)
      eng.setData(latest.current.data)
      engine.current = eng
      setReady(true)
    }).catch((e: unknown) => { if (!cancelled) latest.current.onFail(e) })
    return () => { cancelled = true; eng?.destroy(); engine.current = null; setHover(null) }
  }, [mode])
  useEffect(() => { engine.current?.setData(data) }, [data])
  // a request made while the engine loads (after a 2D/3D switch) is applied once it is ready
  useEffect(() => { if (center && ready) engine.current?.center(center.id) }, [center, ready])
  useEffect(() => { if (fitSignal) engine.current?.fit() }, [fitSignal])
  useEffect(() => {
    const el = wrap.current; if (!el) return
    const ro = new ResizeObserver(() => engine.current?.resize(el.clientWidth, el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const hovered = hover && !touch ? data.nodes.find((n) => n.id === hover) : undefined
  return (
    <div ref={wrap} className="relative h-[50vh] min-h-[320px] overflow-hidden sm:h-[60vh] rounded-[10px] border border-border bg-panel"
      onPointerDown={(e) => setTouch(e.pointerType !== 'mouse')}
      onPointerMove={(e) => {
        const box = wrap.current?.getBoundingClientRect()
        const el = tip.current
        if (!box || !el) return
        // beside the pointer, flipped to its other side near the right or bottom edge
        const x = e.clientX - box.left, y = e.clientY - box.top
        const left = x + 14 + el.offsetWidth > box.width ? x - 14 - el.offsetWidth : x + 14
        const top = y + 14 + el.offsetHeight > box.height ? y - 14 - el.offsetHeight : y + 14
        el.style.transform = `translate(${Math.max(0, left)}px, ${Math.max(0, top)}px)`
      }}>
      <div ref={host} className="absolute inset-0" aria-hidden data-graph={mode} data-ready={ready || undefined} />
      {controls && <div className="absolute right-2 top-2 flex gap-1">{controls}</div>}
      {!ready && <div className="absolute inset-0 flex items-center justify-center"><Spinner label={mode === '3d' ? t('Loading the 3D view') : t('Drawing the graph')} /></div>}
      <div ref={tip} className={`pointer-events-none absolute left-0 top-0 max-w-[18rem] rounded-[6px] border border-border-strong bg-raised px-2.5 py-1.5 shadow-[var(--shadow)] ${hovered ? '' : 'hidden'}`} aria-hidden>
        {hovered && (
          <>
            <p className="text-[13px] font-medium leading-snug">{hovered.title}</p>
            <p className="mt-0.5 text-[12px] text-muted">{describe(hovered)}</p>
          </>
        )}
      </div>
    </div>
  )
}
