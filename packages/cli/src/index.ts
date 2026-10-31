#!/usr/bin/env node
// mdlearn — study from the terminal, and author lessons for MDlearn.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { formatDiagnostic, severityOf, sectionText, studyQueue, report, whenText, displayTitle, leeches, splitBundle, planBundle, fixMessage, type Lesson } from '@mdlearn/core'
import { compileFile, compileSource, inRoot, workspace, curriculumStatus, findDoc, loadDoc, planFor, loadLessons, lessonPaths, loadProgress, loadGoals, scaffoldLessons, type Workspace } from '@mdlearn/core/node'
import { outlineText } from './author.js'
import { reviewSession } from './session.js'
import { bold, dim, out, fail, plural, closest, wrap } from './ui.js'

const HELP = `mdlearn — study a curriculum with spaced repetition, and write its lessons.

Open the app
  studio [folder]        MDlearn Studio in your browser: read, study, and build courses with AI

Study
  review                 Start a study session: due cards first, then new ones
  queue                  What a session would contain right now
  report                 Cards seen, your accuracy, what is due, study streak

Read the curriculum
  status                 Every source document and how many lessons it has
  outline <doc>          A document's objectives and section map
  section <doc> <§>      The exact text of one section, e.g. section 04_sar 6.3

Write lessons
  plan <doc>             How a document would be split into lessons
  new <doc>              Create the planned lesson files (never overwrites)
  lint [file|folder]     Check lessons; shows errors and warnings (default: learn/)
  build <file>           Print a lesson as validated JSON
  errata                 Corrections to the source collected from lessons

Use MDlearn from other assistants
  setup                  How to add MDlearn to Claude Code, Claude.ai, ChatGPT or any chat
  prompt [--full]        Print the prompt for chats without tools (--full: the whole guide)
  import-chat <file|->   Save the lessons a chat wrote (checked first; prints a fix request)

Run "mdlearn <command> --help" for its options.
The curriculum root is the nearest folder with a learn/ folder, or --root <dir>, or $MDLEARN_ROOT.`

const COMMAND_HELP: Record<string, string> = {
  studio: `mdlearn studio [folder] [--port 4747] [--lan] [--lan-full] [--no-open]
  folder      A folder of Markdown notes to open (default: the current curriculum, if any)
  --port      Port to listen on (default 4747; the next free one is used if it is taken)
  --lan       Also share it on your network (study on your phone); prints a private link and QR code
  --lan-full  Let other devices also run AI jobs and open folders (off by default)
  --no-open   Do not open the browser
  --fake-ai   Run AI jobs with a scripted demo engine (no Claude needed)`,
  review: `mdlearn review [--scope f04] [--limit 10] [--new-cards 5] [--due]
  --scope      Only lessons whose id or title contains this text (ids look like f04-01-…)
  --limit      Maximum cards in this session (default 10)
  --new-cards  Maximum new cards (default 5); --due shows only cards that are due
During a session: ? = hint, s = show the answer, q = finish now.`,
  queue: 'mdlearn queue [--scope f04] [--limit 20] [--new-cards 5] [--json]',
  report: 'mdlearn report [--json]',
  status: `mdlearn status [filter] [--all] [--json]
  --all  Also list READMEs, MILESTONES and reference files`,
  outline: 'mdlearn outline <doc> [--json]   <doc> is a path or a unique fragment such as 04_sar',
  section: 'mdlearn section <doc> <§> [--max-words N]   § is a number (6.3), an anchor, or a title fragment',
  plan: 'mdlearn plan <doc> [--target 2500] [--json]   --target = source words per lesson',
  new: 'mdlearn new <doc> [--target 2500]   creates the planned files with one card per subsection',
  lint: `mdlearn lint [file|folder ...] [--verbose]
  Prints path:line:col CODE rule: message for errors (E) and warnings (W); --verbose adds notes (I).
  Exit code 1 when there are errors.`,
  build: 'mdlearn build <file> [-o out.json]',
  errata: 'mdlearn errata [--kind fix|added] [--json]',
  setup: 'mdlearn setup   prints the install steps for Claude Code, Claude.ai and other chats',
  prompt: `mdlearn prompt [--full]
  Prints the MDlearn prompt to paste into ChatGPT, Gemini, Claude.ai or a Custom GPT's instructions.
  --full prints the whole guide instead (to attach as a file). e.g. mdlearn prompt | wl-copy`,
  'import-chat': `mdlearn import-chat <file|-> [--to folder] [--root dir]
  Reads a chat's answer (a file, or - for stdin), splits it at its <!-- file: path --> lines, checks every
  lesson, and saves those without errors in a new course folder (never replacing a file).
  When something must be fixed, prints the message to paste back into the chat.`,
}

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: 'string' }, json: { type: 'boolean' }, verbose: { type: 'boolean' }, quiet: { type: 'boolean' }, all: { type: 'boolean' },
    o: { type: 'string' }, target: { type: 'string' }, limit: { type: 'string' }, scope: { type: 'string' }, 'max-words': { type: 'string' },
    'new-cards': { type: 'string' }, due: { type: 'boolean' }, kind: { type: 'string' }, help: { type: 'boolean', short: 'h' }, full: { type: 'boolean' }, to: { type: 'string' },
    port: { type: 'string' }, lan: { type: 'boolean' }, 'lan-full': { type: 'boolean' }, 'no-open': { type: 'boolean' }, dev: { type: 'boolean' }, 'fake-ai': { type: 'boolean' },
  },
})
const [cmd, ...args] = positionals

