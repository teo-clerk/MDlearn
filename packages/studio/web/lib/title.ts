import { prettyInline } from '@mdlearn/core/tex'
/** Titles may contain `$…$`; show them as readable Unicode (σ⁰, λ⁻⁴) where plain text is needed. */
export const prettyTitle = (s: string) => prettyInline(s)
/** 720 → "12 h", 90 → "1 h 30 min", 25 → "25 min". */
export const duration = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`)
