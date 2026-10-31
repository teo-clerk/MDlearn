// Which section of the document is at the top of the reading area, followed as you scroll.
import { useEffect, useState } from 'react'

export function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    const root = document.getElementById('main')
    if (!root || !ids.length) return
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e)
    const onScroll = () => {
      const top = root.getBoundingClientRect().top + 90
      let current: string | null = els[0]?.id ?? null
      for (const el of els) { if (el.getBoundingClientRect().top <= top) current = el.id; else break }
      setActive(current)
    }
    onScroll()
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => root.removeEventListener('scroll', onScroll)
  }, [ids])
  return active
}
