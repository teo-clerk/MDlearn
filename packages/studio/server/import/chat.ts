// Lessons written by a chat without MDlearn's tools (ChatGPT, Gemini, Claude.ai): split the pasted answer into
// files, check each one where it will live, save the ones without errors in a new course folder, and write
// the message that asks the chat to fix the rest.
import { existsSync } from 'node:fs'
import { splitBundle, planBundle, fixMessage, formatDiagnostic, type BundlePlan } from '@mdlearn/core'
import { compileSource, inRoot } from '@mdlearn/core/node'
import type { Handle } from '../workspaces.js'
import { UserError } from '../workspaces.js'
import { writeNew, result } from './common.js'
import type { ChatCheck, ImportResult } from '../../shared/types.js'

export const MAX_CHAT_CHARS = 2_000_000

function plan(h: Handle, text: string, folder?: string): BundlePlan {
  if (text.length > MAX_CHAT_CHARS) throw new UserError('too-large', 'That answer is too long to import at once.')
  let files
  try { files = splitBundle(text) } catch (e) { throw new UserError('too-large', (e as Error).message) }
  if (!files.length) throw new UserError('empty', 'No lesson found. Paste the whole answer, including the lines that start with <!-- file: -->.')
  try {
    return planBundle(files, { folder: folder?.trim() || undefined, exists: (rel) => existsSync(inRoot(h.root, rel) ?? '') })
  } catch (e) { throw new UserError('path', (e as Error).message) }
}

/** Check a pasted answer without writing anything. `folder` defaults to a free one. */
export function checkChat(h: Handle, text: string, folder?: string): ChatCheck {
  const p = plan(h, text, folder)
  const checked = p.files.map((f) => {
    const abs = inRoot(h.root, f.target)
    if (!abs) throw new UserError('path', 'That location is outside this folder.')
    if (!f.target.endsWith('.learn.md')) return { path: f.target, kind: 'document' as const, cards: 0, errors: 0, warnings: 0, lines: [], exists: existsSync(abs), diagnostics: [] }
    const r = compileSource(f.content, abs)
    const notable = r.diagnostics.filter((d) => !d.code.startsWith('I'))
    return {
      path: f.target, kind: 'lesson' as const, cards: r.lesson?.cards.length ?? 0, exists: existsSync(abs),
      errors: notable.filter((d) => d.code.startsWith('E')).length + (r.lesson ? 0 : 1), warnings: notable.filter((d) => d.code.startsWith('W')).length,
      lines: notable.map(formatDiagnostic), diagnostics: r.diagnostics,
    }
  })
  // the chat named its files by its own paths: ask it to fix them under those names
  const fix = fixMessage(p.files.map((f, i) => ({ path: f.path, diagnostics: checked[i].diagnostics })))
  return { folder: p.folder, files: checked.map(({ diagnostics: _d, ...f }) => f), fix }
}

/** Save the files without errors (never replacing anything); the rest are reported with the fix message. */
export function importChat(h: Handle, text: string, folder?: string): ImportResult {
  const check = checkChat(h, text, folder)
  const p = plan(h, text, check.folder)
  const written: ImportResult['files'] = [], warnings: string[] = []
  p.files.forEach((f, i) => {
    const c = check.files[i]
    if (c.errors) { warnings.push(`${c.path} was not saved: ${c.errors} error(s) to fix first.`); return }
    if (c.exists) { warnings.push(`${c.path} already exists and was left as it is.`); return }
    written.push({ path: writeNew(h, f.target, f.content), kind: c.kind })
  })
  const lessons = written.filter((f) => f.kind === 'lesson').length
  return { ...result(written, warnings, `${lessons} lesson${lessons === 1 ? '' : 's'} in ${check.folder}/`), ...(check.fix ? { fix: check.fix } : {}) }
}
