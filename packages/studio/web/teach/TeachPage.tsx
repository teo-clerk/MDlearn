// Teach-back (the Feynman technique): explain a lesson, or a section of your notes, in plain words as if to a
// beginner. Writing it out shows what you really understand; then an AI compares it with the key ideas and the
// text. A suggestion only: nothing is graded or scheduled. The draft is kept on this device until it is sent.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearch } from 'wouter'
import { ChevronDown, Presentation } from 'lucide-react'
import { api } from '../api/client'
import { useDoc, useEngines, useLesson, useSession } from '../api/queries'
import { Button, Empty, ErrorNote, Spinner } from '../ui/primitives'
import { TopLeft } from '../layout/Shell'
import { docRoute, lessonRoute } from '../lib/paths'
import { prettyTitle } from '../lib/title'
import { TeachFeedback } from './TeachFeedback'
import type { TeachResult } from '../../shared/types'
import { currentLang, t, tp } from '../i18n'

/** Below this the server refuses: a sentence is not an explanation. */
const MIN_CHARS = 20
const MAX_CHARS = 6000
const draftKey = (ws: string, target: string) => `mdl-teach:${ws}:${target}`
const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0)

export default function TeachPage({ ws }: { ws: string }) {
  const params = new URLSearchParams(useSearch())
  const lessonPath = params.get('lesson') ?? undefined
  const docPath = lessonPath ? undefined : params.get('doc') ?? undefined
  const lesson = useLesson(ws, lessonPath)
  const doc = useDoc(ws, docPath)
  const engines = useEngines()
  const session = useSession()
  const sections = useMemo(() => (doc.data?.outline.sections ?? []).filter((s) => s.words >= 30), [doc.data])
  const [section, setSection] = useState(params.get('section') ?? '')
  const chosen = docPath ? sections.find((s) => s.num === section || s.anchor === section) ?? sections[0] : undefined
  const target = lessonPath ?? (chosen ? `${docPath}#${chosen.anchor}` : '')
  const [text, setText] = useState('')
  const [engine, setEngine] = useState<'local' | 'claude' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [result, setResult] = useState<TeachResult | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { document.title = t('Teach it back · MDlearn Studio') }, [])
  useEffect(() => { if (!target) return; try { setText(localStorage.getItem(draftKey(ws, target)) ?? '') } catch { setText('') } setResult(null) }, [ws, target])
  const save = (v: string) => { setText(v); try { localStorage.setItem(draftKey(ws, target), v) } catch { /* private mode */ } }

  const local = !!engines.data?.local.available
  const claude = !!engines.data?.claude.available && !!session.data?.caps.includes('ai')
  const using = engine ?? (local ? 'local' : claude ? 'claude' : null)
  const title = lessonPath ? prettyTitle(lesson.data?.lesson?.title ?? '') : chosen ? `${chosen.num ? `§${chosen.num} ` : ''}${chosen.title}` : ''
  const back = lessonPath ? lessonRoute(ws, lessonPath) : docPath && chosen ? `${docRoute(ws, docPath)}&section=${encodeURIComponent(chosen.num ?? chosen.anchor)}` : null

  const send = async () => {
    if (!using || busy || text.trim().length < MIN_CHARS) return
    setBusy(true); setError(null)
    try {
      const body = { text, lang: currentLang(), engine: using, ...(lessonPath ? { lesson: lessonPath } : { doc: docPath, section: chosen?.num ?? chosen?.anchor }) }
      setResult(await api.post<TeachResult>(`/api/w/${ws}/teachback`, body))
    } catch (e) { setError(e) } finally { setBusy(false) }
  }

  if (!lessonPath && !docPath) return <Empty icon={Presentation} title={t('Teach it back')}>{t('Open a lesson or a document and choose “Teach it back”.')}</Empty>
  if (lesson.isLoading || doc.isLoading) return <div className="p-10"><Spinner /></div>
  if (lesson.error || doc.error) return <ErrorNote error={lesson.error ?? doc.error} />
  if (docPath && !chosen) return <Empty icon={Presentation} title={t('Nothing to explain here')}>{t('This document has no section long enough to explain.')}</Empty>
  return (
    <div className="mx-auto max-w-[720px] px-5 pb-24 pt-2 sm:px-8">
      <TopLeft><span className="truncate px-1 text-[13px] text-muted">{t('Teach it back')}</span></TopLeft>
      <section className="pt-8" aria-labelledby="teach-title">
        <h1 id="teach-title" className="text-[24px] font-semibold tracking-[-0.015em]">{t('Teach it back')}</h1>
        <p className="mt-1.5 max-w-[62ch] text-[14.5px] text-muted">{t('Explain it in your own words, as if to someone who has never heard of it. Writing it out shows what you really understand; then the AI compares it with the text.')}</p>
        {docPath ? (
          <div className="mt-5">
            <label htmlFor="teach-section" className="text-[12.5px] text-muted">{t('Section')}</label>
            <span className="relative mt-1.5 block max-w-[30rem]">
              <select id="teach-section" value={chosen!.anchor} onChange={(e) => setSection(e.target.value)} className="h-9 w-full cursor-pointer appearance-none truncate rounded-[6px] border border-border-strong bg-bg pl-2.5 pr-8 text-[14px] outline-none focus:border-text">
                {sections.map((s) => <option key={s.anchor} value={s.anchor}>{`${' '.repeat(Math.max(0, s.depth - 2))}${s.num ? `${s.num} ` : ''}${s.title}`}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            </span>
          </div>
        ) : <p className="mt-5 text-[15px] font-medium">{title}</p>}
        <ul className="mt-4 flex flex-col gap-0.5 text-[13px] text-muted">
          <li>{t('Plain words: if you need a technical term, say what it means.')}</li>
          <li>{t('Say why, not only what; give one example.')}</li>
          <li>{t('Do not look back at the text while you write.')}</li>
        </ul>
        <label htmlFor="teach-text" className="sr-only">{t('Your explanation')}</label>
        <textarea id="teach-text" ref={box} value={text} onChange={(e) => save(e.target.value.slice(0, MAX_CHARS))} rows={10} placeholder={t('Start with what it is for, then how it works…')}
          className="read mt-4 block w-full resize-y rounded-[8px] border border-border-strong bg-bg px-3.5 py-3 text-[16px] leading-relaxed outline-none focus:border-text" />
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button variant="primary" icon={Presentation} busy={busy} disabled={!using || text.trim().length < MIN_CHARS} onClick={() => void send()}>{result ? t('Get feedback again') : t('Get feedback')}</Button>
          {local && claude && (
            <span role="radiogroup" aria-label={t('Feedback from')} className="inline-flex gap-1 text-[12.5px]">
              {(['local', 'claude'] as const).map((e) => (
                <button key={e} type="button" role="radio" aria-checked={using === e} onClick={() => setEngine(e)}
                  className={`h-7 rounded-[6px] border px-2 cursor-pointer ${using === e ? 'border-text bg-hover font-medium' : 'border-border text-muted hover:bg-hover'}`}>{e === 'local' ? t('Local AI') : 'Claude'}</button>
              ))}
            </span>
          )}
          <span className="ml-auto tabular text-[12px] text-muted">{tp(words(text), '{n} word', '{n} words')}</span>
        </div>
        {!using && engines.data && <p className="mt-3 text-[13px] text-muted">{t('Feedback needs the local AI (Ollama) or Claude.')} <Link href={`/w/${ws}/settings#local-ai`} className="underline underline-offset-2 hover:text-text">{t('Set one up in Settings')}</Link></p>}
        {busy && <p className="mt-3 text-[13px] text-muted" role="status">{using === 'local' ? t('Reading your explanation. The local AI can take a minute.') : t('Reading your explanation…')}</p>}
        {error ? <div className="mt-4"><ErrorNote error={error} retry={() => void send()} /></div> : null}
      </section>
      {result && <TeachFeedback result={result} back={back} onRevise={() => { box.current?.focus(); box.current?.scrollIntoView({ block: 'center' }) }} />}
    </div>
  )
}
