// Second step: who writes the lessons. Claude from here, a coding assistant in the folder, or any chat.
import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import { BookOpenCheck, FolderCheck, MessageSquareText, Sparkles, TerminalSquare, type LucideIcon } from 'lucide-react'
import { agentsApi, jobsApi, useEngines, useIntegrations, useTree } from '../api/queries'
import { useLiveEvents } from '../api/events'
import { useUi } from '../state/ui'
import { Button, ErrorNote, Spinner } from '../ui/primitives'
import { Command, CopyButton } from '../settings/Command'
import { promptFor } from '../settings/prompt'
import { LANGS, currentLang, t, tp } from '../i18n'
import type { PreparedFolder } from '../../shared/types'

type Writer = 'claude' | 'assistant' | 'chat'
const REQUEST = 'Make the MDlearn course from the files in sources/, following AGENTS.md.'
const courseLanguage = () => (currentLang() === 'en' ? undefined : LANGS.find((l) => l.code === currentLang())?.english)
const request = () => (courseLanguage() ? `${REQUEST} Write it in ${courseLanguage()}.` : REQUEST)
const TOOLS: { id: string; name: string; run: (ask: string) => string }[] = [
  { id: 'claude', name: 'Claude Code', run: (ask) => `claude "${ask}"` },
  { id: 'codex', name: 'Codex', run: (ask) => `codex "${ask}"` },
  { id: 'opencode', name: 'OpenCode', run: (ask) => `opencode --prompt "${ask}"` },
  { id: 'pi', name: 'Pi', run: (ask) => `pi "${ask}"` },
]

function Option({ icon: Icon, title, hint, chosen, onChoose }: { icon: LucideIcon; title: string; hint: string; chosen: boolean; onChoose: () => void }) {
  return (
    <button role="radio" aria-checked={chosen} onClick={onChoose}
      className={`flex flex-col items-start justify-start rounded-[8px] border p-3 text-left cursor-pointer ${chosen ? 'border-accent bg-accent-soft' : 'border-border hover:bg-hover'}`}>
      <Icon className="size-[18px] text-muted" strokeWidth={1.7} aria-hidden />
      <span className="mt-2 block text-[14px] font-medium">{title}</span>
      <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{hint}</span>
    </button>
  )
}