// `mdlearn lint | head` closes the pipe early: end quietly instead of printing a stack trace.
process.stdout.on('error', (e: NodeJS.ErrnoException) => { if (e.code === 'EPIPE') process.exit(0); throw e })

function findRoot(): string {
  if (opt.root) return resolve(opt.root)
  if (process.env.MDLEARN_ROOT) return resolve(process.env.MDLEARN_ROOT)
  for (let d = process.cwd(); ; d = dirname(d)) {
    if (existsSync(join(d, 'learn'))) return d
    if (dirname(d) === d) return process.cwd()
  }
}
const ws: Workspace = workspace(findRoot())
const needLearn = () => {
  if (!lessonPaths(ws).length) fail(`no lessons in ${ws.root}. Run inside a folder with lessons (e.g. ~/CODING/ESA-PROJECTS) or pass --root <dir>.`)
}
const doc = (ref?: string) => (ref && findDoc(ws, ref)) || fail(ref ? `no document matches "${ref}" in ${ws.root}. Try \`mdlearn status\` to list documents.` : 'which document? e.g. mdlearn outline 04_sar')

function lessonFiles(p: string): string[] {
  const abs = resolve(p)
  if (!existsSync(abs)) fail(`no such file or folder: ${p}`)
  if (statSync(abs).isFile()) return [abs]
  return readdirSync(abs, { recursive: true }).map(String).filter((f) => f.endsWith('.learn.md')).map((f) => join(abs, f)).sort()
}
const lessons = (): Lesson[] => loadLessons(ws).map((l) => l.lesson).filter((l): l is Lesson => !!l)

async function studio(): Promise<void> {
  const folder = args[0] ? resolve(args[0]) : lessonPaths(ws).length ? ws.root : undefined
  if (args[0] && !existsSync(folder!)) fail(`no such folder: ${args[0]}`)
  let mod: typeof import('@mdlearn/studio/server')
  try { mod = await import('@mdlearn/studio/server') } catch { return fail('MDlearn Studio is not installed or not built (npm run build).') }
  const port = opt.port ? Number(opt.port) : undefined
  if (port !== undefined && !(port > 0 && port < 65536)) fail('--port must be a number between 1 and 65535')
  const s = await mod.startStudio({ root: folder, port, lan: !!opt.lan || !!opt['lan-full'], lanFull: !!opt['lan-full'], open: !opt['no-open'], dev: !!opt.dev, fakeAi: !!opt['fake-ai'] })
  out(`${bold('MDlearn Studio')} is running at ${s.url}`)
  if (folder) out(dim(`Folder: ${folder}`))
  if (s.lanUrl) {
    out(`On your phone (same Wi-Fi), scan this or open: ${s.lanUrl}`)
    if (s.qr) out(s.qr)
    out(dim('Anyone with this link on your network can read and study these notes. Plain HTTP: use it on networks you trust.'))
  }
  out(dim('Press Ctrl+C to stop.'))
  const stop = async () => { await s.close(); process.exit(0) }
  process.on('SIGINT', stop); process.on('SIGTERM', stop)
  await new Promise(() => {}) // keep running until stopped
}

