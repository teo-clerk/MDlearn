// Side-panel tab: passages elsewhere in the folder about the section you are reading. It follows the section in view.
import { useMemo } from 'react'
import { Link } from 'wouter'
import type { DocOutline } from '@mdlearn/core'
import { useRelated } from '../api/queries'
import { useDebounced } from '../lib/hooks'
import { docRoute } from '../lib/paths'
import { prettyTitle } from '../lib/title'
import { Spinner } from '../ui/primitives'
import { useActiveSection } from './useActiveSection'
import { t } from '../i18n'

const SETTLE_MS = 300

export function RelatedPanel({ ws, path, outline }: { ws: string; path: string; outline: DocOutline }) {
  const ids = useMemo(() => outline.sections.filter((s) => s.depth <= 3).map((s) => s.anchor), [outline])
  const section = useDebounced(useActiveSection(ids), SETTLE_MS)
  const res = useRelated(ws, path, section ?? undefined, !ids.length || !!section)
  const heading = outline.sections.find((s) => s.anchor === section)
  if (res.isError) return <p className="px-4 py-3 text-[13px] text-muted">{t('Related passages could not be read.')}</p>
  if (!res.data) return <div className="p-4"><Spinner label={t('Finding related passages')} /></div>
  const { passages, mode } = res.data
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
      {heading && <p className="px-2 pb-2 text-[12px] text-muted [overflow-wrap:anywhere]">{t('Close to {section}', { section: prettyTitle(heading.title) })}</p>}
      {passages.length === 0 && <p className="px-2 text-[12.5px] text-subtle">{t('Nothing else in this folder is close to this section.')}</p>}
      <ul>
        {passages.map((p) => (
          <li key={`${p.doc}:${p.line}`}>
            <Link href={docRoute(ws, p.doc, p.section?.anchor)} className="block rounded-[5px] px-2 py-1.5 hover:bg-hover">
              <span className="block text-[13px] leading-snug [overflow-wrap:anywhere]">{prettyTitle(p.docTitle)}</span>
              {p.section && <span className="block truncate text-[11.5px] text-subtle">{p.section.num ? `${p.section.num} ` : ''}{prettyTitle(p.section.title)}</span>}
              <span className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted">{p.snippet}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="px-2 pt-2 text-[11.5px] text-subtle">
        {mode === 'meaning' ? t('Found by meaning.') : <>{t('Found by shared words.')} <Link href={`/w/${ws}/ask`} className="underline hover:text-text">{t('Set up search by meaning in Ask.')}</Link></>}
      </p>
    </div>
  )
}
