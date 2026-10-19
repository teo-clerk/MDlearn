// "Ask about this passage": a short answer from the local model, grounded in the section the passage
// belongs to, streamed into the note's thread beside the text.
import { randomUUID } from 'node:crypto'
import { findSection, sectionText } from '@mdlearn/core'
import { loadDoc } from '@mdlearn/core/node'
import { notesStore, type Anchor, type Note } from '../notes.js'
import { ollamaChat, type OllamaConfig, type ChatMessage } from './ollama.js'
import type { EventBus } from '../bus.js'
import type { Handle, Workspaces } from '../workspaces.js'

export const ASK_SYSTEM = `You are a patient study coach helping a student understand their own notes.
Answer the question about the quoted passage in at most 150 words, plainly, as to a classmate.
Use the section text for facts; if the answer is not in it, say so briefly and give the standard explanation.
Write math in LaTeX between $…$ (inline) or $$…$$ (display). Refer to sections as §3.1. No preamble, no closing offer.`
export const EXPLAIN_QUESTION = 'Explain this passage step by step in simpler words. What is the key idea, and why does it hold?'

const running = new Map<string, AbortController>()
/** Other streamed answers (asking the whole folder) share the same stop button. */
export const trackRunning = (id: string, ctl: AbortController | null) => { if (ctl) running.set(id, ctl); else running.delete(id) }
export function cancelAsk(messageId: string): boolean {
  const c = running.get(messageId)
  c?.abort()
  return !!c
}

export interface AskInput { doc: string; anchor: Anchor; question: string; noteId?: string }
export async function ask(h: Handle, workspaces: Workspaces, bus: EventBus, cfg: OllamaConfig, input: AskInput): Promise<{ note: Note; messageId: string }> {
  const abs = workspaces.resolve(h, input.doc)
  const { outline, md } = loadDoc(abs, h.root)
  const section = input.anchor.section ? findSection(outline, input.anchor.section) : null
  const context = section ? sectionText(md, outline, section.num ?? section.anchor, 1200)?.text ?? '' : ''
  const user = { id: randomUUID(), role: 'user' as const, text: input.question, at: Date.now(), done: true }
  const ai = { id: randomUUID(), role: 'ai' as const, text: '', engine: `local · ${cfg.model}`, at: Date.now(), done: false }
  const note = input.noteId
    ? await notesStore.update(h, input.doc, input.noteId, (n) => ({ ...n, thread: [...n.thread, user, ai] }))
    : await notesStore.create(h, input.doc, input.anchor, '').then((n) => notesStore.update(h, input.doc, n.id, (x) => ({ ...x, thread: [user, ai] })))
  bus.publish({ type: 'notes.changed', ws: h.id, doc: input.doc })

  const history: ChatMessage[] = note.thread.slice(0, -2).filter((m) => m.done && !m.error).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))
  const messages: ChatMessage[] = [
    { role: 'system', content: ASK_SYSTEM },
    { role: 'user', content: `Document: ${outline.title}\n${section ? `Section §${section.num ?? section.anchor} ${section.title}:\n"""\n${context}\n"""\n` : ''}Quoted passage: "${input.anchor.quote.exact}"` },
    { role: 'assistant', content: 'Understood. What would you like to know about it?' },
    ...history,
    { role: 'user', content: input.question },
  ]
  const ctl = new AbortController()
  running.set(ai.id, ctl)
  let pending = '', timer: NodeJS.Timeout | undefined
  const flush = () => { timer = undefined; if (pending) { bus.publish({ type: 'ai.delta', ws: h.id, doc: input.doc, noteId: note.id, messageId: ai.id, text: pending }); pending = '' } }
  // generation continues in the background; the browser follows it through ai.delta events
  void ollamaChat(cfg, { messages, signal: ctl.signal, onDelta: (t) => { pending += t; timer ??= setTimeout(flush, 50) } })
    .then((text) => finish(text))
    .catch((e: Error) => finish(null, ctl.signal.aborted ? 'Stopped.' : e.message))
  async function finish(text: string | null, error?: string) {
    clearTimeout(timer); flush(); running.delete(ai.id)
    await notesStore.update(h, input.doc, note.id, (n) => ({ ...n, thread: n.thread.map((m) => (m.id === ai.id ? { ...m, text: text ?? m.text, done: true, ...(error ? { error } : {}) } : m)) })).catch(() => {})
    bus.publish({ type: 'ai.done', ws: h.id, doc: input.doc, noteId: note.id, messageId: ai.id, ...(error ? { error } : {}) })
    bus.publish({ type: 'notes.changed', ws: h.id, doc: input.doc })
  }
  return { note, messageId: ai.id }
}
