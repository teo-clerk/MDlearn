// Studio's server for the desktop app: a child process running in Electron's own Node, so it behaves exactly as
// `mdlearn studio` does. The app waits for its address, logs what it prints, and stops it on quit (closing its
// stdin first, then the whole process group if it does not go).
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { readyUrl } from './rules'

const START_TIMEOUT_MS = 30_000
const STOP_GRACE_MS = 4000
const MAX_LOG = 5 * 1024 * 1024

export interface Sidecar { url: string; stop(): Promise<void> }
export interface SidecarOptions { entry: string; port: number; logFile: string; execPath?: string; timeoutMs?: number }

/** Appends to the log, keeping one older log when it grows past 5 MB. */
export function logger(file: string): (text: string) => void {
  mkdirSync(dirname(file), { recursive: true })
  return (text) => {
    try {
      if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) > MAX_LOG) renameSync(file, `${file}.1`)
      appendFileSync(file, text)
    } catch { /* logging never stops the app */ }
  }
}

export function startSidecar(o: SidecarOptions): Promise<Sidecar> {
  const log = logger(o.logFile)
  log(`\n--- ${new Date().toISOString()} starting ${o.entry}\n`)
  const token = randomBytes(16).toString('hex')
  const child = spawn(o.execPath ?? process.execPath, [o.entry], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', MDLEARN_PORT: String(o.port), MDLEARN_READY_TOKEN: token },
    stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true,
  })
  let output = ''
  const exited = new Promise<number | null>((done) => child.on('exit', (code) => { log(`--- server exited (${code})\n`); done(code) }))
  const stop = async () => {
    if (child.exitCode !== null) return
    child.stdin.end()
    const timer = setTimeout(() => {
      try { if (process.platform !== 'win32') process.kill(-child.pid!, 'SIGKILL'); else child.kill('SIGKILL') } catch { /* gone */ }
    }, STOP_GRACE_MS)
    await exited
    clearTimeout(timer)
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { void stop(); reject(new Error(`The Studio server did not start within ${(o.timeoutMs ?? START_TIMEOUT_MS) / 1000} seconds.`)) }, o.timeoutMs ?? START_TIMEOUT_MS)
    const onData = (b: Buffer) => {
      const text = b.toString('utf8')
      log(text)
      if (output.length < 64 * 1024) output += text
      const url = readyUrl(output, token)
      if (url) { clearTimeout(timer); resolve({ url, stop }) }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', (b: Buffer) => log(b.toString('utf8')))
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    void exited.then((code) => { clearTimeout(timer); reject(new Error(`The Studio server stopped while starting (exit code ${code}).`)) })
  })
}
