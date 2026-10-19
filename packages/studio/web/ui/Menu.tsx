// A button that opens a small menu of actions; closes on choosing, Escape or a click elsewhere.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'

/** `iconOnly`: a square icon button (the label is its accessible name). */
export function Menu({ label, icon: Icon, children, onOpen, align = 'right', iconOnly }: { label: string; icon?: LucideIcon; children: (close: () => void) => ReactNode; onOpen?: () => void; align?: 'left' | 'right'; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', out); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', key) }
  }, [open])
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => { if (!open) onOpen?.(); setOpen((o) => !o) }}
        aria-label={iconOnly ? label : undefined} title={iconOnly ? label : undefined}
        className={iconOnly ? `inline-flex size-7 items-center justify-center rounded-[6px] text-muted hover:bg-hover hover:text-text cursor-pointer ${open ? 'bg-active text-text' : ''}` : 'inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[12.5px] font-medium text-text hover:bg-hover cursor-pointer'}>
        {Icon && <Icon className={iconOnly ? 'size-4' : 'size-4 text-muted'} strokeWidth={1.8} aria-hidden />}{!iconOnly && <>{label}<ChevronDown className="size-3 text-subtle" aria-hidden /></>}
      </button>
      {open && <div role="menu" className={`absolute top-8 z-50 max-h-[70vh] w-72 overflow-y-auto rounded-[8px] border border-border bg-raised p-1 shadow-pop ${align === 'right' ? 'right-0' : 'left-0'}`}>{children(() => setOpen(false))}</div>}
    </div>
  )
}
export function MenuItem({ children, hint, onClick }: { children: ReactNode; hint?: string; onClick: () => void }) {
  return (
    <button role="menuitem" type="button" onClick={onClick} className="flex w-full flex-col rounded-[5px] px-2.5 py-1.5 text-left hover:bg-hover cursor-pointer">
      <span className="text-[13px]">{children}</span>{hint && <span className="text-[11.5px] text-subtle">{hint}</span>}
    </button>
  )
}
export const MenuLabel = ({ children }: { children: ReactNode }) => <p className="px-2.5 pb-0.5 pt-1.5 text-[11.5px] font-medium text-muted">{children}</p>
