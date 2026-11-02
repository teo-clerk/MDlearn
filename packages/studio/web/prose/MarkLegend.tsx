// What the colours of the highlights mean, under the title of a page that uses more than one: colour helps when it says
// something, and only if you know what. Each highlight also says it when you rest on it.
import { useMemo } from 'react'
import { MARK_TONES, type MarkTone } from '@mdlearn/core/html'
import { t } from '../i18n'

export const toneName = (tone: MarkTone) => ({ key: t('Key idea'), definition: t('Definition'), example: t('Example'), trap: t('Common mistake'), rule: t('Rule or formula') })[tone]

/** The tones a page uses; a plain `<mark>` counts as the key idea it looks like. */
function tonesIn(blocks: unknown): MarkTone[] {
  const text = JSON.stringify(blocks)
  return MARK_TONES.filter((tone) => text.includes(`"data-tone":"${tone}"`) || (tone === 'key' && text.includes('"tag":"mark","attrs":{}')))
}

export function MarkLegend({ blocks }: { blocks: unknown }) {
  const tones = useMemo(() => tonesIn(blocks), [blocks])
  if (tones.length < 2) return null
  return (
    <p className="tone-legend mb-6 flex flex-wrap gap-1.5 font-ui text-[12px] text-muted" role="group" aria-label={t('What the highlights mean')}>
      {tones.map((tone) => <mark key={tone} data-tone={tone}>{toneName(tone)}</mark>)}
    </p>
  )
}
