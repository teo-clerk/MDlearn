// Make a card of your own from the passage you selected. Saved into the document's "My cards" lesson, scheduled like
// any card.
import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { Check, Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { keys, notesApi, type CardInput, type Passage } from '../api/queries'
import { useNotesUi } from './store'
import { Button } from '../ui/primitives'
import { lessonRoute } from '../lib/paths'
import { CardForm } from './CardForm'
import { t } from '../i18n'

export function CardDraft({ ws, doc }: { ws: string; doc: string }) {
  const { draft, setDraft } = useNotesUi()
  const qc = useQueryClient()
  const [passage, setPassage] = useState<Passage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ path: string } | null>(null)
  useEffect(() => {
    if (!draft) return
    let live = true
    setPassage(null); setError(null); setSaved(null)
    notesApi.passage(ws, doc, draft.anchor.quote.exact).then((p) => { if (live) setPassage(p) }).catch((e: Error) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [draft, ws, doc])
  if (!draft) return null
  const save = async (card: CardInput) => {
    const section = passage?.section ? { num: passage.section.num, anchor: passage.section.anchor } : null
    const r = await notesApi.addCard(ws, { doc, section, card })
    setSaved({ path: r.path })
    void qc.invalidateQueries({ queryKey: keys.tree(ws) })
  }
  return (
    <div className="rounded-[8px] border border-border-strong bg-raised p-3 text-[13px] shadow-pop">
      {!passage && !error && <p className="flex items-center gap-2 text-muted"><Loader2 className="size-4 animate-spin" aria-hidden />{t('Finding the passage…')}</p>}
      {error && <p className="text-bad" role="alert">{error}</p>}
      {saved ? (
        <div role="status">
          <p className="flex items-center gap-1.5 font-medium"><Check className="size-4 text-good" aria-hidden />{t('Card saved')}</p>
          <p className="mt-1 text-muted">{t('It joins your study queue as a new card in')} <Link href={lessonRoute(ws, saved.path)} className="underline underline-offset-2 hover:text-text">{t('My cards')}</Link>.</p>
          <div className="mt-2 flex gap-2"><Button size="sm" variant="ghost" onClick={() => setSaved(null)}>{t('Make another')}</Button><Button size="sm" variant="ghost" onClick={() => setDraft(null)}>{t('Done')}</Button></div>
        </div>
      ) : passage ? <CardForm text={passage.text} quote={draft.anchor.quote.exact} from={passage.section ? passage.section.num ?? passage.section.title : undefined} onSave={save} onCancel={() => setDraft(null)} /> : null}
    </div>
  )
}