function FromHere({ ws, name }: { ws: string; name: string }) {
  const [, navigate] = useLocation()
  const [wishes, setWishes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const start = async () => {
    setBusy(true); setError(null)
    try {
      const job = await jobsApi.start(ws, { recipe: 'course.class', name, language: courseLanguage(), ...(wishes.trim() ? { request: wishes.trim() } : {}) })
      navigate(`/w/${ws}/studio?job=${job.id}`)
    } catch (e) { setError(e); setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-3">
      <label className="block text-[13px] font-medium">{t('Anything it should know? (optional)')}
        <textarea value={wishes} onChange={(e) => setWishes(e.target.value)} maxLength={2000} rows={2} placeholder={t('e.g. The exam covers chapters 1 to 4 and is mostly problems')}
          className="mt-1.5 w-full rounded-[6px] border border-border-strong bg-bg px-3 py-2 text-[14px] outline-none focus:border-accent" />
      </label>
      {!!error && <ErrorNote error={error} />}
      <div><Button variant="primary" icon={Sparkles} busy={busy} onClick={() => void start()}>{t('Write the lessons')}</Button></div>
      <p className="text-[12.5px] text-muted">{t('This uses your Claude plan. You can watch it, stop it and undo it.')}</p>
    </div>
  )
}

function WithAssistant({ ws, root }: { ws: string; root: string }) {
  const [tool, setTool] = useState(TOOLS[0])
  const [ready, setReady] = useState<PreparedFolder | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const prepare = async () => {
    setBusy(true); setError(null)
    try { setReady(await agentsApi.prepare(ws)) } catch (e) { setError(e) } finally { setBusy(false) }
  }
  if (!ready) return (
    <div className="flex flex-col gap-2">
      <p className="text-[13.5px] leading-relaxed">{t('MDlearn adds a short instruction file and its skills to this folder, so your assistant knows how to write lessons. Nothing else changes.')}</p>
      {!!error && <ErrorNote error={error} />}
      <div><Button variant="primary" icon={FolderCheck} busy={busy} onClick={() => void prepare()}>{t('Get the folder ready')}</Button></div>
    </div>
  )
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label={t('Your assistant')} className="flex flex-wrap gap-1">
        {TOOLS.map((x) => <button key={x.id} role="tab" aria-selected={x.id === tool.id} onClick={() => setTool(x)} className={`rounded-[6px] px-2.5 py-1 text-[13px] cursor-pointer ${x.id === tool.id ? 'bg-hover font-medium' : 'text-muted hover:text-text'}`}>{x.name}</button>)}
      </div>
      <p className="text-[13.5px]">{t('Run this in a terminal:')}</p>
      <Command text={`cd "${root}"\n${tool.run(request())}`} />
      {!!ready.kept.length && <p className="text-[13px] text-warn">{t('Your own {file} was kept. Add a line to it: follow .agents/skills/mdlearn-course/SKILL.md.', { file: ready.kept[0] })}</p>}
    </div>
  )
}

function InAChat({ ws }: { ws: string }) {
  const info = useIntegrations()
  const setImportOpen = useUi((u) => u.setImportOpen)
  const [, navigate] = useLocation()
  return (
    <ol className="flex list-decimal flex-col gap-2 pl-5 text-[13.5px] leading-relaxed">
      <li>{t('Open ChatGPT, Claude.ai or Gemini and attach your files. Chats read PDF, PowerPoint and Word themselves.')}</li>
      <li className="flex flex-col items-start gap-1.5">{t('Paste the MDlearn prompt, then ask for a course from the attached files.')}
        {info.data ? <CopyButton text={promptFor(info.data.prompt).text} label={t('Copy the prompt')} /> : <Spinner />}
      </li>
      <li className="flex flex-col items-start gap-1.5">{t('Copy its whole answer and bring it here.')}
        <Button size="sm" variant="secondary" onClick={() => { setImportOpen(true); navigate(`/w/${ws}`) }}>{t('Import from a chat…')}</Button>
      </li>
    </ol>
  )
}

/** Lessons appear as they are written, wherever they come from. */
function Arriving({ ws }: { ws: string }) {
  useLiveEvents(ws)
  const tree = useTree(ws)
  const lessons = [...(tree.data?.docs ?? []).flatMap((d) => d.lessons), ...(tree.data?.orphanLessons ?? [])]
  if (!lessons.length) return <p className="text-[13px] text-muted">{t('Lessons appear here as they are written.')}</p>
  const cards = lessons.reduce((n, l) => n + l.cards, 0), errors = lessons.reduce((n, l) => n + l.errors, 0)
  return (
    <div role="status" className="flex flex-wrap items-center gap-3">
      <p className="text-[14px]"><span className="font-medium">{tp(lessons.length, '{n} lesson', '{n} lessons')}</span> · {tp(cards, '{n} card', '{n} cards')}{errors ? ` · ${tp(errors, '{n} error', '{n} errors')}` : ''}</p>
      <Link href={`/w/${ws}/study`} className="inline-flex h-8 items-center gap-1.5 rounded-[6px] bg-accent px-3 text-[13.5px] font-medium text-on-accent"><BookOpenCheck className="size-4" aria-hidden />{t('Start studying')}</Link>
    </div>
  )
}

export function WriterStep({ ws }: { ws: string }) {
  const tree = useTree(ws)
  const engines = useEngines()
  const claude = engines.data?.claude?.available
  const [picked, setPicked] = useState<Writer | null>(null)
  const writer = picked ?? (claude ? 'claude' : 'assistant')
  if (!tree.data) return <div className="mt-6"><Spinner /></div>
  return (
    <section aria-labelledby="writer" className="mt-8">
      <h2 id="writer" className="text-[16px] font-semibold">{t('Who writes the lessons?')}</h2>
      <div role="radiogroup" aria-labelledby="writer" className={`mt-3 grid gap-2 ${claude ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {claude && <Option icon={Sparkles} title={t('Claude, from here')} hint={t('Starts now, and you watch it work')} chosen={writer === 'claude'} onChoose={() => setPicked('claude')} />}
        <Option icon={TerminalSquare} title={t('My coding assistant')} hint={t('Claude Code, Codex, OpenCode or Pi')} chosen={writer === 'assistant'} onChoose={() => setPicked('assistant')} />
        <Option icon={MessageSquareText} title={t('A chat')} hint={t('ChatGPT, Claude.ai or Gemini')} chosen={writer === 'chat'} onChoose={() => setPicked('chat')} />
      </div>
      <div className="mt-4">
        {writer === 'claude' && <FromHere ws={ws} name={tree.data.name} />}
        {writer === 'assistant' && <WithAssistant ws={ws} root={tree.data.root} />}
        {writer === 'chat' && <InAChat ws={ws} />}
      </div>
      <div className="mt-6 border-t border-border pt-4"><Arriving ws={ws} /></div>
    </section>
  )
}
