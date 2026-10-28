// Two quiet charts in ink: what is due over the next week, and a calendar of the last half year.
import type { TodayResponse } from '../../shared/types'
import { t, tp, locale } from '../i18n'

const weekday = new Intl.DateTimeFormat(locale(), { weekday: 'short' })
const long = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' })
const at = (key: string) => new Date(`${key}T12:00:00`)

export function Forecast({ days }: { days: TodayResponse['forecast'] }) {
  const max = Math.max(1, ...days.map((d) => d.count))
  const none = days.every((d) => d.count === 0)
  return (
    <figure aria-label={t('Reviews due in the next 7 days')} className="relative">
      {/* nothing scheduled yet: say why instead of drawing an empty chart */}
      {none && <figcaption className="absolute inset-x-0 top-5 px-2 text-center text-[12.5px] leading-snug text-muted">{t('Nothing due this week. Reviews appear here once you have studied some cards.')}</figcaption>}
      <div className="flex h-[88px] items-end gap-2">
        {days.map((d, i) => (
          <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${long.format(at(d.date))}: ${tp(d.count, '{n} card', '{n} cards')}${i === 0 ? ` ${t('(including overdue)')}` : ''}`}>
            <span className="tabular text-[12px] text-muted">{d.count || ''}</span>
            <div className={`w-full rounded-[3px] ${i === 0 ? 'bg-text' : 'bg-text/45'}`} style={{ height: `${Math.max(d.count ? 6 : 2, (d.count / max) * 56)}px`, opacity: d.count ? 1 : 0.2 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2">{days.map((d, i) => <span key={d.date} className="flex-1 text-center text-[11.5px] text-subtle">{i === 0 ? t('Today') : weekday.format(at(d.date))}</span>)}</div>
    </figure>
  )
}

const LEVEL = ['var(--hover)', 'color-mix(in srgb, var(--text) 22%, transparent)', 'color-mix(in srgb, var(--text) 42%, transparent)', 'color-mix(in srgb, var(--text) 66%, transparent)', 'var(--text)']
export function Heatmap({ map }: { map: TodayResponse['heatmap'] }) {
  const lead = (at(map.days[0].date).getDay() + 6) % 7 // Monday = row 0
  const month = new Intl.DateTimeFormat(locale(), { month: 'short' })
  const labels: { col: number; text: string }[] = []
  map.days.forEach((d, i) => { const col = Math.floor((i + lead) / 7); if (at(d.date).getDate() <= 7 && ((i + lead) % 7 === 0 || i === 0) && !labels.some((l) => l.col === col)) labels.push({ col, text: month.format(at(d.date)) }) })
  return (
    <figure aria-label={tp(map.total, '{n} review in the last 26 weeks', '{n} reviews in the last 26 weeks')}>
      <div className="relative overflow-x-auto pb-1">
        <div className="relative h-4 text-[11px] text-subtle" style={{ width: Math.ceil((map.days.length + lead) / 7) * 14 }}>{labels.map((l) => <span key={l.col} className="absolute" style={{ left: l.col * 14 }}>{l.text}</span>)}</div>
        <div className="grid gap-[2px]" style={{ gridTemplateRows: 'repeat(7, 12px)', gridAutoFlow: 'column', gridAutoColumns: '12px' }} role="img" aria-label={t('Calendar of reviews per day')}>
          {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
          {map.days.map((d) => <span key={d.date} className="rounded-[2px]" style={{ background: LEVEL[d.level] }} title={`${long.format(at(d.date))}: ${d.count} ${d.count === 1 ? 'review' : 'reviews'}`} />)}
        </div>
      </div>
      <figcaption className="mt-1.5 flex items-center justify-between text-[11.5px] text-subtle">
        <span className="tabular">{tp(map.total, '{n} review in 26 weeks', '{n} reviews in 26 weeks')}</span>
        <span className="flex items-center gap-1">{t('Less')} {LEVEL.map((c, i) => <span key={i} className="size-[10px] rounded-[2px]" style={{ background: c }} />)} {t('More')}</span>
      </figcaption>
    </figure>
  )
}
