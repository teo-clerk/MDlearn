// MDlearn Studio HTTP API (Hono). Pure: everything it needs comes in `deps`, so tests drive it with
// app.request() and a temporary settings file.
import { Hono, type Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { compress } from 'hono/compress'
import { bodyLimit } from 'hono/body-limit'
import { readFileSync, statSync, existsSync } from 'node:fs'
import { extname, relative, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { compile, parseDocument, findSection, sectionText, isWidget, parseWebAnswer, checkStructured } from '@mdlearn/core'
import { loadCourse, compileSource, searchCurriculum, loadDoc, loadGoals, saveGoals, inRoot } from '@mdlearn/core/node'
import { security, capsOf, clientOf, need, type SecurityOptions } from './security.js'
import { Workspaces, UserError, browse, type Handle } from './workspaces.js'
import { redactLesson, redactDoc, findDocWidget } from './redact.js'
import * as study from './study.js'
import { today } from './today.js'
import { passageFor, addCard } from './cards.js'
import { notesStore, AnchorSchema } from './notes.js'
import { ask, cancelAsk, EXPLAIN_QUESTION } from './ai/ask.js'
import { ollamaStatus, ollamaBusy } from './ai/ollama.js'
import { judge } from './ai/judge.js'
import { PyodideStore } from './python.js'
import { Knowledge } from './knowledge/index.js'
import { AskService } from './ask/service.js'
import { buildApkg, notesOf } from './export/anki.js'
import { sheetOf, startIdeas, ideaProgress } from './sheet.js'
import { createFile, listHistory, readFileInfo, readVersion, saveFile, MAX_FILE_CHARS } from './editor.js'
import { importWeb } from './import/web.js'
import { importNotebook } from './import/notebook.js'
import { importPdfFast, pdfPageCount } from './import/pdf-fast.js'
import { importAnki } from './import/anki.js'
import { IMPORT_DIR, MAX_IMPORT_BYTES, freePath, slugify, writeNew } from './import/common.js'
import { visualise } from './ai/visualise.js'
import { insertAfterQuote } from './insert.js'
import type { JobManager } from './ai/jobs.js'
import type { AiEngine } from './ai/engine.js'
import { createCourse, improveLesson, customJob, importPdf } from './ai/recipes.js'
import { BatchRunner } from './ai/batch.js'
import type { EventBus, Envelope } from './bus.js'
import type { SettingsStore } from './settings.js'
import type { SessionInfo, LessonResponse, CompileResponse, PreviewResponse } from '../shared/types.js'

export interface Deps {
  version: string
  security: SecurityOptions
  settings: SettingsStore
  workspaces: Workspaces
  bus: EventBus
  serverId: string
  lanUrl?: string
  /** Claude Code availability (set by the server; absent in tests). */
  claudeStatus?: () => Promise<{ available: boolean; version?: string; error?: string }>
  knowledge?: Knowledge
  ask?: AskService
  /** How often a batch looks at its running job (tests make it short). */
  batchPollMs?: number
  /** Python-in-the-browser files (default: the installed pyodide package + download cache). */
  pyodide?: PyodideStore
  jobs?: JobManager
  /** The engine for course jobs (Claude Code, or the scripted demo engine). */
  engine?: () => AiEngine
}
const IMAGE_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }
const MAX_UPLOAD_FILES = 2000, MAX_UPLOAD_FILE = 2 * 1024 * 1024
const UPLOAD_TYPES = /\.(md|markdown|txt|png|jpe?g|gif|webp)$/i

export function createApp(deps: Deps): Hono {
  const app = new Hono()
  const o = deps.security
  app.use('*', security(o))
  app.use('/api/*', compress())
  // JSON requests are small; only uploads may be large (their own limit below)
  app.use('/api/*', async (c, next) => (c.req.path === '/api/workspaces/upload' || /^\/api\/w\/[^/]+\/import\/file$/.test(c.req.path) ? next() : bodyLimit({ maxSize: 2 * 1024 * 1024, onError: (cx) => cx.json({ error: { code: 'too-large', message: 'Request too large.' } }, 413) })(c, next)))
  app.onError((err, c) => {
    if (err instanceof UserError) return c.json({ error: { code: err.code, message: err.message } }, err.code === 'not-found' ? 404 : err.code === 'path' ? 403 : err.code === 'conflict' || err.code === 'file-exists' ? 409 : 400)
    if (err instanceof z.ZodError) return c.json({ error: { code: 'invalid', message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') } }, 400)
    console.error('[studio]', err)
    return c.json({ error: { code: 'internal', message: 'Something went wrong on the server; see the terminal for details.' } }, 500)
  })
  const ws = (c: Context): Handle => {
    const h = deps.workspaces.get(c.req.param('ws') ?? '')
    if (!h) throw new UserError('not-found', 'This folder is not open any more. Open it again from the library.')
    return h
  }
  const pathParam = (c: Context) => z.string().min(1).max(1024).parse(c.req.query('path'))

  // ---- session & workspaces
  app.get('/api/session', (c) => c.json<SessionInfo>({ version: deps.version, client: clientOf(c), caps: capsOf(c, o), lan: { enabled: o.lan, ...(deps.lanUrl && clientOf(c) === 'local' ? { url: deps.lanUrl } : {}) } }))
  app.get('/api/workspaces', need('read', o), (c) => c.json(clientOf(c) === 'local' || o.lanFull ? deps.workspaces.list() : deps.workspaces.list().map(({ root: _r, ...w }) => ({ ...w, root: '' }))))
  app.post('/api/workspaces/open', need('fs', o), async (c) => {
    const { path } = z.object({ path: z.string().min(1).max(4096) }).parse(await c.req.json())
    const h = deps.workspaces.open(path)
    return c.json({ id: h.id, name: h.name, root: h.root })
  })
  app.post('/api/workspaces/imports', need('fs', o), (c) => { const h = deps.workspaces.importsFolder(); return c.json({ id: h.id, name: h.name, root: h.root }) })
  app.get('/api/fs/browse', need('fs', o), (c) => c.json(browse(c.req.query('path'))))
  app.post('/api/workspaces/upload', need('fs', o), bodyLimit({ maxSize: 200 * 1024 * 1024, onError: (c) => c.json({ error: { code: 'too-large', message: 'Upload too large (200 MB at most).' } }, 413) }), async (c) => {
    const body = await c.req.parseBody({ all: true })
    const name = typeof body.name === 'string' ? body.name : 'Uploaded notes'
    const raw = body['files'] ?? body['files[]']
    const files = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((f): f is File => typeof f === 'object' && 'arrayBuffer' in f)
    const paths = [body['paths'] ?? body['paths[]']].flat().filter((p): p is string => typeof p === 'string')
    if (!files.length) throw new UserError('empty', 'No files were received.')
    if (files.length > MAX_UPLOAD_FILES) throw new UserError('too-many', `At most ${MAX_UPLOAD_FILES} files per upload.`)
    const accepted: { path: string; data: Uint8Array }[] = []
    let skipped = 0
    for (const [i, f] of files.entries()) {
      const path = paths[i] ?? f.name
      if (!UPLOAD_TYPES.test(path) || f.size > MAX_UPLOAD_FILE) { skipped++; continue }
      accepted.push({ path, data: new Uint8Array(await f.arrayBuffer()) })
    }
    if (!accepted.some((f) => /\.(md|markdown|txt)$/i.test(f.path))) throw new UserError('no-markdown', 'None of these files is Markdown (.md).')
    const h = deps.workspaces.upload(name, accepted)
    return c.json({ id: h.id, name: h.name, root: h.root, files: accepted.length, skipped })
  })

  // ---- reading
  app.get('/api/w/:ws/tree', need('read', o), (c) => c.json(deps.workspaces.tree(ws(c))))
  app.get('/api/w/:ws/doc', need('read', o), (c) => {
    const h = ws(c), rel = pathParam(c)
    const model = deps.workspaces.doc(h, rel)
    const etag = `W/"${model.mtime}-${deps.version}"`
    if (c.req.header('if-none-match') === etag) return c.body(null, 304)
    c.header('ETag', etag); c.header('Cache-Control', 'no-cache')
    return c.json(redactDoc(model))
  })
  app.get('/api/w/:ws/doc/section', need('read', o), (c) => {
    const h = ws(c), rel = pathParam(c), ref = z.string().min(1).max(200).parse(c.req.query('ref'))
    const abs = deps.workspaces.resolve(h, rel)
    const { outline, md } = loadDoc(abs, h.root)
    const s = findSection(outline, ref)
    if (!s) throw new UserError('not-found', `No section ${ref} in ${rel}.`)
    const text = sectionText(md, outline, ref, 1500)!
    return c.json({ section: s, text: text.text, truncated: text.truncated, doc: redactDoc(parseDocument(text.text, { path: rel })) })
  })
  // practice an authored widget inside a document (not scheduled, not logged)
  app.post('/api/w/:ws/doc/check', need('read', o), async (c) => {
    const h = ws(c)
    const body = z.object({ path: z.string().min(1).max(1024), widgetId: z.string().min(1).max(300), answer: z.unknown() }).parse(await c.req.json())
    const model = deps.workspaces.doc(h, body.path)
    const w = findDocWidget(model.blocks, body.widgetId)
    if (!w || !isWidget(w)) throw new UserError('not-found', 'This question is no longer in the document (it was edited). Reload.')
    const answer = parseWebAnswer(w, body.answer)
    if (!answer) throw new UserError('invalid', 'That answer does not fit this question.')
    const lesson = { id: 'doc', title: model.title, lang: (typeof model.frontmatter?.lang === 'string' ? model.frontmatter.lang : 'en') } as never
    return c.json({ checked: checkStructured({ lesson, card: { id: 'doc', title: '', blocks: [] }, widget: w }, answer) })
  })
  // ---- quick cards from what you are reading
  app.get('/api/w/:ws/doc/passage', need('notes', o), (c) => {
    const h = ws(c)
    return c.json(passageFor(deps.workspaces.resolve(h, pathParam(c)), z.string().min(1).max(2000).parse(c.req.query('quote'))))
  })
  app.post('/api/w/:ws/cards', need('notes', o), async (c) => {
    const h = ws(c)
    const body = z.object({
      doc: z.string().min(1).max(1024), section: z.object({ num: z.string().nullable(), anchor: z.string() }).nullable().default(null),
      card: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('cloze'), text: z.string().min(3).max(6000), title: z.string().max(80).optional() }),
        z.object({ kind: z.literal('qa'), question: z.string().min(3).max(1000), answer: z.string().min(1).max(3000), title: z.string().max(80).optional() }),
      ]),
    }).parse(await c.req.json())
    const r = await addCard(h, body.doc, deps.workspaces.resolve(h, body.doc), body.section, body.card)
    deps.bus.publish({ type: 'tree.changed', ws: h.id })
    return c.json(r)
  })
  app.get('/api/w/:ws/raw', need('read', o), (c) => {
    const h = ws(c), abs = deps.workspaces.resolve(h, pathParam(c))
    c.header('Content-Type', 'text/markdown; charset=utf-8')
    return c.body(readFileSync(abs, 'utf8'))
  })
  app.get('/api/w/:ws/asset', need('read', o), (c) => {
    const h = ws(c), abs = deps.workspaces.resolve(h, pathParam(c), /\.(png|jpe?g|gif|webp)$/i)
    if (statSync(abs).size > 20 * 1024 * 1024) throw new UserError('too-large', 'Image too large.')
    c.header('Content-Type', IMAGE_TYPES[extname(abs).toLowerCase()] ?? 'application/octet-stream')
    c.header('Content-Security-Policy', "default-src 'none'; sandbox")
    c.header('Cache-Control', 'no-cache')
    return c.body(readFileSync(abs))
  })
  app.get('/api/w/:ws/lesson', need('read', o), (c) => {
    const h = ws(c), rel = pathParam(c)
    const abs = deps.workspaces.resolve(h, rel, /\.learn\.md$/i)
    const hit = loadCourse(h.ws.learnDir).find((l) => l.path === abs)
    const r = hit ?? compileSource(readFileSync(abs, 'utf8'), abs)
    return c.json<LessonResponse>({ path: rel, lesson: r.lesson ? redactLesson(r.lesson) : null, diagnostics: r.diagnostics })
  })
  app.post('/api/w/:ws/compile', need('read', o), async (c) => {
    const h = ws(c)
    const { source, path, mode } = z.object({ source: z.string().max(400_000), path: z.string().max(1024).optional(), mode: z.enum(['lesson', 'document']).default('lesson') }).parse(await c.req.json())
    const abs = path ? deps.workspaces.resolve(h, path.endsWith('.md') ? path : `${path}.md`, /\.md$/i) : undefined
    const diagnostics = mode === 'document' ? parseDocument(source, { path: path ?? 'snippet.md' }).diagnostics
      : abs ? compileSource(source, abs).diagnostics : compile(source).diagnostics
    return c.json<CompileResponse>({ diagnostics, ok: !diagnostics.some((d) => d.code.startsWith('E')) })
  })
  app.get('/api/w/:ws/search', need('read', o), (c) => {
    const h = ws(c), q = z.string().min(2).max(200).parse(c.req.query('q'))
    return c.json(searchCurriculum(h.ws, q, { limit: 30 }))
  })

  // ---- study
  const num = (v: string | undefined, max: number) => (v === undefined || v === '' ? undefined : z.coerce.number().int().min(0).max(max).parse(v))
  app.get('/api/w/:ws/study/queue', need('study', o), (c) => c.json(study.plan(ws(c), {
    scope: c.req.query('scope') || undefined, doc: c.req.query('doc') || undefined, limit: num(c.req.query('limit'), 50), newCards: num(c.req.query('newCards'), 20), due: c.req.query('due') === '1',
  })))
  app.get('/api/w/:ws/study/item', need('study', o), (c) => c.json(study.item(ws(c), z.string().min(1).max(300).parse(c.req.query('widget')))))
  app.post('/api/w/:ws/study/check', need('study', o), async (c) => {
    const body = z.object({ widgetId: z.string().min(1).max(300), answer: z.unknown(), sure: z.boolean().optional(), practice: z.boolean().optional() }).parse(await c.req.json())
    return c.json({ checked: study.check(ws(c), body) })
  })
  app.post('/api/w/:ws/study/hint', need('study', o), async (c) => {
    const { widgetId, n } = z.object({ widgetId: z.string().min(1).max(300), n: z.number().int().min(0).max(20) }).parse(await c.req.json())
    return c.json({ hint: study.hint(ws(c), widgetId, n) })
  })
  app.post('/api/w/:ws/study/record', need('study', o), async (c) => {
    const { cardKey, outcome } = z.object({ cardKey: z.string().min(1).max(300), outcome: z.object({
      correct: z.boolean(), sure: z.boolean().optional(), partial: z.boolean().optional(), revealed: z.boolean().optional(),
      help: z.enum(['none', 'author-hint', 'look-back', 'answer-hint']).optional() }) }).parse(await c.req.json())
    return c.json(study.record(ws(c), cardKey, outcome))
  })
  app.get('/api/w/:ws/study/report', need('study', o), (c) => c.json(study.progressReport(ws(c))))
  app.get('/api/w/:ws/study/map', need('study', o), (c) => c.json(study.sectionMap(ws(c), pathParam(c))))

  // ---- knowledge: formulas, glossary, links, map
  const knowledge = deps.knowledge ?? new Knowledge(deps.workspaces, deps.bus)
  const index = async (c: Context) => { const idx = knowledge.for(ws(c)); if (c.req.query('wait') === '1') await idx.ensure(); return idx }
  app.get('/api/w/:ws/knowledge/status', need('read', o), (c) => c.json(knowledge.for(ws(c)).status()))
  app.get('/api/w/:ws/formulas', need('read', o), async (c) => {
    const idx = await index(c)
    return c.json({ status: idx.status(), ...idx.formulas({ q: c.req.query('q')?.slice(0, 200), doc: c.req.query('doc') || undefined, limit: Math.min(200, Number(c.req.query('limit')) || 60), offset: Math.max(0, Number(c.req.query('offset')) || 0) }) })
  })
  app.get('/api/w/:ws/glossary', need('read', o), async (c) => {
    const idx = await index(c)
    const terms = idx.glossary(c.req.query('q')?.slice(0, 200), c.req.query('loose') === '1')
    // compact: what the reader needs to underline terms and show a definition on hover
    return c.json({ status: idx.status(), terms: c.req.query('compact') === '1' ? terms.filter((t) => t.hoverable).map((t) => ({ term: t.term, definition: t.definition, sources: t.sources.slice(0, 1) })) : terms.map(({ hoverable: _h, ...t }) => t) })
  })
  app.get('/api/w/:ws/links', need('read', o), async (c) => {
    const h = ws(c), path = pathParam(c)
    deps.workspaces.resolve(h, path)
    return c.json((await index(c)).links(path))
  })
  app.get('/api/w/:ws/doc/summary', need('read', o), async (c) => {
    const h = ws(c), path = pathParam(c)
    deps.workspaces.resolve(h, path)
    const idx = await index(c)
    const f = idx.facts(path) ?? (() => { idx.update(path); return idx.facts(path) })()
    if (!f) throw new UserError('not-found', 'No such document.')
    const row = deps.workspaces.tree(h).docs.find((d) => d.path === path)
    return c.json({ path, title: f.title, ...(f.level ? { level: f.level } : {}), ...(f.timeMin ? { timeMin: f.timeMin } : {}), words: f.words, objectives: f.objectives.slice(0, 4), intro: f.intro, lessons: row?.lessons.length ?? 0, memory: row?.memory ?? null, seen: row?.seen ?? 0 })
  })
  app.get('/api/w/:ws/map', need('read', o), async (c) => {
    const h = ws(c)
    const idx = await index(c)
    const tree = deps.workspaces.tree(h)
    const rows = new Map(tree.docs.map((d) => [d.path, d]))
    const g = idx.graph()
    return c.json({ status: idx.status(), edges: g.edges, nodes: g.nodes.map((n) => ({ ...n, lessons: rows.get(n.path)?.lessons.length ?? 0, seen: rows.get(n.path)?.seen ?? 0, memory: rows.get(n.path)?.memory ?? null })) })
  })

  // ---- importers: a web page, a notebook, an Anki deck, a PDF (read locally, or by Claude for formulas)
  app.post('/api/w/:ws/import/web', need('write', o), async (c) => {
    const { url } = z.object({ url: z.string().min(4).max(2000) }).parse(await c.req.json())
    return c.json(await importWeb(ws(c), url))
  })
  app.post('/api/w/:ws/import/file', need('write', o), bodyLimit({ maxSize: MAX_IMPORT_BYTES, onError: (cx) => cx.json({ error: { code: 'too-large', message: 'That file is larger than 100 MB.' } }, 413) }), async (c) => {
    const h = ws(c)
    const body = await c.req.parseBody()
    const file = body['file']
    const kind = z.enum(['pdf-fast', 'pdf-quality', 'anki', 'notebook']).parse(body['kind'])
    if (typeof file !== 'object' || !('arrayBuffer' in file)) throw new UserError('empty', 'No file was received.')
    const name = file.name.replace(/[\\/]/g, '_')
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (kind === 'notebook') return c.json(importNotebook(h, name, Buffer.from(bytes).toString('utf8')))
    if (kind === 'anki') return c.json(importAnki(h, name, bytes, { keepHistory: body['keepHistory'] === 'true' }))
    if (kind === 'pdf-fast') return c.json(await importPdfFast(h, name, bytes))
    // high quality: keep the PDF in the folder, then let Claude read it
    if (!capsOf(c, o).includes('ai')) throw new UserError('path', 'Only the computer running MDlearn can start Claude jobs.')
    if (Buffer.from(bytes.subarray(0, 5)).toString('latin1') !== '%PDF-') throw new UserError('invalid', 'This file is not a PDF.')
    if (deps.claudeStatus && deps.engine?.().name === 'Claude Code') { const st = await deps.claudeStatus(); if (!st.available) throw new UserError('engine', st.error ?? 'Claude Code is not available.') }
    const base = slugify(name.replace(/\.pdf$/i, ''))
    const pdfRel = freePath(h, `${IMPORT_DIR}/source`, base, '.pdf')
    writeNew(h, pdfRel, bytes)
    const outRel = freePath(h, IMPORT_DIR, base)
    const pages = await pdfPageCount(bytes)
    const r = importPdf(h, pdfRel, outRel, pages)
    const { jobs: jm, engine } = jobs()
    const job = jm.start(h, engine, r.spec)
    return c.json({ files: [{ path: pdfRel, kind: 'asset' }, { path: outRel, kind: 'document' }], warnings: [], summary: `Claude is reading ${pages ? `${pages} pages` : 'the PDF'}; the document appears when the job finishes.`, jobId: job.id })
  })

  // ---- editor: read with a version stamp, save without overwriting someone else's change, preview, history
  app.get('/api/w/:ws/file', need('read', o), (c) => c.json(readFileInfo(ws(c), deps.workspaces, pathParam(c))))
  app.post('/api/w/:ws/files/save', need('write', o), async (c) => {
    const body = z.object({ path: z.string().min(1).max(1024), text: z.string().max(MAX_FILE_CHARS), baseMtime: z.number().optional(), overwrite: z.boolean().optional() }).parse(await c.req.json())
    return c.json(saveFile(ws(c), deps.workspaces, body))
  })
  app.post('/api/w/:ws/files/create', need('write', o), async (c) => {
    const body = z.object({ path: z.string().min(1).max(1024), text: z.string().max(MAX_FILE_CHARS).default('') }).parse(await c.req.json())
    return c.json(createFile(ws(c), body.path, body.text))
  })
  app.post('/api/w/:ws/preview', need('read', o), async (c) => {
    const h = ws(c)
    const { path, text } = z.object({ path: z.string().min(1).max(1024), text: z.string().max(MAX_FILE_CHARS) }).parse(await c.req.json())
    if (!/\.md$/i.test(path)) throw new UserError('path', 'Only Markdown files can be previewed.')
    if (/\.learn\.md$/i.test(path)) {
      const abs = inRoot(h.root, path)
      if (!abs) throw new UserError('path', 'That file is outside this folder.')
      const r = compileSource(text, abs)
      return c.json<PreviewResponse>({ kind: 'lesson', lesson: { path, lesson: r.lesson ? redactLesson(r.lesson) : null, diagnostics: r.diagnostics }, diagnostics: r.diagnostics })
    }
    const doc = deps.workspaces.preview(h, path, text)
    return c.json<PreviewResponse>({ kind: 'doc', doc: redactDoc(doc), diagnostics: doc.diagnostics })
  })
  app.get('/api/w/:ws/history', need('read', o), (c) => c.json(listHistory(ws(c), deps.workspaces, pathParam(c))))
  app.get('/api/w/:ws/history/version', need('read', o), (c) => {
    const id = z.string().min(1).max(20).parse(c.req.query('id'))
    return c.json({ text: readVersion(ws(c), deps.workspaces, pathParam(c), id) })
  })

  // ---- cheat sheet of one document
  app.get('/api/w/:ws/sheet', need('read', o), async (c) => {
    const h = ws(c), path = pathParam(c)
    deps.workspaces.resolve(h, path)
    const idx = await index(c)
    if (!idx.facts(path)) idx.update(path)
    const facts = idx.facts(path)
    if (!facts) throw new UserError('not-found', 'No such document.')
    return c.json(sheetOf(h, deps.workspaces, facts, ideaProgress(h, path)))
  })
  app.post('/api/w/:ws/sheet/ideas', need('askLocal', o), async (c) => {
    const h = ws(c)
    const body = z.object({ path: z.string().min(1).max(1024), regenerate: z.boolean().optional() }).parse(await c.req.json())
    const progress = await startIdeas(h, deps.workspaces, deps.settings.get().ollama, body.path, () => undefined, body.regenerate)
    return c.json(progress)
  })

  // ---- ask your whole folder
  const askSvc = deps.ask ?? new AskService(knowledge, deps.bus, deps.settings)
  app.get('/api/w/:ws/ask/status', need('askLocal', o), async (c) => c.json(await askSvc.status(ws(c))))
  app.post('/api/w/:ws/ask/setup', need('ai', o), async (c) => { await askSvc.setup(ws(c)); return c.json(await askSvc.status(ws(c))) })
  app.get('/api/w/:ws/ask/history', need('askLocal', o), (c) => c.json(askSvc.history(ws(c))))
  app.post('/api/w/:ws/ask', need('askLocal', o), async (c) => {
    const { question } = z.object({ question: z.string().trim().min(2).max(1000) }).parse(await c.req.json())
    return c.json(await askSvc.ask(ws(c), question))
  })
  app.post('/api/w/:ws/ask/delete', need('askLocal', o), async (c) => {
    const { id } = z.object({ id: z.string().max(64).nullable() }).parse(await c.req.json())
    await askSvc.remove(ws(c), id)
    return c.json({ ok: true })
  })
  app.post('/api/w/:ws/ask/note', need('notes', o), async (c) => {
    const body = z.object({ id: z.string().max(64), n: z.number().int().min(1).max(20) }).parse(await c.req.json())
    return c.json(await askSvc.saveAsNote(ws(c), body.id, body.n))
  })

  // ---- exports (answers are included, so only the computer running MDlearn may download them)
  app.get('/api/w/:ws/export/anki', need('write', o), (c) => {
    const h = ws(c), scope = c.req.query('scope') || ''
    const { lessons, pathOf } = study.course(h)
    let pool = lessons
    if (/\.learn\.md$/i.test(scope)) pool = lessons.filter((l) => pathOf.get(l.id) === scope)
    else if (scope) { const inDoc = study.lessonsOfDoc(h, scope); pool = lessons.filter((l) => inDoc.has(l.id)) }
    const notes = notesOf(pool)
    if (!notes.length) throw new UserError('empty', 'There are no study cards here to export.')
    const name = (scope ? scope.replace(/\.(learn\.)?md$/i, '').split('/').pop()! : h.name).replace(/[^\w.-]+/g, '-')
    return c.body(buildApkg(notes) as Uint8Array<ArrayBuffer>, 200, { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="mdlearn-${name}.apkg"`, 'cache-control': 'no-store' })
  })

  // ---- today, goals, suspended cards
  app.get('/api/w/:ws/today', need('study', o), (c) => c.json(today(ws(c))))
  app.get('/api/w/:ws/goals', need('study', o), (c) => c.json(loadGoals(ws(c).ws)))
  app.post('/api/w/:ws/goals', need('study', o), async (c) => {
    const h = ws(c)
    const body = z.object({
      dailyGoal: z.number().int().min(1).max(500).optional(),
      deadlines: z.array(z.object({ scope: z.string().max(1024), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), label: z.string().max(80).optional() })).max(50).optional(),
      /** Only an empty list is accepted here ("bring them all back"); single cards go through cards/suspend. */
      suspended: z.array(z.string()).max(0).optional(),
    }).parse(await c.req.json())
    for (const d of body.deadlines ?? []) if (d.scope) deps.workspaces.resolve(h, d.scope) // a deadline must name a real document
    return c.json(saveGoals(h.ws, { ...loadGoals(h.ws), ...(body.dailyGoal ? { dailyGoal: body.dailyGoal } : {}), ...(body.deadlines ? { deadlines: body.deadlines } : {}), ...(body.suspended ? { suspended: [] } : {}) }))
  })
  app.post('/api/w/:ws/cards/suspend', need('study', o), async (c) => {
    const h = ws(c)
    const { key, suspended } = z.object({ key: z.string().min(1).max(300), suspended: z.boolean() }).parse(await c.req.json())
    const g = loadGoals(h.ws)
    const set = new Set(g.suspended)
    suspended ? set.add(key) : set.delete(key)
    deps.bus.publish({ type: 'progress.changed', ws: h.id })
    return c.json(saveGoals(h.ws, { ...g, suspended: [...set] }))
  })

  // ---- notes & AI
  app.get('/api/w/:ws/notes', need('notes', o), (c) => {
    const h = ws(c), doc = pathParam(c)
    deps.workspaces.resolve(h, doc)
    return c.json(notesStore.list(h, doc))
  })
  app.post('/api/w/:ws/notes', need('notes', o), async (c) => {
    const h = ws(c)
    const body = z.object({ doc: z.string().min(1).max(1024), anchor: AnchorSchema, body: z.string().max(20_000) }).parse(await c.req.json())
    deps.workspaces.resolve(h, body.doc)
    const note = await notesStore.create(h, body.doc, body.anchor, body.body)
    deps.bus.publish({ type: 'notes.changed', ws: h.id, doc: body.doc })
    return c.json(note)
  })
  app.post('/api/w/:ws/notes/:id/update', need('notes', o), async (c) => {
    const h = ws(c)
    const body = z.object({ doc: z.string().min(1).max(1024), body: z.string().max(20_000) }).parse(await c.req.json())
    deps.workspaces.resolve(h, body.doc)
    const note = await notesStore.update(h, body.doc, c.req.param('id'), (n) => ({ ...n, body: body.body }))
    deps.bus.publish({ type: 'notes.changed', ws: h.id, doc: body.doc })
    return c.json(note)
  })
  app.post('/api/w/:ws/notes/:id/delete', need('notes', o), async (c) => {
    const h = ws(c)
    const { doc } = z.object({ doc: z.string().min(1).max(1024) }).parse(await c.req.json())
    deps.workspaces.resolve(h, doc)
    await notesStore.remove(h, doc, c.req.param('id'))
    deps.bus.publish({ type: 'notes.changed', ws: h.id, doc })
    return c.json({ ok: true })
  })
  app.post('/api/w/:ws/ai/ask', need('askLocal', o), async (c) => {
    const h = ws(c)
    const body = z.object({ doc: z.string().min(1).max(1024), anchor: AnchorSchema, question: z.string().max(4000).optional(), mode: z.enum(['ask', 'explain']).default('ask'), noteId: z.string().max(64).optional() }).parse(await c.req.json())
    const cfg = deps.settings.get().ollama
    const status = await ollamaStatus(cfg)
    if (!status.available) throw new UserError('engine', status.error ?? 'The local model is not available.')
    const question = body.mode === 'explain' || !body.question?.trim() ? EXPLAIN_QUESTION : body.question.trim()
    const r = await ask(h, deps.workspaces, deps.bus, cfg, { doc: body.doc, anchor: body.anchor, question, ...(body.noteId ? { noteId: body.noteId } : {}) })
    return c.json(r)
  })
  app.post('/api/w/:ws/ai/visualise', need('askLocal', o), async (c) => {
    const h = ws(c)
    const body = z.object({ doc: z.string().min(1).max(1024), anchor: AnchorSchema, kind: z.enum(['auto', 'plot', 'formula', 'animate']).default('auto') }).parse(await c.req.json())
    const cfg = deps.settings.get().ollama
    const status = await ollamaStatus(cfg)
    if (!status.available) throw new UserError('engine', status.error ?? 'The local model is not available.')
    return c.json(await visualise(h, deps.workspaces, cfg, body.doc, body.anchor, body.kind, c.req.raw.signal))
  })
  // insert a snippet into a document right after the paragraph that holds a passage (explicit user action)
  app.post('/api/w/:ws/files/insert', need('write', o), async (c) => {
    const h = ws(c)
    const body = z.object({ path: z.string().min(1).max(1024), quote: z.string().min(1).max(2000), text: z.string().min(1).max(50_000), baseMtime: z.number().optional() }).parse(await c.req.json())
    const abs = deps.workspaces.resolve(h, body.path)
    return c.json(insertAfterQuote(abs, body.quote, body.text, body.baseMtime))
  })
  app.post('/api/w/:ws/ai/cancel', need('askLocal', o), async (c) => {
    const { messageId } = z.object({ messageId: z.string().max(64) }).parse(await c.req.json())
    return c.json({ stopped: cancelAsk(messageId) })
  })
  app.post('/api/w/:ws/study/judge', need('askLocal', o), async (c) => {
    const h = ws(c)
    const body = z.object({ widgetId: z.string().min(1).max(300), text: z.string().min(1).max(4000) }).parse(await c.req.json())
    return c.json(await judge(h, deps.settings.get().ollama, body.widgetId, body.text))
  })
  app.get('/api/engines', need('read', o), async (c) => {
    const local = await ollamaStatus(deps.settings.get().ollama)
    return c.json({ local: { ...local, busy: ollamaBusy() }, claude: deps.claudeStatus ? await deps.claudeStatus() : { available: false, error: 'Not configured.' } })
  })

  // ---- AI Studio jobs
  const jobs = () => { if (!deps.jobs || !deps.engine) throw new UserError('engine', 'AI jobs are not available in this server.'); return { jobs: deps.jobs, engine: deps.engine() } }
  app.get('/api/w/:ws/ai/jobs', need('read', o), (c) => c.json(deps.jobs ? deps.jobs.list(ws(c)) : []))
  app.get('/api/w/:ws/ai/jobs/:id', need('read', o), (c) => {
    const j = deps.jobs?.get(ws(c), c.req.param('id'))
    if (!j) throw new UserError('not-found', 'No such job.')
    return c.json(j)
  })
  app.post('/api/w/:ws/ai/jobs', need('ai', o), async (c) => {
    const h = ws(c)
    const body = z.discriminatedUnion('recipe', [
      z.object({ recipe: z.literal('course.create'), doc: z.string().min(1).max(1024) }),
      z.object({ recipe: z.literal('lesson.improve'), lesson: z.string().min(1).max(1024), focus: z.enum(['questions', 'clarity', 'lint', 'all', 'leech']).default('all'), note: z.string().max(2000).default(''),
        card: z.object({ key: z.string().max(300), title: z.string().max(200), wrong: z.array(z.string().max(300)).max(5).default([]) }).optional() }),
      z.object({ recipe: z.literal('custom'), request: z.string().min(3).max(4000), scope: z.string().max(512).default('learn') }),
    ]).parse(await c.req.json())
    if (deps.claudeStatus && deps.engine?.().name === 'Claude Code') {
      const st = await deps.claudeStatus()
      if (!st.available) throw new UserError('engine', st.error ?? 'Claude Code is not available.')
    }
    const r = body.recipe === 'course.create' ? createCourse(h, body.doc) : body.recipe === 'lesson.improve' ? improveLesson(h, body.lesson, body.focus, body.note, body.card ? { cardKey: body.card.key, title: body.card.title, wrong: body.card.wrong } : undefined) : customJob(h, body.request, body.scope)
    const { jobs: jm, engine } = jobs()
    return c.json(jm.start(h, engine, r.spec, r.preWrite ? { preWrite: r.preWrite } : {}))
  })
  // ---- a course for many documents, one after another
  let batches: BatchRunner | undefined
  const batchRunner = () => (batches ??= new BatchRunner(jobs().jobs, deps.batchPollMs))
  const claudeReady = async () => { if (deps.claudeStatus && deps.engine?.().name === 'Claude Code') { const st = await deps.claudeStatus(); if (!st.available) throw new UserError('engine', st.error ?? 'Claude Code is not available.') } }
  app.get('/api/w/:ws/ai/batch/candidates', need('ai', o), (c) => {
    const h = ws(c)
    return c.json(batchRunner().candidates(h, deps.workspaces.tree(h).docs.filter((d) => d.lessons.length === 0).map((d) => d.path)))
  })
  app.get('/api/w/:ws/ai/batches', need('read', o), (c) => c.json(batchRunner().list(ws(c))))
  app.get('/api/w/:ws/ai/batches/:id', need('read', o), (c) => c.json(batchRunner().get(ws(c), c.req.param('id'))))
  app.post('/api/w/:ws/ai/batches', need('ai', o), async (c) => {
    const body = z.object({ docs: z.array(z.string().min(1).max(1024)).min(1).max(300), model: z.enum(['haiku', 'sonnet', 'opus']).default('sonnet') }).parse(await c.req.json())
    await claudeReady()
    const h = ws(c)
    // only documents without lessons: a document with some has its own "improve" flow
    const eligible = new Set(deps.workspaces.tree(h).docs.filter((d) => d.lessons.length === 0).map((d) => d.path))
    return c.json(batchRunner().start(h, jobs().engine, body.docs.filter((d) => eligible.has(d)), body.model))
  })
  app.post('/api/w/:ws/ai/batches/:id/stop', need('ai', o), (c) => c.json(batchRunner().stop(ws(c), c.req.param('id'))))
  app.post('/api/w/:ws/ai/batches/:id/resume', need('ai', o), async (c) => { await claudeReady(); return c.json(batchRunner().resume(ws(c), jobs().engine, c.req.param('id'))) })
  app.post('/api/w/:ws/ai/jobs/:id/cancel', need('ai', o), (c) => c.json({ stopped: jobs().jobs.cancel(ws(c), c.req.param('id')) }))
  app.post('/api/w/:ws/ai/jobs/:id/undo', need('ai', o), (c) => c.json(jobs().jobs.undo(ws(c), c.req.param('id'))))
  app.post('/api/w/:ws/ai/jobs/:id/followup', need('ai', o), async (c) => {
    const h = ws(c)
    const { request } = z.object({ request: z.string().min(2).max(4000) }).parse(await c.req.json())
    const { jobs: jm, engine } = jobs()
    const prev = jm.get(h, c.req.param('id'))
    if (!prev) throw new UserError('not-found', 'No such job.')
    if (!prev.sessionId) throw new UserError('session', 'This job cannot be continued; start a new one.')
    const scope = prev.files.length ? [...new Set(prev.files.map((f) => f.path.split('/').slice(0, -1).join('/')))] : ['learn']
    const r = customJob(h, request, scope[0])
    return c.json(jm.start(h, engine, { ...r.spec, recipe: 'followup', title: request.slice(0, 80), writeScope: scope.map((s) => `${h.root}/${s}`), resume: prev.sessionId }, { parent: prev.id }))
  })

  // ---- simulation sandbox (its own strict policy: scripts only from here, workers from blobs, no network)
  const sandboxDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'sandbox')
  const sandboxFile = (name: string) => readFileSync(existsSync(join(sandboxDir, name)) ? join(sandboxDir, name) : join(dirname(fileURLToPath(import.meta.url)), '..', 'sandbox', name), 'utf8')
  const SANDBOX_CSP = "default-src 'none'; script-src 'self' blob:; worker-src blob:; style-src 'unsafe-inline'; img-src blob: data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"
  app.get('/sandbox/sim.html', (c) => { c.header('Content-Security-Policy', SANDBOX_CSP); c.header('Content-Type', 'text/html; charset=utf-8'); c.header('Cache-Control', 'no-cache'); return c.body(sandboxFile('sim.html')) })
  const PY_CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval' blob:; worker-src blob:; connect-src 'self'; style-src 'unsafe-inline'; img-src blob: data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"
  app.get('/sandbox/py.html', (c) => { c.header('Content-Security-Policy', PY_CSP); c.header('Content-Type', 'text/html; charset=utf-8'); c.header('Cache-Control', 'no-cache'); return c.body(sandboxFile('py.html')) })
  app.get('/sandbox/py.js', (c) => { c.header('Content-Security-Policy', PY_CSP); c.header('Content-Type', 'text/javascript; charset=utf-8'); c.header('Cache-Control', 'no-cache'); return c.body(sandboxFile('py.js')) })
  let pyStore: PyodideStore | undefined
  const py = () => (pyStore ??= deps.pyodide ?? new PyodideStore())
  // the runtime and its packages: public static files, readable by the sandbox (opaque origin, so CORS *)
  app.get('/sandbox/pyodide/:file', async (c) => {
    let f
    try { f = await py().get(c.req.param('file')) } catch (e) { return c.json({ error: { code: 'download', message: (e as Error).message } }, 502) }
    if (!f) return c.json({ error: { code: 'not-found', message: 'Not part of this Python release.' } }, 404)
    c.header('Content-Type', f.type); c.header('Access-Control-Allow-Origin', '*'); c.header('Cross-Origin-Resource-Policy', 'cross-origin'); c.header('Cache-Control', 'public, max-age=31536000, immutable')
    return c.body(f.data as never)
  })
  app.get('/api/python/packages', need('read', o), (c) => c.json({ version: py().version, packages: py().packageNames() }))
  app.get('/sandbox/sim.js', (c) => { c.header('Content-Security-Policy', SANDBOX_CSP); c.header('Content-Type', 'text/javascript; charset=utf-8'); c.header('Cache-Control', 'no-cache'); return c.body(sandboxFile('sim.js')) })

  // ---- live events
  app.get('/api/events', need('read', o), (c) => {
    const site = c.req.header('sec-fetch-site')
    if (site && site !== 'same-origin' && site !== 'none') return c.json({ error: { code: 'origin', message: 'Request from another site refused.' } }, 403)
    const wsId = c.req.query('ws') ?? null
    const last = Number(c.req.header('last-event-id') ?? NaN)
    return streamSSE(c, async (stream) => {
      const send = (id: number, data: unknown) => stream.writeSSE({ id: String(id), data: JSON.stringify(data) })
      const relevant = (e: Envelope) => !('ws' in e.event) || !wsId || !e.event.ws || e.event.ws === wsId
      if (Number.isFinite(last)) {
        const missed = deps.bus.since(last)
        if (missed === null) await stream.writeSSE({ data: JSON.stringify({ type: 'resync' }) })
        else for (const e of missed.filter(relevant)) await send(e.id, e.event)
      } else await stream.writeSSE({ data: JSON.stringify({ type: 'hello', serverId: deps.serverId, ws: wsId }) })
      const queue: Promise<void>[] = []
      const off = deps.bus.subscribe((e) => { if (relevant(e)) queue.push(send(e.id, e.event)) })
      stream.onAbort(() => off())
      while (!stream.aborted) {
        await stream.sleep(25_000)
        if (!stream.aborted) await stream.write(': ping\n\n')
      }
      off()
    })
  })
  return app
}
export const relPath = (h: Handle, abs: string) => relative(h.root, abs).split('\\').join('/')
