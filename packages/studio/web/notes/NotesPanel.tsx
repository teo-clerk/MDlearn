// Notes beside the text: each note sits next to its passage (like comments in a document editor),
// follows the scroll, and highlights its passage. Narrow screens get a simple list.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { StickyNote } from 'lucide-react'
import { keys, notesApi, useNotes, useEngines } from '../api/queries'
import { useStream } from '../state/stream'
import { locate, rangeFor, textOf } from '../lib/anchor'
import { SEEK_EVENT } from '../visuals/VideoBlock'
import { useNotesUi } from './store'
import { NoteCard, type NoteActions } from './NoteCard'
import { DraftCard } from './DraftCard'
import { VisualDraftCard } from './VisualDraftCard'
import { CardDraft } from './CardDraft'
import { NOTE_MARKS } from './marks'
import type { Note } from '../../shared/types'
import { t } from '../i18n'

interface Placed { note: Note; range: Range | null; y: number }
const GAP = 8

export function NotesPanel({ ws, doc, article, mtime }: { ws: string; doc: string; article: HTMLElement | null; mtime: number }) {
  const notes = useNotes(ws, doc)
  const engines = useEngines()
  const canAsk = !!engines.data?.local.available
  const { active, setActive, draft, setDraft } = useNotesUi()
  const qc = useQueryClient()
  const [version, setVersion] = useState(0)
  const [scroll, setScroll] = useState(0)
  const [heights, setHeights] = useState<Record<string, number>>({})
  const wide = useWide()
  const box = useRef<HTMLDivElement>(null)
  // the panel's notes area starts lower than the page (the tab row): positions are shifted by that offset
  const [offset, setOffset] = useState(0)
  useLayoutEffect(() => {
    const main = document.getElementById('main')
    if (box.current && main) setOffset(box.current.getBoundingClientRect().top - main.getBoundingClientRect().top)
  }, [version, wide])

  // re-place notes when the article re-renders (math appears lazily, live reload) or the window resizes
  useEffect(() => {
    if (!article) return
    let t: number | undefined
    const bump = () => { clearTimeout(t); t = window.setTimeout(() => setVersion((v) => v + 1), 120) }
    const ro = new ResizeObserver(bump); ro.observe(article)
    const mo = new MutationObserver(bump); mo.observe(article, { childList: true, subtree: true, characterData: true })
    return () => { ro.disconnect(); mo.disconnect(); clearTimeout(t) }
  }, [article])
  useEffect(() => {
    const main = document.getElementById('main')
    if (!main) return
    const on = () => setScroll(main.scrollTop)
    on(); main.addEventListener('scroll', on, { passive: true })
    return () => main.removeEventListener('scroll', on)
  }, [])

  const placed = useMemo<Placed[]>(() => {
    const main = document.getElementById('main')
    if (!article || !main || !notes.data) return []
    const text = textOf(article)
    const top0 = main.getBoundingClientRect().top - main.scrollTop
    return notes.data.map((note) => {
      const at = locate(text, note.anchor)
      const range = at ? rangeFor(article, at.start, at.end) : null
      return { note, range, y: range ? range.getBoundingClientRect().top - top0 : -1 }
    }).sort((a, b) => (a.y < 0 ? -1 : b.y < 0 ? 1 : a.y - b.y))
  }, [article, notes.data, version]) // eslint-disable-line react-hooks/exhaustive-deps

  const draftY = useMemo(() => {
    const main = document.getElementById('main')
    if (!draft || !article || !main) return 0
    const at = locate(textOf(article), draft.anchor)
    const r = at && rangeFor(article, at.start, at.end)
    return r ? r.getBoundingClientRect().top - (main.getBoundingClientRect().top - main.scrollTop) : main.scrollTop + 40
  }, [draft, article, version])

  useHighlights(placed, active, draft && article ? (() => { const at = locate(textOf(article), draft.anchor); return at ? rangeFor(article, at.start, at.end) : null })() : null)

  // stack cards at their passage without overlapping; the card being worked on keeps its place and the
  // others move aside (up for those above it, down for those below)
  const tops = useMemo(() => {
    const items = [...placed.filter((p) => p.y >= 0).map((p) => ({ id: p.note.id, y: p.y })), ...(draft ? [{ id: 'draft', y: draftY }] : [])].sort((a, b) => a.y - b.y)
    const h = (id: string) => heights[id] ?? 80
    const focus = items.findIndex((it) => it.id === (draft ? 'draft' : active))
    const out: Record<string, number> = {}
    const pivot = focus >= 0 ? focus : 0
    if (!items.length) return out
    out[items[pivot].id] = items[pivot].y
    let bottom = items[pivot].y + h(items[pivot].id)
    for (const it of items.slice(pivot + 1)) { const top = Math.max(it.y, bottom + GAP); out[it.id] = top; bottom = top + h(it.id) }
    let ceiling = items[pivot].y
    for (const it of items.slice(0, pivot).reverse()) { const top = Math.min(it.y, ceiling - GAP - h(it.id)); out[it.id] = top; ceiling = top }
    return out
  }, [placed, draft, draftY, heights, active])

  const measure = useCallback((id: string) => (el: HTMLElement | null) => {
    if (!el) return
    const h = el.offsetHeight
    setHeights((m) => (m[id] === h ? m : { ...m, [id]: h }))
  }, [])

  const refresh = () => qc.invalidateQueries({ queryKey: keys.notes(ws, doc) })
  const draftCard = () => (draft?.mode === 'visual' ? <VisualDraftCard ws={ws} doc={doc} mtime={mtime} /> : draft?.mode === 'card' ? <CardDraft ws={ws} doc={doc} /> : <DraftCard ws={ws} doc={doc} canAsk={canAsk} onDone={refresh} />)
  const actionsFor = (n: Note): NoteActions => ({
    canAsk,
    save: async (body) => { await notesApi.update(ws, doc, n.id, body); await refresh() },
    remove: async () => { await notesApi.remove(ws, doc, n.id); setActive(null); await refresh() },
    ask: async (question) => { await notesApi.ask(ws, { doc, anchor: n.anchor, question, mode: 'ask', noteId: n.id }); await refresh() },
    makeCard: () => setDraft({ anchor: n.anchor, mode: 'card' }),
    stop: (id) => { void notesApi.cancel(ws, id); useStream.getState().finish(id) },
  })
  // a note on a moment of a video: the player it sits beside goes back to that moment
  const seekFor = (p: Placed) => {
    const at = p.note.anchor.t, player = p.range?.startContainer.parentElement?.closest('[data-video]')
    return at !== undefined && player ? () => player.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: at })) : undefined
  }
  const focus = (n: Placed) => { setActive(n.note.id); if (!wide && n.range) n.range.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }

  const detached = placed.filter((p) => p.y < 0)
  const isEmpty = !notes.data?.length && !draft
  return (
    <div ref={box} className="relative min-h-0 flex-1 overflow-hidden">
      {isEmpty && (
        <div className="px-5 py-6 text-[13px] leading-relaxed text-muted">
          <StickyNote className="mb-2 size-5 text-subtle" strokeWidth={1.6} aria-hidden />
          {canAsk ? t('Select any passage to leave a note or ask the AI about it. Notes are saved beside your files, never inside them.') : t('Select any passage to leave a note. Notes are saved beside your files, never inside them.')}
          {!canAsk && engines.data && <p className="mt-2 text-[12px]">{t('Local AI: {status}', { status: engines.data.local.error ?? t('not available') })}</p>}
        </div>
      )}
      {wide ? (
        <div className="absolute inset-x-0 top-0 px-3" style={{ transform: `translateY(${-scroll - offset}px)` }}>
          {draft && <div ref={measure('draft')} className="absolute inset-x-3 z-10" style={{ top: tops.draft ?? draftY }}>{draftCard()}</div>}
          {placed.filter((p) => p.y >= 0).map((p) => (
            <div key={p.note.id} ref={measure(p.note.id)} className="absolute inset-x-3 transition-[top] duration-150" style={{ top: tops[p.note.id] ?? p.y }}>
              <NoteCard note={p.note} active={active === p.note.id} onFocus={() => focus(p)} actions={actionsFor(p.note)} quoteFound onSeek={seekFor(p)} />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex h-full flex-col gap-2 overflow-y-auto p-3">
          {draft && draftCard()}
          {placed.filter((p) => p.y >= 0).map((p) => <NoteCard key={p.note.id} note={p.note} active={active === p.note.id} onFocus={() => focus(p)} actions={actionsFor(p.note)} quoteFound onSeek={seekFor(p)} />)}
        </div>
      )}
      {detached.length > 0 && (
        <div className="absolute inset-x-0 bottom-0 max-h-[40%] overflow-y-auto border-t border-border bg-panel p-3">
          <p className="mb-2 text-[12px] font-medium text-muted">{t('Notes whose passage changed')}</p>
          <div className="flex flex-col gap-2">{detached.map((p) => <NoteCard key={p.note.id} note={p.note} active={active === p.note.id} onFocus={() => setActive(p.note.id)} actions={actionsFor(p.note)} quoteFound={false} />)}</div>
        </div>
      )}
    </div>
  )
}

function useWide() {
  const [w, setW] = useState(() => window.matchMedia('(min-width: 1100px)').matches)
  useEffect(() => { const m = window.matchMedia('(min-width: 1100px)'); const on = () => setW(m.matches); m.addEventListener('change', on); return () => m.removeEventListener('change', on) }, [])
  return w
}

/** Highlight noted passages with the CSS Custom Highlight API (no markup added to the document). */
function useHighlights(placed: Placed[], active: string | null, draft: Range | null) {
  useLayoutEffect(() => {
    const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
    const H = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight
    if (!reg || !H) return
    const act = [...placed.filter((p) => p.range && p.note.id === active).map((p) => p.range!), ...(draft ? [draft] : [])]
    reg.set('mdl-note-active', new H(...act))
    return () => { reg.delete('mdl-note-active') }
  }, [placed, active, draft])
}

/** Every noted passage stays highlighted while the document is open, whichever tab the panel shows. */
export function useNoteHighlights(ws: string, doc: string | undefined, article: HTMLElement | null) {
  const notes = useNotes(ws, doc)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!article) return
    let t: number | undefined
    const bump = () => { clearTimeout(t); t = window.setTimeout(() => setVersion((v) => v + 1), 200) }
    const mo = new MutationObserver(bump); mo.observe(article, { childList: true, subtree: true })
    return () => { mo.disconnect(); clearTimeout(t) }
  }, [article])
  useLayoutEffect(() => {
    const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
    const H = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight
    if (!reg || !H || !article || !notes.data) return
    const text = textOf(article)
    const rangesOf = (list: Note[]) => list.map((n) => { const at = locate(text, n.anchor); return at ? rangeFor(article, at.start, at.end) : null }).filter((r): r is Range => !!r)
    reg.set('mdl-note', new H(...rangesOf(notes.data.filter((n) => !n.color))))
    for (const { color } of NOTE_MARKS) reg.set(`mdl-mark-${color}`, new H(...rangesOf(notes.data.filter((n) => n.color === color))))
    return () => { reg.delete('mdl-note'); for (const { color } of NOTE_MARKS) reg.delete(`mdl-mark-${color}`) }
  }, [notes.data, article, version])
}
