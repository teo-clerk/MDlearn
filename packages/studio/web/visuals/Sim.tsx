// A simulation written as JavaScript in the lesson: it runs in a sandboxed frame (its own origin, no
// network, no access to this page), gets its sliders' values, and is stopped if it stops responding.
import { useEffect, useRef, useState } from 'react'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import type { Visual } from '@mdlearn/core'
import { Frame } from './Plot'
import { ParamSliders, initialValues, type Values } from './ParamSliders'
import { t } from '../i18n'

type SimBlock = Extract<Visual, { type: 'sim' }>
const theme = () => { const s = getComputedStyle(document.documentElement); return { ink: s.getPropertyValue('--text').trim(), muted: s.getPropertyValue('--muted').trim(), accent: s.getPropertyValue('--text').trim(), bg: s.getPropertyValue('--bg').trim(), grid: s.getPropertyValue('--border').trim() } }
const byKey = (b: SimBlock, v: Values) => Object.fromEntries(b.params.map((p) => [p.key, v[p.id]]))

export function Sim({ b }: { b: SimBlock }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [values, setValues] = useState<Values>(() => initialValues(b.params))
  const [error, setError] = useState<string | null>(null)
  const [run, setRun] = useState(0)
  const seen = useRef(Date.now())
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return
      const m = e.data as { type: string; message?: string }
      if (m.type === 'heartbeat' || m.type === 'ready') seen.current = Date.now()
      if (m.type === 'error') setError(m.message ?? t('The simulation failed.'))
    }
    window.addEventListener('message', onMsg)
    const watchdog = setInterval(() => { if (Date.now() - seen.current > 4000 && !error) setError(t('The simulation stopped responding and was stopped.')) }, 1000)
    return () => { window.removeEventListener('message', onMsg); clearInterval(watchdog) }
  }, [error, run])
  useEffect(() => { frame.current?.contentWindow?.postMessage({ type: 'params', params: byKey(b, values) }, '*') }, [values, b])
  const start = () => {
    seen.current = Date.now()
    const w = frame.current?.clientWidth ?? 600
    frame.current?.contentWindow?.postMessage({ type: 'init', code: b.code, params: byKey(b, values), width: w, height: b.height, theme: theme(), seed: 1 }, '*')
  }
  return (
    <Frame b={b}>
      <div className="relative overflow-hidden rounded-[8px] border border-border" style={{ height: b.height }}>
        {!error && <iframe key={run} ref={frame} title={b.caption ? t('Simulation') : t('Simulation')} src="/sandbox/sim.html" sandbox="allow-scripts" onLoad={start}
          className="block h-full w-full border-0 bg-bg" loading="lazy" />}
        {error && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center font-ui text-[13px]" role="alert">
            <TriangleAlert className="size-5 text-warn" aria-hidden />
            <p className="max-w-[46ch] text-muted">{error}</p>
            <button onClick={() => { setError(null); setRun((r) => r + 1) }} className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-text hover:bg-hover cursor-pointer"><RotateCcw className="size-3.5" aria-hidden />{t('Run again')}</button>
          </div>
        )}
      </div>
      <ParamSliders params={b.params} values={values} onChange={setValues} />
    </Frame>
  )
}
