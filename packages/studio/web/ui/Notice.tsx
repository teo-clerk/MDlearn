// A short message at the foot of the page, for something that happened out of sight.
import { useEffect } from 'react'
import { useUi } from '../state/ui'

const SHOWN_MS = 2500

export function Notice() {
  const { notice, notify } = useUi()
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => notify(null), SHOWN_MS)
    return () => clearTimeout(timer)
  }, [notice, notify])
  if (!notice) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <p role="status" className="rounded-[8px] border border-border bg-raised px-3 py-1.5 text-[13px] shadow-pop">{notice}</p>
    </div>
  )
}
