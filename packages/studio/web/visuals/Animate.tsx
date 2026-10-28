// A sequence that unfolds. By default each step adds a frame under the last (a derivation), the new one
// fading in; with `{replace}` one frame at a time crossfades into the next (a process, a diagram's states).
// A frame is a formula with a caption or any Markdown. Back / Next / Play, and ← / → when focused. With
// reduced motion the steps simply appear.
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react'
import type { Visual } from '@mdlearn/core'
import { Prose, type ProseContext } from '../prose/Prose'
import { Tex } from '../prose/Tex'
import { Frame } from './Plot'
import { t } from '../i18n'

type AnimateBlock = Extract<Visual, { type: 'animate' }>
export function Animate({ b, cx }: { b: AnimateBlock; cx?: ProseContext }) {
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(b.auto)
  const last = b.frames.length - 1
  useEffect(() => {
    if (!playing) return
    if (step >= last) { setPlaying(false); return }
    const t = setTimeout(() => setStep((s) => Math.min(s + 1, last)), b.replace ? 3200 : 2400)
    return () => clearTimeout(t)
  }, [playing, step, last, b.replace])
  const go = (s: number) => { setPlaying(false); setStep(Math.max(0, Math.min(last, s))) }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(step + 1) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(step - 1) }
  }
  const frame = (f: AnimateBlock['frames'][number]): ReactNode => (
    <>
      {f.tex !== undefined && <Tex tex={f.tex} display eager />}
      {f.caption.length > 0 && <div className={f.tex !== undefined ? 'read -mt-1 pb-1 text-[15.5px] text-text/85' : 'read py-1 text-[16.5px]'}><Prose nodes={f.caption} cx={cx} /></div>}
    </>
  )
  const btn = 'inline-flex size-8 items-center justify-center rounded-[6px] text-muted hover:bg-hover hover:text-text disabled:opacity-30 cursor-pointer'
  return (
    <Frame b={b}>
      <div tabIndex={0} onKeyDown={onKey} aria-roledescription={t('step-by-step animation')} className="rounded-[8px] outline-offset-4">
        {b.replace ? (
          // every frame sits in the same cell, so the box keeps the tallest frame's height and nothing jumps
          <div className="grid" aria-live="polite">
            {b.frames.map((f, i) => (
              <div key={i} aria-hidden={i !== step} className={`animate-slide [grid-area:1/1] rounded-[8px] px-3 py-1 ${i === step ? 'is-on' : 'pointer-events-none'}`}>
                <span className="sr-only">{t('Step {n} of {total}.', { n: i + 1, total: b.frames.length })} </span>
                {frame(f)}
              </div>
            ))}
          </div>
        ) : (
          <ol className="flex flex-col gap-1" aria-live="polite">
            {b.frames.slice(0, step + 1).map((f, i) => (
              <li key={i} className={`animate-step rounded-[8px] px-3 py-1 transition-colors duration-300 ${i === step ? 'bg-hover' : 'opacity-60'}`}>
                <span className="sr-only">{t('Step {n} of {total}.', { n: i + 1, total: b.frames.length })} </span>
                {frame(f)}
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1 font-ui">
        <button type="button" className={btn} aria-label={t('Previous step')} disabled={step === 0} onClick={() => go(step - 1)}><ChevronLeft className="size-4" /></button>
        {step < last
          ? <button type="button" className={btn} aria-label={playing ? t('Pause') : t('Play')} onClick={() => setPlaying((p) => !p)}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}</button>
          : <button type="button" className={btn} aria-label={t('Start again')} onClick={() => { setStep(0); setPlaying(false) }}><RotateCcw className="size-4" /></button>}
        <button type="button" className={btn} aria-label={t('Next step')} disabled={step === last} onClick={() => go(step + 1)}><ChevronRight className="size-4" /></button>
        <span className="ml-1 tabular text-[12.5px] text-muted">{t('Step {n} of {total}', { n: step + 1, total: b.frames.length })}</span>
        <span className="ml-auto flex gap-1" aria-hidden>{b.frames.map((_, i) => <span key={i} className={`size-1.5 rounded-full transition-colors ${i <= step ? 'bg-text/70' : 'bg-border-strong'}`} />)}</span>
      </div>
    </Frame>
  )
}
