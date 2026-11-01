// A small sign of what MDlearn is doing at the foot of the sidebar, and someone to ask about your course. No hunger, no
// coins, no guilt, nothing for time spent here. It always says in words what it shows, and it stays away from study
// sessions and exams. Settings can change it or turn it off.
import { lazy, Suspense, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Link, useLocation, useSearch } from 'wouter'
import { useInbox, useJobs, useTree } from '../api/queries'
import { useUi } from '../state/ui'
import { IconButton } from '../ui/primitives'
import { AskBox } from './AskBox'
import { PixelPet } from './PixelPet'
import { activityLabel, useActivity } from './useActivity'
import { t, tp } from '../i18n'

const Orb = lazy(() => import('./Orb'))

function Panel({ ws, thread, onThread, onClose }: { ws: string; thread: string[]; onThread: (ids: string[]) => void; onClose: () => void }) {
  const tree = useTree(ws), inbox = useInbox(ws), jobs = useJobs(ws)
  const [location] = useLocation()
  const search = useSearch()
  const doc = /\/(doc|lesson)$/.test(location) ? new URLSearchParams(search).get('path') : null
  const job = jobs.data?.find((j) => j.status === 'running' || j.status === 'queued')
  const row = 'rounded-[5px] px-2 py-1 text-[12.5px] text-muted hover:bg-hover hover:text-text'
  return (
    <div role="dialog" aria-label={t('Companion')} onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      className="absolute bottom-full left-2 z-50 mb-1 flex max-h-[min(76vh,640px)] w-[min(440px,calc(100vw-1.5rem))] flex-col rounded-[8px] border border-border bg-raised shadow-pop">
      <div className="flex items-center justify-between border-b border-border py-1 pl-3 pr-1">
        <h2 className="text-[13px] font-medium">{t('Ask about your course')}</h2>
        <IconButton icon={X} label={t('Close')} onClick={onClose} />
      </div>
      <AskBox ws={ws} doc={doc} thread={thread} onThread={onThread} />
      <div className="flex flex-wrap items-center border-t border-border px-1 py-1">
        <Link href={`/w/${ws}/study`} className={row} onClick={onClose}>{tp(tree.data?.totals.due ?? 0, '{n} card due', '{n} cards due')}</Link>
        <Link href={`/w/${ws}/inbox`} className={row} onClick={onClose}>{tp(inbox.data?.total ?? 0, '{n} in your inbox', '{n} in your inbox')}</Link>
        {job ? <Link href={`/w/${ws}/studio?job=${job.id}`} className={row} onClick={onClose}>{job.title}</Link> : <span className="px-2 py-1 text-[12.5px] text-subtle">{t('No AI job running')}</span>}
      </div>
    </div>
  )
}

function Present({ ws, kind }: { ws: string; kind: 'orb' | 'pixel' }) {
  const { activity, hidden } = useActivity(ws)
  const [open, setOpen] = useState(false)
  const [thread, setThread] = useState<string[]>([]) // here, so the conversation is still there when you open it again
  const toggle = useRef<HTMLButtonElement>(null)
  if (hidden) return null
  const close = () => { setOpen(false); toggle.current?.focus() }
  return (
    <div className="relative px-2 pt-1 max-[899px]:hidden" data-companion={kind}>
      <button ref={toggle} aria-expanded={open} title={t('Ask about your course')} onClick={() => setOpen((o) => !o)} className="flex h-8 w-full items-center gap-2 rounded-[6px] px-1.5 text-[13px] text-muted hover:bg-hover hover:text-text cursor-pointer">
        <span className="flex size-6 shrink-0 items-center justify-center" aria-hidden>
          {kind === 'orb' ? <Suspense fallback={null}><Orb activity={activity} /></Suspense> : <PixelPet activity={activity} />}
        </span>
        <span className="truncate" role="status" aria-live="off">{activityLabel(activity)}</span>
      </button>
      {open && <Panel ws={ws} thread={thread} onThread={setThread} onClose={close} />}
    </div>
  )
}

export function Companion({ ws }: { ws: string }) {
  const kind = useUi((u) => u.companion)
  return kind === 'off' ? null : <Present ws={ws} kind={kind} />
}
