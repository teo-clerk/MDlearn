// Python in the browser: one sandboxed frame (opaque origin, no network except its own server) holds a
// Pyodide Worker. Cells share one interpreter, like a notebook; runs go one at a time; a run that takes
// too long restarts the interpreter instead of freezing the page.
import { create } from 'zustand'
import { t } from '../i18n'

export interface RunOutput { stream: 'stdout' | 'stderr'; text: string }
export interface RunResult { output: RunOutput[]; figures: string[]; value: string | null; error: string | null; restarted?: boolean }
export interface CheckResult { passed: number; total: number; failures: { text: string; message?: string }[]; error: string | null }
export type PyState = 'idle' | 'starting' | 'running'
interface PyStatus { state: PyState; status: string; setState(state: PyState, status?: string): void }
export const usePython = create<PyStatus>((set) => ({ state: 'idle', status: '', setState: (state, status = '') => set({ state, status }) }))

const EXEC_LIMIT_MS = 30_000
const LOAD_LIMIT_MS = 240_000
type Msg = { type: string; id?: number; text?: string; message?: string; result?: string | null; figures?: string[]; results?: { ok: boolean; text: string; message?: string }[]; error?: string }

class Runtime {
  private frame: HTMLIFrameElement | null = null
  private booted: Promise<void> | null = null
  private nextId = 1
  private listener: ((m: Msg) => void) | null = null
  private chain: Promise<unknown> = Promise.resolve()

  private ensure(): Promise<void> {
    if (this.booted) return this.booted
    usePython.getState().setState('starting', t('Starting Python…'))
    this.booted = new Promise<void>((resolve, reject) => {
      const frame = document.createElement('iframe')
      frame.setAttribute('sandbox', 'allow-scripts')
      frame.title = t('Python runner')
      frame.setAttribute('aria-hidden', 'true')
      frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden'
      frame.src = '/sandbox/py.html'
      const onMessage = (e: MessageEvent) => {
        if (e.source !== frame.contentWindow) return
        const m = e.data as Msg
        if (m.type === 'frame-ready') frame.contentWindow!.postMessage({ type: 'start' }, '*')
        else if (m.type === 'ready') { usePython.getState().setState('idle'); resolve() }
        else if (m.type === 'status') { if (this.listener) this.listener(m); else usePython.getState().setState('starting', m.text) }
        else if (m.type === 'error' && m.id === -1) { this.teardown(); reject(new Error(m.message ?? t('Python could not start.'))) }
        else this.listener?.(m)
      }
      window.addEventListener('message', onMessage)
      ;(frame as HTMLIFrameElement & { __off?: () => void }).__off = () => window.removeEventListener('message', onMessage)
      document.body.appendChild(frame)
      this.frame = frame
    })
    this.booted.catch(() => undefined)
    return this.booted
  }
  private teardown() {
    const f = this.frame as (HTMLIFrameElement & { __off?: () => void }) | null
    f?.__off?.(); f?.remove()
    this.frame = null; this.booted = null; this.listener = null
    usePython.getState().setState('idle')
  }
  /** Throw the interpreter away (variables are lost). */
  restart() { this.teardown() }

  /** Send one request and collect its messages until `done`/`tests`/`error`; enforces the time limits. */
  private request(build: (id: number) => object, collect: (m: Msg, finish: (v: unknown) => void) => void): Promise<unknown> {
    const job = this.chain.then(async () => {
      await this.ensure()
      const id = this.nextId++
      return new Promise<unknown>((resolve, reject) => {
        let timer = setTimeout(() => lose(t('Python took too long to load.'), LOAD_LIMIT_MS), LOAD_LIMIT_MS)
        const finish = (v: unknown) => { clearTimeout(timer); this.listener = null; usePython.getState().setState('idle'); resolve(v) }
        const lose = (why: string, ms: number) => { this.teardown(); reject(Object.assign(new Error(`${why} ${t('Python was restarted; variables are gone.')}`), { restarted: true, ms })) }
        usePython.getState().setState('starting', t('Starting…'))
        this.listener = (m) => {
          if (m.type === 'status') {
            usePython.getState().setState(m.text === t('Running…') ? 'running' : 'starting', m.text)
            clearTimeout(timer)
            timer = setTimeout(() => lose(`This took longer than ${m.text === t('Running…') ? EXEC_LIMIT_MS / 1000 : LOAD_LIMIT_MS / 1000} seconds.`, 0), m.text === t('Running…') ? EXEC_LIMIT_MS : LOAD_LIMIT_MS)
            return
          }
          if (m.id !== undefined && m.id !== id && m.type !== 'stdout' && m.type !== 'stderr') return
          collect(m, finish)
        }
        this.frame!.contentWindow!.postMessage(build(id), '*')
      })
    })
    this.chain = job.catch(() => undefined)
    return job
  }

  /** Run a cell. Output arrives in `onOutput` as it is printed. */
  async run(code: string, onOutput?: (o: RunOutput) => void): Promise<RunResult> {
    const output: RunOutput[] = []
    try {
      return await this.request((id) => ({ type: 'run', id, code }), (m, finish) => {
        if (m.type === 'stdout' || m.type === 'stderr') { const o = { stream: m.type, text: m.text ?? '' } as RunOutput; output.push(o); onOutput?.(o) }
        else if (m.type === 'done') finish({ output, figures: m.figures ?? [], value: m.result ?? null, error: null })
        else if (m.type === 'error') finish({ output, figures: [], value: null, error: m.message ?? t('Python error') })
      }) as RunResult
    } catch (e) { return { output, figures: [], value: null, error: (e as Error).message, restarted: true } }
  }
  /** Run the learner's code, then the exercise's checks, each `assert` counted separately. */
  async check(code: string, tests: string): Promise<CheckResult> {
    try {
      return await this.request((id) => ({ type: 'tests', id, code, tests }), (m, finish) => {
        if (m.type === 'tests') {
          const r = m.results ?? []
          finish({ passed: r.filter((x) => x.ok).length, total: r.length, failures: r.filter((x) => !x.ok).map((x) => ({ text: x.text, message: x.message })), error: m.error ?? null })
        } else if (m.type === 'error') finish({ passed: 0, total: 0, failures: [], error: m.message ?? t('Python error') })
      }) as CheckResult
    } catch (e) { return { passed: 0, total: 0, failures: [], error: (e as Error).message } }
  }
}
export const python = new Runtime()
