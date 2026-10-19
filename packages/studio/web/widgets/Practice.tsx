// A question you can try inside a document or a lesson page: checked on the server, never scheduled.
import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { Checked, PosedWidget, WebAnswer } from '@mdlearn/core'
import { WidgetView } from './WidgetView'
import { Verdict } from './Verdict'
import { emptyDraft, prepareAnswer, ready, type Draft } from './draft'
import { Button } from '../ui/primitives'

const KIND: Record<PosedWidget['type'], string> = { quiz: 'Question', cloze: 'Fill in the gaps', order: 'Put in order', explain: 'Explain', steps: 'Worked example', code: 'Exercise' }
export function Practice({ widget, check }: { widget: PosedWidget; check: (a: WebAnswer) => Promise<Checked> }) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(widget))
  const [result, setResult] = useState<Checked | null>(null)
  const [skipped, setSkipped] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (a: WebAnswer | 'draft') => {
    setBusy(true); setError(null)
    try {
      let answer: WebAnswer
      if (a === 'draft') { const p = await prepareAnswer(widget, draft); answer = p.answer; if (p.run && draft.type === 'text') setDraft({ ...draft, run: p.run }) } else answer = a
      setResult(await check(answer)); setSkipped(answer.type === 'skip')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const worked = widget.type === 'steps' && widget.blanks.length === 0
  return (
    <section className="my-6 rounded-[10px] border border-border px-5 py-4 font-ui" aria-label={KIND[widget.type]}>
      <p className="mb-2 text-[12px] font-medium text-muted">{worked ? 'Worked example' : KIND[widget.type]}</p>
      <WidgetView widget={widget} draft={draft} setDraft={setDraft} result={result} onSubmit={() => ready(widget, draft) && void run('draft')} />
      {!worked && (result ? (
        <>
          <Verdict result={result} skipped={skipped} />
          <Button className="mt-4" size="sm" variant="ghost" icon={RotateCcw} onClick={() => { setResult(null); setSkipped(false); setDraft(emptyDraft(widget)) }}>Try again</Button>
        </>
      ) : (
        <div className="mt-4 flex items-center gap-2">
          <Button variant="primary" size="sm" busy={busy} disabled={!ready(widget, draft)} onClick={() => run('draft')}>Check</Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => run({ type: 'skip' })}>Show answer</Button>
          {error && <span className="text-[13px] text-bad" role="alert">{error}</span>}
        </div>
      ))}
    </section>
  )
}
