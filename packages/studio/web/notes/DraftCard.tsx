// A note being written for a fresh selection: save it as a note, or send it as a question to the AI.
import { formatTime } from '@mdlearn/core'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { notesApi } from '../api/queries'
import { useNotesUi } from './store'
import { Button } from '../ui/primitives'
import { t } from '../i18n'

export function DraftCard({ ws, doc, canAsk, onDone }: { ws: string; doc: string; canAsk: boolean; onDone(): void }) {
  const { draft, setDraft, setActive } = useNotesUi()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<false | 'note' | 'ask'>(false)
  const [error, setError] = useState<string | null>(null)
  if (!draft) return null
  const ask = draft.mode === 'ask'
  const run = async (kind: 'note' | 'ask') => {
    setBusy(kind); setError(null)
    try {
      const note = kind === 'note' ? await notesApi.create(ws, doc, draft.anchor, text.trim()) : (await notesApi.ask(ws, { doc, anchor: draft.anchor, question: text.trim(), mode: 'ask' })).note
      setDraft(null); setActive(note.id); onDone()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <form className="rounded-[8px] border border-border-strong bg-raised p-3 text-[13.5px] shadow-pop" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void run(ask ? 'ask' : 'note') }}>
      <blockquote className="line-clamp-2 border-l border-border-strong pl-2 text-[12.5px] text-muted">{draft.anchor.quote.exact}{draft.anchor.t !== undefined && <span className="tabular"> · {formatTime(draft.anchor.t)}</span>}</blockquote>
      <textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus rows={3} aria-label={ask ? t('Your question') : t('Your note')}
        placeholder={ask ? t('What would you like to know about this passage?') : t('Write a note…')}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit(); if (e.key === 'Escape') setDraft(null) }}
        className="mt-2 w-full resize-y rounded-[6px] border border-border-strong bg-bg px-2 py-1.5 outline-none focus:border-accent" />
      {error && <p className="mt-1 text-[12px] text-bad" role="alert">{error}</p>}
      <div className="mt-2 flex items-center gap-1.5">
        <Button type="submit" size="sm" variant="primary" disabled={!text.trim() || !!busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}{ask ? t('Ask') : t('Save note')}
        </Button>
        {canAsk && !ask && <Button type="button" size="sm" variant="ghost" disabled={!text.trim() || !!busy} onClick={() => run('ask')}>{t('Ask the AI instead')}</Button>}
        <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>{t('Cancel')}</Button>
      </div>
    </form>
  )
}
