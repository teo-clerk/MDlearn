// A scripted engine for tests and `mdlearn studio --fake-ai`: behaves like a job that writes one valid
// lesson into its allowed folder, without calling any model.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import type { AiEngine, JobSpec, RunContext } from './engine.js'

export class FakeEngine implements AiEngine {
  name = 'Demo (no AI)'
  constructor(private delayMs = 60) {}
  async run(job: JobSpec, ctx: RunContext) {
    const wait = () => new Promise((r) => setTimeout(r, this.delayMs))
    ctx.emit({ kind: 'session', sessionId: `fake-${job.id}` })
    ctx.emit({ kind: 'tool', label: 'Reading the outline' })
    await wait()
    for (const scope of job.writeScope) {
      if (ctx.signal.aborted) return { ok: false, summary: 'Stopped.' }
      const file = scope.endsWith('.md') ? scope : join(scope, '01-demo.learn.md')
      if (ctx.beforeWrite(file) !== 'allow') continue
      ctx.emit({ kind: 'tool', label: `Writing ${relative(job.root, file)}`, path: relative(job.root, file) })
      mkdirSync(dirname(file), { recursive: true })
      const existing = existsSync(file) ? readFileSync(file, 'utf8') : ''
      writeFileSync(file, existing.includes('TODO') || !existing ? DEMO : existing.replace(/\s*$/, '\n') + EXTRA)
      await wait()
    }
    ctx.emit({ kind: 'text', text: 'Done: one card with a question.' })
    ctx.emit({ kind: 'usage', turns: 3, durationMs: this.delayMs * 3 })
    return { ok: true, summary: 'Wrote a demo lesson.' }
  }
}
const DEMO = `---
title: Demo lesson
level: beginner
goals:
  - Explain why received radar power falls as R^-4
---

## Two-way spreading

Power spreads over a sphere on the way out and again on the way back.

:::quiz
How does received power scale with range $R$?
- [x] $R^{-4}$
  > Right: $R^{-2}$ out and $R^{-2}$ back.
- [ ] $R^{-2}$
  > That is one way only; the echo spreads again on the way back.
:::
`
const EXTRA = `
## One more idea

:::cloze
Received power falls with the {{fourth}} power of range.
:::
`

/** The demo stand-in for a one-shot Claude answer (teach-back): the first key idea covered, the second partly, the rest missing. */
export async function fakeOnce(req: { system: string; prompt: string }): Promise<string> {
  const given = [...req.prompt.matchAll(/^(\d+)\. (.+)$/gm)].map((m) => Number(m[1]))
  const ideas = given.length ? given.map((index, k) => ({ index, verdict: k === 0 ? 'covered' : k === 1 ? 'partly' : 'missing', ...(k === 0 ? { evidence: 'your first sentence' } : {}) }))
    : [{ idea: 'What the section is about.', verdict: 'covered' }, { idea: 'Why it holds.', verdict: 'missing' }]
  return JSON.stringify({ ideas, misconceptions: [], followUp: 'Why does that happen?', feedback: 'A good start (demo answer). Add why it holds.' })
}
