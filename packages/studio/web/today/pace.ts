// The deadline sentences of the Today page, in the interface language (the server's paceText speaks English
// for the CLI). The server labels a deadline over the whole folder "Everything".
import { t, tp, locale } from '../i18n'
import type { PaceInfo } from '../../shared/types'

const WHOLE = 'Everything'
export const paceLabel = (p: PaceInfo) => (p.label === WHOLE ? t('Everything') : p.label)

export function paceText(p: PaceInfo): string {
  const date = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(new Date(`${p.deadline}T12:00:00`))
  const label = p.label === WHOLE ? '' : p.label
  const v = { label, date, perDay: p.perDay }
  switch (p.status) {
    case 'done': return label ? t('All cards seen for {label}.', v) : t('All cards seen.')
    case 'overdue': return label
      ? tp(p.remaining, 'The deadline for {label} ({date}) has passed; {n} card is still new.', 'The deadline for {label} ({date}) has passed; {n} cards are still new.', v)
      : tp(p.remaining, 'The deadline ({date}) has passed; {n} card is still new.', 'The deadline ({date}) has passed; {n} cards are still new.', v)
    case 'on-track': return label
      ? tp(p.perDay, 'On track for {label}: {n} new card a day finishes by {date}.', 'On track for {label}: {n} new cards a day finishes by {date}.', v)
      : tp(p.perDay, 'On track: {n} new card a day finishes by {date}.', 'On track: {n} new cards a day finishes by {date}.', v)
    case 'behind': {
      if (!p.daysBehind) return label
        ? tp(p.perDay, 'Behind for {label}: {n} new card a day finishes by {date}.', 'Behind for {label}: {n} new cards a day finishes by {date}.', v)
        : tp(p.perDay, 'Behind: {n} new card a day finishes by {date}.', 'Behind: {n} new cards a day finishes by {date}.', v)
      const days = tp(p.daysBehind, '{n} day', '{n} days')
      return label
        ? tp(p.perDay, 'Behind for {label} by about {days}: {n} new card a day finishes by {date}.', 'Behind for {label} by about {days}: {n} new cards a day finishes by {date}.', { ...v, days })
        : tp(p.perDay, 'Behind by about {days}: {n} new card a day finishes by {date}.', 'Behind by about {days}: {n} new cards a day finishes by {date}.', { ...v, days })
    }
  }
}
