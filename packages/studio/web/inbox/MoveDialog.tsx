// Move an inbox item to the end of a section of a document you pick. It only ever happens here, when you ask.
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { inboxApi, useDoc, useTree } from '../api/queries'
import { Button, ErrorNote, Spinner } from '../ui/primitives'
import { prettyTitle } from '../lib/title'
import { Choice } from '../import/Choice'
import type { InboxItem } from '../../shared/types'
import { t } from '../i18n'

const SHOWN = 8
const INBOX_FOLDER = 'Inbox/'

export function MoveDialog({ ws, item, onClose, onMoved }: { ws: string; item: InboxItem; onClose(): void; onMoved(): void }) {
  const tree = useTree(ws)
  const [q, setQ] = useState('')
  const [doc, setDoc] = useState<string | null>(item.source?.doc ?? null)
  const [section, setSection] = useState<string | null>(item.source?.section ?? null)
  const opened = useDoc(ws, doc ?? undefined)
  const move = useMutation({ mutationFn: () => inboxApi.move(ws, item, doc!, section), onSuccess: () => { onMoved(); onClose() } })
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const docs = (tree.data?.docs ?? []).filter((d) => !d.path.startsWith(INBOX_FOLDER) && words.every((w) => `${d.title} ${d.path}`.toLowerCase().includes(w))).slice(0, SHOWN)
  const pick = (path: string) => { setDoc(path); setSection(null) }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/25 px-4 py-[10vh]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="move-title" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
        className="w-full max-w-[480px] rounded-[10px] border border-border bg-raised p-4 shadow-pop">
        <h2 id="move-title" className="text-[15px] font-semibold">{t('Move to a document')}</h2>
        <p className="mt-0.5 text-[13px] text-muted">{t('The text is added at the end of the section you pick.')}</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus spellCheck={false} aria-label={t('Find a document')} placeholder={t('Find a document…')}
          className="mt-3 h-9 w-full rounded-[6px] border border-border-strong bg-bg px-3 text-[14px] outline-none placeholder:text-subtle focus:border-focus" />
        <div role="radiogroup" aria-label={t('Documents')} className="mt-2 rounded-[8px] border border-border">
          {docs.length === 0 && <p className="px-3 py-2 text-[13px] text-muted">{t('Nothing found.')}</p>}
          {docs.map((d) => (
            <button key={d.path} type="button" role="radio" aria-checked={doc === d.path} onClick={() => pick(d.path)}
              className={`block w-full border-b border-border px-3 py-1.5 text-left last:border-b-0 cursor-pointer ${doc === d.path ? 'bg-hover' : 'hover:bg-hover'}`}>
              <span className="block truncate text-[13px]">{prettyTitle(d.title)}</span>
              <span className="block truncate text-[11.5px] text-subtle">{d.path}</span>
            </button>
          ))}
        </div>
        {doc && opened.isLoading && <div className="mt-3"><Spinner /></div>}
        {doc && opened.data && (
          <fieldset className="mt-3 max-h-[28vh] overflow-y-auto">
            <legend className="text-[12.5px] text-muted">{t('Where in {doc}', { doc: prettyTitle(opened.data.outline.title) })}</legend>
            <Choice name="move-section" checked={section === null} onChange={() => setSection(null)} title={t('End of the document')} hint="" />
            {opened.data.outline.sections.filter((s) => s.depth <= 3).map((s) => (
              <Choice key={s.anchor} name="move-section" checked={section === s.anchor} onChange={() => setSection(s.anchor)} title={`${s.num ? `${s.num} ` : ''}${prettyTitle(s.title)}`} hint="" />
            ))}
          </fieldset>
        )}
        {move.error && <div className="mt-2"><ErrorNote error={move.error} /></div>}
        <div className="mt-3 flex gap-2">
          <Button variant="primary" disabled={!doc} busy={move.isPending} onClick={() => move.mutate()}>{t('Move')}</Button>
          <Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
        </div>
      </div>
    </div>
  )
}
