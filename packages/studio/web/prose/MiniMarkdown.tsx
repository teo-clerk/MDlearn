// Small Markdown for AI answers and notes: paragraphs, lists, **bold**, *italic*, `code`, $math$, $$display$$.
import { Fragment, type ReactNode } from 'react'
import { Tex } from './Tex'

export type Cite = (n: number) => ReactNode
function inline(s: string, key = '', cite?: Cite): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\$\$([^$]+)\$\$|\$([^$\n]+?)\$|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\n]+)\*|\[(\d{1,2})\]/g
  let last = 0, m: RegExpExecArray | null, i = 0
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    const k = `${key}-${i++}`
    if (m[1] !== undefined) out.push(<Tex key={k} tex={m[1]} eager />)
    else if (m[2] !== undefined) out.push(<Tex key={k} tex={m[2]} eager />)
    else if (m[3] !== undefined) out.push(<code key={k}>{m[3]}</code>)
    else if (m[4] !== undefined) out.push(<strong key={k}>{m[4]}</strong>)
    else if (m[5] !== undefined) out.push(<em key={k}>{m[5]}</em>)
    else if (m[6] !== undefined) out.push(cite ? <Fragment key={k}>{cite(Number(m[6]))}</Fragment> : m[0])
    last = m.index + m[0].length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}
/** `inline`: one run of text with no paragraph around it (a term, a definition beside it). */
export function MiniMarkdown({ text, cite, inline: flat }: { text: string; cite?: Cite; inline?: boolean }) {
  if (flat) return <>{inline(text.replace(/\s+/g, ' ').trim(), 'i', cite)}</>
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  return (
    <>
      {blocks.map((b, i) => {
        const display = /^\$\$([\s\S]+)\$\$$/.exec(b)
        if (display) return <Tex key={i} tex={display[1]} display eager />
        const lines = b.split('\n')
        if (lines.every((l) => /^\s*([-*]|\d+[.)])\s+/.test(l))) {
          const ordered = /^\s*\d/.test(lines[0])
          const items = lines.map((l, k) => <li key={k}>{inline(l.replace(/^\s*([-*]|\d+[.)])\s+/, ''), `${i}-${k}`, cite)}</li>)
          return ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>
        }
        return <p key={i}>{lines.map((l, k) => <Fragment key={k}>{k > 0 && <br />}{inline(l, `${i}-${k}`, cite)}</Fragment>)}</p>
      })}
    </>
  )
}
