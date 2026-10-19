// Side-panel outline: sections with their numbers, the one you are reading highlighted, and — when the
// document has lessons — how well you remember each section.
import { useEffect, useState } from 'react'
import type { DocOutline } from '@mdlearn/core'
import type { SectionMemory } from '../api/queries'
import { MemoryMark } from '../ui/primitives'
import { prettyTitle } from '../lib/title'

export function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    const root = document.getElementById('main')
    if (!root || !ids.length) return
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e)
    const onScroll = () => {
      const top = root.getBoundingClientRect().top + 90
      let current: string | null = els[0]?.id ?? null
      for (const el of els) { if (el.getBoundingClientRect().top <= top) current = el.id; else break }
      setActive(current)
    }
    onScroll()
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => root.removeEventListener('scroll', onScroll)
  }, [ids])
  return active
}

export function Outline({ outline, memory }: { outline: DocOutline; memory?: SectionMemory[] }) {
  const sections = outline.sections.filter((s) => s.depth <= 3)
  const active = useActiveSection(sections.map((s) => s.anchor))
  const mem = new Map((memory ?? []).map((m) => [m.anchor, m]))
  if (!sections.length) return <p className="px-4 py-3 text-[13px] text-muted">This document has no sections.</p>
  return (
    <nav aria-label="Outline" className="px-2 py-2">
      <ul className="text-[13px]">
        {sections.map((s) => {
          const m = mem.get(s.anchor)
          const on = active === s.anchor
          return (
            <li key={s.anchor}>
              <a href={`#${s.anchor}`} aria-current={on ? 'location' : undefined} style={{ paddingLeft: 8 + (s.depth - 2) * 14 }}
                onClick={(e) => { e.preventDefault(); document.getElementById(s.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); history.replaceState(null, '', `#${s.anchor}`) }}
                className={`flex items-baseline gap-2 rounded-[5px] py-1 pr-2 leading-snug ${on ? 'bg-active text-text' : 'text-text/75 hover:bg-hover hover:text-text'}`}>
                {s.num && <span className="w-7 shrink-0 tabular text-[12px] text-subtle">{s.num}</span>}
                <span className="min-w-0 flex-1">{prettyTitle(s.title)}</span>
                {m && m.seen > 0 && <MemoryMark memory={m.memory} seen={m.seen} />}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
