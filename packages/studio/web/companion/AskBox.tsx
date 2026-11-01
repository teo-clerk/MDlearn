// Asking the companion: a short conversation about your course, in the language you write in. It answers from your notes
// and lessons with the passages shown, knows your progress and the page you are on, and says what is not from your course.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'wouter'
import { useQueryClient } from '@tanstack/react-query'
import { askApi, useAskHistory } from '../api/queries'
import { AskAnswer } from '../knowledge/AskAnswer'
import { EnginePick, useAskEngine } from '../knowledge/AskEngine'
import { Button } from '../ui/primitives'
import type { AskEntry } from '../../shared/types'
import { currentLang, t } from '../i18n'

const FOLLOW_UP_TURNS = 3

interface AskBoxProps { ws: string; doc: string | null; thread: string[]; onThread: (ids: string[]) => void }

export function AskBox({ ws, doc, thread, onThread }: AskBoxProps) {
  const engine = useAskEngine()
  const history = useAskHistory(ws)
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const last = useRef<HTMLDivElement>(null)
  const entries = thread.flatMap((id) => history.data?.find((e) => e.id === id) ?? [])
  useEffect(() => { field.current?.focus() }, [])
  useEffect(() => { last.current?.scrollIntoView({ block: 'nearest' }) }, [entries.length])

  const submit = async () => {
    const question = q.trim()
    if (question.length < 2 || busy || !engine.using) return
    setBusy(true); setError(null)
    try {
      const r = await askApi.ask(ws, question, { engine: engine.using, lang: currentLang(), companion: true, ...(doc ? { doc } : {}), thread: thread.slice(-FOLLOW_UP_TURNS) })
      qc.setQueryData<AskEntry[]>(['ask-history', ws], (old) => [r.entry, ...(old ?? []).filter((e) => e.id !== r.entry.id)])
      onThread([...thread, r.id]); setQ('')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false); field.current?.focus() }
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {entries.length === 0
          ? <p className="py-1 text-[13px] text-muted">{t('Ask about a lesson, about what to review next, or about anything you did not follow. It knows the page you are on.')}</p>
          : <div className="flex flex-col gap-5">{entries.map((e) => <AskAnswer key={e.id} ws={ws} e={e} compact />)}<div ref={last} /></div>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void submit() }} className="border-t border-border px-3 py-2">
        <textarea ref={field} value={q} onChange={(e) => setQ(e.target.value)} rows={2} maxLength={1000} aria-label={t('Your question')} disabled={engine.known && !engine.using}
          placeholder={t('Ask anything about your course')} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() } }}
          className="w-full resize-none rounded-[6px] border border-border-strong bg-bg px-2.5 py-1.5 text-[14px] outline-none placeholder:text-subtle focus:border-focus disabled:opacity-60" />
        <div className="mt-1.5 flex items-center gap-3">
          <Button type="submit" size="sm" variant="primary" busy={busy} disabled={q.trim().length < 2 || !engine.using}>{t('Ask')}</Button>
          {entries.length > 0 && <button type="button" onClick={() => { onThread([]); field.current?.focus() }} className="text-[12.5px] text-muted underline-offset-2 hover:text-text hover:underline cursor-pointer">{t('New conversation')}</button>}
          <Link href={`/w/${ws}/ask`} className="ml-auto text-[12.5px] text-muted underline-offset-2 hover:text-text hover:underline">{t('All your answers')}</Link>
        </div>
        <EnginePick ws={ws} engine={engine} progress />
        {error && <p role="alert" className="mt-1.5 text-[13px] text-bad">{error}</p>}
      </form>
    </>
  )
}
