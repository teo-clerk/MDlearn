// "in 10 minutes", "later today, 14:05", "tomorrow", "in 3 days (Fri 4 Oct)", in the interface language
// (the browser's version of core's whenText, which speaks English for the terminal and the MCP tutor).
import { t, tp, locale } from '../i18n'

const DAY = 864e5
export function whenText(iso: string, now = Date.now()): string {
  const at = new Date(iso).getTime(), mins = Math.round((at - now) / 6e4)
  if (mins <= 1) return t('in a minute')
  if (mins < 60) return tp(mins, 'in {n} minute', 'in {n} minutes')
  const day = (x: number) => { const d = new Date(x); d.setHours(0, 0, 0, 0); return d.getTime() }
  const days = Math.round((day(at) - day(now)) / DAY)
  const time = new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(at)
  const date = new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short' }).format(at)
  if (days === 0) return t('later today, {time}', { time })
  if (days === 1) return t('tomorrow')
  if (days < 14) return tp(days, 'in {n} day ({date})', 'in {n} days ({date})', { date })
  return tp(Math.round(days / 7), 'in {n} week ({date})', 'in {n} weeks ({date})', { date })
}
