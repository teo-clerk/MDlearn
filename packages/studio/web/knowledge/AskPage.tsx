// Ask your whole folder: a question, an answer from your own documents, and the passages it came from.
import { useEffect, useRef, useState } from 'react'
import { Link, useSearch } from 'wouter'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Loader2, MessageSquareText } from 'lucide-react'
import { askApi, useAskHistory, useAskStatus, useSession } from '../api/queries'
import { Button, Empty, ErrorNote, Spinner } from '../ui/primitives'
import { AskAnswer } from './AskAnswer'
import { EnginePick, useAskEngine } from './AskEngine'
import { Frame } from './Frame'
import type { AskEntry, AskStatus } from '../../shared/types'
import { currentLang, t, tp, locale } from '../i18n'

const fmt = new Intl.NumberFormat(locale())

export default function AskPage({ ws }: { ws: string }) {
  const status = useAskStatus(ws)
  const history = useAskHistory(ws)
  const session = useSession()
  const engine = useAskEngine()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const asked = useRef(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const preset = new URLSearchParams(useSearch()).get('q')
  useEffect(() => { document.title = t('Ask · MDlearn Studio') }, [])

  const submit = async (text: string) => {
    const question = text.trim()
    if (question.length < 2 || busy) return
    setBusy(true); setError(null)
    try {
      const r = await askApi.ask(ws, question, { engine: engine.using ?? 'local', lang: currentLang() })
      qc.setQueryData<AskEntry[]>(['ask-history', ws], (old) => [r.entry, ...(old ?? []).filter((e) => e.id !== r.entry.id)])
      setQ('')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false); field.current?.focus() }
  }
  // a question handed over from the search palette is asked once
  useEffect(() => { if (preset && !asked.current && engine.using) { asked.current = true; void submit(preset) } }, [preset, engine.using]) // eslint-disable-line react-hooks/exhaustive-deps

  const s = status.data
  const off = engine.known && !engine.using
  return (
    <Frame title={t('Ask')} hint={t('Questions about everything in this folder, answered from your own documents with the passages shown.')}>
      <SearchModel ws={ws} s={s} canSetup={!!session.data?.caps.includes('ai')} />
      <form onSubmit={(e) => { e.preventDefault(); void submit(q) }} className="mb-6">
        <textarea ref={field} value={q} onChange={(e) => setQ(e.target.value)} rows={2} maxLength={1000} aria-label={t('Your question')} disabled={off}
          placeholder={off ? t('The local model is not available.') : t('Ask something, e.g. why can no engine beat the Carnot limit?')}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(q) } }}
          className="w-full resize-y rounded-[8px] border border-border-strong bg-raised px-3.5 py-2.5 text-[15px] outline-none placeholder:text-subtle focus:border-focus disabled:opacity-60" />
        <div className="mt-2 flex items-center gap-3">
          <Button type="submit" variant="primary" busy={busy} disabled={q.trim().length < 2 || !engine.using}>{t('Ask')}</Button>
          <span className="text-[12px] text-subtle">{t('Enter to ask · Shift+Enter for a new line')}</span>
          {!!history.data?.length && <button type="button" onClick={async () => { await askApi.remove(ws, null); await qc.invalidateQueries({ queryKey: ['ask-history', ws] }) }} className="ml-auto text-[12.5px] text-muted hover:text-text underline-offset-2 hover:underline cursor-pointer">{t('Clear history')}</button>}
        </div>
        <EnginePick ws={ws} engine={engine} />
        {error && <p role="alert" className="mt-2 text-[13px] text-bad">{error}</p>}
      </form>
      {history.isLoading && <Spinner label={t('Loading')} />}
      {history.error && <ErrorNote error={history.error} retry={() => history.refetch()} />}
      {history.data && history.data.length === 0 && <Empty icon={MessageSquareText} title={t('Nothing asked yet')}>{t('Ask in your own words. The answer cites the passages it used, and each one opens in its document.')}</Empty>}
      <div className="flex flex-col gap-7">
        {history.data?.map((e) => <AskAnswer key={e.id} ws={ws} e={e} />)}
      </div>
    </Frame>
  )
}

/** The optional download that makes search understand meaning, and how far indexing has come. */
function SearchModel({ ws, s, canSetup }: { ws: string; s?: AskStatus; canSetup: boolean }) {
  const qc = useQueryClient()
  const [err, setErr] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  if (!s) return null
  const start = async () => {
    setStarting(true); setErr(null)
    try { qc.setQueryData(['ask-status', ws], await askApi.setup(ws)) } catch (e) { setErr((e as Error).message) } finally { setStarting(false) }
  }
  const working = !!s.pulling || s.building
  const incomplete = s.installed && s.indexed < s.total && !working
  if (s.installed && !working && !incomplete && !s.error) return null
  return (
    <section aria-label={t('Search model')} className="mb-5 rounded-[8px] border border-border bg-panel px-4 py-3 text-[13.5px]">
      {s.reading && <p role="status" className="text-muted">{t('Reading your documents…')}</p>}
      {!s.installed && !s.pulling && (
        <>
          <p className="font-medium">{t('Search by meaning')}</p>
          <p className="mt-0.5 text-muted">{t('Questions are matched by words now. A small search model ({model}, downloaded once through Ollama) also finds passages that use other words.', { model: s.size })}</p>
          {!s.ollama && <p className="mt-1.5 text-muted">{t('Ollama is not running; start it to download.')} <Link href={`/w/${ws}/settings#local-ai`} className="underline underline-offset-2 hover:text-text">{t('Local AI settings')}</Link></p>}
          {s.ollama && (canSetup
            ? <Button className="mt-2.5" size="sm" icon={Download} busy={starting} onClick={() => void start()}>{t('Download {model}', { model: s.model })}</Button>
            : <p className="mt-1.5 text-muted">{t('Download it from the computer that runs MDlearn.')}</p>)}
        </>
      )}
      {s.pulling && (
        <div role="status" aria-live="polite">
          <p className="font-medium">{t('Downloading {model}', { model: s.model })}{s.pulling.percent !== undefined ? ` · ${s.pulling.percent}%` : ''}</p>
          {s.pulling.percent !== undefined && <div className="mt-2 h-[3px] w-full overflow-hidden rounded bg-active"><div className="h-full bg-accent transition-[width]" style={{ width: `${s.pulling.percent}%` }} /></div>}
          <p className="mt-1.5 text-muted">{s.pulling.status}</p>
        </div>
      )}
      {s.building && (
        <div role="status" aria-live="polite">
          <p className="flex items-center gap-2 font-medium"><Loader2 className="size-4 animate-spin text-muted" aria-hidden />{t('Indexing passages')} · <span className="tabular">{t('{done} of {total}', { done: fmt.format(s.indexed), total: fmt.format(s.total) })}</span></p>
          <p className="mt-0.5 text-muted">{t('You can ask meanwhile; what is not indexed yet is found by words.')}</p>
        </div>
      )}
      {incomplete && (
        <p className="flex flex-wrap items-center gap-3"><span className="text-muted tabular">{tp(s.total - s.indexed, '{n} passage is not indexed for meaning search yet.', '{n} passages are not indexed for meaning search yet.')}</span>
          {canSetup && <Button size="sm" busy={starting} onClick={() => void start()}>{t('Index now')}</Button>}</p>
      )}
      {(s.error || err) && <p role="alert" className="mt-1.5 text-bad">{s.error ?? err}</p>}
    </section>
  )
}
