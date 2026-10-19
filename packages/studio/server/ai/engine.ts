// The contract every AI engine fulfils for jobs that write files (Claude Code, or the scripted fake used
// in tests and demos). The job manager owns safety: every write goes through `beforeWrite`.
import type { JobEvent, JobStatus } from '../../shared/types.js'
export type { JobEvent, JobStatus }

export interface JobSpec {
  id: string
  root: string
  recipe: string
  title: string
  prompt: string
  /** Folders (absolute) the job may write into; only `.md` files. */
  writeScope: string[]
  maxTurns: number
  resume?: string
  /** Claude model alias for this job (defaults to the one in settings). */
  model?: string
}
export interface RunContext {
  emit(e: JobEvent): void
  signal: AbortSignal
  /** Called before any file write: 'allow', or the reason it is refused. Takes the undo snapshot. */
  beforeWrite(absPath: string): 'allow' | string
}
export interface AiEngine {
  name: string
  run(job: JobSpec, ctx: RunContext): Promise<{ ok: boolean; summary: string; sessionId?: string }>
}
