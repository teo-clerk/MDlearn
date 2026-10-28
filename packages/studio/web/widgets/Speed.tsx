// A speed round: one statement at a time, True or False (buttons, or the T and F keys), a streak counter and,
// when the author set one, a countdown. Each answer is checked on the server at once; the round submits
// itself when the last statement is answered or the time runs out.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Play, Timer, X } from 'lucide-react'
import { Prose, Inline } from '../prose/Prose'
import { Button } from '../ui/primitives'
import type { Draft } from './draft'
import type { WidgetProps } from './WidgetView'
import { useSubmitWhenDone } from './motion'
import { t, tp } from '../i18n'

/** The verdict on statement `i`, shown on that statement's card before the next one comes. */
type Flash = { i: number; ok: boolean; feedback?: Parameters<typeof Prose>[0]['nodes'] } | null
const RIGHT_MS = 650, WRONG_MS = 1900

export function Speed({ widget, draft, setDraft, result, probe, onSubmit }: WidgetProps<Extract<Draft, { type: 'speed' }>>) {
  const [playing, setPlaying] = useState(false)
  const [flash, setFlash] = useState<Flash>(null)
  const [streak, setStreak] = useState(0)
  const [best, setBest] = useState(0)
  const [now, setNow] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(0)
  const latest = useRef(draft)
  latest.current = draft
  const limit = widget.type === 'speed' && widget.time ? widget.time * 1000 : 0
  const at = draft.answers.findIndex((x) => x === null)
  useSubmitWhenDone(draft.done, !!result, onSubmit)
  // the clock: elapsed time, and the end of a timed round
  useEffect(() => {
    if (!playing || draft.done) return
    const t = setInterval(() => {
      const ms = Date.now() - started.current
      setNow(ms)
      if (limit && ms >= limit) { setPlaying(false); setDraft({ ...latest.current, ms: limit, done: true }) }
    }, 100)
    return () => clearInterval(t)
  }, [playing, draft.done, limit, setDraft])
  const answer = useCallback(async (v: boolean) => {
    const d = latest.current
    if (!playing || flash || at < 0 || widget.type !== 'speed') return
    const answers = d.answers.map((x, i) => (i === at ? v : x))
    const last = answers.every((x) => x !== null)
    setDraft({ ...d, answers })
    try {
      const checked = probe ? await probe({ type: 'speed', answers, ms: Date.now() - started.current }) : null
      const part = checked?.parts?.statements?.[at]
      const ok = part?.ok === true
      setStreak((s) => { const n = ok ? s + 1 : 0; setBest((b) => Math.max(b, n)); return n })
      setFlash({ i: at, ok, ...(!ok && part?.feedback ? { feedback: part.feedback } : {}) })
      setTimeout(() => {
        setFlash(null)
        if (last) { setPlaying(false); setDraft({ ...latest.current, ms: Date.now() - started.current, done: true }) }
      }, ok ? RIGHT_MS : WRONG_MS)
    } catch (e) { setError((e as Error).message) }
  }, [playing, flash, at, widget.type, probe, setDraft])
  useEffect(() => {
    if (!playing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const k = e.key.toLowerCase()
      if (k === 't' || k === '1') { e.preventDefault(); void answer(true) }
      if (k === 'f' || k === '2') { e.preventDefault(); void answer(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playing, answer])
  if (widget.type !== 'speed') return null
  const n = widget.statements.length
  const answered = draft.answers.filter((x) => x !== null).length
  const secs = (ms: number) => `${Math.floor(ms / 1000)} s`

  if (result) {
    const st = result.parts?.statements ?? []
    const score = result.parts?.score
    return (
      <div>
        <div className="read"><Prose nodes={widget.prompt} /></div>
        <p className="game-settle mt-3 font-ui text-[15px] font-semibold tabular">{score ? t('{done} of {total}', { done: score.right, total: score.total }) : ''}{draft.ms ? ` · ${secs(draft.ms)}` : ''}{best > 1 ? ` · ${t('best streak {n}', { n: best })}` : ''}</p>
        <ol className="game-list mt-2 flex flex-col gap-1.5">
          {widget.statements.map((s, i) => {
            const p = st[i]
            return (
              <li key={i} className={`flex items-start gap-2.5 rounded-[7px] border px-3 py-2 ${p?.ok ? 'border-good/50 bg-good-soft' : 'border-bad/40 bg-bad-soft'}`}>
                {p?.ok ? <Check className="mt-1 size-4 shrink-0 text-good" strokeWidth={2.6} aria-label={t('right')} /> : <X className="mt-1 size-4 shrink-0 text-bad" strokeWidth={2.6} aria-label={draft.answers[i] === null ? t('not answered') : t('wrong')} />}
                <div className="read min-w-0 flex-1 text-[15.5px] leading-[1.5]">
                  <Inline nodes={s} /> <span className="font-ui text-[12.5px] font-semibold text-muted">{p?.truth ? t('True') : t('False')}</span>
                  {!p?.ok && p?.feedback && <div className="mt-0.5 text-[14.5px] text-muted [&_p]:!m-0"><Prose nodes={p.feedback} /></div>}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    )
  }
  if (!playing && !draft.done) {
    return (
      <div>
        <div className="read"><Prose nodes={widget.prompt} /></div>
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[9px] border border-border px-4 py-3 font-ui">
          <Button variant="primary" size="sm" icon={Play} onClick={() => { started.current = Date.now() - draft.ms; setNow(draft.ms); setPlaying(true) }}>{answered ? t('Resume') : t('Start the round')}</Button>
          <span className="text-[13px] text-muted tabular">{tp(n, '{n} statement', '{n} statements')}{widget.time ? <> · <Timer className="inline size-3.5 align-[-2px]" aria-hidden /> {widget.time} s</> : ''} · {t('answer with T and F')}</span>
        </div>
      </div>
    )
  }
  const shownAt = flash ? flash.i : at
  const statement = shownAt >= 0 ? widget.statements[shownAt] : null
  return (
    <div>
      <div className="mb-2 flex items-center gap-3 font-ui text-[12px] text-muted tabular">
        <span>{t('{done} of {total}', { done: Math.min(shownAt + 1, n), total: n })}</span>
        <span className={`game-streak ${streak > 1 ? 'opacity-100' : 'opacity-0'}`} aria-live="polite">{t('Streak {n}', { n: streak })}</span>
        <span className="ml-auto">{limit ? t('{n} s left', { n: Math.max(0, Math.ceil((limit - now) / 1000)) }) : secs(now)}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-hover" aria-hidden>
        <div className="h-full bg-text/60 transition-[width] duration-100 ease-linear" style={{ width: `${limit ? Math.max(0, 100 - (now / limit) * 100) : (answered / n) * 100}%` }} />
      </div>
      {statement && (
        <div key={shownAt} className={`game-card mt-3 rounded-[10px] border px-4 py-5 ${flash ? (flash.ok ? 'game-right border-good/60 bg-good-soft' : 'game-wrong border-bad/50 bg-bad-soft') : 'border-border-strong'}`} aria-live="polite">
          <div className="read text-[18px] leading-[1.5]"><Inline nodes={statement} /></div>
          {flash && <p className="mt-2 flex items-center gap-1.5 font-ui text-[13.5px] font-semibold">{flash.ok ? <><Check className="size-4 text-good" strokeWidth={2.6} aria-hidden />{t('Right')}</> : <><X className="size-4 text-bad" strokeWidth={2.6} aria-hidden />{t('Not quite')}</>}</p>}
          {flash?.feedback && <div className="read mt-1 text-[15px] text-muted [&_p]:!m-0"><Prose nodes={flash.feedback} /></div>}
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2 font-ui">
        <button type="button" disabled={!!flash} onClick={() => void answer(true)} className="h-11 rounded-[8px] border border-border-strong bg-raised text-[15px] font-semibold hover:bg-hover disabled:opacity-50 cursor-pointer">{t('True')} <kbd className="ml-1 text-[11px] font-normal text-muted">T</kbd></button>
        <button type="button" disabled={!!flash} onClick={() => void answer(false)} className="h-11 rounded-[8px] border border-border-strong bg-raised text-[15px] font-semibold hover:bg-hover disabled:opacity-50 cursor-pointer">{t('False')} <kbd className="ml-1 text-[11px] font-normal text-muted">F</kbd></button>
      </div>
      {error && <p className="mt-2 text-[13px] text-bad" role="alert">{error}</p>}
    </div>
  )
}
