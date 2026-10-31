// Explain in your own words, or write code; after checking, the key ideas or the reference solution.
import { useState } from 'react'
import { Check, Loader2, Play, X } from 'lucide-react'
import { Prose } from '../prose/Prose'
import { python, usePython, type RunOutput } from '../python/runtime'
import { friendly } from '../python/PythonBlock'
import { isRunnableCode } from './draft'
import type { Draft } from './draft'
import type { WidgetProps } from './WidgetView'
import { t } from '../i18n'

export function FreeText({ widget, draft, setDraft, result, autoFocus, onSubmit }: WidgetProps<Extract<Draft, { type: 'text' }>>) {
  const [out, setOut] = useState<{ output: RunOutput[]; figures: string[]; error: string | null } | null>(null)
  const [running, setRunning] = useState(false)
  const py = usePython()
  if (widget.type !== 'explain' && widget.type !== 'code') return null
  const code = widget.type === 'code'
  const runnable = isRunnableCode(widget)
  return (
    <div>
      <div className="read"><Prose nodes={widget.prompt} /></div>
      <textarea value={draft.text} onChange={(e) => setDraft({ type: 'text', text: e.target.value })} disabled={!!result} autoFocus={autoFocus}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) { e.preventDefault(); onSubmit() } }}
        aria-label={code ? t('Your {language} code', { language: widget.lang }) : t('Your explanation')} spellCheck={!code}
        placeholder={code ? '' : t('Explain it in a sentence or two, as if to a classmate…')}
        rows={code ? Math.max(6, draft.text.split('\n').length + 1) : 4}
        className={`mt-3 w-full resize-y rounded-[7px] border border-border-strong bg-raised px-3 py-2 outline-none focus:border-accent disabled:opacity-80 ${code ? 'font-mono text-[13px] leading-relaxed' : 'font-read text-[16px] leading-relaxed'}`} />
      {!result && <p className="mt-1 text-[12px] text-muted">{code ? (runnable ? t('Run tries your code; Check runs it against the exercise’s checks (Ctrl+Enter).') : t('Ctrl+Enter to check.')) : t('Ctrl+Enter to compare with the key ideas.')}</p>}
      {runnable && !result && (
        <div className="mt-2">
          <button type="button" disabled={running || !draft.text.trim()} onClick={async () => { setRunning(true); setOut(null); const r = await python.run(draft.text); setOut({ output: r.output, figures: r.figures, error: r.error }); setRunning(false) }}
            className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-border-strong px-2.5 text-[12.5px] font-medium hover:bg-hover disabled:opacity-40 cursor-pointer">
            {running ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Play className="size-3.5" aria-hidden />}{t('Run')}{running && py.status ? ` · ${py.status}` : ''}
          </button>
          {out && (
            <div className="mt-2 rounded-[6px] border border-border bg-bg px-3 py-2 text-[12.5px]" aria-live="polite">
              {out.output.length > 0 && <pre className="whitespace-pre-wrap font-mono">{out.output.map((o) => o.text).join('\n')}</pre>}
              {out.figures.map((f, i) => <img key={i} src={`data:image/png;base64,${f}`} alt={`Figure ${i + 1}`} className="mt-1 max-w-full rounded bg-white" />)}
              {out.error && <pre role="alert" className="whitespace-pre-wrap font-mono text-bad">{friendly(out.error)}</pre>}
              {!out.output.length && !out.figures.length && !out.error && <span className="text-muted">{t('Ran without printing anything.')}</span>}
            </div>
          )}
        </div>
      )}
      {result?.parts?.tests && (
        <div className="mt-4 rounded-[7px] border border-border p-3 font-ui text-[13.5px]" role="status">
          <p className="flex items-center gap-1.5 font-medium">{result.parts.tests.passed === result.parts.tests.total ? <Check className="size-4 text-good" aria-hidden /> : <X className="size-4 text-bad" aria-hidden />}{result.feedback}</p>
          {draft.run?.error && <pre className="mt-1.5 whitespace-pre-wrap font-mono text-[12px] text-bad">{friendly(draft.run.error)}</pre>}
          {draft.run && draft.run.failures.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-1">{draft.run.failures.map((f, i) => <li key={i}><code className="font-mono text-[12px]">{f.text}</code>{f.message ? <span className="text-muted"> — {f.message}</span> : null}</li>)}</ul>
          )}
        </div>
      )}
      {result?.parts?.ideas && (
        <div className="mt-4 rounded-[7px] border border-border p-3">
          <p className="font-ui text-[12.5px] font-medium text-muted">{t('Key ideas')}</p>
          <ol className="read mt-1 text-[16px]">{result.parts.ideas.map((idea, i) => <li key={i}><Prose nodes={idea} /></li>)}</ol>
        </div>
      )}
      {result?.parts?.solution && (
        <div className="mt-4">
          <p className="font-ui text-[12.5px] font-medium text-muted">{t('Reference solution')}</p>
          <pre className="code mt-1 rounded-[7px] border border-border bg-code"><code>{result.parts.solution.code}</code></pre>
        </div>
      )}
    </div>
  )
}
