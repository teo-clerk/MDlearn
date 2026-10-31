// Save a thought in a moment. Enter saves, Shift+Enter starts a new line; a pasted address is kept as a link.
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { inboxApi, keys } from '../api/queries'
import { Button, ErrorNote } from '../ui/primitives'
import { t } from '../i18n'

const JUST_AN_ADDRESS = /^https?:\/\/\S{1,1990}$/i
export const MAX_CAPTURE = 4000

export function CaptureForm({ ws, rows = 2, autoFocus, onSaved }: { ws: string; rows?: number; autoFocus?: boolean; onSaved?(): void }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const save = useMutation({
    mutationFn: () => { const s = text.trim(); return inboxApi.capture(ws, JUST_AN_ADDRESS.test(s) ? { url: s } : { text: s }) },
    onSuccess: () => { setText(''); void qc.invalidateQueries({ queryKey: keys.inbox(ws) }); onSaved?.() },
  })
  const ready = text.trim().length > 0 && !save.isPending
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (ready) save.mutate() }}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={rows} maxLength={MAX_CAPTURE} autoFocus={autoFocus} aria-label={t('Capture a thought')} placeholder={t('Capture a thought…')}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (ready) save.mutate() } }}
        className="block w-full resize-y rounded-[6px] border border-border-strong bg-bg px-2.5 py-2 text-[14px] outline-none placeholder:text-subtle focus:border-focus" />
      {save.error && <div className="mt-2"><ErrorNote error={save.error} /></div>}
      <div className="mt-2 flex items-center gap-2">
        <Button type="submit" size="sm" variant="secondary" disabled={!ready} busy={save.isPending}>{t('Save to inbox')}</Button>
        <span className="text-[12px] text-subtle max-[700px]:hidden">{t('Enter saves. Shift+Enter starts a new line.')}</span>
      </div>
    </form>
  )
}
