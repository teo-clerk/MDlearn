// Settings → Appearance (theme, accent colour) and Language. All three are per device, like the sidebar's
// theme switch: they live in localStorage and apply before the first paint.
import { useState } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useUi, type CompanionKind, type Theme } from '../state/ui'
import { ACCENTS, applyAccent, parseHex, savedAccent, swatch, type Accent, type AccentId } from '../lib/accent'
import { applyColour, colourOn } from '../lib/colour'
import { LANGS, currentLang, setLang, t } from '../i18n'
import { Section } from './Section'

const ACCENT_NAMES: Record<AccentId, () => string> = {
  graphite: () => t('Graphite'), blue: () => t('Blue'), green: () => t('Green'), violet: () => t('Violet'), amber: () => t('Amber'), rose: () => t('Rose'),
}
const option = (on: boolean) => `inline-flex h-8 items-center gap-1.5 rounded-[6px] border px-3 text-[13px] cursor-pointer ${on ? 'border-text bg-hover font-medium' : 'border-border hover:bg-hover'}`

export function Appearance() {
  const theme = useUi((s) => s.theme), setTheme = useUi((s) => s.setTheme)
  const [accent, setAccent] = useState<Accent>(savedAccent)
  const [colour, setColour] = useState(colourOn)
  const companion = useUi((s) => s.companion), setCompanion = useUi((s) => s.setCompanion)
  const companions: [CompanionKind, string][] = [['off', t('Off')], ['orb', t('Orb')], ['pixel', t('Pixel')]]
  const custom = parseHex(accent) ? accent : null
  const pick = (a: Accent) => { applyAccent(a); setAccent(a) }
  const themes: [Theme, typeof Sun, string][] = [['light', Sun, t('Light')], ['dark', Moon, t('Dark')], ['system', Monitor, t('Match system')]]
  return (
    <Section id="appearance" title={t('Appearance')}>
      <div>
        <p className="text-[12.5px] text-muted" id="theme-label">{t('Theme')}</p>
        <div role="radiogroup" aria-labelledby="theme-label" className="mt-1.5 flex flex-wrap gap-1.5">
          {themes.map(([value, Icon, label]) => (
            <button key={value} type="button" role="radio" aria-checked={theme === value} onClick={() => setTheme(value)} className={option(theme === value)}>
              <Icon className="size-[15px] text-muted" aria-hidden />{label}
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-start gap-2 text-[13.5px]">
        <input type="checkbox" checked={colour} onChange={(e) => { setColour(e.target.checked); applyColour(e.target.checked) }} className="mt-0.5" />
        <span>{t('Colour in notes')}<span className="block text-[12.5px] text-muted">{t('Callouts, formula terms and highlights. Each colour has a job, and icons and text say the same thing.')}</span></span>
      </label>
      <div>
        <p className="text-[12.5px] text-muted" id="companion-label">{t('Companion')}</p>
        <div role="radiogroup" aria-labelledby="companion-label" className="mt-1.5 flex flex-wrap gap-1.5">
          {companions.map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={companion === value} onClick={() => setCompanion(value)} className={option(companion === value)}>{label}</button>)}
        </div>
        <p className="mt-1.5 text-[12.5px] text-muted">{t('A small sign of what MDlearn is doing, at the foot of the sidebar. A test. It never rewards or nags you, and it hides during questions.')}</p>
      </div>
      <div>
        <p className="text-[12.5px] text-muted" id="accent-label">{t('Accent colour')}</p>
        <div role="radiogroup" aria-labelledby="accent-label" className="mt-1.5 flex flex-wrap items-center gap-2">
          {ACCENTS.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={accent === a.id} aria-label={ACCENT_NAMES[a.id]()} title={ACCENT_NAMES[a.id]()} onClick={() => pick(a.id)}
              className={`flex size-8 items-center justify-center rounded-full border-2 cursor-pointer ${accent === a.id ? 'border-text' : 'border-transparent hover:border-border-strong'}`}>
              {/* graphite is the text colour of each theme, so its swatch follows the theme too */}
              <span className="flex size-6 items-center justify-center rounded-full" style={{ background: a.id === 'graphite' ? 'var(--text)' : swatch(a.id) }}>
                {accent === a.id && <Check className={`size-3.5 ${a.id === 'graphite' ? 'text-bg' : 'text-white'}`} strokeWidth={3} aria-hidden />}
              </span>
            </button>
          ))}
          <label className={`ml-1 inline-flex h-8 items-center gap-2 rounded-[6px] border px-2.5 text-[13px] cursor-pointer ${custom ? 'border-text bg-hover font-medium' : 'border-border hover:bg-hover'}`}>
            <input type="color" value={custom ?? '#3b6fd4'} onChange={(e) => pick(e.target.value as Accent)} className="size-5 cursor-pointer rounded border-0 bg-transparent p-0" />
            {t('Custom colour')}
          </label>
        </div>
        <p className="mt-1.5 max-w-[62ch] text-[12.5px] text-muted">{t('Buttons, focus rings and progress bars use it. Every choice keeps text readable in both themes.')}</p>
      </div>
    </Section>
  )
}

export function Language() {
  const now = currentLang()
  return (
    <Section id="language" title={t('Language')} intro={t('The language of the interface, on this device. Lessons keep their own language. Changing it reloads the page.')}>
      <div role="radiogroup" aria-label={t('Language')} className="flex flex-wrap gap-1.5">
        {LANGS.map((l) => (
          <button key={l.code} type="button" role="radio" aria-checked={now === l.code} lang={l.code} onClick={() => { if (l.code !== now) setLang(l.code) }} className={option(now === l.code)}>
            {l.name}
          </button>
        ))}
      </div>
    </Section>
  )
}
