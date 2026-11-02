#!/usr/bin/env node
// mdlearn MCP server — gives Claude exact access to a curriculum (outlines, sections), the authoring guide,
// lesson linting and saving, ready-made prompts (a course on any topic, with or without notes; companion
// lessons; a study session), and an FSRS-backed tutor whose questions never leak their answers.
// Config: MDLEARN_ROOT (folder, default the project folder or cwd), MDLEARN_LEARN_DIR (default "learn"),
// MDLEARN_READONLY=1 (no save_lesson: for hosts that guard writes themselves, such as MDlearn Studio).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  formatDiagnostic, sectionText, outlineDoc, studyQueue, locate, pose, check, hint, ratingFor, ratingWords, scheduleAfter, whenText, report, coursePrompt, courseChanges,
  type Lesson,
  isAssistantFile, isStudyNote,
} from '@mdlearn/core'
import {
  isStudyFile, workspace, relativePosix, curriculumStatus, findDoc, loadDoc, planFor, loadLessons, loadProgress, loadGoals, appendProgress, compileSource, compileFile, searchCurriculum, inRoot as insideRoot,
} from '@mdlearn/core/node'

// a plugin's .mcp.json may pass an unexpanded "${…}" when the host does not know the variable
const fromEnv = (v: string | undefined) => (v && !v.includes('${') ? v : undefined)
const ws = workspace(fromEnv(process.env.MDLEARN_ROOT) ?? fromEnv(process.env.CLAUDE_PROJECT_DIR) ?? process.cwd(), process.env.MDLEARN_LEARN_DIR ?? 'learn')
const readOnly = process.env.MDLEARN_READONLY === '1'
const server = new McpServer({ name: 'mdlearn', version: '1.6.1' })

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] })
const json = (v: unknown) => text(JSON.stringify(v, null, 1))
const error = (s: string) => ({ content: [{ type: 'text' as const, text: s }], isError: true })
const lessons = (): Lesson[] => loadLessons(ws).map((l) => l.lesson).filter((l): l is Lesson => !!l)
const inRoot = (p: string) => insideRoot(ws.root, p)
const RO = { readOnlyHint: true, openWorldHint: false }

// The authoring guide ships next to the server (plugin bundle: ./guide/<part>.md) or comes from the repo's docs.
const here = dirname(fileURLToPath(import.meta.url))
const GUIDE = {
  method: 'docs/AGENT_SKILL.md', spec: 'docs/DSL_SPECIFICATION.md', chat: 'docs/CHAT_PROMPT.md',
  visuals: 'skills/mdlearn-visuals/SKILL.md', tutor: 'skills/mdlearn-tutor/SKILL.md', curriculum: 'skills/mdlearn-curriculum/SKILL.md',
} as const
type GuidePart = keyof typeof GUIDE
function guide(part: GuidePart): string {
  for (const f of [join(here, 'guide', `${part}.md`), join(here, '..', '..', '..', GUIDE[part])])
    if (existsSync(f)) return readFileSync(f, 'utf8').replace(/^---\n[\s\S]*?\n---\n+/, '') // without skill frontmatter
  return `(The ${part} guide is not installed next to the mdlearn server.)`
}

// ------------------------------------------------------------------ curriculum (read-only)
server.registerTool('curriculum_status', {
  title: 'Curriculum status',
  description: 'List source documents of the curriculum with size, planned vs existing companion lessons, lint errors/warnings, cards and widgets. Use first to see what exists.',
  inputSchema: { filter: z.string().optional().describe('Substring of the document path, e.g. "00_FOUNDATIONS" or "04_sar"') },
  annotations: RO,
}, async ({ filter }) => json({ root: ws.root, learnDir: relativePosix(ws.root, ws.learnDir), docs: curriculumStatus(ws, filter) }))

server.registerTool('doc_outline', {
  title: 'Document outline',
  description: 'House-style metadata (title, time, difficulty, objectives, prerequisites, deliverable) and the full section tree (numbers, titles, word counts, roles, line ranges) of one source document. Cheap: read this instead of the whole document.',
  inputSchema: { doc: z.string().describe('Path relative to the curriculum root, or a unique file-name fragment such as "04_sar"') },
  annotations: RO,
}, async ({ doc }) => {
  const abs = findDoc(ws, doc)
  return abs ? json(loadDoc(abs, ws.root).outline) : error(`No unique document matches "${doc}".`)
})

