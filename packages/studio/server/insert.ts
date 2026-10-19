// Insert a block into a Markdown file after the paragraph that contains a quoted passage. Refuses when
// the file changed since the page was loaded (so a stale view never overwrites newer text).
import { readFileSync, statSync, writeFileSync, renameSync } from 'node:fs'
import { UserError } from './workspaces.js'
import { locateQuote } from './passage.js'

export function insertAfterQuote(abs: string, quote: string, text: string, baseMtime?: number): { line: number } {
  if (baseMtime !== undefined && Math.abs(statSync(abs).mtimeMs - baseMtime) > 1) throw new UserError('conflict', 'The file changed since you opened it. Reload and try again.')
  const lines = readFileSync(abs, 'utf8').split('\n')
  const at = locateQuote(lines, quote)
  if (at < 0) throw new UserError('not-found', 'The passage could not be found in the file; copy the block instead.')
  // end of the paragraph / block the passage is in
  let end = at
  let fence: string | null = null
  for (let i = at; i < lines.length; i++) {
    const t = lines[i].trim()
    if (/^(`{3,}|~{3,}|\$\$)/.test(t)) fence = fence ? null : t.slice(0, 3)
    end = i
    if (!fence && (t === '' || i === lines.length - 1)) break
  }
  const next = [...lines.slice(0, end + 1), ...(lines[end]?.trim() ? [''] : []), ...text.trimEnd().split('\n'), '', ...lines.slice(end + 1)]
  const tmp = `${abs}.${process.pid}.tmp`
  writeFileSync(tmp, next.join('\n'))
  renameSync(tmp, abs)
  return { line: end + 2 }
}
