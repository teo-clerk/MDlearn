// Author-facing output: document outlines and deterministic lesson scaffolds.
import type { DocOutline } from '@mdlearn/core'

export function outlineText(o: DocOutline): string {
  const head = [`# ${o.docNo ? o.docNo + ' — ' : ''}${o.title}`, `kind: ${o.kind} · words: ${o.words}` +
    (o.timeMin ? ` · time: ${o.timeMin} min` : '') + (o.difficulty ? ` · difficulty: ${o.difficulty} (${o.level})` : '') +
    (o.milestone ? ` · milestone: ${o.milestone}` : '')]
  if (o.prerequisites.length) head.push(`prerequisites: ${o.prerequisites.map((p) => p.href).join(', ')}`)
  if (o.objectives.length) head.push('objectives:', ...o.objectives.map((x, i) => `  ${i + 1}. ${x}`))
  if (o.deliverable) head.push(`deliverable: ${o.deliverable}`)
  head.push('sections:')
  for (const s of o.sections) head.push(`${'  '.repeat(s.depth - 1)}${s.num ? '§' + s.num + ' ' : ''}${s.title}  [${s.words}w${s.displayMath ? `, ${s.displayMath}∑` : ''}${s.codeBlocks ? `, ${s.codeBlocks} code` : ''}${s.role !== 'content' ? `, ${s.role}` : ''}]  L${s.startLine}–${s.endLine}`)
  return head.join('\n')
}