server.registerTool('get_section', {
  title: 'Get section',
  description: 'Exact Markdown of one section of a source document (heading and all subsections). Use this to ground lessons and tutoring in the real text instead of memory.',
  inputSchema: {
    doc: z.string(), section: z.string().describe('Section number ("5.1", "§5.1", "A2"), anchor, or title fragment'),
    maxWords: z.number().int().positive().optional().describe('Truncate long sections at a paragraph boundary'),
  },
  annotations: RO,
}, async ({ doc, section, maxWords }) => {
  const abs = findDoc(ws, doc)
  if (!abs) return error(`No unique document matches "${doc}".`)
  const { outline, md } = loadDoc(abs, ws.root)
  const s = sectionText(md, outline, section, maxWords)
  if (!s) return error(`No section "${section}" in ${outline.path}. Sections: ${outline.sections.map((x) => x.num ?? x.anchor).join(', ')}`)
  return text(`<!-- ${outline.path} §${s.section.num ?? s.section.anchor}, lines ${s.section.startLine}–${s.section.endLine}${s.truncated ? `, truncated to ${maxWords} of ${s.section.words} words` : ''} -->\n${s.text}`)
})

server.registerTool('search_curriculum', {
  title: 'Search curriculum',
  description: 'Find sections whose title or text contains all query terms (case-insensitive). Returns document, section number, title and a snippet — use get_section to read one.',
  inputSchema: { query: z.string().min(2), filter: z.string().optional(), limit: z.number().int().positive().max(50).optional() },
  annotations: RO,
}, async ({ query, filter, limit }) => json(searchCurriculum(ws, query, { filter, limit })))

// ------------------------------------------------------------------ authoring
server.registerTool('plan_lessons', {
  title: 'Plan companion lessons',
  description: 'Split a source document into companion lessons (≈2,500 source words each): ids, target file paths, the `source:` value to put in frontmatter, covered sections, and whether the file exists.',
  inputSchema: { doc: z.string(), targetWords: z.number().int().positive().optional() },
  annotations: RO,
}, async ({ doc, targetWords }) => {
  const abs = findDoc(ws, doc)
  return abs ? json(planFor(ws, abs, targetWords).map((p) => ({ ...p, path: relativePosix(ws.root, p.path) }))) : error(`No unique document matches "${doc}".`)
})

server.registerTool('lint_lesson', {
  title: 'Lint lesson',
  description: 'Compile a lesson and return diagnostics as `line:col CODE rule: message` (E = must fix, W = should fix, I = info). Pass `path` for a file in the curriculum, or `content` plus the `path` it will be saved at (so ::read links resolve). Fix every E and W line, then lint again.',
  inputSchema: { path: z.string().describe('Lesson path relative to the curriculum root'), content: z.string().optional().describe('Unsaved lesson source; when omitted the file is read') },
  annotations: RO,
}, async ({ path, content }) => {
  const abs = inRoot(path)
  if (!abs) return error('Path must be inside the curriculum root.')
  const r = content !== undefined ? compileSource(content, abs) : existsSync(abs) ? compileFile(abs) : null
  if (!r) return error(`No such file: ${path}`)
  const errs = r.diagnostics.filter((d) => d.code.startsWith('E')).length
  const lines = r.diagnostics.map(formatDiagnostic)
  const cards = r.lesson?.cards.length ?? 0
  return text(`${errs ? `✗ ${errs} error(s)` : '✓ no errors'} · ${cards} cards\n${lines.join('\n') || '(no diagnostics)'}`)
})

