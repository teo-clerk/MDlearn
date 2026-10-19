// One note: the quoted passage, your text, and the conversation with the AI about it.
import { useState } from 'react'
import { ArrowUp, Loader2, Square, Trash2 } from 'lucide-react'
import type { Note, NoteMessage } from '../../shared/types'
import { MiniMarkdown } from '../prose/MiniMarkdown'
import { useStream } from '../state/stream'
import { IconButton } from '../ui/primitives'

export interface NoteActions {
  save(body: string): Promise<void>
  remove(): Promise<void>
  ask(question: string): Promise<void>
  stop(messageId: string): void
  canAsk: boolean
}
export function NoteCard({ note, active, onFocus, actions, quoteFound }: { note: Note; active: boolean; onFocus(): void; actions: NoteActions; quoteFound: boolean }) {
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(note.body)
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <article onClick={onFocus} onFocus={onFocus} tabIndex={-1} aria-label="Note"
      className={`rounded-[8px] border bg-raised p-3 text-[13.5px] transition-shadow ${active ? 'border-border-strong shadow-pop' : 'border-border'}`}>
      <blockquote className={`line-clamp-2 border-l pl-2 text-[12.5px] text-muted ${quoteFound ? 'border-border-strong' : 'border-dashed border-warn'}`} title={note.anchor.quote.exact}>
        {note.anchor.quote.exact}
      </blockquote>
      {!quoteFound && <p className="mt-1 text-[11.5px] text-warn">This passage changed; the note is kept here.</p>}
      {editing ? (
        <form className="mt-2" onSubmit={async (e) => { e.preventDefault(); await actions.save(body); setEditing(false) }}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} autoFocus rows={3} aria-label="Note text"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit(); if (e.key === 'Escape') { setBody(note.body); setEditing(false) } }}
            className="w-full resize-y rounded-[6px] border border-border-strong bg-bg px-2 py-1.5 outline-none focus:border-text" />
          <div className="mt-1 flex gap-1"><button type="submit" className="rounded-[5px] bg-accent px-2 py-1 text-[12.5px] font-medium text-on-accent cursor-pointer">Save</button><button type="button" onClick={() => { setBody(note.body); setEditing(false) }} className="rounded-[5px] px-2 py-1 text-[12.5px] hover:bg-hover cursor-pointer">Cancel</button></div>
        </form>
      ) : note.body ? (
        <div className="prose-note mt-2 cursor-text" onDoubleClick={() => setEditing(true)}><MiniMarkdown text={note.body} /></div>
      ) : null}
      {note.thread.map((m) => <Message key={m.id} m={m} onStop={() => actions.stop(m.id)} />)}
      {active && actions.canAsk && (
        <form className="mt-2 flex items-end gap-1" onSubmit={async (e) => { e.preventDefault(); if (!question.trim()) return; setBusy(true); try { await actions.ask(question.trim()); setQuestion('') } finally { setBusy(false) } }}>
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={1} placeholder={note.thread.length ? 'Ask a follow-up…' : 'Ask about this passage…'} aria-label="Question for the AI"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }}
            className="max-h-32 min-h-8 flex-1 resize-none rounded-[6px] border border-border-strong bg-bg px-2 py-1.5 text-[13px] outline-none focus:border-text" />
          <button type="submit" disabled={busy || !question.trim()} aria-label="Ask" className="flex size-8 shrink-0 items-center justify-center rounded-[6px] bg-accent text-on-accent disabled:opacity-40 cursor-pointer">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowUp className="size-4" aria-hidden />}
          </button>
        </form>
      )}
      {active && (
        <div className="mt-2 flex items-center justify-between">
          {!editing ? <button onClick={() => setEditing(true)} className="text-[12px] text-muted hover:text-text cursor-pointer">{note.body ? 'Edit note' : 'Add a note'}</button> : <span />}
          <IconButton icon={Trash2} label="Delete note" onClick={(e) => { e.stopPropagation(); if (confirm('Delete this note and its conversation?')) void actions.remove() }} />
        </div>
      )}
    </article>
  )
}

function Message({ m, onStop }: { m: NoteMessage; onStop(): void }) {
  const streamed = useStream((s) => s.text[m.id])
  const text = m.done ? m.text : streamed ?? ''
  if (m.role === 'user') return <p className="mt-3 font-medium text-text">{m.text}</p>
  return (
    <div className="mt-1.5" aria-live={m.done ? undefined : 'polite'}>
      <div className="prose-note text-text/90">{text ? <MiniMarkdown text={text} /> : !m.done && <span className="inline-flex items-center gap-1.5 text-muted"><Loader2 className="size-3.5 animate-spin" aria-hidden />Thinking…</span>}</div>
      <p className="mt-1 flex items-center gap-2 text-[11.5px] text-subtle">
        {m.engine}{m.error && <span className="text-bad">{m.error}</span>}
        {!m.done && <button onClick={(e) => { e.stopPropagation(); onStop() }} className="inline-flex items-center gap-1 text-muted hover:text-text cursor-pointer"><Square className="size-3" aria-hidden />Stop</button>}
      </p>
    </div>
  )
}
