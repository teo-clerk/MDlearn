// Settings: how Studio looks, its language, the local AI (Ollama models), and how to use MDlearn from other assistants (Claude Code in any folder,
// Claude.ai, ChatGPT and other chats) so they write lessons you can study here.
import { useEffect, useState, type ReactNode } from 'react'
import { Download, MessageSquareText, Settings, TerminalSquare } from 'lucide-react'
import { agentsApi, useIntegrations } from '../api/queries'
import type { McpSetup } from '../../shared/types'
import { useUi } from '../state/ui'
import { Button, ErrorNote, Spinner } from '../ui/primitives'
import { TopLeft } from '../layout/Shell'
import { LANGS, currentLang, locale, t } from '../i18n'
import { Appearance, Language } from './Appearance'
import { Section } from './Section'
import { Command, CopyButton } from './Command'
import { LocalAi } from './LocalAi'
import { ScinetSettings } from './ScinetSettings'

export default function SettingsPage() {
  useEffect(() => { document.title = t('Settings · MDlearn Studio') }, [])
  useEffect(() => { if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' }) }, [])
  return (
    <div className="mx-auto max-w-[760px] px-6 pb-24 pt-6 sm:px-10">
      <TopLeft><span className="truncate px-1 text-[13px] text-muted">{t('Settings')}</span></TopLeft>
      <h1 className="flex items-center gap-2 font-ui text-[26px] font-bold tracking-[-0.02em]"><Settings className="size-6 text-muted" strokeWidth={1.8} aria-hidden />{t('Settings')}</h1>
      <Appearance />
      <Language />
      <LocalAi />
      <ScinetSettings />
      <OtherApps />
    </div>
  )
}

function App({ icon: Icon, name, children }: { icon: typeof Settings; name: string; children: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-border p-4">
      <h3 className="flex items-center gap-1.5 text-[14px] font-semibold"><Icon className="size-4 text-muted" strokeWidth={1.8} aria-hidden />{name}</h3>
      <div className="mt-2 flex flex-col gap-2 text-[13.5px] leading-relaxed">{children}</div>
    </div>
  )
}

/** The MCP tools are extra: they let an assistant quiz you and read your folder by section. */
function McpTools() {
  const [setup, setSetup] = useState<McpSetup | null>(null)
  const [error, setError] = useState<Error | null>(null)
  return (
    <details>
      <summary className="cursor-pointer text-[12.5px] text-muted">{t('To let it quiz you too, add the MDlearn tools')}</summary>
      <div className="mt-2 flex flex-col gap-2">
        {!setup && <div><Button size="sm" variant="secondary" onClick={() => agentsApi.mcp().then(setSetup, setError)}>{t('Show the commands')}</Button></div>}
        {error && <ErrorNote error={error} />}
        {setup && (
          <>
            <p className="text-muted">{t('MDlearn gives you these and never changes another app’s settings. They need Node.js.')}</p>
            <p>Codex</p><Command text={setup.commands.codex} />
            <p>Pi</p><Command text={setup.commands.pi} />
            <p>{t('OpenCode: add this to opencode.json')}</p><Command text={setup.commands.opencode} />
          </>
        )}
      </div>
    </details>
  )
}

/** The chat prompt, asking for courses in the interface language when it is not English (the prompt itself stays English). */
function promptFor(prompt: string): { text: string; language: string | null } {
  const lang = LANGS.find((l) => l.code === currentLang())!
  if (lang.code === 'en') return { text: prompt, language: null }
  return { text: `${prompt.trimEnd()}\n\nUnless I ask otherwise, write the course in ${lang.english}.\n`, language: new Intl.DisplayNames(locale(), { type: 'language' }).of(lang.code) ?? lang.name }
}

function OtherApps() {
  const info = useIntegrations()
  const setImportOpen = useUi((s) => s.setImportOpen)
  return (
    <Section id="apps" title={t('Use MDlearn in other apps')}
      intro={t('Ask any assistant for a course on a topic, with or without your notes. It writes MDlearn lessons with the same method Studio uses; you study them here.')}>
      {info.isLoading && <Spinner />}
      {info.error && <ErrorNote error={info.error} />}
      {info.data && (
        <>
          {info.data.pluginDir && (
            <App icon={TerminalSquare} name={t('Claude Code, in any folder')}>
              <p>{t('Install the MDlearn plugin once (run these in a terminal):')}</p>
              <Command text={`claude plugin marketplace add "${info.data.pluginDir}"\nclaude plugin install mdlearn@mdlearn`} />
              <p>{t('Then, in any project:')} <code className="font-mono text-[12.5px]">/mdlearn:course how vaccines work, beginner</code> {t('writes a checked course into that folder, and')} <code className="font-mono text-[12.5px]">/mdlearn:study</code> {t('quizzes you on it. After an update of MDlearn, run')} <code className="font-mono text-[12.5px]">claude plugin marketplace update mdlearn</code>.</p>
            </App>
          )}
          <App icon={TerminalSquare} name={t('Codex, OpenCode, Pi and other coding assistants')}>
            <p>{t('Nothing to install: a folder can carry the instructions. Open it here, press Ctrl+K and choose “Get this folder ready for my AI”. Then start your assistant in that folder and ask for a course.')}</p>
            {info.data.pluginDir && <McpTools />}
          </App>
          <App icon={MessageSquareText} name={t('Claude.ai')}>
            <p>{t('Download the skill and upload it in Claude.ai under Settings → Capabilities → Skills. Then ask: "Make an MDlearn course on …".')}</p>
            {info.data.skillZip && <div><a href="/api/integrations/mdlearn-skill.zip" download className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-border-strong px-2.5 text-[13px] font-medium hover:bg-hover"><Download className="size-[15px]" aria-hidden />mdlearn-skill.zip</a></div>}
            <p className="text-muted">{t('Claude.ai cannot save into this folder: copy its answer and use Import → From a chat.')}</p>
          </App>
          <App icon={MessageSquareText} name={t('ChatGPT, Gemini and other chats')}>
            <p>{t('Paste the MDlearn prompt into the chat, or into a Custom GPT\'s or Project\'s instructions; for the full rules, attach the guide as a file. Then ask for a course and paste the answer into Import → From a chat: Studio checks every file and, if something is wrong, writes the fix request for you.')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton text={promptFor(info.data.prompt).text} label={t('Copy the prompt')} />
              {info.data.guide && <a href="/api/integrations/MDLEARN_GUIDE.md" download className="inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-[13px] font-medium text-muted hover:bg-hover hover:text-text"><Download className="size-[15px]" aria-hidden />{t('The full guide')}</a>}
              <Button size="sm" variant="ghost" onClick={() => setImportOpen(true)}>{t('Import from a chat…')}</Button>
            </div>
            {promptFor(info.data.prompt).language && <p className="text-[12.5px] text-muted">{t('The copied prompt asks for courses in {language} unless you ask otherwise.', { language: promptFor(info.data.prompt).language! })}</p>}
            <details>
              <summary className="cursor-pointer text-[12.5px] text-muted">{t('Show the prompt')}</summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-[6px] border border-border bg-code px-3 py-2 font-mono text-[11.5px] leading-relaxed">{promptFor(info.data.prompt).text}</pre>
            </details>
          </App>
        </>
      )}
    </Section>
  )
}