/** The files scripts/build-integrations.ts wrote next to MDlearn Studio. */
function integration(file: string): string {
  let dir: string
  try { dir = join(dirname(fileURLToPath(import.meta.resolve('@mdlearn/studio/server'))), '..', 'integrations') } catch { return fail('MDlearn Studio is not installed or not built (npm run build).') }
  const p = join(dir, file)
  return existsSync(p) ? p : fail(`${file} is missing; build MDlearn first (npm run build).`)
}
function setup(): void {
  const plugin = integration('claude-plugin')
  out(`${bold('Claude Code')} (any folder): install the plugin once
  claude plugin marketplace add "${plugin}"
  claude plugin install mdlearn@mdlearn
then: /mdlearn:course <topic> writes a checked course into the current folder; /mdlearn:study quizzes you.

${bold('Claude.ai')}: upload ${integration('mdlearn-skill.zip')}
under Settings → Capabilities → Skills, then ask "Make an MDlearn course on …".

${bold('ChatGPT, Gemini, any chat')}: paste the output of \`mdlearn prompt\` (or attach \`mdlearn prompt --full\`),
ask for a course, save its answer to a file and run \`mdlearn import-chat answer.md\`.`)
}
async function importChat(): Promise<void> {
  const src = args[0]
  if (!src) fail('which answer? e.g. mdlearn import-chat answer.md (or - to read stdin)')
  const text = src === '-' ? readFileSync(0, 'utf8') : existsSync(src) ? readFileSync(src, 'utf8') : fail(`no such file: ${src}`)
  const root = resolve(opt.root ?? process.cwd())
  let files
  try { files = splitBundle(text) } catch (e) { return fail((e as Error).message) }
  if (!files.length) fail('no lesson found in that answer.')
  let plan
  try { plan = planBundle(files, { folder: opt.to, exists: (rel) => existsSync(join(root, rel)) }) } catch (e) { return fail((e as Error).message) }
  const checked = plan.files.map((f) => {
    const abs = inRoot(root, f.target) ?? fail(`${f.target} is outside ${root}`)
    const diagnostics = f.target.endsWith('.learn.md') ? compileSource(f.content, abs).diagnostics : []
    return { ...f, abs, diagnostics, errors: diagnostics.filter((d) => severityOf(d.code) === 'error').length }
  })
  for (const f of checked) {
    const rel = relative(process.cwd(), f.abs)
    if (f.errors) { out(`✗ ${rel}: ${plural(f.errors, 'error')}, not saved`); continue }
    if (existsSync(f.abs)) { out(`– ${rel}: already exists, left as it is`); continue }
    mkdirSync(dirname(f.abs), { recursive: true })
    writeFileSync(f.abs, f.content, { flag: 'wx' })
    out(`✓ ${rel}`)
  }
  const fix = fixMessage(checked.map((f) => ({ path: f.path, diagnostics: f.diagnostics })))
  if (fix) { out(`\nPaste this into the chat:\n\n${fix}`); process.exitCode = 1 }
}

