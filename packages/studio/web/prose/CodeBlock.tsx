// Syntax highlighting with Shiki, loaded on demand; plain code until it is ready.
import { useEffect, useState } from 'react'

let highlighter: Promise<{ codeToHtml: (code: string, o: { lang: string; themes: { light: string; dark: string }; defaultColor: false }) => string; getLoadedLanguages: () => string[] }> | undefined
const LANGS = ['python', 'typescript', 'javascript', 'bash', 'json', 'yaml', 'toml', 'sql', 'markdown', 'java', 'c', 'cpp', 'latex', 'diff', 'html', 'css', 'ini', 'dockerfile', 'r', 'julia', 'matlab', 'go', 'rust']
const ALIAS: Record<string, string> = { py: 'python', ts: 'typescript', js: 'javascript', sh: 'bash', shell: 'bash', console: 'bash', zsh: 'bash', yml: 'yaml', md: 'markdown', tex: 'latex', 'c++': 'cpp' }
function load() {
  highlighter ??= import('shiki').then((s) => s.createHighlighter({ themes: ['github-light', 'github-dark'], langs: LANGS }) as never)
  return highlighter
}
/** `bare`: no frame or language label (when something else already provides the frame). */
export default function CodeBlock({ code, lang, bare }: { code: string; lang: string; bare?: boolean }) {
  const [html, setHtml] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    const l = ALIAS[lang] ?? lang
    if (!l || !LANGS.includes(l)) return
    load().then((h) => { if (live) setHtml(h.codeToHtml(code, { lang: l, themes: { light: 'github-light', dark: 'github-dark' }, defaultColor: false })) }).catch(() => {})
    return () => { live = false }
  }, [code, lang])
  if (bare) return html ? <div className="code" dangerouslySetInnerHTML={{ __html: html }} /> : <pre className="code"><code>{code}</code></pre>
  return (
    <figure className="code-block" data-lang={lang || undefined}>
      {lang && <figcaption>{lang}</figcaption>}
      {html ? <div className="code" dangerouslySetInnerHTML={{ __html: html }} /> : <pre className="code"><code>{code}</code></pre>}
    </figure>
  )
}
