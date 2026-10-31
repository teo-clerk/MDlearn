// On a course's overview page: where you stand in each lesson, and the ways to change the course once you have started.
import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, FilePlus2, Pause, Play, Sparkles, TriangleAlert, type LucideIcon } from 'lucide-react'
import { courseApi, jobsApi, useCourse, useEngines } from '../api/queries'
import { lessonRoute } from '../lib/paths'
import { Button, ErrorNote } from '../ui/primitives'
import type { CourseLesson, LostCardInfo } from '../../shared/types'
import { t, tp } from '../i18n'

const useRun = (ws: string) => {
  const qc = useQueryClient()
  const [error, setError] = useState<unknown>(null)
  const run = async (work: Promise<unknown>) => {
    setError(null)
    try { await work } catch (e) { setError(e) }
    await qc.invalidateQueries({ queryKey: ['course', ws] })
  }
  return { error, run }
}

function RowButton({ icon: Icon, label, disabled, onClick }: { icon: LucideIcon; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="flex size-7 shrink-0 items-center justify-center rounded-[5px] text-muted hover:bg-hover hover:text-text disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default">
      <Icon className="size-3.5" aria-hidden />
    </button>
  )
}

function standing(l: CourseLesson): { short: string; long: string } {
  if (l.paused) return { short: t('Paused'), long: t('Paused: its cards stay out of your sessions') }
  if (!l.seen) return { short: t('Not started'), long: t('Not started') }
  const percent = Math.round((l.memory ?? 0) * 100)
  return { short: `${l.seen}/${l.cards} · ${percent}%`, long: t('{seen} of {cards} cards studied, about {percent}% remembered', { seen: l.seen, cards: l.cards, percent }) }
}

function Lessons({ ws, doc, lessons, canWrite, canStudy, run }: { ws: string; doc: string; lessons: CourseLesson[]; canWrite: boolean; canStudy: boolean; run: (w: Promise<unknown>) => Promise<void> }) {
  return (
    <ol aria-label={t('Lessons')} className="divide-y divide-border border-y border-border">
      {lessons.map((l, i) => {
        const where = standing(l)
        return (
          <li key={l.path} className="flex items-center gap-1 py-1">
            <span className="w-6 shrink-0 tabular text-[12.5px] text-subtle" aria-hidden>{i + 1}</span>
            <Link href={lessonRoute(ws, l.path)} className="min-w-0 flex-1 truncate text-[14px] hover:underline hover:underline-offset-2">{l.title}</Link>
            <span title={where.long} className="shrink-0 pr-1 tabular text-[12.5px] text-muted">{where.short}</span>
            {canWrite && l.numbered && <>
              <RowButton icon={ArrowUp} label={t('Move {title} up', { title: l.title })} disabled={i === 0} onClick={() => void run(courseApi.move(ws, doc, l.path, -1))} />
              <RowButton icon={ArrowDown} label={t('Move {title} down', { title: l.title })} disabled={i === lessons.length - 1} onClick={() => void run(courseApi.move(ws, doc, l.path, 1))} />
            </>}
            {canStudy && <RowButton icon={l.paused ? Play : Pause} label={l.paused ? t('Resume {title}', { title: l.title }) : t('Pause {title}', { title: l.title })} disabled={!l.cards} onClick={() => void run(courseApi.pause(ws, doc, l.path, !l.paused))} />}
          </li>
        )
      })}
    </ol>
  )
}