async function main(): Promise<void> {
  if (!cmd) return out(HELP)
  if (opt.help) return out(COMMAND_HELP[cmd] ?? HELP)
  switch (cmd) {
    case 'studio': return studio()
    case 'setup': return setup()
    case 'prompt': return out(readFileSync(integration(opt.full ? 'MDLEARN_GUIDE.md' : 'MDLEARN_PROMPT.md'), 'utf8').trimEnd())
    case 'import-chat': return importChat()
    case 'review': needLearn(); return reviewSession(ws, opt)
    case 'queue': {
      needLearn()
      const progress = loadProgress(ws)
      const q = studyQueue(lessons(), progress.reviews, { limit: Number(opt.limit ?? 20), newCards: opt.due ? 0 : Number(opt['new-cards'] ?? 5), scope: opt.scope, attempts: progress.attempts, suspended: new Set(loadGoals(ws).suspended) })
      if (opt.json) return out(JSON.stringify(q, null, 1))
      if (!q.length) return out(opt.scope ? `Nothing due and no new cards matching "${opt.scope}".` : 'Nothing due and no new cards.')
      for (const i of q) out(`${i.reason === 'due' ? `review (memory ~${Math.round((i.retrievability ?? 0) * 100)}%)` : 'new              '}  ${displayTitle(i.lessonTitle)} › ${displayTitle(i.cardTitle)}  ${dim(i.kind)}`)
      return
    }
    case 'report': {
      needLearn()
      const progress = loadProgress(ws)
      const r = report(lessons(), progress.reviews, Date.now(), progress.attempts)
      if (opt.json) return out(JSON.stringify(r, null, 1))
      if (!r.totals.seen) {
        out(`You have not studied any of the ${r.totals.cards} cards yet.`)
        out('Start with: mdlearn review   (or mdlearn review --scope f04 for one document)')
        return
      }
      const pct = (a: { answered: number; correct: number }) => (a.answered ? `${a.correct} of ${a.answered} right first time` : 'nothing yet')
      out(bold(`You have seen ${r.totals.seen} of ${r.totals.cards} cards · ${r.totals.due ? plural(r.totals.due, 'card') + ' due now' : 'nothing due now'}${r.nextDue ? ` · next review ${whenText(r.nextDue)}` : ''}`))
      out(`Your accuracy: today ${pct(r.accuracy.today)} · last 7 days ${pct(r.accuracy.last7Days)}`)
      out(`Study streak: ${plural(r.streak, 'day')}`)
      const goals = loadGoals(ws)
      const slipping = leeches(progress.reviews, progress.attempts, new Set(goals.suspended))
      if (slipping.length) {
        const titles = new Map<string, string>(lessons().flatMap((l) => l.cards.map((c): [string, string] => [`${l.id}/${c.id}`, `${displayTitle(c.title)} (${displayTitle(l.title)})`])))
        out()
        out(bold(`Cards that keep slipping (${slipping.length})`))
        for (const l of slipping.slice(0, 5)) out(wrap(`  ${titles.get(l.key) ?? l.key}  ${dim(`missed ${l.lapses} times${l.wrongAnswers.length ? ` · you answered ${l.wrongAnswers.map((w) => `"${w}"`).join(', ')}` : ''}`)}`))
        out(dim('  Open MDlearn Studio (mdlearn studio) to have the AI rewrite them, or set them aside.'))
      }
      for (const d of goals.deadlines) out(`Deadline ${d.label ? `"${d.label}" ` : ''}${d.date}${d.scope ? ` (${d.scope})` : ''}: see \`mdlearn studio\` for the daily pace.`)
      out()
      for (const l of r.lessons.filter((x) => x.seen)) {
        out(wrap(`${l.title}  ${dim(`${l.seen}/${l.cards} seen · ${l.due} due · memory ~${Math.round((l.predictedRecall ?? 0) * 100)}%`)}`))
      }
      out()
      out(dim('memory = the model\'s estimate that you would recall a seen card right now'))
      return
    }
    case 'status': {
      const rows = curriculumStatus(ws, args[0]).filter((r) => opt.all || !['readme', 'milestones', 'reference'].includes(r.kind))
      if (opt.json) return out(JSON.stringify(rows, null, 1))
      if (!rows.length) return out(args[0] ? `No documents match "${args[0]}".` : `No Markdown documents found in ${ws.root}.`)
      const state = (r: (typeof rows)[number]) => (!r.existing ? 'to do      ' : r.errors ? 'has errors ' : r.existing < r.planned ? 'in progress' : 'done       ')
      for (const r of rows) out(`${state(r)}  ${r.doc}  ${dim(`${r.existing}/${r.planned} lessons · ${r.cards} cards${r.errors ? ` · ${plural(r.errors, 'error')}` : ''}${r.warnings ? ` · ${plural(r.warnings, 'warning')}` : ''}`)}`)
      const done = rows.filter((r) => r.existing && !r.errors && r.existing >= r.planned).length
      out(dim(`${done} of ${rows.length} documents done · ${rows.reduce((n, r) => n + r.cards, 0)} cards${opt.all ? '' : ' · --all lists READMEs and reference files too'}`))
      return
    }
    case 'outline': {
      const { outline } = loadDoc(doc(args[0]), ws.root)
      return out(opt.json ? JSON.stringify(outline, null, 1) : outlineText(outline))
    }
    case 'section': {
      const abs = doc(args[0])
      const { outline, md } = loadDoc(abs, ws.root)
      if (!args[1]) fail(`which section? e.g. mdlearn section ${args[0]} ${outline.sections[0]?.num ?? '1'}`)
      const s = sectionText(md, outline, args[1], opt['max-words'] ? Number(opt['max-words']) : undefined)
      if (!s) fail(`no section "${args[1]}" in ${outline.path}. It has: ${outline.sections.filter((x) => x.depth === 2).map((x) => x.num ?? x.anchor).join(', ')}`)
      return out(s!.text + (s!.truncated ? `\n\n[… shortened to ${opt['max-words']} of ${s!.section.words} words]` : ''))
    }
    case 'plan': {
      const plan = planFor(ws, doc(args[0]), opt.target ? Number(opt.target) : undefined)
      if (opt.json) return out(JSON.stringify(plan, null, 1))
      for (const p of plan) out(`${p.exists ? 'exists ' : 'planned'}  ${relative(ws.root, p.path)}  ${dim(`§${p.sections.join(', §')} · ${p.words} words`)}`)
      return
    }
    case 'new': {
      for (const p of scaffoldLessons(ws, doc(args[0]), opt.target ? Number(opt.target) : undefined)) {
        if (p.content === null) { out(`kept     ${relative(ws.root, p.path)} (already exists)`); continue }
        mkdirSync(dirname(p.path), { recursive: true })
        writeFileSync(p.path, p.content)
        out(`created  ${relative(ws.root, p.path)}`)
      }
      return
    }
    case 'lint': {
      const files = args.length ? args.flatMap(lessonFiles) : lessonPaths(ws)
      if (!files.length) return out('No .learn.md files found.')
      let errors = 0, warnings = 0, notes = 0
      for (const f of files) {
        for (const d of compileFile(f).diagnostics) {
          const sev = severityOf(d.code)
          if (sev === 'error') errors++; else if (sev === 'warning') warnings++; else notes++
          if (sev === 'info' && !opt.verbose) continue
          out(`${relative(process.cwd(), f)}:${formatDiagnostic(d)}`)
        }
      }
      if (!opt.quiet) out(dim(`${plural(files.length, 'lesson')} checked · ${plural(errors, 'error')} · ${plural(warnings, 'warning')}${notes && !opt.verbose ? ` · ${plural(notes, 'note')} hidden (--verbose)` : ''}`))
      process.exitCode = errors ? 1 : 0
      return
    }
    case 'build': {
      const r = compileFile(resolve(args[0] ?? fail('which lesson? e.g. mdlearn build learn/…/01-intro.learn.md')))
      if (!r.lesson) fail(r.diagnostics.map(formatDiagnostic).join('\n'))
      const json = JSON.stringify(r.lesson, null, 1)
      if (opt.o) writeFileSync(opt.o, json); else out(json)
      return
    }
    case 'errata': {
      const kinds = opt.kind ? [opt.kind] : ['fix', 'added']
      const rows: { doc: string; section: string; kind: string; note: string; lesson: string }[] = []
      needLearn()
      for (const f of lessonPaths(ws)) {
        const src = readFileSync(f, 'utf8')
        const source = /^source:\s*(.+)$/m.exec(src)?.[1].trim()
        const doc = source ? relative(ws.root, resolve(dirname(f), source)) : '(notes)'
        let section = '—'
        for (const line of src.split('\n')) {
          const read = /^::read\[(.+)\]/.exec(line)
          if (read) section = read[1]
          for (const m of line.matchAll(/<!--\s*(fix|added):\s*([\s\S]*?)-->/g))
            if (kinds.includes(m[1])) rows.push({ doc, section, kind: m[1], note: m[2].trim(), lesson: relative(ws.root, f) })
        }
      }
      if (opt.json) return out(JSON.stringify(rows, null, 1))
      let last = ''
      for (const r of rows.sort((a, b) => a.doc.localeCompare(b.doc))) {
        if (r.doc !== last) { out(`\n## ${r.doc}`); last = r.doc }
        out(`- [${r.kind}] ${r.section}: ${r.note}`)
      }
      if (!rows.length) out('No annotations.')
      return
    }
    default: {
      const guess = closest(cmd, [...Object.keys(COMMAND_HELP)])
      fail(`unknown command "${cmd}".${guess ? ` Did you mean "mdlearn ${guess}"?` : ''} Run "mdlearn" for the list.`)
    }
  }
}
main().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)))