server.registerTool('authoring_guide', {
  title: 'Authoring guide',
  description: 'How to write MDlearn courses: rich notes (.md with `study: true`) and short lessons (.learn.md). Read part "method" before writing: the shape of a note, everything MDlearn can show (formulas, plots, animations, diagrams, videos, code, coloured highlights, exercises), syntax with full examples, and the self-check list. Part "spec" lists the DSL specification sections; pass `section` (e.g. "8.12") to read one. Other parts: "visuals" (plots, formulas, animations, sims), "tutor" (running a study session), "curriculum" (converting many documents).',
  inputSchema: {
    part: z.enum(['method', 'spec', 'visuals', 'tutor', 'curriculum']).optional().describe('Default "method"'),
    section: z.string().optional().describe('With part "spec": a section number such as "8.3", or "all" for the whole specification'),
  },
  annotations: RO,
}, async ({ part = 'method', section }) => {
  if (part !== 'spec') return text(guide(part))
  const md = guide('spec')
  if (section === 'all') return text(md)
  const outline = outlineDoc(md, 'DSL_SPECIFICATION.md')
  if (section) {
    const s = sectionText(md, outline, section)
    return s ? text(s.text) : error(`No section "${section}" in the specification.`)
  }
  return text(`MDlearn DSL specification — ask for one section with section: "<number>".\n${outline.sections.map((x) => `${'  '.repeat(Math.max(0, (x.num?.split('.').length ?? 1) - 1))}${x.num ? `§${x.num} ` : ''}${x.title}`).join('\n')}`)
})

if (!readOnly) server.registerTool('save_lesson', {
  title: 'Save lesson',
  description: 'Lint a note or lesson and save it in this folder. `path` is a .md note with `study: true` in its frontmatter, a .learn.md lesson or a course.md overview; folders are created. Refuses files with lint errors (fix every E line it returns and save again) and existing files unless overwrite is true. When replacing a file, keep every `{#id}` on its headings: it ties that part to the student\'s progress, and the result reports any studied card that went missing. Never writes source documents.',
  inputSchema: {
    path: z.string().describe('Folder-relative path, e.g. "tides/01-why-tides.md" or "tides/course.md"'),
    content: z.string().max(400_000),
    overwrite: z.boolean().optional().describe('Replace an existing lesson file'),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ path, content, overwrite }) => {
  if (isAssistantFile(basename(path))) return error(`${basename(path)} gives instructions to coding assistants, so it can't hold a note. Choose another name.`)
  const overview = basename(path).toLowerCase() === 'course.md'
  const lesson = /\.learn\.md$/i.test(path) || (!overview && /\.md$/i.test(path) && isStudyNote(content))
  if (!lesson && !overview) return error('Only notes with `study: true` in their frontmatter, lesson files (*.learn.md) and course.md overviews can be saved.')
  const abs = inRoot(path)
  if (!abs) return error('Path must be inside this folder.')
  if (lesson && existsSync(abs) && !isStudyFile(abs)) return error(`${path} is the user's own document, and it stays as it is. Save the note under a new name.`)
  if (existsSync(abs) && (!overwrite || overview)) return error(overview ? `${path} already exists; edit it instead (an overview is never replaced, it may be the user's own file).` : `${path} already exists; pass overwrite: true to replace it.`)
  let summary = 'saved'
  if (lesson) {
    const r = compileSource(content, abs)
    const errs = r.diagnostics.filter((d) => d.code.startsWith('E'))
    const lines = r.diagnostics.filter((d) => !d.code.startsWith('I')).map(formatDiagnostic)
    if (errs.length || !r.lesson) return error(`✗ not saved: ${errs.length} error(s)\n${lines.join('\n')}`)
    summary = `✓ saved ${relativePosix(ws.root, abs)} · ${r.lesson.cards.length} cards${lines.length ? `\n${lines.join('\n')}` : ''}`
    const was = existsSync(abs) ? compileSource(readFileSync(abs, 'utf8'), abs).lesson : null
    if (was) summary += `\n${replacedReport(was, r.lesson)}`
  } else if (!content.trim()) return error('The overview is empty.')
  mkdirSync(dirname(abs), { recursive: true })
  const tmp = `${abs}.${process.pid}.tmp`
  try {
    writeFileSync(tmp, content.endsWith('\n') ? content : `${content}\n`)
    renameSync(tmp, abs)
  } catch (e) { rmSync(tmp, { force: true }); return error(`Could not save ${path}: ${(e as Error).message}`) }
  return text(lesson ? summary : `✓ saved ${relativePosix(ws.root, abs)}`)
})

