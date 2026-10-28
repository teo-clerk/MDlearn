// Ctrl+K: jump to a document or lesson, run an action, or search inside every document.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { BookA, BookOpenCheck, ChartNoAxesColumn, ClipboardCheck, CloudOff, FileText, FolderOpen, GraduationCap, MessageSquareText, Network, Search, Settings, Sigma, TextSearch, LifeBuoy } from 'lucide-react'
import { search, useTree } from '../api/queries'
import { Kbd } from '../ui/primitives'
import { useUi } from '../state/ui'
import { docRoute, lessonRoute } from '../lib/paths'
import type { SearchHit } from '../../shared/types'
import { t, tp } from '../i18n'

interface Item { id: string; icon: typeof FileText; title: string; detail?: string; kbd?: string; href: string; group: string }
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')
/** Subsequence match with a bonus for word starts: "sar phys" finds "04_sar_physics". */
function score(q: string, text: string): number {
  const t = norm(text), words = norm(q).split(/\s+/).filter(Boolean)
  let total = 0
  for (const w of words) {
    const at = t.indexOf(w)
    if (at < 0) return 0
    total += at === 0 || /[\s/_\-.]/.test(t[at - 1]) ? 3 : 1
  }
  return total
}

export function CommandPalette({ ws }: { ws: string }) {
  const { palette, setPalette } = useUi()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [, navigate] = useLocation()
  const tree = useTree(ws)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (palette) { setQ(''); setSel(0); setHits([]); setTimeout(() => input.current?.focus(), 0) } }, [palette])
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return }
    const t = setTimeout(() => { search(ws, q.trim()).then(setHits).catch(() => setHits([])) }, 180)
    return () => clearTimeout(t)
  }, [q, ws])
  const items = useMemo<Item[]>(() => {
    const actions: Item[] = [
      { id: 'a-study', icon: BookOpenCheck, title: t('Study now'), detail: tree.data?.totals.due ? tp(tree.data.totals.due, '{n} due', '{n} due') : undefined, href: `/w/${ws}/study`, group: t('Actions') },
      { id: 'a-offline', icon: CloudOff, title: t('Study offline'), detail: t('Take the next days’ cards to a phone'), href: `/offline/${ws}`, group: t('Actions') },
      { id: 'a-exam', icon: ClipboardCheck, title: t('Mock exam'), href: `/w/${ws}/exam`, group: t('Actions') },
      { id: 'a-progress', icon: ChartNoAxesColumn, title: t('Progress'), href: `/w/${ws}/progress`, group: t('Actions') },
      { id: 'a-ask', icon: MessageSquareText, title: t('Ask your folder'), href: `/w/${ws}/ask`, group: t('Actions') },
      { id: 'a-formulas', icon: Sigma, title: t('Formulas'), href: `/w/${ws}/formulas`, group: t('Actions') },
      { id: 'a-glossary', icon: BookA, title: t('Glossary'), href: `/w/${ws}/glossary`, group: t('Actions') },
      { id: 'a-map', icon: Network, title: t('Map of documents'), href: `/w/${ws}/map`, group: t('Actions') },
      { id: 'a-open', icon: FolderOpen, title: t('Open or upload a folder'), href: '/', group: t('Actions') },
      { id: 'a-settings', icon: Settings, title: t('Settings'), detail: t('Appearance, language, and MDlearn in Claude Code, Claude.ai and ChatGPT'), href: `/w/${ws}/settings`, group: t('Actions') },
      { id: 'a-help', icon: LifeBuoy, title: t('Help, the tour and the tutorial'), kbd: '?', href: `/w/${ws}/help`, group: t('Actions') },
    ]
    const docs: Item[] = (tree.data?.docs ?? []).map((d) => ({ id: `d-${d.path}`, icon: FileText, title: d.title || d.path, detail: d.path, href: docRoute(ws, d.path), group: t('Documents') }))
    const lessons: Item[] = [...(tree.data?.docs ?? []).flatMap((d) => d.lessons), ...(tree.data?.orphanLessons ?? [])]
      .map((l) => ({ id: `l-${l.path}`, icon: GraduationCap, title: l.title, detail: l.path, href: lessonRoute(ws, l.path), group: t('Lessons') }))
    if (!q.trim()) return [...actions, ...docs.slice(0, 8)]
    const ranked = [...actions, ...docs, ...lessons].map((it) => ({ it, s: score(q, `${it.title} ${it.detail ?? ''}`) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 12).map((x) => x.it)
    const text: Item[] = hits.slice(0, 10).map((h) => ({ id: `s-${h.doc}-${h.section}`, icon: TextSearch, title: `§${h.section} ${h.title}`, detail: h.snippet, href: `${docRoute(ws, h.doc)}&section=${encodeURIComponent(h.section)}`, group: t('In documents') }))
    const askItem: Item = { id: 'ask-q', icon: MessageSquareText, title: t('Ask: {question}', { question: q.trim() }), detail: t('Answer from your documents, with sources'), href: `/w/${ws}/ask?q=${encodeURIComponent(q.trim())}`, group: t('Ask') }
    return [...ranked, ...text, ...(q.trim().split(/\s+/).length >= 3 ? [askItem] : [])]
  }, [q, hits, tree.data, ws])
  useEffect(() => { setSel((s) => Math.min(s, Math.max(0, items.length - 1))) }, [items.length])
  // keep the chosen row in view while moving with the arrow keys
  useEffect(() => { if (palette) document.getElementById(`pi-${sel}`)?.scrollIntoView({ block: 'nearest' }) }, [sel, palette])
  if (!palette) return null
  const go = (it: Item) => { setPalette(false); navigate(it.href) }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setPalette(false)
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter' && items[sel]) { e.preventDefault(); go(items[sel]) }
  }
  let lastGroup = ''
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 px-4 pt-[12vh]" onMouseDown={() => setPalette(false)}>
      <div role="dialog" aria-modal="true" aria-label={t('Search')} onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[600px] overflow-hidden rounded-[10px] border border-border bg-raised shadow-pop">
        <div className="flex items-center gap-2 border-b border-border px-3.5">
          <Search className="size-4 text-muted" strokeWidth={1.8} aria-hidden />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setSel(0) }} onKeyDown={onKey}
            placeholder={t('Search documents, lessons and text…')} aria-label={t('Search')} role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={items[sel] ? `pi-${sel}` : undefined}
            className="h-12 flex-1 bg-transparent text-[15px] outline-none" />
        </div>
        <ul id="palette-list" role="listbox" className="max-h-[52vh] overflow-y-auto overscroll-contain p-1.5 pb-2">
          {items.length === 0 && <li className="px-3 py-6 text-center text-[13.5px] text-muted">{q.trim().length < 2 ? t('Type to search.') : t('Nothing found.')}</li>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null
            lastGroup = it.group
            const Icon = it.icon
            return (
              <li key={it.id} role="presentation">
                {header && <p className="px-2.5 pb-1 pt-2.5 text-[11.5px] font-medium text-muted">{header}</p>}
                <div id={`pi-${i}`} role="option" aria-selected={i === sel} onMouseMove={() => setSel(i)} onClick={() => go(it)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 py-2 ${i === sel ? 'bg-hover' : ''}`}>
                  <Icon className="size-4 shrink-0 text-muted" strokeWidth={1.7} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px]">{it.title}</span>
                    {it.detail && <span className="block truncate text-[12px] text-muted">{it.detail}</span>}
                  </span>
                  {it.kbd && <Kbd>{it.kbd}</Kbd>}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
