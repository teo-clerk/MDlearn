import { LANGS, currentLang, locale } from '../i18n'

/** The chat prompt, asking for courses in the interface language when it is not English (the prompt itself stays English). */
export function promptFor(prompt: string): { text: string; language: string | null } {
  const lang = LANGS.find((l) => l.code === currentLang())!
  if (lang.code === 'en') return { text: prompt, language: null }
  return { text: `${prompt.trimEnd()}\n\nUnless I ask otherwise, write the course in ${lang.english}.\n`, language: new Intl.DisplayNames(locale(), { type: 'language' }).of(lang.code) ?? lang.english }
}
