// Make a card of your own from the passage you selected: click words or formulas to hide them (a
// fill-in-the-blank card), or write a question and its answer. Saved into the document's "My cards"
// lesson, scheduled like any card.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'wouter'
import { Check, Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { keys, notesApi, type Passage } from '../api/queries'
import { useNotesUi } from './store'
import { Button } from '../ui/primitives'
import { blankable, buildCloze, countBlanks, tokenize } from '../lib/cloze'
import { MiniMarkdown } from '../prose/MiniMarkdown'
import { lessonRoute } from '../lib/paths'

type Mode = 'blank' | 'qa'
export function CardDraft({ ws, doc }: { ws: string; doc: string }) {
  const { draft, setDraft } = useNotesUi()
  const qc = useQueryClient()
  const [passage, setPassage] = useState<Passage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('blank')
  const [chosen, setChosen] = useState<Set<number>>(new Set())
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<{ path: string } | null>(null)
  useEffect(() => {
    if (!draft) return
    let live = true
    setPassage(null); setError(null); setChosen(new Set()); setSaved(null)
    notesApi.passage(ws, doc, draft.anchor.quote.exact).then((p) => { if (live) setPassage(p) }).catch((e: Error) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [draft, ws, doc])
  const toks = useMemo(() => (passage ? tokenize(passage.text) : []), [passage])
  const cloze = useMemo(() => buildCloze(toks, chosen), [toks, chosen])
  if (!draft) return null
  const blanks = countBlanks(cloze)
  const ready = mode === 'blank' ? blanks > 0 : question.trim().length > 2 && answer.trim().length > 0
  const save = async () => {
    setBusy(true); setError(null)
    try {
      const section = passage?.section ? { num: passage.section.num, anchor: passage.section.anchor } : null
      const r = await notesApi.addCard(ws, { doc, section, card: mode === 'blank' ? { kind: 'cloze', text: cloze, ...(title.trim() ? { title: title.trim() } : {}) } : { kind: 'qa', question, answer, ...(title.trim() ? { title: title.trim() } : {}) } })
      setSaved({ path: r.path })
      void qc.invalidateQueries({ queryKey: keys.tree(ws) })
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const toggle = (i: number) => setChosen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  return (
    <div className="rounded-[8px] border border-border-strong bg-raised p-3 text-[13px] shadow-pop">
      <div role="tablist" aria-label="Kind of card" className="flex gap-1">
        {(['blank', 'qa'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`h-7 rounded-[6px] px-2.5 text-[12.5px] font-medium cursor-pointer ${mode === m ? 'bg-active text-text' : 'text-muted hover:bg-hover'}`}>
            {m === 'blank' ? 'Hide words' : 'Question & answer'}
          </button>
        ))}
      </div>
      {!passage && !error && <p className="mt-3 flex items-center gap-2 text-muted"><Loader2 className="size-4 animate-spin" aria-hidden />Finding the passage…</p>}
      {error && <p className="mt-2 text-bad" role="alert">{error}</p>}
      {saved ? (
        <div className="mt-3" role="status">
          <p className="flex items-center gap-1.5 font-medium"><Check className="size-4 text-good" aria-hidden />Card saved</p>
          <p className="mt-1 text-muted">It joins your study queue as a new card in <Link href={lessonRoute(ws, saved.path)} className="underline underline-offset-2 hover:text-text">My cards</Link>.</p>
          <div className="mt-2 flex gap-2"><Button size="sm" variant="ghost" onClick={() => { setSaved(null); setChosen(new Set()); setQuestion(''); setAnswer(''); setTitle('') }}>Make another</Button><Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Done</Button></div>
        </div>
      ) : passage && mode === 'blank' ? (
        <>
          <p className="mt-2 text-muted">Click the words or formulas you want to remember. They become blanks.</p>
          <div className="read mt-2 max-h-[40vh] overflow-y-auto rounded-[6px] bg-bg p-2.5 text-[15px] leading-[1.9]" role="group" aria-label="Passage">
            {toks.map((t, i) => blankable(t)
              ? <button key={i} type="button" aria-pressed={chosen.has(i)} onClick={() => toggle(i)} className={`rounded-[4px] px-[2px] ${chosen.has(i) ? 'bg-text text-bg' : 'hover:bg-active'} cursor-pointer`}>{t.kind === 'math' ? <MiniMarkdown text={t.text} /> : t.text}</button>
              : t.kind === 'display' ? <span key={i} className="mx-1 rounded bg-hover px-1 font-mono text-[12px] text-muted" title="Display formulas cannot be hidden here">formula</span> : <span key={i}>{t.text}</span>)}
          </div>
          <p className="mt-2 text-[12px] text-muted">{blanks ? `${blanks} ${blanks === 1 ? 'blank' : 'blanks'} — you will type them from memory.` : 'Nothing hidden yet.'}</p>
        </>
      ) : passage ? (
        <div className="mt-2 flex flex-col gap-2">
          <blockquote className="line-clamp-3 border-l border-border-strong pl-2 text-[12.5px] text-muted">{draft.anchor.quote.exact}</blockquote>
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} placeholder="Question" aria-label="Question" className="resize-y rounded-[6px] border border-border-strong bg-bg px-2 py-1.5 outline-none focus:border-text" />
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} placeholder="Answer — one idea per line" aria-label="Answer" className="resize-y rounded-[6px] border border-border-strong bg-bg px-2 py-1.5 outline-none focus:border-text" />
        </div>
      ) : null}
      {passage && !saved && (
        <>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Title (optional)${passage.section ? ` · from §${passage.section.num ?? passage.section.title}` : ''}`} aria-label="Card title" className="mt-2 h-8 w-full rounded-[6px] border border-border-strong bg-bg px-2 outline-none focus:border-text" />
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" variant="primary" disabled={!ready} busy={busy} onClick={save}>Save card</Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </>
      )}
    </div>
  )
}
