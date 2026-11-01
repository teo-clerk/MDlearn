// Lessons as passages, so that asking reads what you study as well as your notes. A card is one passage, in the words
// it was written in, with the marks that only the compiler needs taken out.
import { readFileSync, statSync } from 'node:fs'
import { isAbsolute, relative, sep } from 'node:path'
import { realPath, walk } from '@mdlearn/core/node'
import { slugify } from '../import/common.js'
import type { Handle } from '../workspaces.js'
import type { AskSource } from '../../shared/types.js'

export interface LessonPassage { doc: string; docTitle: string; section: AskSource['section']; line: number; text: string }

const MAX_LESSON_BYTES = 1_000_000, MAX_TITLE_CHARS = 200, MAX_CARD_CHARS = 20_000
const files = (h: Handle) => walk(h.ws.root, (f) => f.endsWith('.learn.md'), false)
const fieldOf = (source: string, name: string) => new RegExp(`^${name}:\\s*(.+)$`, 'm').exec(source)?.[1].trim().replace(/^(['"])(.*)\1$/, '$2')
const clean = (lines: string[]) => lines.filter((l) => !/^\s*:::/.test(l)).join('\n').replace(/\{\{([^}|]*)(\|[^}]*)?\}\}/g, '$1').trim()

/** Changes when any lesson does, without reading one. */
export const lessonsStamp = (h: Handle) => files(h).map((f) => { try { const st = statSync(f); return `${f}:${st.mtimeMs}:${st.size}` } catch { return f } }).join('|')

export function cardPassages(doc: string, raw: string): LessonPassage[] {
  const source = raw.replace(/\r\n/g, '\n')
  const front = /^---\n([\s\S]*?)\n---\n/.exec(source)
  const docTitle = (fieldOf(front?.[1] ?? '', 'title') ?? doc).slice(0, MAX_TITLE_CHARS)
  const lines = source.split('\n'), first = front ? front[0].split('\n').length - 1 : 0
  const out: LessonPassage[] = []
  let section: AskSource['section'] = null, start = first, fence = false
  const flush = (end: number) => {
    const text = clean(lines.slice(start, end)).slice(0, MAX_CARD_CHARS)
    if (text) out.push({ doc, docTitle, section, line: start + 1, text })
  }
  for (let i = first; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) fence = !fence
    const heading = fence ? null : /^## +(.+?)(?:\s*\{#([^}]+)\})?\s*$/.exec(lines[i])
    if (!heading) continue
    flush(i)
    section = { num: null, anchor: heading[2] ?? slugify(heading[1]), title: heading[1].slice(0, MAX_TITLE_CHARS) }
    start = i + 1
  }
  flush(lines.length)
  return out
}

/** Every card in the folder. What is read here can go to an AI, so a link that leaves the folder stays out, even in a course someone else made. */
export function lessonPassages(h: Handle): LessonPassage[] {
  const root = realPath(h.root)
  return files(h).flatMap((f) => {
    try {
      const real = realPath(f), rel = relative(root, real)
      if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) || statSync(real).size > MAX_LESSON_BYTES) return []
      return cardPassages(relative(h.root, f).split(sep).join('/'), readFileSync(real, 'utf8'))
    } catch { return [] } // vanished: leave it out
  })
}
