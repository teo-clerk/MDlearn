// `node lint.mjs <note.md>…` — the MDlearn checker as one file, for assistants that can run code but
// have no mdlearn install (the Claude.ai skill). Prints `file:line:col CODE rule: message`; exit 1 on errors.
// `--pin` first writes each card's id into the file, before changing a lesson someone has studied.
import { readFileSync, writeFileSync } from 'node:fs'
import { compile, formatDiagnostic, isWidget, pinIds } from '@mdlearn/core'

const args = process.argv.slice(2), pin = args.includes('--pin')
const files = args.filter((a) => a !== '--pin')
if (!files.length) { console.log('usage: node lint.mjs [--pin] <note.md>…'); process.exit(2) }
if (pin) for (const f of files) {
  const source = readFileSync(f, 'utf8'), pinned = pinIds(source, f)
  if (pinned !== source) writeFileSync(f, pinned)
}
let errors = 0, warnings = 0
for (const f of files) {
  const { lesson, diagnostics } = compile(readFileSync(f, 'utf8'), { path: f })
  for (const d of diagnostics.filter((x) => !x.code.startsWith('I'))) console.log(`${f}:${formatDiagnostic(d)}`)
  errors += diagnostics.filter((d) => d.code.startsWith('E')).length
  warnings += diagnostics.filter((d) => d.code.startsWith('W')).length
  if (lesson) console.log(`${f}: ${lesson.cards.flatMap((c) => c.blocks).filter(isWidget).length} exercises`)
}
console.log(`${errors} error(s), ${warnings} warning(s)`)
process.exit(errors ? 1 : 0)
