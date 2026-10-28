// Import → From a chat: paste what ChatGPT, Gemini or Claude.ai wrote with the MDlearn prompt; every file is
// checked before anything is saved, and problems become a message to paste back into the chat.
import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { Check, ClipboardCopy, FileText, GraduationCap, X } from 'lucide-react'
import { importApi } from '../api/queries'
import { copyText } from '../lib/copy'
import { Button } from '../ui/primitives'
import type { ChatCheck } from '../../shared/types'
import { t, tp } from '../i18n'

export function ChatImport({ ws, text, setText, folder, setFolder, onCheck }: {
  ws: string; text: string; setText: (s: string) => void; folder: string; setFolder: (s: string) => void; onCheck: (c: ChatCheck | null) => void
}) {
  const [check, setCheck] = useState<ChatCheck | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!text.trim()) { setCheck(null); onCheck(null); setError(null); return }
    const t = setTimeout(() => {
      importApi.checkChat(ws, text, folder || undefined)
        .then((c) => { setCheck(c); onCheck(c); setError(null) })
        .catch((e: Error) => { setCheck(null); onCheck(null); setError(e.message) })
    }, 350)
    return () => clearTimeout(t)
  }, [ws, text, folder, onCheck])
  return (
    <div>
      <label htmlFor="chat-text" className="text-[12.5px] text-muted">{t('The chat\'s whole answer')}</label>
      <textarea id="chat-text" value={text} onChange={(e) => setText(e.target.value)} rows={7} spellCheck={false} autoFocus
        placeholder={'<!-- file: course/01-intro.learn.md -->\n~~~~markdown\n---\ntitle: …'}
        className="mt-1 w-full resize-y rounded-[6px] border border-border-strong bg-bg px-3 py-2 font-mono text-[12.5px] leading-relaxed outline-none placeholder:text-subtle focus:border-focus" />
      <p className="mt-1 text-[12px] text-muted">
        {t('No answer yet? Give the chat')} <Link href={`/w/${ws}/settings#apps`} className="underline decoration-border-strong underline-offset-2 hover:decoration-text">{t('the MDlearn prompt')}</Link> {t('first, then ask it for a course.')}
      </p>
      {error && <p role="alert" className="mt-2 text-[13px] text-bad">{error}</p>}
      {check && (
        <div className="mt-3">
          <label htmlFor="chat-folder" className="text-[12.5px] text-muted">{t('Save in the folder')}</label>
          <input id="chat-folder" value={folder || check.folder} onChange={(e) => setFolder(e.target.value)} spellCheck={false}
            className="mt-1 h-8 w-full rounded-[6px] border border-border-strong bg-bg px-2.5 font-mono text-[12.5px] outline-none focus:border-focus" />
          <ul className="mt-2 flex flex-col gap-1 text-[13px]" aria-label={t('Files in the answer')}>
            {check.files.map((f) => <FileRow key={f.path} f={f} />)}
          </ul>
          {check.fix && <FixRequest fix={check.fix} />}
        </div>
      )}
    </div>
  )
}

function FileRow({ f }: { f: ChatCheck['files'][number] }) {
  const Icon = f.kind === 'lesson' ? GraduationCap : FileText
  const state = f.errors ? tp(f.errors, '{n} error', '{n} errors') : f.exists ? t('already exists') : f.kind === 'lesson' ? `${tp(f.cards, '{n} card', '{n} cards')}${f.warnings ? ` · ${tp(f.warnings, '{n} to improve', '{n} to improve')}` : ''}` : t('overview')
  return (
    <li>
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{f.path}</span>
        <span className={`flex shrink-0 items-center gap-1 text-[12px] ${f.errors ? 'text-bad' : 'text-muted'}`}>
          {f.errors ? <X className="size-3.5" aria-hidden /> : <Check className="size-3.5" aria-hidden />}{state}
        </span>
      </div>
      {f.lines.length > 0 && (
        <details className="ml-6 mt-0.5">
          <summary className="cursor-pointer text-[12px] text-muted">{t('Details')}</summary>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-[6px] bg-code px-2 py-1.5 font-mono text-[11.5px] leading-snug">{f.lines.join('\n')}</pre>
        </details>
      )}
    </li>
  )
}

/** The message that asks the chat to fix its own errors, ready to copy. */
export function FixRequest({ fix }: { fix: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="mt-3 rounded-[8px] border border-border bg-panel px-3 py-2.5">
      <p className="text-[13px]">{t('Some files need fixing. Copy this request, paste it into the chat, and paste its new answer here.')}</p>
      <Button size="sm" variant="ghost" icon={copied ? Check : ClipboardCopy} className="mt-1.5"
        onClick={async () => { if (await copyText(fix)) { setCopied(true); setTimeout(() => setCopied(false), 1800) } }}>
        {copied ? t('Copied') : t('Copy the fix request')}
      </Button>
    </div>
  )
}
