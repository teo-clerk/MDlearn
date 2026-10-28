// Small shared building blocks in the app's vocabulary (notes-app chrome).
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2, type LucideIcon } from 'lucide-react'
import { t } from '../i18n'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:brightness-[1.06] active:brightness-95 disabled:opacity-50',
  secondary: 'bg-raised text-text border border-border-strong hover:bg-hover disabled:opacity-50',
  ghost: 'text-text hover:bg-hover disabled:opacity-40',
  danger: 'bg-raised text-bad border border-border-strong hover:bg-bad-soft',
}
/** `collapse`: on a phone only the icon shows (the label stays for screen readers and as a tooltip). */
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: LucideIcon; busy?: boolean; size?: 'sm' | 'md'; collapse?: boolean }>(
  function Button({ variant = 'secondary', icon: Icon, busy, size = 'md', collapse, className = '', children, disabled, ...rest }, ref) {
    const label = collapse && typeof children === 'string' ? children : undefined
    return (
      <button ref={ref} disabled={disabled || busy} title={label} {...rest}
        className={`inline-flex items-center justify-center gap-1.5 rounded-[6px] font-medium transition-[background-color,filter,color] duration-150 cursor-pointer disabled:cursor-default select-none whitespace-nowrap ${size === 'sm' ? 'h-7 px-2.5 text-[13px]' : 'h-8 px-3 text-[13.5px]'} ${collapse ? 'max-sm:px-1.5' : ''} ${VARIANTS[variant]} ${className}`}>
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : Icon && <Icon className="size-[15px] shrink-0" strokeWidth={1.8} aria-hidden />}
        {collapse ? <span className="max-sm:sr-only">{children}</span> : children}
      </button>
    )
  })
export function IconButton({ icon: Icon, label, active, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; active?: boolean }) {
  return (
    <button aria-label={label} title={label} {...rest}
      className={`inline-flex size-7 items-center justify-center rounded-[6px] text-muted hover:bg-hover hover:text-text transition-colors cursor-pointer ${active ? 'bg-active text-text' : ''} ${className}`}>
      <Icon className="size-[16px]" strokeWidth={1.8} aria-hidden />
    </button>
  )
}
export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border bg-raised px-1 font-ui text-[11px] text-muted">{children}</kbd>
)
export function Spinner({ label = t('Loading') }: { label?: string }) {
  return <span className="inline-flex items-center gap-2 text-muted text-[13px]" role="status"><Loader2 className="size-4 animate-spin" aria-hidden />{label}</span>
}
/** A quiet, centred state for empty lists, errors and first runs. */
export function Empty({ icon: Icon, title, children, action }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-6 py-14 text-center">
      {Icon && <Icon className="mb-3 size-7 text-subtle" strokeWidth={1.5} aria-hidden />}
      <h2 className="text-[15px] font-semibold text-text">{title}</h2>
      {children && <div className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
export function ErrorNote({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof Error ? error.message : t('Something went wrong.')
  return (
    <div role="alert" className="mx-auto my-10 max-w-md rounded-[6px] border border-border bg-bad-soft px-4 py-3 text-[13.5px] text-text">
      <p>{msg}</p>
      {retry && <button onClick={retry} className="mt-1 text-accent-ink underline underline-offset-2 cursor-pointer">{t('Try again')}</button>}
    </div>
  )
}
/** Memory as a small mark + percentage (never colour alone). */
export function MemoryMark({ memory, seen }: { memory: number | null; seen?: number }) {
  if (memory === null || !seen) return <span className="text-subtle tabular text-[12px]" title={t('Not studied yet')}>–</span>
  const pct = Math.round(memory * 100)
  const level = pct >= 85 ? 'good' : pct >= 60 ? 'warn' : 'bad'
  return (
    <span className="inline-flex items-center gap-1 tabular text-[12px] text-muted" title={`Memory ${pct}% (the model's estimate that you would recall these cards now)`}>
      <span className={`inline-block size-[7px] rounded-full ${level === 'good' ? 'bg-good' : level === 'warn' ? 'bg-warn' : 'bg-bad'}`} aria-hidden />{pct}%
    </span>
  )
}