/** What replacing a lesson did to the student's cards, so the AI can put back a card it should have kept. */
function replacedReport(was: Lesson, now: Lesson): string {
  const c = courseChanges([was], [now]), studied = new Set(loadProgress(ws).reviews.map((r) => r.key))
  const lost = c.removed.filter((x) => studied.has(x.key))
  return `${c.kept} cards kept their progress · ${c.added.length} new · ${c.removed.length} removed`
    + (lost.length ? `\nStudied cards no longer in this lesson (their progress is cut off): ${lost.map((x) => `"${x.title}" {#${x.key.split('/')[1]}}`).join(', ')}. If a card was only rewritten, put that id back on its heading.` : '')
}

// ------------------------------------------------------------------ tutor
server.registerTool('study_queue', {
  title: 'Study queue',
  description: 'What to study now: due cards (lowest recall first, interleaved across lessons) then new cards in curriculum order. Each item has a widgetId to pass to present_item.',
  inputSchema: {
    limit: z.number().int().positive().max(50).optional(), newCards: z.number().int().min(0).max(20).optional(),
    scope: z.string().optional().describe('Lesson id or title fragment, e.g. "f04" or "speckle"'),
  },
  annotations: RO,
}, async ({ limit, newCards, scope }) => {
  const progress = loadProgress(ws)
  const q = studyQueue(lessons(), progress.reviews, { limit, newCards, scope, attempts: progress.attempts, suspended: new Set(loadGoals(ws).suspended) })
  return json(q.length ? q : { message: 'Nothing due and no new cards in scope.' })
})

server.registerTool('present_item', {
  title: 'Present item',
  description: 'The question for one widget, safe to show the learner: no answer keys, no feedback, no solutions. Also returns the answer format, hint count and the source sections behind the card. Show it, then wait for the learner\'s answer before calling check_answer.',
  inputSchema: { widgetId: z.string() },
  annotations: RO,
}, async ({ widgetId }) => {
  const loc = locate(lessons(), widgetId)
  return loc ? json(pose(loc)) : error(`Unknown widget ${widgetId}.`)
})

server.registerTool('get_hint', {
  title: 'Get hint',
  description: 'The n-th author hint (0-based) for a widget. Using a hint caps the rating at Hard — pass help:"author-hint" to record_review.',
  inputSchema: { widgetId: z.string(), n: z.number().int().min(0) },
  annotations: RO,
}, async ({ widgetId, n }) => {
  const loc = locate(lessons(), widgetId)
  if (!loc) return error(`Unknown widget ${widgetId}.`)
  return text(hint(loc, n) ?? 'No more hints.')
})

server.registerTool('check_answer', {
  title: 'Check answer',
  description: 'Grade the learner\'s answer. Returns correct (true/false, or null when you must judge: explain → compare with the idea units in `rubric`; self-check code → compare with tests/solution), partial, `feedback` in words per gap or option, `answer` (always present: show it after a wrong answer or a skip), and `reveal` (explanation). Logs the attempt. Then call record_review.',
  inputSchema: { widgetId: z.string(), answer: z.string().max(4000), sure: z.boolean().optional() },
}, async ({ widgetId, answer, sure }) => {
  const all = lessons()
  const loc = locate(all, widgetId)
  if (!loc) return error(`Unknown widget ${widgetId}.`)
  const res = check(loc, answer, all)
  appendProgress(ws, { attempts: [{ id: randomUUID(), t: Date.now(), widget: widgetId, card: `${loc.lesson.id}/${loc.card.id}`, kind: 'attempt', ...(res.correct !== null ? { correct: res.correct } : {}), ...(sure !== undefined ? { sure } : {}), answer: answer.slice(0, 2000) }] })
  const { parts: _parts, ...forChat } = res // structured verdicts are for interactive surfaces
  return json(forChat)
})

server.registerTool('record_review', {
  title: 'Record review',
  description: 'Commit the outcome of one card to the FSRS schedule using the MDlearn rating table: wrong / revealed / answer-revealing hint → Again; correct but unsure, partial, author hint or looked back → Hard; correct, sure, unaided → Good. Returns the rating and the next due date.',
  inputSchema: {
    cardKey: z.string(), correct: z.boolean(), sure: z.boolean().optional(), partial: z.boolean().optional(),
    help: z.enum(['none', 'author-hint', 'look-back', 'answer-hint']).optional(), revealed: z.boolean().optional(),
  },
}, async ({ cardKey, ...o }) => {
  const all = lessons()
  if (!all.some((l) => l.cards.some((c) => `${l.id}/${c.id}` === cardKey))) return error(`Unknown card ${cardKey}.`)
  const rating = ratingFor(o)
  const saved = appendProgress(ws, { reviews: [{ id: randomUUID(), t: Date.now(), key: cardKey, rating }] })
  const next = scheduleAfter(saved.reviews, cardKey)
  const words = ratingWords(rating)
  // `say` is learner-facing; the FSRS label and ISO date are for the tutor's bookkeeping only.
  return json({ say: `${words.word}: ${words.meaning}${next ? `; next review ${whenText(next.due)}` : ''}`, rating: words.word, fsrsRating: ['', 'Again', 'Hard', 'Good', 'Easy'][rating], next })
})

server.registerTool('progress_report', {
  title: 'Progress report',
  description: 'Your progress: cards seen and due per lesson, your own first-try accuracy today and over 7 days, the model\'s predicted recall ("memory"), the next due time, and the study streak (days you studied and cleared what was due). Use accuracy.today for a session summary.',
  inputSchema: {},
  annotations: RO,
}, async () => { const p = loadProgress(ws); return json(report(lessons(), p.reviews, Date.now(), p.attempts)) })

server.registerTool('read_lesson', {
  title: 'Read lesson source',
  description: 'Raw source of a lesson file (to edit it, or to see a card in full after the learner has answered).',
  inputSchema: { path: z.string() },
  annotations: RO,
}, async ({ path }) => {
  const abs = inRoot(path)
  return abs && /\.md$/.test(abs) && existsSync(abs) ? text(readFileSync(abs, 'utf8')) : error(`No such lesson: ${path} (lesson files end in .learn.md)`)
})

// ------------------------------------------------------------------ ready-made prompts (slash commands in most clients)
const ask = (s: string) => ({ messages: [{ role: 'user' as const, content: { type: 'text' as const, text: s } }] })
server.registerPrompt('create_course', {
  title: 'Create a course',
  description: 'Build an MDlearn course on any topic — from your notes or from general knowledge — with proven learning methods, linted and saved in this folder.',
  argsSchema: {
    topic: z.string().describe('What to learn, e.g. "orbital mechanics for ML engineers"'),
    level: z.string().optional().describe('beginner, intermediate or advanced'),
    language: z.string().optional().describe('Language of the notes'),
    minutes: z.string().optional().describe('Total study time in minutes (default: as long as the subject needs)'),
    notes: z.string().optional().describe('A notes file or folder to build from (leave empty for none)'),
  },
}, ({ topic, level, language, minutes, notes }) => ask(coursePrompt({
  topic, level, language, notes: notes?.trim() || undefined, minutes: Number.parseInt(minutes ?? '', 10) || undefined, save: readOnly ? 'write' : 'tool',
})))
server.registerPrompt('companion_lessons', {
  title: 'Companion lessons for a document',
  description: 'Turn one long document of this folder into companion lessons that link back to its sections.',
  argsSchema: { doc: z.string().describe('Document path or a unique part of its name') },
}, ({ doc }) => ask(`Write MDlearn companion lessons for the document "${doc}" in this folder.

1. Call \`authoring_guide\` and follow it, especially "Companion lessons": the learner reads the document; each card links to a section with \`::read[§…]\`, gives a short gist of what to look for, and asks one retrieval question.
2. Call \`plan_lessons\` for the document: it gives each lesson's id, path, \`source:\` value and sections.
3. For each planned lesson, read every section it covers with \`get_section\` (never from memory), then write the lesson and ${readOnly ? 'write the file, then lint it with `lint_lesson`' : 'save it with `save_lesson`'}; fix every E and W line until it is clean. Recompute every number from the section text.
4. Finish with one line per file (path, cards, lint result), and list any errors you found in the document itself.`))
server.registerPrompt('study', {
  title: 'Study session',
  description: 'A spaced-repetition study session on what is due, one question at a time, with feedback and scheduling.',
  argsSchema: { scope: z.string().optional().describe('A lesson id or topic to focus on (default: everything due)') },
}, ({ scope }) => ask(`Run an MDlearn study session${scope ? ` on "${scope}"` : ''} with the mdlearn tools, following this protocol exactly:\n\n${guide('tutor')}`))

// ------------------------------------------------------------------ the guide as resources
for (const [part, name] of [['method', 'How to write MDlearn lessons'], ['spec', 'MDlearn DSL specification'], ['chat', 'MDlearn prompt for chats without tools']] as const)
  server.registerResource(`guide-${part}`, `mdlearn://guide/${part}`, { title: name, mimeType: 'text/markdown' }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: guide(part) }] }))

await server.connect(new StdioServerTransport())
