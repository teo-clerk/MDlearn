// Today → Inbox: what you captured, to be turned into a card, moved into a document, or let go.
import { useState } from 'react'
import { Link } from 'wouter'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRightToLine, Check, Layers } from 'lucide-react'
import { inboxApi, keys, useInbox, useSession, type CardInput } from '../api/queries'
import { Button, ErrorNote } from '../ui/primitives'
import { docRoute } from '../lib/paths'
import { prettyTitle } from '../lib/title'
import { CardForm } from '../notes/CardForm'
import { CaptureForm } from './CaptureForm'
import { MoveDialog } from './MoveDialog'
import type { InboxItem } from '../../shared/types'
import { t, tp } from '../i18n'

export function InboxSection({ ws }: { ws: string }) {
  const inbox = useInbox(ws)
  const caps = useSession().data?.caps ?? []
  const canSort = caps.includes('notes')
  if (inbox.isLoading || !canSort && !inbox.data?.total) return null
  const { items = [], total = 0 } = inbox.data ?? {}
  return (
    <section className="mt-8" aria-labelledby="inbox">
      <h2 id="inbox" className="text-[13px] font-medium text-muted">{total ? tp(total, 'Inbox · {n} to sort', 'Inbox · {n} to sort') : t('Inbox')}</h2>
      {inbox.error && <ErrorNote error={inbox.error} retry={() => void inbox.refetch()} />}
      {canSort && <div className="mt-2"><CaptureForm ws={ws} /></div>}
      {items.length > 0 && <ul className="mt-3">{items.map((item) => <Row key={`${item.file}:${item.line}`} ws={ws} item={item} canSort={canSort} canMove={caps.includes('write')} />)}</ul>}
      {total > items.length && <p className="mt-2 text-[12.5px] text-muted">{tp(total - items.length, '{n} older item is in the Inbox folder.', '{n} older items are in the Inbox folder.')}</p>}
    </section>
  )
}

function Row({ ws, item, canSort, canMove }: { ws: string; item: InboxItem; canSort: boolean; canMove: boolean }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState<'card' | 'move' | null>(null)
  const refresh = () => { void qc.invalidateQueries({ queryKey: keys.inbox(ws) }); void qc.invalidateQueries({ queryKey: keys.tree(ws) }); void qc.invalidateQueries({ queryKey: keys.today(ws) }) }
  const done = useMutation({ mutationFn: () => inboxApi.done(ws, item), onSuccess: refresh })
  const saveCard = async (card: CardInput) => { await inboxApi.card(ws, item, card); refresh() }
  const body = item.quote ?? item.text
  return (
    <li className="border-t border-border py-2.5">
      {item.text && <p className="whitespace-pre-wrap text-[14px] leading-snug [overflow-wrap:anywhere]">{item.text}</p>}
      {item.quote && <blockquote className="mt-1 line-clamp-3 border-l border-border-strong pl-2 text-[13px] text-muted [overflow-wrap:anywhere]">{item.quote}</blockquote>}
      <p className="mt-1 text-[12px] text-subtle tabular [overflow-wrap:anywhere]">
        {item.date}{item.time ? ` ${item.time}` : ''}
        {item.source?.doc && <> · <Link href={docRoute(ws, item.source.doc, item.source.section ?? undefined)} className="underline hover:text-text">{prettyTitle(item.source.label)}</Link></>}
        {item.source?.url && <> · <a href={item.source.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-text">{item.source.label}</a></>}
      </p>
      {done.error && <div className="mt-1"><ErrorNote error={done.error} /></div>}
      {canSort && open !== 'card' && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" icon={Layers} disabled={!body} onClick={() => setOpen('card')}>{t('Card')}</Button>
          {canMove && <Button size="sm" variant="ghost" icon={ArrowRightToLine} onClick={() => setOpen('move')}>{t('Move')}</Button>}
          <Button size="sm" variant="ghost" icon={Check} busy={done.isPending} onClick={() => done.mutate()}>{t('Done')}</Button>
        </div>
      )}
      {open === 'card' && <div className="mt-2 rounded-[8px] border border-border-strong bg-raised p-3 text-[13px]"><CardForm text={body} quote={body} onSave={saveCard} onCancel={() => setOpen(null)} /></div>}
      {open === 'move' && <MoveDialog ws={ws} item={item} onClose={() => setOpen(null)} onMoved={refresh} />}
    </li>
  )
}
