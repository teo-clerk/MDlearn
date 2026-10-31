// A small sign of what MDlearn is doing, at the foot of the sidebar. A test, off by default: no hunger, no coins, no
// guilt, nothing for time spent here. It always says in words what it shows.
import { lazy, Suspense, useState } from 'react'
import { Link } from 'wouter'
import { useInbox, useJobs, useTree } from '../api/queries'
import { useUi } from '../state/ui'
import { PixelPet } from './PixelPet'
import { activityLabel, useActivity } from './useActivity'
import { t, tp } from '../i18n'

const Orb = lazy(() => import('./Orb'))

function Now({ ws, onClose }: { ws: string; onClose: () => void }) {
  const tree = useTree(ws), inbox = useInbox(ws), jobs = useJobs(ws)
  const job = jobs.data?.find((j) => j.status === 'running' || j.status === 'queued')
  const row = 'block rounded-[5px] px-2 py-1.5 text-[13px] hover:bg-hover'
  return (
    <>
      <button aria-label={t('Close')} className="fixed inset-0 z-40 cursor-default" onClick={onClose} />
      <div role="dialog" aria-label={t('Right now')} className="absolute bottom-full left-2 right-2 z-50 mb-1 rounded-[8px] border border-border bg-raised p-1 shadow-pop">
        <Link href={`/w/${ws}/study`} className={row} onClick={onClose}>{tp(tree.data?.totals.due ?? 0, '{n} card due', '{n} cards due')}</Link>
        <Link href={`/w/${ws}/inbox`} className={row} onClick={onClose}>{tp(inbox.data?.total ?? 0, '{n} in your inbox', '{n} in your inbox')}</Link>
        {job ? <Link href={`/w/${ws}/studio?job=${job.id}`} className={row} onClick={onClose}>{job.title}</Link> : <p className="px-2 py-1.5 text-[13px] text-muted">{t('No AI job running')}</p>}
      </div>
    </>
  )
}

function Present({ ws, kind }: { ws: string; kind: 'orb' | 'pixel' }) {
  const { activity, hidden } = useActivity(ws)
  const [open, setOpen] = useState(false)
  if (hidden) return null
  return (
    <div className="relative px-2 pt-1 max-[899px]:hidden" data-companion={kind}>
      <button aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex h-8 w-full items-center gap-2 rounded-[6px] px-1.5 text-[13px] text-muted hover:bg-hover hover:text-text cursor-pointer">
        <span className="flex size-6 shrink-0 items-center justify-center" aria-hidden>
          {kind === 'orb' ? <Suspense fallback={null}><Orb activity={activity} /></Suspense> : <PixelPet activity={activity} />}
        </span>
        <span className="truncate" role="status">{activityLabel(activity)}</span>
      </button>
      {open && <Now ws={ws} onClose={() => setOpen(false)} />}
    </div>
  )
}

export function Companion({ ws }: { ws: string }) {
  const kind = useUi((u) => u.companion)
  return kind === 'off' ? null : <Present ws={ws} kind={kind} />
}
