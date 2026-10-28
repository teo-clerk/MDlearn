// The shared frame of the library pages (formulas, glossary, map): title, a line of context, content.
import type { ReactNode } from 'react'
import { TopLeft } from '../layout/Shell'
import { t } from '../i18n'

export function Frame({ title, hint, actions, children, wide }: { title: string; hint?: ReactNode; actions?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto px-6 pb-24 pt-6 sm:px-10 ${wide ? 'max-w-[1100px]' : 'max-w-[820px]'}`}>
      <TopLeft><span className="truncate px-1 text-[13px] text-muted">{title}</span></TopLeft>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="font-ui text-[26px] font-bold leading-tight tracking-[-0.02em]">{title}</h1>
          {hint && <p className="mt-1 text-[13.5px] text-muted">{hint}</p>}
        </div>
        {actions}
      </header>
      {children}
    </div>
  )
}
export function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label}
      className="h-9 min-w-0 flex-1 rounded-[6px] border border-border-strong bg-raised px-3 text-[14px] outline-none placeholder:text-subtle focus:border-focus" />
  )
}
/** "Reading your documents…" while the index is still being built. */
export function BuildNote({ status }: { status?: { total: number; indexed: number; building: boolean } }) {
  if (!status?.building) return null
  return <p role="status" className="mb-3 text-[12.5px] text-muted tabular">{t('Reading your documents…')} {t('{done} of {total}', { done: status.indexed, total: status.total })}</p>
}
