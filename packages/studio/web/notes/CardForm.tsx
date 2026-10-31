// The form behind a card of your own: click words or formulas to hide them (a fill-in-the-blank card), or write a
// question and its answer. Used beside a passage and when sorting the inbox.
import { useMemo, useState } from 'react'
import type { CardInput } from '../api/queries'
import { Button } from '../ui/primitives'
import { blankable, buildCloze, countBlanks, tokenize } from '../lib/cloze'
import { MiniMarkdown } from '../prose/MiniMarkdown'
import { t } from '../i18n'

type Mode = 'blank' | 'qa'
export function CardForm({ text, quote, from, onSave, onCancel }: { text: string; quote: string; from?: string; onSave(card: CardInput): Promise<void>; onCancel(): void }) {
  const [mode, setMode] = useState<Mode>('blank')
  const [chosen, setChosen] = useState<Set<number>>(new Set())
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toks = useMemo(() => tokenize(text), [text])
  const cloze = useMemo(() => buildCloze(toks, chosen), [toks, chosen])
  const blanks = countBlanks(cloze)
  const ready = mode === 'blank' ? blanks > 0 : question.trim().length > 2 && answer.trim().length > 0
  const save = async () => {
    setBusy(true); setError(null)
    const named = title.trim() ? { title: title.trim() } : {}
    try {
      await onSave(mode === 'blank' ? { kind: 'cloze', text: cloze, ...named } : { kind: 'qa', question, answer, ...named })
    } catch (e) { setError((e as Error).message); setBusy(false) }
  }
  const toggle = (i: number) => setChosen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  return (
    <>
      <div role="tablist" aria-label={t('Kind of card')} className="flex gap-1">
        {(['blank', 'qa'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`h-7 rounded-[6px] px-2.5 text-[12.5px] font-medium cursor-pointer ${mode === m ? 'bg-active text-text' : 'text-muted hover:bg-hover'}`}>
            {m === 'blank' ? t('Hide words') : t('Question & answer')}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-bad" role="alert">{error}</p>}
      {mode === 'blank' ? (
        <>
          <p className="mt-2 text-muted">{t('Click the words or formulas you want to remember. They become blanks.')}</p>
          <div className="read mt-2 max-h-[40vh] overflow-y-auto rounded-[6px] bg-bg p-2.5 text-[15px] leading-[1.9]" role="group" aria-label={t('Passage')}>
            {toks.map((tok, i) => blankable(tok)
              ? <button key={i} type="button" aria-pressed={chosen.has(i)} onClick={() => toggle(i)} className={`rounded-[4px] px-[2px] ${chosen.has(i) ? 'bg-text text-bg' : 'hover:bg-active'} cursor-pointer`}>{tok.kind === 'math' ? <MiniMarkdown text={tok.text} /> : tok.text}</button>
              : tok.kind === 'display' ? <span key={i} className="mx-1 rounded bg-hover px-1 font-mono text-[12px] text-muted" title={t('Display formulas cannot be hidden here')}>{t('formula')}</span> : <span key={i}>{tok.text}</span>)}
          </div>
          <p className="mt-2 text-[12px] text-muted">{blanks ? `${blanks} ${blanks === 1 ? 'blank' : 'blanks'} — you will type them from memory.` : t('Nothing hidden yet.')}</p>
        </>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <blockquote className="line-clamp-3 border-l border-border-strong pl-2 text-[12.5px] text-muted">{quote}</blockquote>
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} placeholder={t('Question')} aria-label={t('Question')} className="resize-y rounded-[6px] border border-border-strong bg-bg px-2 py-1.5 outline-none focus:border-accent" />
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} placeholder={t('Answer — one idea per line')} aria-label={t('Answer')} className="resize-y rounded-[6px] border border-border-strong bg-bg px-2 py-1.5 outline-none focus:border-accent" />
        </div>
      )}
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Title (optional)${from ? ` · from §${from}` : ''}`} aria-label={t('Card title')} className="mt-2 h-8 w-full rounded-[6px] border border-border-strong bg-bg px-2 outline-none focus:border-accent" />
      <div className="mt-2 flex gap-1.5">
        <Button size="sm" variant="primary" disabled={!ready} busy={busy} onClick={save}>{t('Save card')}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>{t('Cancel')}</Button>
      </div>
    </>
  )
}
