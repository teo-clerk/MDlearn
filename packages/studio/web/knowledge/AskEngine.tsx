// Who answers a question: the local AI when there is one, or Claude from this computer. Claude reads parts of your course
// on Anthropic's servers, so the page says what goes there whenever it is the one answering.
import { useState } from 'react'
import { Link } from 'wouter'
import { useEngines, useSession } from '../api/queries'
import { t } from '../i18n'

type Engine = 'local' | 'claude'
export interface AskEngineChoice { using: Engine | null; local: boolean; claude: boolean; known: boolean; choose(e: Engine): void }

export function useAskEngine(): AskEngineChoice {
  const engines = useEngines()
  const session = useSession()
  const [chosen, choose] = useState<Engine | null>(null)
  const local = !!engines.data?.local.available
  const claude = !!engines.data?.claude.available && !!session.data?.caps.includes('ai')
  const open = (e: Engine | null) => (e === 'local' ? local : e === 'claude' ? claude : false)
  const using = open(chosen) ? chosen : local ? 'local' : claude ? 'claude' : null
  return { using, local, claude, known: !!engines.data, choose }
}

export function EnginePick({ ws, engine, progress = false }: { ws: string; engine: AskEngineChoice; progress?: boolean }) {
  const { using, local, claude, known, choose } = engine
  if (known && !using) return <p className="mt-2 text-[12.5px] text-muted">{t('Asking needs the local AI (Ollama) or Claude.')} <Link href={`/w/${ws}/settings#local-ai`} className="underline underline-offset-2 hover:text-text">{t('Local AI settings')}</Link></p>
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
      {local && claude && (
        <span role="radiogroup" aria-label={t('Answers from')} className="inline-flex gap-1">
          {(['local', 'claude'] as const).map((e) => (
            <button key={e} type="button" role="radio" aria-checked={using === e} onClick={() => choose(e)}
              className={`h-7 rounded-[6px] border px-2 cursor-pointer ${using === e ? 'border-accent bg-accent-soft font-medium' : 'border-border text-muted hover:bg-hover'}`}>{e === 'local' ? t('Local AI') : 'Claude'}</button>
          ))}
        </span>
      )}
      {using === 'claude' && <span className="text-muted">{progress ? t('Claude answers. The passages and titles it reads, and your study progress, go to Anthropic, under your own account.') : t('Claude answers. The passages and titles it reads go to Anthropic, under your own account.')}</span>}
    </div>
  )
}
