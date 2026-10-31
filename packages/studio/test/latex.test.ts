import { describe, it, expect } from 'vitest'
import { mkdtempSync, cpSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, readdirSync, symlinkSync, lstatSync, utimesSync } from 'node:fs'
import { join, resolve, delimiter } from 'node:path'
import { tmpdir } from 'node:os'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { Latex, chooseRun, commandFor, copyProject, envFor, fakeEngines, fakeRunner, findEngines, installHelp, magicProgram, parseTexLog, spawnRunner, type Runner } from '../server/latex'
import { texDocs, texRoot } from '../server/latex-files'
import type { FileInfo, TexResult, TexStatus, Tree } from '../shared/types'

const fixture = resolve(__dirname, '../../core/test/fixtures/curriculum')
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
const PAPER = '\\documentclass{article}\n\\title{Speckle \\emph{notes}}\n\\begin{document}\n\\maketitle\nHello $x^2$.\n\\end{document}\n'

function setup(latex = new Latex({ runner: fakeRunner, engines: fakeEngines, cacheDir: tmp('mdl-texcache-') })) {
  const root = tmp('mdl-tex-'); cpSync(fixture, root, { recursive: true })
  mkdirSync(join(root, 'paper/chapters'), { recursive: true })
  writeFileSync(join(root, 'paper/main.tex'), PAPER)
  writeFileSync(join(root, 'paper/chapters/one.tex'), '% !TEX root = ../main.tex\n\\section{One}\n')
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  const workspaces = new Workspaces(settings)
  const app = createApp({ version: 't', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus: new EventBus(), serverId: 't', latex })
  const h = workspaces.open(root)
  const headers = { host: 'localhost:1' }
  const get = (p: string) => app.request(p.startsWith('/api/w/') || p.startsWith('/api/latex') ? p : `/api/w/${h.id}${p}`, { headers })
  const post = (p: string, body: unknown) => app.request(`/api/w/${h.id}${p}`, { method: 'POST', body: JSON.stringify(body), headers: { ...headers, 'content-type': 'application/json', 'x-mdl': '1' } })
  return { root, get, post }
}

describe('reading a TeX log', () => {
  it('finds errors in the -file-line-error, classic and Tectonic forms, with a hint, and warnings with their line', () => {
    const log = [
      './main.tex:12: Undefined control sequence.', 'l.12 \\foo',
      '! Missing $ inserted.', '<inserted text>', '                $', 'l.20 x^',
      'error: chapters/one.tex:3: LaTeX Error: File `nope.sty\' not found.',
      'LaTeX Warning: Reference `fig:a\' on page 1 undefined on input line 31.',
      'Package hyperref Warning: Token not allowed in a PDF string (Unicode):', '(hyperref)                removing `math shift\' on input line 44.',
      'Overfull \\hbox (12.3pt too wide) in paragraph at lines 50--52',
      'warning: main.tex:60: Underfull \\hbox (badness 10000) in paragraph at lines 60--61',
      'error: the main input file was not found', './main.tex:12: Undefined control sequence.', 'error: main.tex:20: Missing $ inserted',
    ].join('\n')
    const p = parseTexLog(log)
    expect(p.filter((x) => x.severity === 'error')).toEqual([
      { severity: 'error', file: 'main.tex', line: 12, message: 'Undefined control sequence.', hint: 'undefined-command' },
      { severity: 'error', line: 20, message: 'Missing $ inserted.', hint: 'math-mode', file: 'main.tex' }, // the engine's copy adds the file
      { severity: 'error', file: 'chapters/one.tex', line: 3, message: 'LaTeX Error: File `nope.sty\' not found.', hint: 'missing-file' },
      { severity: 'error', message: 'the main input file was not found' },
    ]) // repeated errors are listed once
    expect(p.filter((x) => x.severity === 'warning').map((x) => [x.line, x.message.slice(0, 30)])).toEqual([
      [31, 'LaTeX Warning: Reference `fig:'], [44, 'Package hyperref Warning: Toke'], [50, 'Overfull \\hbox (12.3pt too wid'], [60, 'Underfull \\hbox (badness 10000'],
    ])
  })
  it('shows a real Tectonic error once, without the engine\'s own wrapper messages', () => {
    // captured from Tectonic 0.17 on a document with \textbff on line 4
    const log = ['! Undefined control sequence.', 'l.4 \\textbff', 'error: broken.tex:4: Undefined control sequence',
      'error: something bad happened inside XeTeX; its output follows:', '! Undefined control sequence.', 'l.4 \\textbff', 'error: the XeTeX engine had an unrecoverable error'].join('\n')
    expect(parseTexLog(log)).toEqual([{ severity: 'error', line: 4, message: 'Undefined control sequence.', hint: 'undefined-command', file: 'broken.tex' }])
    // alone, a wrapper message is all there is to show
    expect(parseTexLog('error: the XeTeX engine had an unrecoverable error')).toHaveLength(1)
  })
})

