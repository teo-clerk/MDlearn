// "New note": asks for a name (and folder), creates the file and opens it — a Markdown note in the editor, or a
// LaTeX document (from a small template) on the LaTeX page.
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { fileApi } from '../api/queries'
import { latexRoute } from '../lib/paths'
import { Button } from '../ui/primitives'
import { t } from '../i18n'

type Kind = 'md' | 'tex'
const EXT: Record<Kind, string> = { md: '.md', tex: '.tex' }
const titleOf = (path: string) => path.split('/').pop()!.replace(/\.(md|tex)$/i, '').replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase())
const latexTemplate = (title: string) => `\\documentclass[11pt]{article}
\\usepackage{amsmath, amssymb}
\\usepackage{graphicx}
\\usepackage[hidelinks]{hyperref}

\\title{${title}}
\\author{}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}
Write here. Math in a sentence: $E = mc^2$. On its own line:
\\begin{equation}
  \\int_0^1 x^2 \\, dx = \\frac{1}{3}
\\end{equation}

\\end{document}
`

export function NewNote({ ws, folder, onClose }: { ws: string; folder: string; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>('md')
  const [name, setName] = useState(`${folder ? `${folder}/` : ''}untitled.md`)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [, navigate] = useLocation()
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus(); input.current?.setSelectionRange(name.lastIndexOf('/') + 1, name.length - EXT[kind].length) }, [kind]) // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (k: Kind) => { setKind(k); setName((n) => n.replace(/\.(md|tex)$/i, '') + EXT[k]) }
  const create = async () => {
    const trimmed = name.trim().replace(/\.(md|tex)$/i, '')
    const path = `${trimmed}${EXT[kind]}`
    setBusy(true); setError(null)
    try {
      await fileApi.create(ws, path, kind === 'tex' ? latexTemplate(titleOf(path)) : `# ${titleOf(path)}\n\n`)
      onClose()
      navigate(kind === 'tex' ? latexRoute(ws, path) : `/w/${ws}/edit?path=${encodeURIComponent(path)}`)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 px-4 pt-[16vh]" onMouseDown={onClose}>
      <form role="dialog" aria-modal="true" aria-label={t('New note')} onMouseDown={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void create() }}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
        className="w-full max-w-md rounded-[10px] border border-border bg-raised p-4 shadow-pop">
        <h2 className="text-[15px] font-semibold">{t('New note')}</h2>
        <div role="radiogroup" aria-label={t('Kind of file')} className="mt-3 flex gap-1.5">
          {(['md', 'tex'] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => choose(k)}
              className={`h-8 rounded-[6px] border px-3 text-[13px] cursor-pointer ${kind === k ? 'border-text bg-hover font-medium' : 'border-border text-muted hover:bg-hover'}`}>
              {k === 'md' ? t('Markdown note') : t('LaTeX document')}
            </button>
          ))}
        </div>
        <label className="mt-3 block text-[12.5px] text-muted" htmlFor="new-note-name">{t('File name, with a folder if you like')}</label>
        <input id="new-note-name" ref={input} value={name} onChange={(e) => setName(e.target.value)} spellCheck={false}
          className="mt-1 h-9 w-full rounded-[6px] border border-border-strong bg-bg px-3 font-mono text-[13px] outline-none focus:border-focus" />
        {kind === 'tex' && <p className="mt-2 text-[12.5px] text-muted">{t('Starts from a short article with math; compile it to see the PDF.')}</p>}
        {error && <p role="alert" className="mt-2 text-[13px] text-bad">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!name.trim()}>{t('Create and edit')}</Button>
        </div>
      </form>
    </div>
  )
}
