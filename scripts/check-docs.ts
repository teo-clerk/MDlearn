// Extracts every ```markdown / ~~~~markdown block from the docs and compiles it.
import { readFileSync } from 'node:fs'
import { compile } from '../packages/core/src/compile.ts'
import { severityOf } from '../packages/core/src/registry.ts'
let bad = 0, n = 0
for (const path of process.argv.slice(2)) {
  const doc = readFileSync(path, 'utf8')
  const re = /^(```|~~~~?)markdown\n([\s\S]*?)^\1\s*$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(doc))) {
    n++
    const body = m[2]
    const src = body.startsWith('---\n') ? body : `---\ntitle: Example\n---\n## Card\n${body}`
    const line = doc.slice(0, m.index).split('\n').length
    const { lesson, diagnostics } = compile(src)
    const notable = diagnostics.filter((d) => severityOf(d.code) !== 'info')
    const marker = /<!-- invalid: ([A-Z0-9 ]+) -->\s*$/.exec(doc.slice(Math.max(0, m.index - 200), m.index))
    if (marker) { // invalid examples must produce exactly the documented codes (compiled as-is)
      const got = compile(body).diagnostics.map((d) => d.code).join(' ')
      if (got !== marker[1].trim()) { bad++; console.log(`${path}:${line} expected ${marker[1]} got ${got}`) }
      continue
    }
    if (!lesson || notable.length) {
      bad++; console.log(`${path}:${line}`, notable.map((d) => `${d.code}@${d.line}${d.message ? ' ' + d.message : ''}`).join(', ') || 'no lesson')
    }
  }
}
console.log(`${n} examples, ${bad} with errors/warnings`)
process.exit(bad ? 1 : 0)