describe('choosing and running an engine', () => {
  const tl = [{ id: 'latexmk', version: 'Latexmk, John Collins, 7 Apr. 2024. Version 4.85' }, { id: 'pdflatex', version: '' }, { id: 'xelatex', version: '' }] as const
  it('prefers what the file asks for, then Tectonic, then TeX Live; nothing when no engine is there', () => {
    expect(magicProgram('% !TEX program = XeLaTeX\n\\documentclass{article}')).toBe('xelatex')
    expect(magicProgram('\\documentclass{article}')).toBeNull()
    expect(chooseRun([...tl, { id: 'tectonic', version: '' }], 'xelatex')).toEqual({ engine: 'latexmk', program: 'xelatex' })
    expect(chooseRun([...tl, { id: 'tectonic', version: '' }], null)).toEqual({ engine: 'tectonic', program: null })
    expect(chooseRun([...tl], null)).toEqual({ engine: 'latexmk', program: 'pdflatex' })
    expect(chooseRun([{ id: 'lualatex', version: '' }], 'xelatex')).toEqual({ engine: 'lualatex', program: 'lualatex' })
    expect(chooseRun([], null)).toBeNull()
    // an old latexmk may read a project's latexmkrc (Perl) before it sees -norc: the program then runs directly
    expect(chooseRun([{ id: 'latexmk', version: 'Latexmk, John Collins, 2021. Version 4.76' }, { id: 'pdflatex', version: '' }], null)).toEqual({ engine: 'pdflatex', program: 'pdflatex' })
  })
  it('never turns shell escape on, and keeps TeX Live inside the folder and the output folder', () => {
    for (const run of [{ engine: 'tectonic', program: null }, { engine: 'latexmk', program: 'lualatex' }, { engine: 'pdflatex', program: 'pdflatex' }] as const) {
      const { args } = commandFor(run, 'main.tex', '/out')
      expect(args.join(' ')).not.toMatch(/(^| )-shell-escape|enable-write18|-Z shell-escape/)
      expect(args.at(-1)).toBe('./main.tex') // a file named "-x.tex" is never an option
      expect(args.some((a) => a.includes('/out'))).toBe(true)
      if (run.engine === 'tectonic') expect(args).toContain('--untrusted'); else expect(args).toContain('-no-shell-escape')
      if (run.engine === 'latexmk') expect(args[0]).toBe('-norc') // a project's latexmkrc is Perl code
    }
    expect(envFor('/out', { LATEXMKRCSYS: '/x/rc' })).toEqual({ shell_escape: 'f', openin_any: 'p', openout_any: 'p', TEXMFOUTPUT: '/out', TECTONIC_UNTRUSTED_MODE: '1' })
  })
  it('suggests how to install an engine on this kind of computer', () => {
    expect(installHelp('linux', { ID: 'arch' }).command).toBe('sudo pacman -S tectonic')
    expect(installHelp('linux', { ID: 'linuxmint', ID_LIKE: 'ubuntu debian' }).command).toMatch(/^sudo apt install/)
    expect(installHelp('darwin', {}).command).toBe('brew install tectonic')
    expect(installHelp('win32', {})).toEqual({ command: null, url: expect.stringContaining('tectonic') })
  })
  it.skipIf(process.platform === 'win32')('runs a real engine program from the PATH, in the file\'s folder, writing only to the output folder', async () => {
    const bin = tmp('mdl-texbin-')
    // a stand-in "tectonic": checks its rules, then writes a PDF and a log where it was told to
    writeFileSync(join(bin, 'tectonic'), `#!/bin/sh
if [ "$1" = "--version" ]; then echo "Tectonic 0.17.0"; exit 0; fi
[ "$TECTONIC_UNTRUSTED_MODE" = "1" ] || exit 9
out=""; prev=""; for a in "$@"; do [ "$prev" = "--outdir" ] && out="$a"; prev="$a"; done
[ -f main.tex ] || exit 8
printf '%%PDF-1.4 stand-in' > "$out/main.pdf"; echo "Output written" > "$out/main.log"; echo "note: done"
`)
    chmodSync(join(bin, 'tectonic'), 0o755)
    const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` }
    expect(findEngines(env).map((e) => e.id)).toContain('tectonic')
    const { root, post, get } = setup(new Latex({ env, cacheDir: tmp('mdl-texcache-'), runner: spawnRunner }))
    const r = await (await post('/latex/compile', { path: 'paper/main.tex' })).json() as TexResult
    expect(r).toMatchObject({ ok: true, engine: 'tectonic', problems: [] })
    expect(readdirSync(join(root, 'paper')).sort()).toEqual(['chapters', 'main.tex']) // nothing written beside the source
    expect(Buffer.from(await (await get('/latex/pdf?path=paper/main.tex')).arrayBuffer()).toString()).toBe('%PDF-1.4 stand-in')
  })
  it('stops a compiler that runs too long, or writes too much', async () => {
    const r = await spawnRunner({ cmd: process.execPath, args: ['-e', 'setTimeout(() => {}, 60000)'], cwd: tmpdir(), env: process.env, timeoutMs: 200 })
    expect(r.timedOut).toBe(true)
    const dir = tmp('mdl-texout-')
    const big = await spawnRunner({ cmd: process.execPath, args: ['-e', `const fs=require('fs');setInterval(()=>fs.appendFileSync('big.log','x'.repeat(1<<20)),20)`], cwd: dir, env: process.env, timeoutMs: 20_000, watch: { dir, bytes: 4 << 20 } })
    expect(big).toMatchObject({ tooBig: true, timedOut: false })
  })
  it('reads a log with huge crafted lines quickly', () => {
    const t = Date.now()
    const p = parseTexLog(`! LaTeX Error: ${'File `'.repeat(70_000)}\n${'Environment '.repeat(30_000)}`)
    expect(Date.now() - t).toBeLessThan(300)
    expect(p[0].message.length).toBeLessThanOrEqual(301)
  })
})

describe('LaTeX in the folder', () => {
  it('lists .tex files in the tree by their title, and opens and saves them in the editor', async () => {
    const { root, get, post } = setup()
    const tree = await (await get('/tree')).json() as Tree
    expect(tree.latex).toEqual([{ path: 'paper/chapters/one.tex', title: 'one' }, { path: 'paper/main.tex', title: 'Speckle notes' }])
    expect(texDocs(root)).toHaveLength(2)
    const f = await (await get('/file?path=paper/main.tex')).json() as FileInfo
    expect(f.kind).toBe('latex')
    expect((await post('/files/save', { path: 'paper/main.tex', text: `${PAPER}% edited\n`, baseMtime: f.mtime })).status).toBe(200)
    expect(readFileSync(join(root, 'paper/main.tex'), 'utf8')).toContain('% edited')
    expect((await post('/files/create', { path: 'paper/new.tex', text: PAPER })).status).toBe(200)
    expect((await post('/files/create', { path: 'paper/new.sh', text: 'x' })).status).toBe(403)
  })
  it('compiles to a PDF kept out of the folder, shows it, and saves it beside the file on request', async () => {
    const { root, get, post } = setup()
    const r = await (await post('/latex/compile', { path: 'paper/main.tex' })).json() as TexResult & { target: string }
    expect(r).toMatchObject({ ok: true, engine: 'tectonic', target: 'paper/main.tex', pdf: { size: expect.any(Number) } })
    expect(r.problems).toEqual([expect.objectContaining({ severity: 'warning', line: 3 })])
    expect(existsSync(join(root, 'paper/main.pdf'))).toBe(false)
    const pdf = await get('/latex/pdf?path=paper/main.tex')
    expect(pdf.headers.get('content-type')).toBe('application/pdf')
    expect(pdf.headers.get('content-security-policy')).toBe("object-src 'self'; frame-ancestors 'self'")
    expect((await pdf.text()).startsWith('%PDF-1.4')).toBe(true)
    expect((await get('/latex/pdf?path=paper/main.tex&download=1')).headers.get('content-disposition')).toBe("attachment; filename*=UTF-8''main.pdf")
    expect(await (await post('/latex/save-pdf', { path: 'paper/main.tex' })).json()).toEqual({ path: 'paper/main.pdf' })
    expect(readFileSync(join(root, 'paper/main.pdf'), 'latin1')).toContain('Speckle')
  })
  it('a chapter compiles its main file; an error comes back with its line; a file with no \\documentclass says what to do', async () => {
    const { root, post } = setup()
    expect(texRoot('% !TEX root = ../main.tex\n')).toBe('../main.tex')
    const r = await (await post('/latex/compile', { path: 'paper/chapters/one.tex' })).json() as TexResult & { target: string }
    expect(r.target).toBe('paper/main.tex')
    writeFileSync(join(root, 'paper/main.tex'), PAPER.replace('Hello', '\\oops Hello'))
    const bad = await (await post('/latex/compile', { path: 'paper/main.tex' })).json() as TexResult
    expect(bad.ok).toBe(false)
    expect(bad.problems[0]).toMatchObject({ severity: 'error', file: 'main.tex', line: 5, hint: 'undefined-command' })
    expect(bad.pdf).not.toBeNull() // the last good PDF stays on screen
    writeFileSync(join(root, 'paper/chapters/one.tex'), '\\section{One}\n')
    expect(((await (await post('/latex/compile', { path: 'paper/chapters/one.tex' })).json()) as { error: { code: string } }).error.code).toBe('not-main')
  })
  it('refuses paths outside the folder or not .tex, a second compile of the same file, and says when no engine is installed', async () => {
    const { post, get } = setup()
    const code = async (r: Promise<Response>) => ((await (await r).json()) as { error: { code: string } }).error.code
    expect(await code(post('/latex/compile', { path: '../etc/passwd.tex' }))).toBe('path')
    expect(await code(post('/latex/compile', { path: '00_FOUNDATIONS/04_radar.md' }))).toBe('path')
    expect((await get('/latex/pdf?path=paper/main.tex')).status).toBe(404) // nothing compiled yet
    let release = () => {}
    const slow = new Latex({ engines: fakeEngines, cacheDir: tmp('mdl-texcache-'), runner: (job) => new Promise((done) => { release = () => done(fakeRunner(job)) }) })
    const s = setup(slow)
    const first = s.post('/latex/compile', { path: 'paper/main.tex' })
    await new Promise((r) => setTimeout(r, 20))
    expect(((await (await s.post('/latex/compile', { path: 'paper/main.tex' })).json()) as { error: { code: string } }).error.code).toBe('busy')
    release()
    expect((await first).status).toBe(200)
    const none = setup(new Latex({ engines: () => [], cacheDir: tmp('mdl-texcache-') }))
    expect(((await (await none.post('/latex/compile', { path: 'paper/main.tex' })).json()) as { error: { code: string } }).error.code).toBe('no-engine')
    const st = await (await none.get('/api/latex/status')).json() as TexStatus
    expect(st).toMatchObject({ engines: [], chosen: null, install: { url: expect.any(String) } })
  })
})

describe('a .tex file from anywhere cannot touch the notes folder', () => {
  it('the engine works on a copy: no hidden files, no latexmkrc, no link leading out of the folder', async () => {
    const outside = tmp('mdl-outside-'); writeFileSync(join(outside, 'secret.txt'), 'private key')
    const { root, post } = setup(new Latex({ engines: fakeEngines, cacheDir: tmp('mdl-texcache-'), runner: (async (job) => {
      const seen = readdirSync(job.cwd).sort()
      // what a hostile document could try: overwrite its source and a note beside it
      writeFileSync(join(job.cwd, 'main.tex'), 'clobbered'); writeFileSync(join(job.cwd, 'notes.md'), 'clobbered')
      writeFileSync(join(outDirOf(job.args), 'main.pdf'), '%PDF-1.4'); return { code: 0, output: seen.join(','), timedOut: false }
    }) satisfies Runner }))
    const dir = join(root, 'paper')
    writeFileSync(join(dir, 'notes.md'), 'mine'); writeFileSync(join(dir, 'latexmkrc'), 'system("touch /tmp/pwned")'); writeFileSync(join(dir, '.latexmkrc'), 'x')
    mkdirSync(join(dir, '.git')); writeFileSync(join(dir, '.git', 'config'), 'x')
    symlinkSync(join(outside, 'secret.txt'), join(dir, 'secret.txt'))
    symlinkSync(join(root, '00_FOUNDATIONS'), join(dir, 'shared')) // a link inside the folder is fine
    const r = await (await post('/latex/compile', { path: 'paper/main.tex' })).json() as TexResult
    expect(r.ok).toBe(true)
    expect(r.log.trim().split(',')).toEqual(['chapters', 'main.tex', 'notes.md', 'shared'])
    expect(readFileSync(join(dir, 'main.tex'), 'utf8')).toBe(PAPER)
    expect(readFileSync(join(dir, 'notes.md'), 'utf8')).toBe('mine')
  })
  it('copies what a document folder holds, and counts it', () => {
    expect(copyProject(join(fixture, '00_FOUNDATIONS'), fixture, join(tmp('mdl-copy-'), 'src'))).toBeGreaterThan(0)
  })
  it('saving the PDF replaces a paper.pdf link instead of writing through it', async () => {
    const outside = tmp('mdl-outside-'); writeFileSync(join(outside, 'bashrc'), 'mine')
    const { root, post } = setup()
    symlinkSync(join(outside, 'bashrc'), join(root, 'paper/main.pdf'))
    await post('/latex/compile', { path: 'paper/main.tex' })
    expect((await post('/latex/save-pdf', { path: 'paper/main.tex' })).status).toBe(200)
    expect(readFileSync(join(outside, 'bashrc'), 'utf8')).toBe('mine')
    expect(lstatSync(join(root, 'paper/main.pdf')).isSymbolicLink()).toBe(false)
  })
  it('one PDF per file however its path is spelled; two compiles at most at once; old work folders are cleared', async () => {
    const { get, post } = setup()
    await post('/latex/compile', { path: 'paper/./chapters/../main.tex' })
    expect((await get('/latex/pdf?path=paper/main.tex')).status).toBe(200)
    const waiting: (() => void)[] = []
    const cacheDir = tmp('mdl-texcache-')
    const slow = setup(new Latex({ engines: fakeEngines, cacheDir, runner: (job) => new Promise((done) => { waiting.push(() => done(fakeRunner(job))) }) }))
    writeFileSync(join(slow.root, 'paper/b.tex'), PAPER); writeFileSync(join(slow.root, 'paper/c.tex'), PAPER)
    const two = [slow.post('/latex/compile', { path: 'paper/main.tex' }), slow.post('/latex/compile', { path: 'paper/b.tex' })]
    await new Promise((r) => setTimeout(r, 30))
    expect(((await (await slow.post('/latex/compile', { path: 'paper/c.tex' })).json()) as { error: { message: string } }).error.message).toMatch(/Another document/)
    waiting.forEach((w) => w())
    await Promise.all(two)
    mkdirSync(join(cacheDir, 'ws1', 'run-old'), { recursive: true }); mkdirSync(join(cacheDir, 'ws1', 'run-now'))
    utimesSync(join(cacheDir, 'ws1', 'run-old'), new Date(0), new Date(0))
    new Latex({ engines: fakeEngines, cacheDir })
    expect(readdirSync(join(cacheDir, 'ws1'))).toEqual(['run-now'])
  })
})

function outDirOf(args: string[]) { return args[args.indexOf('--outdir') + 1] }

const hasTectonic = findEngines().some((e) => e.id === 'tectonic')
describe.skipIf(!hasTectonic)('with the Tectonic installed on this computer', () => {
  const real = () => setup(new Latex({ cacheDir: tmp('mdl-texcache-') }))
  it('compiles a document, reports an error at its line, and compiles a chapter\'s main file', async () => {
    const { root, post, get } = real()
    const ok = await (await post('/latex/compile', { path: 'paper/main.tex' })).json() as TexResult
    expect(ok).toMatchObject({ ok: true, engine: 'tectonic' })
    expect(Buffer.from(await (await get('/latex/pdf?path=paper/main.tex')).arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-')
    writeFileSync(join(root, 'paper/broken.tex'), '\\documentclass{article}\n\\begin{document}\nFine.\n\\textbff{x}\n\\end{document}\n')
    const bad = await (await post('/latex/compile', { path: 'paper/broken.tex' })).json() as TexResult
    expect(bad.ok).toBe(false)
    expect(bad.problems.filter((p) => p.severity === 'error')).toEqual([expect.objectContaining({ line: 4, hint: 'undefined-command', file: 'broken.tex' })])
    const chapter = await (await post('/latex/compile', { path: 'paper/chapters/one.tex' })).json() as TexResult & { target: string }
    expect(chapter).toMatchObject({ ok: true, target: 'paper/main.tex' })
  }, 180_000)
})
