// AI jobs: one at a time (they share your subscription limits), streamed to the browser, cancellable,
// linted when they finish, and undoable (every file they touch is snapshotted first).
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { compileFile } from '@mdlearn/core/node'
import { writeAllowed, Snapshots } from './guard.js'
import type { AiEngine, JobEvent, JobSpec, JobStatus } from './engine.js'
import type { JobSummary } from '../../shared/types.js'
import type { EventBus } from '../bus.js'
import type { Handle } from '../workspaces.js'
import { UserError } from '../workspaces.js'

export type { JobSummary }
/** Files the server writes for a job before the engine starts (recorded and undoable like the engine's own writes). */
export type PreWrite = (write: (abs: string, content: string, replace?: boolean) => void) => void
interface Job extends JobSummary { spec: JobSpec; events: JobEvent[]; ctl: AbortController; handle: Handle; engineImpl: AiEngine; after?: () => JobSummary['changes']; preWrite?: PreWrite }
const MAX_EVENTS = 1500
const posix = (p: string) => p.split(sep).join('/')

export class JobManager {
  private jobs = new Map<string, Job>()
  private chain: Promise<unknown> = Promise.resolve()
  constructor(private bus: EventBus) {}

  /** A job's folder; ids are UUIDs (anything else could point outside .mdlearn/jobs). */
  dirOf(h: Handle, id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new UserError('not-found', 'No such job.')
    return join(h.root, '.mdlearn', 'jobs', id)
  }
  /** Queue a job. `preWrite` may create files (e.g. lesson scaffolds) under the job's snapshot, so undo removes them. */
  start(h: Handle, engine: AiEngine, spec: Omit<JobSpec, 'id' | 'root'>, opts: { preWrite?: PreWrite; after?: () => JobSummary['changes']; parent?: string } = {}): JobSummary {
    const id = randomUUID()
    const job: Job = {
      id, ws: h.id, recipe: spec.recipe, title: spec.title, status: 'queued', engine: engine.name, created: Date.now(), files: [], lint: [],
      spec: { ...spec, id, root: h.root }, events: [], ctl: new AbortController(), handle: h, engineImpl: engine, ...(opts.preWrite ? { preWrite: opts.preWrite } : {}), ...(opts.after ? { after: opts.after } : {}), ...(opts.parent ? { parent: opts.parent } : {}),
    }
    this.jobs.set(id, job)
    this.announce(job)
    this.chain = this.chain.then(() => this.run(job)).catch(() => {})
    return this.summary(job)
  }
  get(h: Handle, id: string): (JobSummary & { events: JobEvent[]; prompt: string }) | null {
    const j = this.jobs.get(id)
    if (j && j.ws === h.id) return { ...this.summary(j), events: j.events, prompt: j.spec.prompt }
    const f = join(this.dirOf(h, id), 'job.json')
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null
  }
  list(h: Handle): JobSummary[] {
    const live = [...this.jobs.values()].filter((j) => j.ws === h.id).map((j) => this.summary(j))
    const dir = join(h.root, '.mdlearn', 'jobs')
    const saved = existsSync(dir) ? readdirSync(dir).filter((id) => !this.jobs.has(id) && existsSync(join(dir, id, 'job.json'))).map((id) => {
      try { const { events: _e, prompt: _p, ...s } = JSON.parse(readFileSync(join(dir, id, 'job.json'), 'utf8')); return s as JobSummary } catch { return null }
    }).filter((x): x is JobSummary => !!x) : []
    return [...live, ...saved].sort((a, b) => b.created - a.created).slice(0, 50)
  }
  cancel(h: Handle, id: string): boolean {
    const j = this.jobs.get(id)
    if (!j || j.ws !== h.id || (j.status !== 'queued' && j.status !== 'running')) return false
    j.ctl.abort()
    if (j.status === 'queued') this.setStatus(j, 'cancelled')
    return true
  }
  undo(h: Handle, id: string) {
    const j = this.get(h, id)
    if (!j) throw new UserError('not-found', 'No such job.')
    if (j.status === 'running' || j.status === 'queued') throw new UserError('busy', 'Stop the job before undoing it.')
    const r = Snapshots.undo(this.dirOf(h, id), h.root)
    const live = this.jobs.get(id)
    if (live) { live.undone = true; this.persist(live); this.announce(live) }
    else { const f = join(this.dirOf(h, id), 'job.json'); writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, 'utf8')), undone: true })) }
    this.bus.publish({ type: 'tree.changed', ws: h.id })
    return r
  }

  private async run(job: Job) {
    if (job.status === 'cancelled') return
    const dir = this.dirOf(job.handle, job.id)
    mkdirSync(dir, { recursive: true })
    const snaps = new Snapshots(dir, job.handle.root)
    const files = new Map<string, 'created' | 'modified'>()
    const emit = (e: JobEvent) => {
      job.events.push(e)
      if (job.events.length > MAX_EVENTS) job.events.splice(0, job.events.length - MAX_EVENTS)
      if (e.kind === 'file') { files.set(e.path, files.get(e.path) ?? e.change); job.files = [...files].map(([path, change]) => ({ path, change })) }
      if (e.kind === 'session') job.sessionId = e.sessionId
      this.bus.publish({ type: 'job.event', ws: job.ws, jobId: job.id, event: e })
    }
    const beforeWrite = (abs: string): 'allow' | string => {
      const refused = writeAllowed(abs, job.spec.writeScope, job.spec.keepOut)
      if (refused) { emit({ kind: 'denied', tool: 'Write', reason: `${posix(relative(job.handle.root, abs))}: ${refused}` }); return refused }
      const existed = existsSync(abs)
      snaps.take(abs)
      emit({ kind: 'file', path: posix(relative(job.handle.root, abs)), change: existed ? 'modified' : 'created' })
      return 'allow'
    }
    this.setStatus(job, 'running')
    try {
      job.preWrite?.((abs, content, replace) => {
        if (beforeWrite(abs) !== 'allow') throw new Error(`Refused to prepare ${abs}.`)
        mkdirSync(dirname(abs), { recursive: true })
        writeFileSync(abs, content, replace ? {} : { flag: 'wx' })
      })
      const r = await job.engineImpl.run(job.spec, { emit, signal: job.ctl.signal, beforeWrite })
      job.summary = r.summary
      if (r.sessionId) job.sessionId = r.sessionId
      snaps.seal()
      this.lintTouched(job, emit)
      if (job.after) job.changes = job.after()
      this.setStatus(job, job.ctl.signal.aborted ? 'cancelled' : r.ok ? 'done' : 'failed')
    } catch (e) {
      snaps.seal()
      job.error = job.ctl.signal.aborted ? 'Stopped.' : (e as Error).message
      this.setStatus(job, job.ctl.signal.aborted ? 'cancelled' : 'failed')
    } finally {
      this.bus.publish({ type: 'tree.changed', ws: job.ws })
    }
  }
  /** Check every lesson the job touched with the compiler, whatever the AI claimed. */
  private lintTouched(job: Job, emit: (e: JobEvent) => void) {
    job.lint = []
    for (const f of job.files.filter((x) => x.path.endsWith('.learn.md'))) {
      const abs = join(job.handle.root, f.path)
      if (!existsSync(abs)) continue
      const d = compileFile(abs).diagnostics
      const row = { path: f.path, errors: d.filter((x) => x.code.startsWith('E')).length, warnings: d.filter((x) => x.code.startsWith('W')).length }
      job.lint.push(row)
      emit({ kind: 'lint', ...row })
    }
  }
  private setStatus(job: Job, status: JobStatus) {
    job.status = status
    if (status === 'done' || status === 'failed' || status === 'cancelled') job.finished = Date.now()
    this.persist(job)
    this.announce(job)
  }
  private persist(job: Job) {
    const dir = this.dirOf(job.handle, job.id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'job.json'), JSON.stringify({ ...this.summary(job), events: job.events, prompt: job.spec.prompt }))
  }
  private announce(job: Job) { this.bus.publish({ type: 'job', ws: job.ws, job: this.summary(job) }) }
  private summary(j: Job): JobSummary {
    const { spec: _s, events: _e, ctl: _c, handle: _h, engineImpl: _i, preWrite: _p, after: _a, ...rest } = j
    return rest
  }
}
