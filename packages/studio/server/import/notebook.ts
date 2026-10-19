// A Jupyter notebook → one Markdown document: Markdown cells as written, code cells as fenced code, text
// output as a quote, picture output saved beside it. Nothing is executed.
import { posix } from 'node:path'
import { z } from 'zod'
import type { Handle } from '../workspaces.js'
import { UserError } from '../workspaces.js'
import { IMPORT_DIR, freePath, result, slugify, writeNew } from './common.js'
import type { ImportResult } from '../../shared/types.js'

const text = z.union([z.string(), z.array(z.string())]).transform((v) => (Array.isArray(v) ? v.join('') : v))
const Output = z.looseObject({ output_type: z.string(), name: z.string().optional(), text: text.optional(), data: z.record(z.string(), z.unknown()).optional(), ename: z.string().optional() })
const Cell = z.looseObject({ cell_type: z.string(), source: text, outputs: z.array(Output).optional() })
const Notebook = z.looseObject({ cells: z.array(Cell), metadata: z.looseObject({ kernelspec: z.looseObject({ language: z.string().optional() }).optional(), language_info: z.looseObject({ name: z.string().optional() }).optional() }).optional() })

const MAX_OUTPUT_LINES = 40
const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' }
const quote = (s: string) => {
  const lines = s.replace(/\r/g, '').replace(/\x1b\[[0-9;]*m/g, '').trimEnd().split('\n')
  const shown = lines.length > MAX_OUTPUT_LINES ? [...lines.slice(0, MAX_OUTPUT_LINES), `… ${lines.length - MAX_OUTPUT_LINES} more lines`] : lines
  return shown.map((l) => `> ${l}`.trimEnd()).join('\n')
}
const asText = (v: unknown) => (Array.isArray(v) ? v.join('') : typeof v === 'string' ? v : '')

export function importNotebook(h: Handle, fileName: string, raw: string): ImportResult {
  let nb: z.infer<typeof Notebook>
  try { nb = Notebook.parse(JSON.parse(raw)) } catch { throw new UserError('invalid', 'This does not look like a Jupyter notebook (.ipynb).') }
  const lang = nb.metadata?.kernelspec?.language ?? nb.metadata?.language_info?.name ?? 'python'
  const base = slugify(fileName.replace(/\.ipynb$/i, ''))
  const rel = freePath(h, IMPORT_DIR, base)
  const files: ImportResult['files'] = []
  const warnings: string[] = []
  let figures = 0, skippedOutputs = 0
  const parts: string[] = []
  for (const cell of nb.cells) {
    const src = cell.source.replace(/\s+$/, '')
    if (cell.cell_type === 'markdown') { if (src) parts.push(src); continue }
    if (cell.cell_type !== 'code') continue
    if (src) parts.push(`\`\`\`${lang}\n${src}\n\`\`\``)
    for (const out of cell.outputs ?? []) {
      const data = out.data ?? {}
      const png = Object.keys(IMAGE_TYPES).find((t) => typeof data[t] === 'string')
      if (png) {
        figures++
        const name = posix.join('assets', slugify(base), `figure-${figures}.${IMAGE_TYPES[png]}`)
        writeNew(h, name, Buffer.from(String(data[png]).replace(/\s/g, ''), 'base64'))
        files.push({ path: name, kind: 'asset' })
        parts.push(`![Output ${figures}](${posix.relative(posix.dirname(rel), name)})`)
      } else if (out.output_type === 'stream' && out.text) parts.push(quote(out.text))
      else if (typeof data['text/plain'] !== 'undefined') parts.push(quote(asText(data['text/plain'])))
      else if (out.output_type !== 'error') skippedOutputs++
    }
  }
  if (!parts.length) throw new UserError('empty', 'The notebook has no cells to import.')
  const title = /^#\s+(.+)$/m.exec(parts.join('\n\n'))?.[1].trim()
  const body = parts.join('\n\n')
  writeNew(h, rel, `${title ? '' : `# ${fileName.replace(/\.ipynb$/i, '')}\n\n`}${body}\n`)
  files.unshift({ path: rel, kind: 'document' })
  if (skippedOutputs) warnings.push(`${skippedOutputs} outputs (interactive widgets, HTML) were left out.`)
  return result(files, warnings, `${nb.cells.length} cells imported${figures ? `, ${figures} figures saved` : ''}.`)
}
