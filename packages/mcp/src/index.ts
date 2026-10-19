#!/usr/bin/env node
// mdlearn MCP server — gives Claude exact access to a curriculum (outlines, sections), lesson linting,
// and an FSRS-backed tutor whose questions never leak their answers.
// Config: MDLEARN_ROOT (curriculum root, default cwd), MDLEARN_LEARN_DIR (default "learn").
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { relative } from 'node:path'
import {
  formatDiagnostic, sectionText, studyQueue, locate, pose, check, hint, ratingFor, ratingWords, scheduleAfter, whenText, report,
  type Lesson,
} from '@mdlearn/core'
import {
  workspace, curriculumStatus, findDoc, loadDoc, planFor, loadCourse, loadProgress, loadGoals, appendProgress, compileSource, compileFile, searchCurriculum, inRoot as insideRoot,
} from '@mdlearn/core/node'

const ws = workspace(process.env.MDLEARN_ROOT ?? process.cwd(), process.env.MDLEARN_LEARN_DIR ?? 'learn')
const server = new McpServer({ name: 'mdlearn', version: '0.2.0' })

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] })
const json = (v: unknown) => text(JSON.stringify(v, null, 1))
const error = (s: string) => ({ content: [{ type: 'text' as const, text: s }], isError: true })
const lessons = (): Lesson[] => loadCourse(ws.learnDir).map((l) => l.lesson).filter((l): l is Lesson => !!l)
const inRoot = (p: string) => insideRoot(ws.root, p)
const RO = { readOnlyHint: true, openWorldHint: false }

// ------------------------------------------------------------------ curriculum (read-only)
server.registerTool('curriculum_status', {
  title: 'Curriculum status',
  description: 'List source documents of the curriculum with size, planned vs existing companion lessons, lint errors/warnings, cards and widgets. Use first to see what exists.',
  inputSchema: { filter: z.string().optional().describe('Substring of the document path, e.g. "00_FOUNDATIONS" or "04_sar"') },
  annotations: RO,
}, async ({ filter }) => json({ root: ws.root, learnDir: relative(ws.root, ws.learnDir), docs: curriculumStatus(ws, filter) }))

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
  return abs ? json(planFor(ws, abs, targetWords).map((p) => ({ ...p, path: relative(ws.root, p.path) }))) : error(`No unique document matches "${doc}".`)
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

await server.connect(new StdioServerTransport())
