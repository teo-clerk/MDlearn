import type { ReactNode } from 'react'

/** A titled block of the Settings page; `id` is its #anchor. */
export function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-10 scroll-mt-16">
      <h2 id={`${id}-title`} className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
      {intro && <p className="mt-1 max-w-[62ch] text-[13.5px] text-muted">{intro}</p>}
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </section>
  )
}
