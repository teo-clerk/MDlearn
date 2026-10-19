// A course for many documents at once: the documents are processed one after another (each is an ordinary
// "create a course" job, so each can be watched and undone), the plan is saved beside the jobs, and a batch
// that was stopped — or interrupted by closing the program — resumes where it left off.
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { findDoc, loadDoc, scaffoldLessons } from '@mdlearn/core/node'
import type { Handle } from '../workspaces.js'
import { UserError } from '../workspaces.js'
import type { AiEngine } from './engine.js'
import type { JobManager } from './jobs.js'
import { createCourse } from './recipes.js'
import type { Batch, BatchCandidate, BatchDoc } from '../../shared/types.js'

const posix = (p: string) => p.split(sep).join('/')
const MODELS = new Set(['haiku', 'sonnet', 'opus'])
const dirOf = (h: Handle) => join(h.root, '.mdlearn', 'jobs')
const idOk = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)

export class BatchRunner {
  private live = new Map<string, { stop: boolean; promise: Promise<void> }>()
  constructor(private jobs: JobManager, private pollMs = 400) {}

  /** Documents that still lack lessons, with what building them would involve. */
  candidates(h: Handle, docPaths: string[]): BatchCandidate[] {
    const out: BatchCandidate[] = []
    for (const rel of docPaths) {
      const abs = findDoc(h.ws, rel)
      if (!abs) continue
      const plan = scaffoldLessons(h.ws, abs)
      const fresh = plan.filter((p) => p.content !== null).length
      if (!fresh) continue
      out.push({ path: rel, title: loadDoc(abs, h.root).outline.title || rel, words: loadDoc(abs, h.root).outline.words, lessons: fresh })
    }
    return out
  }

  private file(h: Handle, id: string) { if (!idOk(id)) throw new UserError('not-found', 'No such batch.'); return join(dirOf(h), `batch-${id}.json`) }
  private save(h: Handle, b: Batch) {
    mkdirSync(dirOf(h), { recursive: true })
    const f = this.file(h, b.id), tmp = `${f}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(b)); renameSync(tmp, f)
  }
  private read(h: Handle, id: string): Batch | null {
    const f = this.file(h, id)
    if (!existsSync(f)) return null
    const b = JSON.parse(readFileSync(f, 'utf8')) as Batch
    // saved as running but nothing is driving it any more (the program was closed): it is stopped
    if (b.status === 'running' && !this.live.has(b.id)) return { ...b, status: 'stopped', docs: b.docs.map((d) => (d.status === 'running' ? { ...d, status: 'pending' as const } : d)) }
    return b
  }
  get(h: Handle, id: string): Batch {
    const b = this.read(h, id)
    if (!b) throw new UserError('not-found', 'No such batch.')
    return b
  }
  list(h: Handle): Batch[] {
    const dir = dirOf(h)
    if (!existsSync(dir)) return []
    return readdirSync(dir).flatMap((f) => { const m = /^batch-([0-9a-f-]{36})\.json$/.exec(f); const b = m && this.read(h, m[1]); return b ? [b] : [] }).sort((a, b) => b.created - a.created).slice(0, 20)
  }

  start(h: Handle, engine: AiEngine, docs: string[], model = 'sonnet'): Batch {
    if (!MODELS.has(model)) throw new UserError('invalid', 'Choose haiku, sonnet or opus.')
    if ([...this.live.keys()].some((id) => this.read(h, id)?.status === 'running')) throw new UserError('busy', 'A batch is already running. Stop it first, or wait for it to finish.')
    const picked = this.candidates(h, [...new Set(docs)])
    if (!picked.length) throw new UserError('empty', 'None of these documents needs lessons (they all have them already).')
    const batch: Batch = { id: randomUUID(), created: Date.now(), model, status: 'running', docs: picked.map((p): BatchDoc => ({ ...p, status: 'pending' })) }
    this.save(h, batch)
    this.drive(h, engine, batch)
    return batch
  }
  resume(h: Handle, engine: AiEngine, id: string): Batch {
    const b = this.get(h, id)
    if (this.live.has(id)) return b
    if (!b.docs.some((d) => d.status === 'pending' || d.status === 'failed' || d.status === 'cancelled')) throw new UserError('empty', 'Nothing is left to do in this batch.')
    // a document whose job was cut short still has its unfinished lesson skeletons: take them back first (files you edited since are kept)
    for (const d of b.docs) if ((d.status === 'failed' || d.status === 'cancelled') && d.jobId) { try { this.jobs.undo(h, d.jobId) } catch { /* nothing to take back */ } }
    const next: Batch = { ...b, status: 'running', docs: b.docs.map((d) => (d.status === 'failed' || d.status === 'cancelled' ? { ...d, status: 'pending' as const, jobId: undefined } : d)) }
    this.save(h, next)
    this.drive(h, engine, next)
    return next
  }
  stop(h: Handle, id: string): Batch {
    const b = this.get(h, id)
    const run = this.live.get(id)
    if (run) {
      run.stop = true
      const cur = b.docs.find((d) => d.status === 'running' && d.jobId)
      if (cur?.jobId) this.jobs.cancel(h, cur.jobId)
    }
    return this.get(h, id)
  }
  /** Wait for the batch to settle (tests, shutdown). */
  async idle(id: string) { await this.live.get(id)?.promise }

  private drive(h: Handle, engine: AiEngine, batch: Batch) {
    const ctl = { stop: false, promise: Promise.resolve() }
    this.live.set(batch.id, ctl)
    ctl.promise = (async () => {
      try {
        for (const doc of batch.docs) {
          if (ctl.stop) break
          if (doc.status !== 'pending') continue
          let recipe
          try { recipe = createCourse(h, doc.path) } catch (e) {
            doc.status = (e as UserError).code === 'exists' ? 'skipped' : 'failed'; doc.note = (e as Error).message; this.save(h, batch); continue
          }
          const job = this.jobs.start(h, engine, { ...recipe.spec, model: batch.model }, recipe.preWrite ? { preWrite: recipe.preWrite } : {})
          doc.jobId = job.id; doc.status = 'running'; this.save(h, batch)
          let status = job.status
          while (status === 'queued' || status === 'running') {
            await new Promise((r) => setTimeout(r, this.pollMs))
            status = this.jobs.get(h, job.id)?.status ?? 'failed'
          }
          doc.status = status === 'done' ? 'done' : status === 'cancelled' ? 'cancelled' : 'failed'
          if (status === 'failed') doc.note = this.jobs.get(h, job.id)?.error ?? 'The job failed.'
          this.save(h, batch)
        }
        batch.status = ctl.stop || batch.docs.some((d) => d.status === 'cancelled') ? 'stopped' : 'done'
        if (batch.status === 'stopped') for (const d of batch.docs) if (d.status === 'running') d.status = 'pending'
      } catch (e) {
        batch.status = 'stopped'; batch.error = (e as Error).message
      } finally {
        this.live.delete(batch.id)
        this.save(h, batch)
      }
    })()
  }
}
export const relPath = (h: Handle, abs: string) => posix(relative(h.root, abs))
