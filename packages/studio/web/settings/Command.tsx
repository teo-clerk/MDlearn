import { useState } from 'react'
import { Check, ClipboardCopy } from 'lucide-react'
import { copyText } from '../lib/copy'
import { Button } from '../ui/primitives'
import { t } from '../i18n'

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button size="sm" variant="secondary" icon={copied ? Check : ClipboardCopy}
      onClick={async () => { if (await copyText(text)) { setCopied(true); setTimeout(() => setCopied(false), 1800) } }}>
      {copied ? t('Copied') : label}
    </Button>
  )
}

/** A terminal command with a Copy button. */
export function Command({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-[6px] border border-border bg-code px-2.5 py-1.5 font-mono text-[12px] leading-relaxed">{text}</code>
      <CopyButton text={text} label={t('Copy')} />
    </div>
  )
}
