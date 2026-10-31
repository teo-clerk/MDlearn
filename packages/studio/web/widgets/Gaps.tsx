// Cloze and worked-example steps: the gaps become inputs where they stand in the text; gaps inside a
// formula are numbered boxes with their inputs right after the formula.
import type { ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { Prose, type ProseContext } from '../prose/Prose'
import { Tex } from '../prose/Tex'
import type { Draft } from './draft'
import type { WidgetProps } from './WidgetView'
import { t } from '../i18n'

export function Gaps({ widget, draft, setDraft, result, autoFocus, onSubmit }: WidgetProps<Extract<Draft, { type: 'gaps' }>>) {
  if (widget.type !== 'cloze' && widget.type !== 'steps') return null
  const blanks = widget.blanks
  const labels = Object.fromEntries(blanks.map((b, i) => [b.id, String(i + 1)]))
  const verdicts = new Map((result?.parts?.blanks ?? []).map((b) => [b.id, b]))
  const first = blanks[0]?.id
  const input = (id: string): ReactNode => {
    const v = verdicts.get(id)
    const kind = blanks.find((b) => b.id === id)?.kind
    const n = labels[id]
    return (
      <span key={id} className="inline-flex items-baseline gap-1 align-baseline">
        {blanks.length > 1 && <span className="font-ui text-[11px] font-semibold text-muted" aria-hidden>{n}</span>}
        <input value={draft.values[id] ?? ''} disabled={!!result} autoFocus={autoFocus && id === first}
          aria-label={kind === 'number' ? t('Gap {n} (a number)', { n }) : kind === 'math' ? t('Gap {n} (a formula)', { n }) : t('Gap {n}', { n })}
          onChange={(e) => setDraft({ type: 'gaps', values: { ...draft.values, [id]: e.target.value } })}
          onKeyDown={(e) => { if (e.key === 'Enter' && onSubmit) { e.preventDefault(); onSubmit() } }}
          inputMode={kind === 'number' ? 'decimal' : undefined} spellCheck={false} autoComplete="off"
          size={Math.max(6, Math.min(24, (draft.values[id] ?? '').length + 2))}
          className={`h-[1.75em] rounded-[5px] border bg-raised px-1.5 font-ui text-[15px] outline-none transition-colors focus:border-accent disabled:opacity-100 ${
            v ? (v.ok ? 'border-good bg-good-soft' : 'border-bad bg-bad-soft') : 'border-border-strong'}`} />
        {v && (v.ok ? <Check className="size-4 self-center text-good" aria-label={t('correct')} /> : (
          <span className="inline-flex items-center gap-1 self-center font-ui text-[13px] text-text">
            <X className="size-4 text-bad" aria-label={t('not correct')} />
            {v.kind === 'math' ? <Tex tex={v.expected} eager /> : <span className="font-medium">{v.expected}</span>}
          </span>
        ))}
        {v?.ok && v.note === 'typo' && <span className="self-center font-ui text-[12px] text-muted">{t('spelling: {word}', { word: v.expected })}</span>}
      </span>
    )
  }
  const cx: ProseContext = {
    blank: (id) => input(id),
    gapLabels: labels,
    mathGaps: (ids) => <span className="ml-1.5 inline-flex flex-wrap items-baseline gap-x-4 gap-y-2 align-baseline">{ids.map((id) => input(id))}</span>,
  }
  return (
    <div className="read">
      {widget.type === 'cloze' ? <Prose nodes={widget.body} cx={cx} /> : (
        <>
          <Prose nodes={widget.problem} cx={cx} />
          <ol className="mt-3 !list-none !pl-0">
            {widget.steps.map((s, i) => (
              <li key={i} className="relative border-l border-border py-1.5 pl-5">
                <span className="absolute -left-[11px] top-2.5 flex size-[21px] items-center justify-center rounded-full border border-border bg-bg font-ui text-[11px] font-semibold text-muted" aria-hidden>{i + 1}</span>
                <span className="sr-only">{t('Step {n}.', { n: i + 1 })} </span>
                <Prose nodes={s} cx={cx} />
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
