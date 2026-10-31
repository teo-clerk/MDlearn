// Help: replay the welcome tour, open the interactive tutorial (a folder in your library you can play
// through), and the reference — pages, reading tools, every Markdown construct, shortcuts, your data.
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { useQueryClient } from '@tanstack/react-query'
import { GraduationCap, LifeBuoy, RotateCcw, Route } from 'lucide-react'
import type { Checked } from '@mdlearn/core'
import { helpApi, keys, useHelpDoc, useSession } from '../api/queries'
import { DocBlocks, type BlockEnv } from '../reader/DocBlocks'
import { useUi } from '../state/ui'
import { Button, ErrorNote, Spinner } from '../ui/primitives'
import { TopLeft } from '../layout/Shell'
import { t } from '../i18n'

export default function HelpPage({ ws }: { ws: string }) {
  const help = useHelpDoc()
  const session = useSession()
  const setTour = useUi((s) => s.setTour)
  const [, navigate] = useLocation()
  const qc = useQueryClient()
  const [busy, setBusy] = useState<'open' | 'reset' | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { document.title = t('Help · MDlearn Studio') }, [])
  const canOpen = !!session.data?.caps.includes('fs')
  const env = useMemo<BlockEnv>(() => ({ cx: {}, check: async (): Promise<Checked> => { throw new Error('Help has no questions.') } }), [])
  const tutorial = async (reset: boolean) => {
    setBusy(reset ? 'reset' : 'open'); setError(null)
    try {
      const w = await helpApi.tutorial(reset)
      await qc.invalidateQueries({ queryKey: keys.workspaces })
      navigate(`/w/${w.id}/doc?path=${encodeURIComponent('00-start-here.md')}`)
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }
  return (
    <div className="mx-auto max-w-[760px] px-6 pb-24 pt-6 sm:px-10">
      <TopLeft><span className="truncate px-1 text-[13px] text-muted">{t('Help')}</span></TopLeft>
      <h1 className="flex items-center gap-2 font-ui text-[26px] font-bold tracking-[-0.02em]"><LifeBuoy className="size-6 text-muted" strokeWidth={1.8} aria-hidden />{t('Help')}</h1>
      <p className="mt-1 text-[13.5px] text-muted">{t('New here? Take the one-minute tour, then try the tutorial: a small folder where every feature is live.')}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <section className="rounded-[10px] border border-border p-4 font-ui">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold"><Route className="size-4 text-muted" aria-hidden />{t('Welcome tour')}</h2>
          <p className="mt-1 text-[13px] text-muted">{t('Where everything is, in six short steps.')}</p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => { setTour(true); navigate(`/w/${ws}`) }}>{t('Replay the tour')}</Button>
        </section>
        <section className="rounded-[10px] border border-border p-4 font-ui">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold"><GraduationCap className="size-4 text-muted" aria-hidden />{t('Interactive tutorial')}</h2>
          <p className="mt-1 text-[13px] text-muted">{t('"Start here" and the feature tour: questions, games, animations and HTML to try, each with its Markdown.')}</p>
          {canOpen ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" busy={busy === 'open'} onClick={() => void tutorial(false)}>{t('Open the tutorial')}</Button>
              <Button size="sm" variant="ghost" icon={RotateCcw} busy={busy === 'reset'} onClick={() => void tutorial(true)} title={t('Start the tutorial over from a fresh copy')}>{t('Start over')}</Button>
            </div>
          ) : <p className="mt-3 text-[12.5px] text-muted">{t('Open it on the computer running MDlearn Studio.')}</p>}
          {error && <p className="mt-2 text-[13px] text-bad" role="alert">{error}</p>}
        </section>
      </div>
      <div className="read mt-8 text-[16.5px]">
        {help.isLoading && <Spinner label={t('Loading help')} />}
        {help.error && <ErrorNote error={help.error} retry={() => help.refetch()} />}
        {help.data && <DocBlocks blocks={help.data.doc.blocks.filter((b) => !(b.type === 'heading' && b.depth === 1))} env={env} />}
      </div>
    </div>
  )
}
