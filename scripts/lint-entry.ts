// `node lint.mjs <file.learn.md>…` — the MDlearn checker as one file, for assistants that can run code but
// have no mdlearn install (the Claude.ai skill). Prints `file:line:col CODE rule: message`; exit 1 on errors.
import { readFileSync } from 'node:fs'
import { compile, formatDiagnostic } from '@mdlearn/core'

const files = process.argv.slice(2)
if (!files.length) { console.log('usage: node lint.mjs <file.learn.md>…'); process.exit(2) }
let errors = 0, warnings = 0
for (const f of files) {
  const { lesson, diagnostics } = compile(readFileSync(f, 'utf8'), { path: f })
  for (const d of diagnostics.filter((x) => !x.code.startsWith('I'))) console.log(`${f}:${formatDiagnostic(d)}`)
  errors += diagnostics.filter((d) => d.code.startsWith('E')).length
  warnings += diagnostics.filter((d) => d.code.startsWith('W')).length
  if (lesson) console.log(`${f}: ${lesson.cards.length} cards`)
}
console.log(`${errors} error(s), ${warnings} warning(s)`)
process.exit(errors ? 1 : 0)
