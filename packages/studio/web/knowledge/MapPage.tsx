// The map of your documents: the graph (every document and how they connect, 2D or 3D) or the layered view
// (prerequisites first), for the whole folder or around one document (?doc=). ?view=layers picks the layers.
import { useEffect } from 'react'
import { Link, useSearch } from 'wouter'
import { Network } from 'lucide-react'
import { useMapData } from '../api/queries'
import { mapRoute } from '../lib/paths'
import { prettyTitle } from '../lib/title'
import { Empty, ErrorNote, Spinner } from '../ui/primitives'
import { BuildNote, Frame } from './Frame'
import { GraphView } from './GraphView'
import { LayersView } from './LayersView'
import { t, tp } from '../i18n'

export default function MapPage({ ws }: { ws: string }) {
  const res = useMapData(ws)
  const params = new URLSearchParams(useSearch())
  const focus = params.get('doc')
  const layers = params.get('view') === 'layers'
  useEffect(() => { document.title = t('Map · MDlearn Studio') }, [])
  const focused = focus ? res.data?.nodes.find((n) => n.path === focus) : undefined
  const nPrereq = res.data?.edges.filter((e) => e.kind === 'prereq').length ?? 0
  const hint = !res.data ? undefined : focused
    ? (layers
      ? t('Around {title}: what it builds on to the left, what builds on it to the right.', { title: prettyTitle(focused.title) })
      : t('Around {title}: the documents a few steps away from it.', { title: prettyTitle(focused.title) }))
    : layers
      ? <>{t('Documents on the left come first.')} {nPrereq ? tp(nPrereq, '{n} prerequisite; drag to move around, click a document to see what surrounds it.', '{n} prerequisites; drag to move around, click a document to see what surrounds it.') : t('No prerequisites are declared in these documents.')}</>
      : t('Every document, sized by its words and coloured by how well you remember it.')
  const tab = (on: boolean, label: string, href: string) => (
    <Link href={href} aria-current={on ? 'page' : undefined}
      className={`inline-flex h-7 items-center rounded-[5px] px-2.5 text-[12.5px] font-medium ${on ? 'bg-active text-text' : 'text-muted hover:text-text'}`}>{label}</Link>
  )
  return (
    <Frame wide title={t('Map')} hint={hint}
      actions={res.data && (
        <div className="flex flex-wrap items-center gap-3">
          {focused && <Link href={mapRoute(ws, undefined, layers ? 'layers' : undefined)} className="inline-flex h-7 items-center rounded-[6px] px-2 text-[12.5px] text-muted hover:bg-hover hover:text-text">{t('Whole folder')}</Link>}
          <nav aria-label={t('Map view')} className="inline-flex rounded-[7px] border border-border p-0.5">
            {tab(!layers, t('Graph'), mapRoute(ws, focus ?? undefined))}
            {tab(layers, t('Layers'), mapRoute(ws, focus ?? undefined, 'layers'))}
          </nav>
        </div>
      )}>
      <BuildNote status={res.data?.status} />
      {res.isLoading && <Spinner label={t('Drawing the map')} />}
      {res.error && <ErrorNote error={res.error} retry={() => res.refetch()} />}
      {res.data && focus && !focused && <Empty icon={Network} title={t('That document is not in the folder')} action={<Link href={mapRoute(ws)} className="text-accent-ink underline underline-offset-2">{t('Show the whole folder')}</Link>} />}
      {res.data && (!focus || focused) && (layers
        ? <LayersView ws={ws} data={res.data} focus={focus} focused={focused} />
        : <GraphView key={focus ?? ''} ws={ws} data={res.data} focused={focused} />)}
    </Frame>
  )
}
