// Interface language. The English text is the key: t('Study now'), tp(n, '{n} card', '{n} cards').
// The language is chosen per device (Settings → Language) and loaded before the first render; changing it
// reloads the page. Keys must be string literals: test/i18n.test.ts collects them from the source and checks
// that every language translates every key with the same {placeholders}.
export type Lang = 'en' | 'it' | 'es' | 'fr' | 'ca'
export const LANGS: { code: Lang; name: string; english: string }[] = [
  { code: 'en', name: 'English', english: 'English' },
  { code: 'it', name: 'Italiano', english: 'Italian' },
  { code: 'es', name: 'Español', english: 'Spanish' },
  { code: 'fr', name: 'Français', english: 'French' },
  { code: 'ca', name: 'Català', english: 'Catalan' },
]
/** A translation: text, or plural forms by CLDR category (`other` is required). */
export type Entry = string | { one?: string; few?: string; many?: string; other: string }
export type Dict = Record<string, Entry>

const KEY = 'mdl-lang'
const isLang = (s: unknown): s is Lang => LANGS.some((l) => l.code === s)
let lang: Lang = 'en'
let dict: Dict = {}

/** The saved language, else the browser's if MDlearn speaks it, else English. */
export function savedLang(): Lang {
  try { const s = localStorage.getItem(KEY); if (isLang(s)) return s } catch { /* private mode */ }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2)
  return isLang(nav) ? nav : 'en'
}
const loaders: Record<Exclude<Lang, 'en'>, () => Promise<{ default: Dict }>> = {
  it: () => import('./it'), es: () => import('./es'), fr: () => import('./fr'), ca: () => import('./ca'),
}
/** Load the dictionary before the app renders. */
export async function loadLang(l: Lang = savedLang()): Promise<void> {
  lang = l
  dict = l === 'en' ? {} : (await loaders[l]().catch(() => ({ default: {} }))).default
  document.documentElement.lang = l
}
/** Save a new language and reload, so every screen (and every date) switches at once. */
export function setLang(l: Lang): void {
  try { localStorage.setItem(KEY, l) } catch { /* private mode: this visit only */ }
  location.reload()
}
export const currentLang = (): Lang => lang
/** The locale for Intl (dates, numbers, lists). */
export const locale = (): string => lang

const fill = (s: string, vars?: Record<string, string | number>) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s
const forms = new Map<Lang, Intl.PluralRules>()
const plural = (n: number) => {
  let r = forms.get(lang)
  if (!r) { r = new Intl.PluralRules(lang); forms.set(lang, r) }
  return r.select(n) as 'one' | 'few' | 'many' | 'other'
}

/** The text in the interface language; `{name}` placeholders are filled from `vars`. */
export function t(text: string, vars?: Record<string, string | number>): string {
  const e = dict[text]
  return fill(typeof e === 'string' && e ? e : typeof e === 'object' ? e.other : text, vars)
}
/** A count with its noun: tp(3, '{n} card', '{n} cards') → "3 cards" / "3 carte". `{n}` is the count. */
export function tp(n: number, one: string, other: string, vars?: Record<string, string | number>): string {
  const e = dict[`${one}|${other}`]
  const all = { n: n.toLocaleString(locale()), ...vars }
  if (typeof e === 'object') return fill(e[plural(n)] ?? e.other, all)
  return fill(new Intl.PluralRules('en').select(n) === 'one' ? one : other, all)
}
