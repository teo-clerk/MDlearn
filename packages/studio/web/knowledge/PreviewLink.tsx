// A link to another document of the folder, with a card on hover: what that document is and how well you know it.
import type { ReactNode } from 'react'
import { resolveRel } from '@mdlearn/core/paths'
import { useDocSummary } from '../api/queries'
import { duration, prettyTitle } from '../lib/title'
import { MemoryMark } from '../ui/primitives'
import { Hoverable } from './HoverCard'

const fmt = new Intl.NumberFormat()

export function PreviewLink({ ws, from, url, children }: { ws: string; from: string; url: string; children: ReactNode }) {
  const target = resolveRel(from, url)?.split('#')[0]
  if (!target || !/\.(md|markdown)$/i.test(target)) return <>{children}</>
  return <Hoverable card={() => <DocCard ws={ws} path={target} />}>{children}</Hoverable>
}

function DocCard({ ws, path }: { ws: string; path: string }) {
  const s = useDocSummary(ws, path)
  if (s.isLoading) return <p className="text-muted">Opening…</p>
  if (!s.data) return <p className="text-muted">{path} is not in this folder.</p>
  const d = s.data
  const meta = [d.level && d.level[0].toUpperCase() + d.level.slice(1), d.timeMin ? duration(d.timeMin) : null, `${fmt.format(d.words)} words`].filter(Boolean).join(' · ')
  return (
    <>
      <p className="text-[14px] font-semibold">{prettyTitle(d.title)}</p>
      <p className="mt-0.5 tabular text-[12px] text-muted">{meta}</p>
      {d.intro && <p className="mt-1.5 line-clamp-4 text-text/85">{d.intro.replace(/[*_`]/g, '')}</p>}
      {!!d.lessons && <p className="mt-2 flex items-center gap-2 text-[12px] text-muted tabular">{d.lessons} {d.lessons === 1 ? 'lesson' : 'lessons'} · <MemoryMark memory={d.memory} seen={d.seen} /></p>}
    </>
  )
}
