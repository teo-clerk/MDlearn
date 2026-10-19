// A cheat sheet for one document: its formulas and defined terms by section, with optional key ideas
// written by the local model. Print it (A4, two columns) or save it as a PDF from the browser.
import { useEffect, useState } from 'react'
import { useSearch } from 'wouter'
import { useQueryClient } from '@tanstack/react-query'
import { ListChecks, Printer, Sparkles } from 'lucide-react'
import { sheetApi, useEngines, useSheet } from '../api/queries'
import { prettyTitle, duration } from '../lib/title'
import { Tex } from '../prose/Tex'
import { MiniMarkdown } from '../prose/MiniMarkdown'
import { Button, Empty, ErrorNote, Spinner } from '../ui/primitives'
import { TopActions } from '../layout/Shell'

export default function SheetPage({ ws }: { ws: string }) {
  const path = new URLSearchParams(useSearch()).get('path') ?? undefined
  const res = useSheet(ws, path)
  const engines = useEngines()
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [columns, setColumns] = useState<1 | 2>(1)
  useEffect(() => { if (res.data) document.title = `Cheat sheet — ${res.data.title}` }, [res.data])
  if (!path) return <Empty icon={ListChecks} title="No document selected">Open a document and choose its cheat sheet.</Empty>
  if (res.isLoading) return <div className="p-10"><Spinner label="Collecting formulas and terms" /></div>
  if (res.error || !res.data) return <ErrorNote error={res.error} retry={() => res.refetch()} />
  const s = res.data
  const running = s.ideas.state === 'running'
  const canIdeas = !!engines.data?.local.available
  const generate = async (regenerate: boolean) => {
    setError(null)
    try { await sheetApi.ideas(ws, path, regenerate); await qc.invalidateQueries({ queryKey: ['sheet', ws, path] }) } catch (e) { setError((e as Error).message) }
  }
  const meta = [s.level && s.level[0].toUpperCase() + s.level.slice(1), s.timeMin ? duration(s.timeMin) : null, `${s.formulaCount} formulas`, `${s.termCount} terms`].filter(Boolean).join(' · ')
  return (
    <>
      <TopActions>
        {canIdeas && !running && <Button size="sm" variant="ghost" icon={Sparkles} onClick={() => void generate(s.ideas.state === 'done')}>{s.ideas.state === 'done' ? 'Rewrite key ideas' : 'Add key ideas'}</Button>}
        <div role="group" aria-label="Print layout" className="flex items-center rounded-[6px] border border-border-strong p-px text-[12px]">
          {([1, 2] as const).map((n) => <button key={n} type="button" aria-pressed={columns === n} onClick={() => setColumns(n)} className={`h-6 rounded-[5px] px-2 cursor-pointer ${columns === n ? 'bg-active font-medium' : 'text-muted hover:bg-hover'}`}>{n === 1 ? 'One column' : 'Two columns'}</button>)}
        </div>
        <Button size="sm" variant="secondary" icon={Printer} onClick={() => window.print()}>Print or save as PDF</Button>
      </TopActions>
      <article className="mx-auto max-w-[860px] px-6 pb-24 pt-6 sm:px-10 print:max-w-none print:p-0">
        <header className="mb-5">
          <p className="no-print text-[12.5px] text-muted">Cheat sheet</p>
          <h1 className="font-ui text-[26px] font-bold leading-tight tracking-[-0.02em] print:text-[16pt]">{prettyTitle(s.title)}</h1>
          <p className="mt-1 tabular text-[13px] text-muted">{meta}</p>
          {running && <p role="status" className="no-print mt-2 text-[12.5px] text-muted tabular">Writing key ideas… {s.ideas.done} of {s.ideas.total}</p>}
          {(error || s.ideas.error) && <p role="alert" className="no-print mt-2 text-[13px] text-bad">{error ?? s.ideas.error}</p>}
        </header>
        {s.objectives.length > 0 && (
          <section className="mb-5 break-inside-avoid" aria-label="Objectives">
            <h2 className="text-[13px] font-semibold">You should be able to</h2>
            <ul className="mt-1 list-disc pl-5 text-[14px] leading-snug">{s.objectives.map((o, i) => <li key={i}><MiniMarkdown inline text={o} /></li>)}</ul>
          </section>
        )}
        {s.sections.length === 0 && <Empty icon={ListChecks} title="Nothing to collect yet">This document has no display formulas or defined terms.</Empty>}
        <div className={`sheet ${columns === 2 ? 'sheet-2' : ''}`}>
          {s.sections.map((sec) => (
            <section key={sec.anchor} className="sheet-section mb-5" aria-labelledby={`s-${sec.anchor}`}>
              <h2 id={`s-${sec.anchor}`} className="border-b border-border pb-0.5 text-[14px] font-semibold">{sec.num && <span className="tabular mr-1.5 font-normal text-subtle">{sec.num}</span>}{prettyTitle(sec.title)}</h2>
              {sec.ideas && sec.ideas.length > 0 && <ul className="mt-1.5 list-disc pl-5 text-[13.5px] leading-snug">{sec.ideas.map((x, i) => <li key={i}><MiniMarkdown inline text={x} /></li>)}</ul>}
              {sec.formulas.map((f, i) => <div key={i} className="overflow-x-auto py-0.5 text-[0.95em]"><Tex tex={f.tex} display eager /></div>)}
              {sec.terms.length > 0 && (
                <dl className="mt-1 text-[13px] leading-snug">
                  {sec.terms.map((t) => <div key={t.term} className="mt-1"><dt className="inline font-semibold"><MiniMarkdown inline text={t.term} /></dt><dd className="inline"> — <MiniMarkdown inline text={t.definition} /></dd></div>)}
                </dl>
              )}
            </section>
          ))}
        </div>
      </article>
    </>
  )
}
