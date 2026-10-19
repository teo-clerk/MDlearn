// Side-panel tab: the documents this one points to and the ones that point to it.
import { Link } from 'wouter'
import { Network } from 'lucide-react'
import { useLinks } from '../api/queries'
import { docRoute } from '../lib/paths'
import { prettyTitle } from '../lib/title'
import { Spinner } from '../ui/primitives'
import type { LinkedDoc } from '../../shared/types'

export function LinksPanel({ ws, path }: { ws: string; path: string }) {
  const res = useLinks(ws, path)
  if (res.isLoading) return <div className="p-4"><Spinner label="Finding links" /></div>
  if (!res.data) return <p className="px-4 py-3 text-[13px] text-muted">Links could not be read.</p>
  const { outgoing, backlinks } = res.data
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
      <Group ws={ws} title="Points to" rows={outgoing} empty="This document does not link to another document of the folder." />
      <Group ws={ws} title="Pointed to by" rows={backlinks} empty="No other document links here yet." />
      <Link href={`/w/${ws}/map?doc=${encodeURIComponent(path)}`} className="mx-2 inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-border-strong px-2.5 text-[12.5px] font-medium hover:bg-hover"><Network className="size-3.5" aria-hidden />Show on the map</Link>
    </div>
  )
}

function Group({ ws, title, rows, empty }: { ws: string; title: string; rows: LinkedDoc[]; empty: string }) {
  return (
    <section className="mb-4" aria-label={title}>
      <h3 className="px-2 pb-1 text-[12px] font-medium text-muted">{title}{rows.length > 0 && <span className="ml-1.5 tabular text-subtle">{rows.length}</span>}</h3>
      {rows.length === 0 && <p className="px-2 text-[12.5px] text-subtle">{empty}</p>}
      <ul>
        {rows.map((r) => (
          <li key={`${r.kind}-${r.path}`}>
            {r.exists
              ? <Link href={docRoute(ws, r.path)} className="block rounded-[5px] px-2 py-1.5 hover:bg-hover">
                  <span className="block text-[13px] leading-snug">{prettyTitle(r.title)}</span>
                  <span className="block truncate text-[11.5px] text-subtle">{r.path}{r.kind === 'prereq' ? ' · prerequisite' : ''}{r.count > 1 ? ` · ${r.count} links` : ''}</span>
                </Link>
              : <div className="px-2 py-1.5 text-muted" title="This file is not in the folder">
                  <span className="block text-[13px] leading-snug line-through decoration-subtle">{r.path.split('/').pop()}</span>
                  <span className="block truncate text-[11.5px] text-subtle">not found · {r.path}</span>
                </div>}
          </li>
        ))}
      </ul>
    </section>
  )
}
