// One note: the quoted passage, your text, and the conversation with the AI about it.
import { useState } from 'react'
import { ArrowUp, Loader2, Play, Square, Trash2 } from 'lucide-react'
import { formatTime } from '@mdlearn/core'
import type { Note, NoteMessage } from '../../shared/types'
import { MiniMarkdown } from '../prose/MiniMarkdown'
import { NOTE_MARKS, markLabel } from './marks'
import { useStream } from '../state/stream'
import { IconButton } from '../ui/primitives'
import { t } from '../i18n'

export interface NoteActions {
  save(body: string): Promise<void>
  remove(): Promise<void>
  ask(question: string): Promise<void>
  /** Turn the passage into a card of your own. */
  makeCard(): void
  stop(messageId: string): void
  canAsk: boolean
}
/** `onSeek`: a note on a moment of a video plays the video from there. */
export function NoteCard({ note, active, onFocus, actions, quoteFound, onSeek }: { note: Note; active: boolean; onFocus(): void; actions: NoteActions; quoteFound: boolean; onSeek?: () => void }) {
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(note.body)
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const mark = NOTE_MARKS.find((m) => m.color === note.color)
  return (
    <article onClick={onFocus} onFocus={onFocus} tabIndex={-1} aria-label={t('Note')}
      className={`rounded-[8px] border bg-raised p-3 text-[13.5px] transition-shadow ${active ? 'border-border-strong shadow-pop' : 'border-border'}`}>
      <blockquote className={`line-clamp-2 border-l pl-2 text-[12.5px] text-muted ${quoteFound ? 'border-border-strong' : 'border-dashed border-warn'}`} title={note.anchor.quote.exact}>
        {note.anchor.quote.exact}
      </blockquote>
      {mark && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
          <span className="inline-flex items-center gap-1 font-medium"><mark.icon className={`size-3.5 tone-${mark.color}`} strokeWidth={1.8} aria-hidden />{markLabel(mark.color)}</span>
          {mark.color === 'confusing' && actions.canAsk && !note.thread.length && <button type="button" onClick={(e) => { e.stopPropagation(); void actions.ask(t('Explain this passage simply.')) }} className="text-muted underline underline-offset-2 hover:text-text cursor-pointer">{t('Explain')}</button>}
          {mark.color === 'exam' && <button type="button" onClick={(e) => { e.stopPropagation(); actions.makeCard() }} className="text-muted underline underline-offset-2 hover:text-text cursor-pointer">{t('Make a card')}</button>}
        </p>
      )}
      {note.anchor.t !== undefined && onSeek && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onSeek() }} aria-label={t('Play the video from {time}', { time: formatTime(note.anchor.t) })}
          className="mt-1.5 inline-flex items-center gap-1 rounded-[5px] border border-border px-1.5 py-0.5 tabular text-[12px] text-muted hover:bg-hover hover:text-text cursor-pointer">
          <Play className="size-3" aria-hidden />{formatTime(note.anchor.t)}
        </button>
      )}
      {!quoteFound && <p className="mt-1 text-[11.5px] text-warn">{t('This passage changed; the note is kept here.')}</p>}
      {editing ? (
        <form className="mt-2" onSubmit={async (e) => { e.preventDefault(); await actions.save(body); setEditing(false) }}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} autoFocus rows={3} aria-label={t('Note text')}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit(); if (e.key === 'Escape') { setBody(note.body); setEditing(false) } }}
            className="w-full resize-y rounded-[6px] border border-border-strong bg-bg px-2 py-1.5 outline-none focus:border-text" />
          <div className="mt-1 flex gap-1"><button type="submit" className="rounded-[5px] bg-accent px-2 py-1 text-[12.5px] font-medium text-on-accent cursor-pointer">{t('Save')}</button><button type="button" onClick={() => { setBody(note.body); setEditing(false) }} className="rounded-[5px] px-2 py-1 text-[12.5px] hover:bg-hover cursor-pointer">{t('Cancel')}</button></div>
        </form>
      ) : note.body ? (
        <div className="prose-note mt-2 cursor-text" onDoubleClick={() => setEditing(true)}><MiniMarkdown text={note.body} /></div>
      ) : null}
      {note.thread.map((m) => <Message key={m.id} m={m} onStop={() => actions.stop(m.id)} />)}
      {active && actions.canAsk && (
        <form className="mt-2 flex items-end gap-1" onSubmit={async (e) => { e.preventDefault(); if (!question.trim()) return; setBusy(true); try { await actions.ask(question.trim()); setQuestion('') } finally { setBusy(false) } }}>
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={1} placeholder={note.thread.length ? t('Ask a follow-up…') : t('Ask about this passage…')} aria-label={t('Question for the AI')}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }}
            className="max-h-32 min-h-8 flex-1 resize-none rounded-[6px] border border-border-strong bg-bg px-2 py-1.5 text-[13px] outline-none focus:border-text" />
          <button type="submit" disabled={busy || !question.trim()} aria-label={t('Ask')} className="flex size-8 shrink-0 items-center justify-center rounded-[6px] bg-accent text-on-accent disabled:opacity-40 cursor-pointer">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowUp className="size-4" aria-hidden />}
          </button>
        </form>
      )}
      {active && (
        <div className="mt-2 flex items-center justify-between">
          {!editing ? <button onClick={() => setEditing(true)} className="text-[12px] text-muted hover:text-text cursor-pointer">{note.body ? t('Edit note') : t('Add a note')}</button> : <span />}
          <IconButton icon={Trash2} label={t('Delete note')} onClick={(e) => { e.stopPropagation(); if (confirm(t('Delete this note and its conversation?'))) void actions.remove() }} />
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
      <div className="prose-note text-text/90">{text ? <MiniMarkdown text={text} /> : !m.done && <span className="inline-flex items-center gap-1.5 text-muted"><Loader2 className="size-3.5 animate-spin" aria-hidden />{t('Thinking…')}</span>}</div>
      <p className="mt-1 flex items-center gap-2 text-[11.5px] text-subtle">
        {m.engine}{m.error && <span className="text-bad">{m.error}</span>}
        {!m.done && <button onClick={(e) => { e.stopPropagation(); onStop() }} className="inline-flex items-center gap-1 text-muted hover:text-text cursor-pointer"><Square className="size-3" aria-hidden />{t('Stop')}</button>}
      </p>
    </div>
  )
}
