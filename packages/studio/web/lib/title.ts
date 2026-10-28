import { prettyInline } from '@mdlearn/core/tex'
import { t } from '../i18n'
/** Titles may contain `$…$`; show them as readable Unicode (σ⁰, λ⁻⁴) where plain text is needed. */
export const prettyTitle = (s: string) => prettyInline(s)
/** A lesson level as a label: beginner → "Beginner" in the interface language. */
export const levelName = (level: string) => ({ beginner: t('Beginner'), intermediate: t('Intermediate'), advanced: t('Advanced') } as Record<string, string>)[level] ?? level
/** 720 → "12 h", 90 → "1 h 30 min", 25 → "25 min". */
export const duration = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`)
