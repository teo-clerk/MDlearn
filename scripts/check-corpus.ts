// Read-only regression gate: parse every Markdown document of a curriculum in document mode and report
// problems that would show up in the reader (unclosed math, escaped dollars, raw $$, errors) and timing.
// Usage: tsx scripts/check-corpus.ts <root> [--verbose]
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { parseDocument, type DocBlock } from '../packages/core/src/index.js'
import { workspace, sourceDocs } from '../packages/core/src/node.js'

const root = process.argv[2]
if (!root) { console.error('usage: tsx scripts/check-corpus.ts <root> [--verbose]'); process.exit(2) }
const verbose = process.argv.includes('--verbose')
const ws = workspace(root)
const docs = sourceDocs(ws)
const times: number[] = []
const count = (code: string, ds: { code: string }[]) => ds.filter((d) => d.code === code).length
const walk = (bs: DocBlock[], f: (b: DocBlock) => void) => { for (const b of bs) { f(b); if (b.type === 'details') walk(b.children, f) } }
let totals = { errors: 0, e109: 0, i808: 0, i820: 0, details: 0, rawDollars: 0, math: 0 }
for (const abs of docs) {
  const rel = relative(ws.root, abs)
  const src = readFileSync(abs, 'utf8')
  const t = performance.now()
  const d = parseDocument(src, { path: rel })
  times.push(performance.now() - t)
  let details = 0, raw = 0, math = 0
  walk(d.blocks, (b) => {
    if (b.type === 'details') details++
    const json = JSON.stringify(b)
    math += (json.match(/"type":"(inline)?[mM]ath"/g) ?? []).length
    // literal $$ in text nodes (not code) means a display-math block was lost
    if (b.type === 'prose' && b.node.type !== 'code') raw += (json.match(/"type":"text","value":"[^"]*\$\$/g) ?? []).length
  })
  const errors = d.diagnostics.filter((x) => x.code.startsWith('E'))
  const row = { e: errors.length, e109: count('E109', d.diagnostics), i808: count('I808', d.diagnostics), i820: count('I820', d.diagnostics), details, raw, math }
  totals = { errors: totals.errors + row.e, e109: totals.e109 + row.e109, i808: totals.i808 + row.i808, i820: totals.i820 + row.i820, details: totals.details + details, rawDollars: totals.rawDollars + raw, math: totals.math + math }
  if (verbose || row.e || row.raw || row.i820) console.log(`${rel}: ${JSON.stringify(row)}${row.e ? ' ' + errors.slice(0, 3).map((x) => `${x.code}@${x.line} ${x.message ?? ''}`).join(' | ') : ''}`)
}
const sorted = [...times].sort((a, b) => a - b)
const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]?.toFixed(0)
console.log(`${docs.length} documents · ${totals.math} formulas · ${totals.details} details folded · errors ${totals.errors} · E109 ${totals.e109} · I808 ${totals.i808} · I820 ${totals.i820} · literal $$ ${totals.rawDollars}`)
console.log(`parse ms: p50 ${pct(0.5)} · p95 ${pct(0.95)} · max ${pct(1)}`)
process.exitCode = totals.e109 || totals.rawDollars ? 1 : 0
