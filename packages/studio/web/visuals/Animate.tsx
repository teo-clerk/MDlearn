// A derivation that unfolds: each step adds a formula under the last, the new one fading in; Back / Next /
// Play. With reduced motion the steps simply appear.
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react'
import type { Visual } from '@mdlearn/core'
import { Prose } from '../prose/Prose'
import { Tex } from '../prose/Tex'
import { Frame } from './Plot'

type AnimateBlock = Extract<Visual, { type: 'animate' }>
export function Animate({ b }: { b: AnimateBlock }) {
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(b.auto)
  const last = b.frames.length - 1
  useEffect(() => {
    if (!playing) return
    if (step >= last) { setPlaying(false); return }
    const t = setTimeout(() => setStep((s) => Math.min(s + 1, last)), 2400)
    return () => clearTimeout(t)
  }, [playing, step, last])
  const btn = 'inline-flex size-8 items-center justify-center rounded-[6px] text-muted hover:bg-hover hover:text-text disabled:opacity-30 cursor-pointer'
  return (
    <Frame b={b}>
      <ol className="flex flex-col gap-1" aria-live="polite">
        {b.frames.slice(0, step + 1).map((f, i) => (
          <li key={i} className={`animate-step rounded-[8px] px-3 py-1 transition-colors duration-300 ${i === step ? 'bg-hover' : 'opacity-60'}`}>
            <span className="sr-only">Step {i + 1} of {b.frames.length}. </span>
            <Tex tex={f.tex} display eager />
            {f.caption.length > 0 && <div className="read -mt-1 pb-1 text-[15.5px] text-text/85"><Prose nodes={f.caption} /></div>}
          </li>
        ))}
      </ol>
      <div className="mt-2 flex items-center gap-1 font-ui">
        <button type="button" className={btn} aria-label="Previous step" disabled={step === 0} onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)) }}><ChevronLeft className="size-4" /></button>
        {step < last
          ? <button type="button" className={btn} aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((p) => !p)}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}</button>
          : <button type="button" className={btn} aria-label="Start again" onClick={() => { setStep(0); setPlaying(false) }}><RotateCcw className="size-4" /></button>}
        <button type="button" className={btn} aria-label="Next step" disabled={step === last} onClick={() => { setPlaying(false); setStep((s) => Math.min(last, s + 1)) }}><ChevronRight className="size-4" /></button>
        <span className="ml-1 tabular text-[12.5px] text-muted">Step {step + 1} of {b.frames.length}</span>
        <span className="ml-auto flex gap-1" aria-hidden>{b.frames.map((_, i) => <span key={i} className={`size-1.5 rounded-full ${i <= step ? 'bg-text/70' : 'bg-border-strong'}`} />)}</span>
      </div>
    </Frame>
  )
}
