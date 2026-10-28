// The verdict in words (never colour alone), then the author's explanation.
import { Check, CircleDashed, X } from 'lucide-react'
import type { Checked } from '@mdlearn/core'
import { Prose } from '../prose/Prose'
import { t } from '../i18n'

export function verdictOf(r: Checked, skipped = false): { word: string; tone: 'good' | 'warn' | 'bad' | 'neutral' } {
  if (skipped) return { word: t('Answer shown'), tone: 'neutral' }
  if (r.correct === null) return { word: t('Compare with the key ideas'), tone: 'neutral' }
  if (r.correct && r.partial) return { word: t('Nearly right'), tone: 'warn' }
  return r.correct ? { word: t('Right'), tone: 'good' } : { word: t('Not quite'), tone: 'bad' }
}
export function Verdict({ result, skipped }: { result: Checked; skipped?: boolean }) {
  const v = verdictOf(result, skipped)
  const Icon = v.tone === 'good' ? Check : v.tone === 'bad' ? X : CircleDashed
  const color = v.tone === 'good' ? 'text-good' : v.tone === 'bad' ? 'text-bad' : v.tone === 'warn' ? 'text-warn' : 'text-muted'
  return (
    <div className="mt-5" role="status">
      <p className="flex items-center gap-1.5 text-[15px] font-semibold"><Icon className={`size-[18px] ${color}`} strokeWidth={2.4} aria-hidden />{v.word}</p>
      {result.parts?.reveal && <div className="read mt-2 text-[16.5px]"><Prose nodes={result.parts.reveal} /></div>}
    </div>
  )
}
