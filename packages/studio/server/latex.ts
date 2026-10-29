// LaTeX: .tex files written in the editor, compiled to PDF by a TeX engine on this computer — Tectonic (one
// program, fetches the packages a document needs) or TeX Live's latexmk / pdflatex / xelatex / lualatex.
// A .tex file may come from anywhere, so the engine never touches the notes folder: it runs on a private copy of
// the document's folder (regular files only, no hidden files, no latexmkrc, no link leading out of the notes
// folder), with shell escape off, and only the PDF and the log are kept, in the user's cache. TeX Live also gets
// kpathsea's paranoid rules (no absolute paths, no "..", no dot files) and latexmk never reads an rc file (Perl).
// Compiling needs the `write` capability: this computer, or LAN devices under --lan-full.
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { closeSync, constants, copyFileSync, existsSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { basename, dirname, join, sep } from 'node:path'
import { IGNORED_DIRS } from '@mdlearn/core/node'
import type { Handle } from './workspaces.js'
import { UserError } from './workspaces.js'
import { TEX_FILE } from './latex-files.js'
import { distroIs, osRelease } from './system.js'
import type { TexEngine, TexEngineId, TexHint, TexProblem, TexProgram, TexResult, TexStatus } from '../shared/types.js'

const TIMEOUT_MS = 180_000 // Tectonic's first run downloads the packages a document needs
const MAX_PDF = 100 * 1024 * 1024
const MAX_LOG = 400_000
const MAX_PROBLEMS = 60
const MAX_LINE = 2000, MAX_MESSAGE = 300 // log lines come from the document: keep the matching linear and short
const MAX_RUNNING = 2
const MAX_COPY_FILES = 3000, MAX_COPY_BYTES = 300 * 1024 * 1024
const MAX_OUTPUT = 500 * 1024 * 1024 // what an engine may write before it is stopped
const LATEXMK_NORC = 4077 // -norc is honoured from latexmk 4.77; an older one may read a project's latexmkrc first
const PROBES: Record<TexEngineId, string[]> = { tectonic: ['--version'], latexmk: ['-v'], pdflatex: ['--version'], xelatex: ['--version'], lualatex: ['--version'] }
const PROGRAMS: TexProgram[] = ['pdflatex', 'xelatex', 'lualatex']
const LATEXMK_FLAG: Record<TexProgram, string> = { pdflatex: '-pdf', xelatex: '-pdfxe', lualatex: '-pdflua' }
const TEX_FLAGS = ['-interaction=nonstopmode', '-halt-on-error', '-file-line-error', '-no-shell-escape']

export interface Run { engine: TexEngineId; program: TexProgram | null }
export interface Job { cmd: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number; watch?: { dir: string; bytes: number } }
export interface JobResult { code: number | null; output: string; timedOut: boolean; tooBig?: boolean }
export type Runner = (job: Job) => Promise<JobResult>

/** `% !TEX program = xelatex` in the first lines picks the TeX Live program, as TeXShop, VS Code and Overleaf do. */
export function magicProgram(text: string): TexProgram | null {
  const m = /^%\s*!\s*TEX\s+(?:TS-)?program\s*=\s*(pdflatex|xelatex|lualatex)\b/im.exec(text.split('\n', 30).join('\n'))
  return m ? (m[1].toLowerCase() as TexProgram) : null
}

/** latexmk only when it is recent enough to skip rc files for sure. */
const latexmkSafe = (engines: TexEngine[]) => {
  const v = /Version\s+(\d+)\.(\d+)/i.exec(engines.find((e) => e.id === 'latexmk')?.version ?? '')
  return !!v && Number(v[1]) * 1000 + Number(v[2]) >= LATEXMK_NORC
}

/** Which engine compiles: the program a file asks for when TeX Live has it, else Tectonic, else TeX Live's pdflatex. */
export function chooseRun(engines: TexEngine[], asked: TexProgram | null): Run | null {
  const has = (id: TexEngineId) => engines.some((e) => e.id === id)
  const via = (program: TexProgram): Run => ({ engine: latexmkSafe(engines) ? 'latexmk' : program, program })
  if (asked && has(asked)) return via(asked)
  if (has('tectonic')) return { engine: 'tectonic', program: null }
  const program = PROGRAMS.find(has)
  return program ? via(program) : null
}

/** The command line; the file goes as ./name so a name starting with "-" is never read as an option. */
export function commandFor(run: Run, file: string, outDir: string): { cmd: string; args: string[] } {
  const input = `./${file}`
  if (run.engine === 'tectonic') return { cmd: 'tectonic', args: ['--untrusted', '--keep-logs', '--chatter', 'minimal', '--outdir', outDir, input] }
  // -norc: a latexmkrc is Perl, run by latexmk — never read one
  if (run.engine === 'latexmk') return { cmd: 'latexmk', args: ['-norc', LATEXMK_FLAG[run.program!], ...TEX_FLAGS, `-outdir=${outDir}`, input] }
  return { cmd: run.engine, args: [...TEX_FLAGS, `-output-directory=${outDir}`, input] }
}

/** No shell escape, and (TeX Live) no reading or writing outside the copy and the output folder. */
export function envFor(outDir: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const { LATEXMKRCSYS: _rc, ...env } = base // a system latexmkrc named by the environment is not read either
  return { ...env, shell_escape: 'f', openin_any: 'p', openout_any: 'p', TEXMFOUTPUT: outDir, TECTONIC_UNTRUSTED_MODE: '1' }
}

/**
 * The document's folder, copied for the engine: regular files only (a link is followed only to a file inside the
 * notes folder), no hidden files or folders, no latexmkrc. Returns the bytes copied; refuses a folder too big.
 */
export function copyProject(src: string, root: string, dest: string): number {
  const realRoot = realpathSync(root)
  const inside = (p: string) => p === realRoot || p.startsWith(realRoot + sep)
  let files = 0, bytes = 0
  const visit = (from: string, to: string, depth: number) => {
    mkdirSync(to, { recursive: true })
    for (const name of readdirSync(from)) {
      if (name.startsWith('.') || name === 'latexmkrc' || IGNORED_DIRS.has(name)) continue
      let real: string
      try { real = realpathSync(join(from, name)) } catch { continue } // a dangling link
      if (!inside(real)) continue
      const st = statSync(real)
      if (st.isDirectory()) { if (depth < 8) visit(join(from, name), join(to, name), depth + 1); continue }
      if (!st.isFile()) continue
      files++; bytes += st.size
      if (files > MAX_COPY_FILES || bytes > MAX_COPY_BYTES) throw new UserError('too-large', 'The folder of this document holds too much to compile (over 3,000 files or 300 MB). Keep the LaTeX project in a folder of its own.')
      copyFileSync(real, join(to, name))
    }
  }
  visit(src, dest, 0)
  return bytes
}

/** The end of a file, at most `max` bytes (an engine can write a huge log). */
function tail(f: string, max = MAX_LOG): string {
  let fd: number
  try { fd = openSync(f, 'r') } catch { return '' }
  try {
    const size = fstatSync(fd).size, len = Math.min(size, max)
    const buf = Buffer.alloc(len)
    readSync(fd, buf, 0, len, size - len)
    return buf.toString('utf8')
  } finally { closeSync(fd) }
}
function sizeOf(dir: string): number {
  let n = 0
  try { for (const e of readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? sizeOf(join(dir, e.name)) : e.isFile() ? statSync(join(dir, e.name)).size : 0 } catch { /* removed meanwhile */ }
  return n
}

const HINTS: [RegExp, TexHint][] = [
  [/Undefined control sequence/i, 'undefined-command'],
  [/Missing \$ inserted|allowed only in math mode/i, 'math-mode'],
  [/File `[^']+' not found|can't find file|not found in bundle/i, 'missing-file'],
  [/Missing \} inserted|Extra \}|Missing \{ inserted|Runaway argument|File ended while scanning/i, 'braces'],
  [/Environment \S+ undefined/i, 'undefined-environment'],
  [/\\begin\{\S+\} on input line \d+ ended by \\end|ended by \\end\{/i, 'begin-end'],
  [/Misplaced alignment tab character &/i, 'alignment'],
]
const hintOf = (message: string): TexHint | undefined => HINTS.find(([re]) => re.test(message))?.[1]
const clean = (f: string) => f.replace(/^\.\//, '')

/** Errors and warnings from a TeX log (TeX Live with -file-line-error, the classic "! … l.12" form, or Tectonic). */
export function parseTexLog(log: string): TexProblem[] {
  const lines = log.split(/\r?\n/)
  const out: TexProblem[] = []
  const seen = new Map<string, number>()
  // the log and the engine's own output often report the same error, one of them with the file name
  const add = (found: TexProblem) => {
    const p = found.message.length > MAX_MESSAGE ? { ...found, message: `${found.message.slice(0, MAX_MESSAGE)}…` } : found
    const key = `${p.severity}:${p.line ?? ''}:${p.message.replace(/\.$/, '').toLowerCase()}`
    const at = seen.get(key)
    if (at !== undefined) { if (p.file && !out[at].file) out[at] = { ...out[at], file: p.file }; return }
    if (out.length >= MAX_PROBLEMS) return
    seen.set(key, out.length)
    const hint = p.severity === 'error' ? hintOf(p.message) : undefined
    out.push(hint ? { ...p, hint } : p)
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].slice(0, MAX_LINE)
    let m = /^(error|warning): (\S[^:]*?\.(?:tex|sty|cls|bib|ltx)):(\d+): (.+)$/.exec(l)
    if (m) { add({ severity: m[1] as 'error' | 'warning', file: clean(m[2]), line: Number(m[3]), message: m[4].trim() }); continue }
    m = /^(\S[^:]*?\.(?:tex|sty|cls|ltx)):(\d+): (.+)$/.exec(l)
    if (m) { add({ severity: 'error', file: clean(m[1]), line: Number(m[2]), message: m[3].trim() }); continue }
    m = /^! (.+)$/.exec(l)
    if (m) {
      const at = lines.slice(i + 1, i + 12).map((x) => /^l\.(\d+)/.exec(x)).find(Boolean)
      add({ severity: 'error', message: m[1].trim(), ...(at ? { line: Number(at[1]) } : {}) })
      continue
    }
    m = /^((?:LaTeX|Package \S+|Class \S+) Warning: .+)$/.exec(l)
    if (m) {
      // continuation lines start with "(package)" spaces; the input line may be on any of them
      let text = m[1]
      for (let j = i + 1; j < Math.min(lines.length, i + 8) && /^\(\S+\)\s|^\s{4,}\S/.test(lines[j].slice(0, MAX_LINE)); j++) text += ` ${lines[j].slice(0, MAX_LINE).replace(/^\(\S+\)\s+/, '').trim()}`
      const at = /on input line (\d+)/.exec(text)
      add({ severity: 'warning', message: text.replace(/\s*on input line \d+\.?/, '').trim(), ...(at ? { line: Number(at[1]) } : {}) })
      continue
    }
    m = /^((?:Over|Under)full \\[hv]box .*?)(?: (?:in paragraph|detected|has occurred while \\output is active))? at lines? (\d+)/.exec(l)
    if (m) { add({ severity: 'warning', message: m[1].trim(), line: Number(m[2]) }); continue }
    m = /^error: (.+)$/.exec(l)
    if (m) add({ severity: 'error', message: m[1].trim() })
  }
  // Tectonic wraps a real error in two of its own ("something bad happened inside XeTeX…"): keep them only alone
  return out.some((p) => p.severity === 'error' && p.line !== undefined) ? out.filter((p) => !(p.line === undefined && WRAPPER.test(p.message))) : out
}
const WRAPPER = /something bad happened inside|engine had an unrecoverable error|halted on potentially-recoverable error/i

/** How to get an engine on this computer (shown when none is found). */
export function installHelp(os = platform(), release = osRelease()): TexStatus['install'] {
  const url = 'https://tectonic-typesetting.github.io/en-US/install.html'
  if (os === 'darwin') return { command: 'brew install tectonic', url }
  if (os !== 'linux') return { command: null, url }
  if (distroIs(release, 'arch')) return { command: 'sudo pacman -S tectonic', url }
  if (distroIs(release, 'fedora')) return { command: 'sudo dnf install tectonic', url }
  if (distroIs(release, 'debian', 'ubuntu')) return { command: 'sudo apt install texlive-latex-extra latexmk', url }
  return { command: null, url }
}

export function findEngines(env: NodeJS.ProcessEnv = process.env): TexEngine[] {
  return (Object.keys(PROBES) as TexEngineId[]).flatMap((id) => {
    const r = spawnSync(id, PROBES[id], { env, timeout: 5000, encoding: 'utf8', windowsHide: true })
    if (r.error || r.status !== 0) return []
    const first = `${r.stdout}\n${r.stderr}`.split('\n').map((s) => s.trim()).find(Boolean) ?? ''
    return [{ id, version: first.slice(0, 80) }]
  })
}

/** Runs a TeX engine as its own process group, so a timeout also stops what latexmk started. */
export const spawnRunner: Runner = (job) => new Promise((resolve) => {
  let output = ''
  let timedOut = false
  const p = spawn(job.cmd, job.args, { cwd: job.cwd, env: job.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let tooBig = false
  const keep = (b: Buffer) => { output = (output + b.toString('utf8')).slice(-MAX_LOG) }
  p.stdout.on('data', keep); p.stderr.on('data', keep)
  const stop = () => { try { process.kill(-p.pid!, 'SIGKILL') } catch { p.kill('SIGKILL') } }
  const timer = setTimeout(() => { timedOut = true; stop() }, job.timeoutMs)
  const watch = job.watch ? setInterval(() => { if (sizeOf(job.watch!.dir) > job.watch!.bytes) { tooBig = true; stop() } }, 500) : undefined
  const done = () => { clearTimeout(timer); clearInterval(watch) }
  p.on('error', (e) => { done(); resolve({ code: null, output: `${output}\n${e.message}`, timedOut, tooBig }) })
  p.on('close', (code) => { done(); resolve({ code, output, timedOut, tooBig }) })
})

export interface LatexOptions { runner?: Runner; engines?: () => TexEngine[]; cacheDir?: string; env?: NodeJS.ProcessEnv; maxOutput?: number }

export class Latex {
  private readonly runner: Runner
  private readonly probe: () => TexEngine[]
  private readonly cacheDir: string
  private readonly env: NodeJS.ProcessEnv
  private readonly maxOutput: number
  private known: { at: number; engines: TexEngine[] } | null = null
  private readonly running = new Set<string>()

  constructor(o: LatexOptions = {}) {
    this.env = o.env ?? process.env
    this.runner = o.runner ?? spawnRunner
    this.probe = o.engines ?? (() => findEngines(this.env))
    this.cacheDir = o.cacheDir ?? join(this.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'mdlearn', 'latex')
    this.maxOutput = o.maxOutput ?? MAX_OUTPUT
    this.sweep()
  }

  /** Work folders left by a server that stopped mid-compile (older than any compile can last). */
  private sweep() {
    const old = Date.now() - 2 * TIMEOUT_MS
    try {
      for (const ws of readdirSync(this.cacheDir)) {
        for (const d of readdirSync(join(this.cacheDir, ws)).filter((n) => n.startsWith('run-'))) {
          const p = join(this.cacheDir, ws, d)
          if (statSync(p).mtimeMs < old) rmSync(p, { recursive: true, force: true })
        }
      }
    } catch { /* no cache yet */ }
  }

  /** The engines on this computer, looked up again after a minute (or at once with `fresh`, after an install). */
  engines(fresh = false): TexEngine[] {
    if (fresh || !this.known || Date.now() - this.known.at > 60_000) this.known = { at: Date.now(), engines: this.probe() }
    return this.known.engines
  }

  status(fresh = false): TexStatus {
    const engines = this.engines(fresh)
    const run = chooseRun(engines, null)
    return { engines, chosen: run ? (run.program && run.engine !== 'tectonic' ? `${run.engine} (${run.program})` : run.engine) : null, install: installHelp() }
  }

  private outputOf(h: Handle, rel: string) {
    const dir = join(this.cacheDir, h.id)
    const stem = createHash('sha1').update(rel).digest('hex').slice(0, 16)
    return { dir, pdf: join(dir, `${stem}.pdf`), log: join(dir, `${stem}.log`) }
  }

  /** The last PDF compiled from this file, if any. */
  pdfOf(h: Handle, rel: string): string | null {
    const { pdf } = this.outputOf(h, rel)
    return existsSync(pdf) ? pdf : null
  }

  async compile(h: Handle, abs: string, rel: string): Promise<TexResult> {
    const key = `${h.id}:${rel}`
    if (this.running.has(key)) throw new UserError('busy', 'This document is already being compiled.')
    if (this.running.size >= MAX_RUNNING) throw new UserError('busy', 'Another document is being compiled. Try again when it is done.')
    const text = readFileSync(abs, 'utf8')
    if (!/\\documentclass/.test(text)) throw new UserError('not-main', 'This file has no \\documentclass. Compile the main file, or put "% !TEX root = main.tex" at the top of this one.')
    const asked = magicProgram(text)
    const run = chooseRun(this.engines(), asked)
    if (!run) throw new UserError('no-engine', 'No LaTeX engine was found on this computer. Install Tectonic or TeX Live, then try again.')
    this.running.add(key)
    const started = Date.now()
    const out = this.outputOf(h, rel)
    let work: string | null = null
    try {
      mkdirSync(out.dir, { recursive: true })
      work = mkdtempSync(join(out.dir, 'run-'))
      const src = join(work, 'src'), outDir = join(work, 'out')
      const copied = copyProject(dirname(abs), h.root, src)
      mkdirSync(outDir)
      const file = basename(abs)
      const { cmd, args } = commandFor(run, file, outDir)
      const job: Job = { cmd, args, cwd: src, env: envFor(outDir, this.env), timeoutMs: TIMEOUT_MS, watch: { dir: work, bytes: copied + this.maxOutput } }
      const logOf = () => tail(join(outDir, file.replace(TEX_FILE, '.log')))
      let r = await this.runner(job)
      // without latexmk, references and the table of contents need a second pass
      for (let pass = 1; pass < 3 && run.engine === run.program && r.code === 0 && /Rerun to get|Label\(s\) may have changed|Please rerun/.test(logOf()); pass++) r = await this.runner(job)
      const log = `${logOf()}\n${r.output}`.slice(-MAX_LOG)
      const problems = parseTexLog(log)
      if (r.timedOut) problems.unshift({ severity: 'error', message: `The compiler stopped after ${TIMEOUT_MS / 1000} seconds.`, hint: 'timeout' })
      if (r.tooBig) problems.unshift({ severity: 'error', message: `The compiler wrote more than ${Math.round(this.maxOutput / 1048576)} MB and was stopped.`, hint: 'timeout' })
      const made = join(outDir, file.replace(TEX_FILE, '.pdf'))
      const ok = r.code === 0 && !r.timedOut && !r.tooBig && existsSync(made)
      if (ok && statSync(made).size > MAX_PDF) throw new UserError('too-large', 'The PDF is larger than 100 MB.')
      if (ok) renameSync(made, out.pdf)
      writeFileSync(out.log, log)
      if (!ok && !problems.some((p) => p.severity === 'error')) problems.unshift({ severity: 'error', message: r.code === null && !r.timedOut ? `${cmd} could not be started.` : 'The compiler stopped without making a PDF. The log below says why.' })
      const pdf = existsSync(out.pdf) ? statSync(out.pdf) : null
      return { ok, engine: run.engine, ...(run.program ? { program: run.program } : {}), ms: Date.now() - started, pdf: pdf ? { size: pdf.size, at: Math.round(pdf.mtimeMs) } : null, problems, log: log.slice(-20_000) }
    } finally {
      this.running.delete(key)
      if (work) rmSync(work, { recursive: true, force: true })
    }
  }

  /**
   * Copies the last PDF next to the .tex file (paper.tex → paper.pdf), replacing an earlier copy. Written beside
   * it and renamed into place, so a paper.pdf that is a link is replaced, never followed.
   */
  savePdfNextTo(h: Handle, abs: string, rel: string): string {
    const pdf = this.pdfOf(h, rel)
    if (!pdf) throw new UserError('not-found', 'Compile the document first.')
    const dest = abs.replace(TEX_FILE, '.pdf')
    let isDir = false
    try { isDir = lstatSync(dest).isDirectory() } catch { /* not there yet */ }
    if (isDir) throw new UserError('path', 'A folder already has the name the PDF would get.')
    const tmp = `${dest}.${randomBytes(6).toString('hex')}.tmp`
    copyFileSync(pdf, tmp, constants.COPYFILE_EXCL)
    renameSync(tmp, dest)
    return rel.replace(TEX_FILE, '.pdf')
  }
}

/** A tiny one-page PDF (for the stand-in engine used by tests and demos). */
export function minimalPdf(text: string): Buffer {
  const safe = text.replace(/[\\()]/g, (c) => `\\${c}`).slice(0, 80)
  const stream = `BT /F1 24 Tf 72 720 Td (${safe}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets = objects.map((o, i) => { const at = body.length; body += `${i + 1} 0 obj\n${o}\nendobj\n`; return at })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

/**
 * The stand-in engine (tests, demos): a line with \oops is an undefined command; otherwise a one-page PDF with
 * the document's \title. It reads and writes like the real ones: the source in its folder, the output in --outdir.
 */
export const fakeRunner: Runner = async (job) => {
  const file = basename(job.args.at(-1)!)
  const outDir = job.args[job.args.indexOf('--outdir') + 1]
  const lines = readFileSync(join(job.cwd, file), 'utf8').split('\n')
  const bad = lines.findIndex((l) => l.includes('\\oops'))
  const log = (body: string) => writeFileSync(join(outDir, file.replace(TEX_FILE, '.log')), `This is the stand-in TeX engine\n${body}\n`)
  if (bad >= 0) { log(`./${file}:${bad + 1}: Undefined control sequence.\nl.${bad + 1} \\oops`); return { code: 1, output: `error: ${file}:${bad + 1}: Undefined control sequence`, timedOut: false } }
  const title = /\\title\{([^}]*)\}/.exec(lines.join('\n'))?.[1] ?? 'Document'
  writeFileSync(join(outDir, file.replace(TEX_FILE, '.pdf')), minimalPdf(title))
  log(`LaTeX Warning: Reference \`fig:none' on page 1 undefined on input line ${Math.min(lines.length, 3)}.\nOutput written on ${file.replace(TEX_FILE, '.pdf')} (1 page).`)
  return { code: 0, output: '', timedOut: false }
}
export const fakeEngines = (): TexEngine[] => [{ id: 'tectonic', version: 'Tectonic (stand-in for tests)' }]
