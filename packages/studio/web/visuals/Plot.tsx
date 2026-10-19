// An interactive plot: the formula is evaluated in the browser (MathJSON, no eval), resampled whenever a
// slider moves; a crosshair reads off values. Monochrome: curves differ by dash pattern, not colour.
import { useMemo, useRef, useState, useEffect } from 'react'
import { compileExpr } from '@mdlearn/core/eval'
import type { Visual } from '@mdlearn/core'
import { Inline, Prose } from '../prose/Prose'
import { Tex } from '../prose/Tex'
import { ParamSliders, initialValues, type Values } from './ParamSliders'
import { fmt, linearTicks, logTicks } from './format'

type PlotBlock = Extract<Visual, { type: 'plot' }>
const DASH = ['', '6 4', '2 3', '8 3 2 3']
const N = 240
const M = { l: 58, r: 14, t: 12, b: 34 }

export function Plot({ b }: { b: PlotBlock }) {
  const [values, setValues] = useState<Values>(() => initialValues(b.params))
  const [hover, setHover] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    if (!box.current) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])
  const x = b.params.find((p) => p.id === b.x)!
  const fns = useMemo(() => b.curves.map((c) => compileExpr(c.expr)), [b.curves])
  const data = useMemo(() => {
    const xs = Array.from({ length: N }, (_, i) => { const t = i / (N - 1); return b.xScale === 'log' ? x.min! * (x.max! / x.min!) ** t : x.min! + (x.max! - x.min!) * t })
    const ys = fns.map((f) => xs.map((xv) => f({ ...values, [x.id]: xv })))
    return { xs, ys }
  }, [fns, values, x, b.xScale])
  // a fixed y range that holds the curve for every slider setting, so moving a slider visibly moves it
  const range = useMemo(() => {
    const sliders = b.params.filter((p) => p.id !== x.id && p.min !== undefined).slice(0, 6)
    const base = initialValues(b.params)
    const combos: Values[] = [base]
    for (let mask = 0; mask < 2 ** sliders.length; mask++) combos.push({ ...base, ...Object.fromEntries(sliders.map((p, k) => [p.id, mask & (1 << k) ? p.max! : p.min!])) })
    const ys: number[] = []
    for (const env of combos) for (const f of fns) for (let i = 0; i < N; i += 4) {
      const t = i / (N - 1)
      const y = f({ ...env, [x.id]: b.xScale === 'log' ? x.min! * (x.max! / x.min!) ** t : x.min! + (x.max! - x.min!) * t })
      if (Number.isFinite(y) && (b.yScale !== 'log' || y > 0)) ys.push(y)
    }
    if (!ys.length) return null
    ys.sort((p, q) => p - q)
    // ignore the extreme 1 % (asymptotes) so one spike does not flatten everything
    const cut = Math.floor(ys.length * 0.01)
    return { lo: ys[cut], hi: ys[ys.length - 1 - cut] }
  }, [b, fns, x])
  const finite = data.ys.flat().filter((v) => Number.isFinite(v) && (b.yScale !== 'log' || v > 0))
  const H = b.height, W = width
  if (!finite.length || !range) return <Frame b={b}><p className="py-8 text-center font-ui text-[13px] text-muted">No values to draw with these settings.</p></Frame>
  let lo = range.lo, hi = range.hi
  if (lo === hi) { lo -= Math.abs(lo) * 0.1 || 1; hi += Math.abs(hi) * 0.1 || 1 }
  if (b.yScale === 'linear') { const pad = (hi - lo) * 0.06; lo = lo >= 0 && lo - pad < 0 ? 0 : lo - pad; hi += pad }
  const sx = (v: number) => M.l + (b.xScale === 'log' ? Math.log(v / x.min!) / Math.log(x.max! / x.min!) : (v - x.min!) / (x.max! - x.min!)) * (W - M.l - M.r)
  const sy = (v: number) => H - M.b - (b.yScale === 'log' ? Math.log(v / lo) / Math.log(hi / lo) : (v - lo) / (hi - lo)) * (H - M.t - M.b)
  const xt = b.xScale === 'log' ? logTicks(x.min!, x.max!) : linearTicks(x.min!, x.max!)
  const yt = b.yScale === 'log' ? logTicks(lo, hi) : linearTicks(lo, hi)
  const path = (ys: number[]) => {
    let d = '', pen = false
    ys.forEach((y, i) => {
      const ok = Number.isFinite(y) && (b.yScale !== 'log' || y > 0) && y >= lo - (hi - lo) * 5 && y <= hi + (hi - lo) * 5
      if (!ok) { pen = false; return }
      d += `${pen ? 'L' : 'M'}${sx(data.xs[i]).toFixed(1)},${sy(Math.min(Math.max(y, lo), hi)).toFixed(1)}`
      pen = true
    })
    return d
  }
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    if (px < M.l || px > W - M.r) { setHover(null); return }
    setHover(Math.round(((px - M.l) / (W - M.l - M.r)) * (N - 1)))
  }
  return (
    <Frame b={b}>
      <div ref={box} className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`Plot of ${b.curves.map((c) => c.lhs ?? 'y').join(', ')} against ${x.sym}`}
          onPointerMove={onMove} onPointerLeave={() => setHover(null)} className="block touch-none select-none font-ui">
          {yt.map((t) => <g key={`y${t}`}><line x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} stroke="var(--border)" /><text x={M.l - 6} y={sy(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--muted)">{fmt(t, 2)}</text></g>)}
          {xt.map((t) => <g key={`x${t}`}><line x1={sx(t)} x2={sx(t)} y1={M.t} y2={H - M.b} stroke="var(--border)" strokeDasharray="2 3" /><text x={sx(t)} y={H - M.b + 15} textAnchor="middle" fontSize="11" fill="var(--muted)">{fmt(t, 2)}</text></g>)}
          <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--border-strong)" />
          {data.ys.map((ys, i) => <path key={i} d={path(ys)} fill="none" stroke="var(--text)" strokeWidth={i === 0 ? 2 : 1.6} strokeDasharray={DASH[i]} strokeLinejoin="round" />)}
          {hover !== null && (
            <g>
              <line x1={sx(data.xs[hover])} x2={sx(data.xs[hover])} y1={M.t} y2={H - M.b} stroke="var(--muted)" />
              {data.ys.map((ys, i) => Number.isFinite(ys[hover]) && ys[hover] >= lo && ys[hover] <= hi && <circle key={i} cx={sx(data.xs[hover])} cy={sy(ys[hover])} r={3.5} fill="var(--bg)" stroke="var(--text)" strokeWidth={1.5} />)}
            </g>
          )}
        </svg>
        {hover !== null && (
          <div className="pointer-events-none absolute right-3 top-2 rounded-[6px] border border-border bg-raised px-2 py-1 font-ui text-[12px] tabular shadow-pop">
            <div><Tex tex={x.sym} eager /> = {fmt(data.xs[hover])}{x.unit ? ` ${x.unit.replace(/\$/g, '')}` : ''}</div>
            {b.curves.map((c, i) => <div key={i}>{c.lhs ? <Tex tex={c.lhs} eager /> : 'y'} = {fmt(data.ys[i][hover])}</div>)}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 px-1 font-ui text-[12px] text-muted">
          <span>{b.curves.length > 1 && b.curves.map((c, i) => <span key={i} className="mr-3 inline-flex items-center gap-1"><svg width="22" height="6" aria-hidden><line x1="0" x2="22" y1="3" y2="3" stroke="var(--text)" strokeWidth="2" strokeDasharray={DASH[i]} /></svg>{c.lhs ? <Tex tex={c.lhs} eager /> : `curve ${i + 1}`}</span>)}</span>
          <span><Tex tex={x.sym} eager />{x.unit ? ` (${x.unit.replace(/\$/g, '')})` : ''}{b.xScale === 'log' ? ', log scale' : ''}</span>
        </div>
      </div>
      <ParamSliders params={b.params} values={values} onChange={setValues} exclude={b.x} />
    </Frame>
  )
}

export function Frame({ b, children }: { b: { caption?: unknown; body: unknown; type: string }; children: React.ReactNode }) {
  const caption = b.caption as Parameters<typeof Inline>[0]['nodes'] | undefined
  return (
    <figure className="not-prose my-6 rounded-[10px] border border-border px-4 py-3.5" aria-label={b.type}>
      {caption && <figcaption className="mb-1 font-ui text-[14px] font-semibold text-text"><Inline nodes={caption} /></figcaption>}
      {(b.body as unknown[]).length > 0 && <div className="read mb-2 text-[16px] text-text/90"><Prose nodes={b.body as Parameters<typeof Prose>[0]['nodes']} /></div>}
      {children}
    </figure>
  )
}
