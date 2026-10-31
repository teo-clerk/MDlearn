// Passages you marked as confusing: they wait here until you have looked at them again.
import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import { CircleHelp } from 'lucide-react'
import { notesApi, useEngines } from '../api/queries'
import { docRoute } from '../lib/paths'
import { Button, ErrorNote } from '../ui/primitives'
import type { ConfusingPassage } from '../../shared/types'
import { t } from '../i18n'

const route = (ws: string, p: ConfusingPassage) => `${docRoute(ws, p.doc)}&note=${encodeURIComponent(p.id)}`

export function Confusing({ ws, passages }: { ws: string; passages: ConfusingPassage[] }) {
  const engines = useEngines()
  const [, navigate] = useLocation()
  const [error, setError] = useState<unknown>(null)
  const canAsk = !!engines.data?.local.available
  if (!passages.length) return null
  const explain = async (p: ConfusingPassage) => {
    setError(null)
    try { await notesApi.ask(ws, { doc: p.doc, anchor: p.anchor, question: t('Explain this passage simply.'), mode: 'ask', noteId: p.id }); navigate(route(ws, p)) }
    catch (e) { setError(e) }
  }
  return (
    <section aria-labelledby="confusing">
      <h2 id="confusing" className="flex items-center gap-1.5 text-[13px] font-medium text-muted"><CircleHelp className="size-3.5 tone-confusing" strokeWidth={1.8} aria-hidden />{t('Confusing passages')}</h2>
      <ul className="mt-2 divide-y divide-border border-y border-border">
        {passages.map((p) => (
          <li key={p.id} className="flex items-center gap-2 py-1.5">
            <Link href={route(ws, p)} className="min-w-0 flex-1 truncate text-[13.5px] hover:underline hover:underline-offset-2">{p.anchor.quote.exact}</Link>
            {canAsk && !p.explained && <Button size="sm" variant="ghost" onClick={() => void explain(p)}>{t('Explain')}</Button>}
          </li>
        ))}
      </ul>
      {!!error && <div className="mt-2"><ErrorNote error={error} /></div>}
    </section>
  )
}
