// Daily goal and deadlines. A deadline sets how many new cards a day finish the material in time.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Plus, X } from 'lucide-react'
import { goalsApi, keys } from '../api/queries'
import { Button } from '../ui/primitives'
import type { PaceInfo, TodayResponse, TreeDoc } from '../../shared/types'
import { t, tp, locale } from '../i18n'
import { paceLabel } from './pace'

export function GoalsEditor({ ws, goal, paces, docs, suspended }: { ws: string; goal: TodayResponse['goal']; paces: PaceInfo[]; docs: TreeDoc[]; suspended: number }) {
  const qc = useQueryClient()
  const [daily, setDaily] = useState(String(goal.daily))
  const [scope, setScope] = useState('')
  const [date, setDate] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: keys.today(ws) })
  const save = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); await refresh() } catch (e) { setError((e as Error).message) } }
  const current = paces.map((p) => ({ scope: p.scope, date: p.deadline, ...(p.label && p.label !== 'Everything' ? { label: p.label } : {}) }))
  const input = 'h-8 rounded-[6px] border border-border-strong bg-bg px-2 text-[13.5px] text-text outline-none focus:border-accent [color-scheme:light_dark]'
  return (
    <section aria-labelledby="goals">
      <h2 id="goals" className="text-[13px] font-medium text-muted">{t('Goals')}</h2>
      <div className="mt-2 rounded-[8px] border border-border p-3.5 text-[13.5px]">
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); const n = Number(daily); void save(() => goalsApi.save(ws, { dailyGoal: n })) }}>
          <label className="flex items-center gap-2">{t('Review about')}
            <input value={daily} onChange={(e) => setDaily(e.target.value)} inputMode="numeric" aria-label={t('Cards per day')} className={`${input} w-16 tabular`} /> {t('cards a day')}</label>
          {Number(daily) !== goal.daily && <Button type="submit" size="sm" variant="secondary">{t('Save')}</Button>}
        </form>
        <ul className="mt-3 flex flex-col gap-1.5">
          {paces.map((p, i) => (
            <li key={`${p.scope}-${p.deadline}`} className="flex items-start gap-2">
              <span className="min-w-0 flex-1"><span className="font-medium">{paceLabel(p)}</span> <span className="text-muted tabular">· {t('by')} {new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${p.deadline}T12:00:00`))}{p.scope ? '' : ` · ${t('whole folder')}`}</span></span>
              <button aria-label={t('Remove deadline')} title={t('Remove deadline')} onClick={() => void save(() => goalsApi.save(ws, { deadlines: current.filter((_, k) => k !== i) }))} className="rounded p-1 text-muted hover:bg-hover hover:text-text cursor-pointer"><X className="size-3.5" /></button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12.5px] text-muted">{t('Have an exam? Add a deadline and the daily session paces new cards so you finish in time.')}</p>
        <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (!date) return; void save(async () => { await goalsApi.save(ws, { deadlines: [...current, { scope, date, ...(label.trim() ? { label: label.trim() } : {}) }] }); setDate(''); setLabel('') }) }}>
          <label className="sr-only" htmlFor="dl-scope">{t('Deadline for')}</label>
          <span className="relative min-w-0 max-w-full">
            <select id="dl-scope" value={scope} onChange={(e) => setScope(e.target.value)} className={`${input} w-[16rem] max-w-full cursor-pointer appearance-none truncate pr-7`}>
              <option value="">{t('Everything')}</option>
              {docs.filter((d) => d.cards > 0).map((d) => <option key={d.path} value={d.path}>{d.title || d.path}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
          </span>
          <label className="sr-only" htmlFor="dl-date">{t('Date')}</label>
          <input id="dl-date" type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className={input} />
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('What for? (optional)')} aria-label={t('What the deadline is for')} className={`${input} w-44 max-w-full`} />
          <Button type="submit" size="sm" variant="secondary" icon={Plus} disabled={!date}>{t('Add deadline')}</Button>
        </form>
        {error && <p className="mt-2 text-bad" role="alert">{error}</p>}
        {suspended > 0 && (
          <p className="mt-3 text-[12.5px] text-muted">{tp(suspended, '{n} card is set aside.', '{n} cards are set aside.')}{' '}
            <button onClick={() => void save(() => goalsApi.save(ws, { suspended: [] }))} className="underline underline-offset-2 hover:text-text cursor-pointer">{tp(suspended, 'Bring it back', 'Bring them back')}</button></p>
        )}
      </div>
    </section>
  )
}