function LostCards({ ws, lost, canWrite, canStudy, run }: { ws: string; lost: LostCardInfo[]; canWrite: boolean; canStudy: boolean; run: (w: Promise<unknown>) => Promise<void> }) {
  return (
    <section aria-labelledby="lost-cards" className="mt-3 rounded-[8px] border border-border-strong p-3">
      <h3 id="lost-cards" className="flex items-center gap-1.5 text-[13.5px] font-medium"><TriangleAlert className="size-4 shrink-0 text-warn" aria-hidden />{tp(lost.length, '{n} card you studied is gone', '{n} cards you studied are gone')}</h3>
      <p className="mt-1 text-[13px] text-muted">{t('If a card was renamed or moved, reconnect it and it keeps its schedule. Your history is never deleted.')}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {lost.map((c) => (
          <li key={c.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]">
            <span className="min-w-0 flex-1 basis-40 truncate first-letter:uppercase">{c.title}</span>
            <span className="shrink-0 tabular text-[12.5px] text-muted">{tp(c.reviews, '{n} review', '{n} reviews')}</span>
            {canWrite && !!c.matches.length && (
              <select aria-label={t('Reconnect {title}', { title: c.title })} value="" onChange={(e) => { if (e.target.value) void run(courseApi.reconnect(ws, c.key, e.target.value)) }}
                className="h-7 max-w-52 rounded-[5px] border border-border-strong bg-bg px-1.5 text-[12.5px]">
                <option value="">{t('Reconnect to…')}</option>
                {c.matches.map((m) => <option key={m.key} value={m.key}>{m.title}</option>)}
              </select>
            )}
            {canStudy && <Button size="sm" variant="ghost" onClick={() => void run(courseApi.letGo(ws, c.key))}>{t('Let go')}</Button>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function ChangeForm({ ws, doc, onClose }: { ws: string; doc: string; onClose: () => void }) {
  const [, navigate] = useLocation()
  const [request, setRequest] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const start = async () => {
    setBusy(true); setError(null)
    try { const job = await jobsApi.start(ws, { recipe: 'course.change', doc, request: request.trim() }); navigate(`/w/${ws}/studio?job=${job.id}`) }
    catch (e) { setError(e); setBusy(false) }
  }
  return (
    <div className="mt-3 flex flex-col gap-2">
      <label className="block text-[13px] font-medium">{t('What should change?')}
        <textarea autoFocus value={request} onChange={(e) => setRequest(e.target.value)} maxLength={2000} rows={2} placeholder={t('e.g. Add chapter 5, and explain lesson 3 more slowly')}
          className="mt-1.5 w-full rounded-[6px] border border-border-strong bg-bg px-3 py-2 text-[14px] outline-none focus:border-accent" />
      </label>
      <p className="text-[12.5px] text-muted">{t('Cards keep their history, even with new titles or better questions. You can undo the whole change.')}</p>
      {!!error && <ErrorNote error={error} />}
      <div className="flex gap-2"><Button variant="primary" size="sm" icon={Sparkles} busy={busy} disabled={request.trim().length < 2} onClick={() => void start()}>{t('Change the course')}</Button><Button size="sm" variant="ghost" onClick={onClose}>{t('Cancel')}</Button></div>
    </div>
  )
}

export function CoursePanel({ ws, doc, caps }: { ws: string; doc: string; caps: readonly string[] }) {
  const info = useCourse(ws, doc)
  const engines = useEngines()
  const { error, run } = useRun(ws)
  const [changing, setChanging] = useState(false)
  const canWrite = caps.includes('write'), canStudy = caps.includes('study')
  const claude = caps.includes('ai') && engines.data?.claude?.available
  if (!info.data?.lessons.length) return null
  return (
    <section aria-label={t('This course')} className="mb-8 font-ui">
      <Lessons ws={ws} doc={doc} lessons={info.data.lessons} canWrite={canWrite} canStudy={canStudy} run={run} />
      {!!error && <div className="mt-2"><ErrorNote error={error} /></div>}
      {!!info.data.lost.length && <LostCards ws={ws} lost={info.data.lost} canWrite={canWrite} canStudy={canStudy} run={run} />}
      {canWrite && !changing && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {claude && <Button size="sm" variant="secondary" icon={Sparkles} onClick={() => setChanging(true)}>{t('Change this course')}</Button>}
          <Link href={`/start?ws=${ws}&add=1`} className="inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-[13px] text-muted hover:bg-hover hover:text-text"><FilePlus2 className="size-4" strokeWidth={1.7} aria-hidden />{t('Add class files')}</Link>
        </div>
      )}
      {canWrite && !claude && <p className="mt-2 text-[12.5px] text-muted">{t('To change it, ask your coding assistant in this folder. AGENTS.md tells it how to keep your progress.')}</p>}
      {changing && <ChangeForm ws={ws} doc={doc} onClose={() => setChanging(false)} />}
    </section>
  )
}
