// MDlearn Studio HTTP API (Hono). Pure: everything it needs comes in `deps`, so tests drive it with
// app.request() and a temporary settings file.
import { Hono, type Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { compress } from 'hono/compress'
import { bodyLimit } from 'hono/body-limit'
import { readFileSync, statSync, existsSync } from 'node:fs'
import { MEDIA_TYPES, mediaResponse } from './media.js'
import { MAX_PICTURE_BYTES, savePicture } from './pictures.js'
import { realPictureFetch, webPicture, type PictureFetch } from './web-pictures.js'
import { installMcp, mcpCommands, prepareFolder } from './agents.js'
import { addClassFile } from './import/class-files.js'
import { extname, relative, join, dirname, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { compile, parseDocument, findSection, sectionText, isWidget, parseWebAnswer, checkStructured, MAX_EXAM_QUESTIONS } from '@mdlearn/core'
import { loadLessons, compileSource, searchCurriculum, loadDoc, loadGoals, saveGoals, inRoot } from '@mdlearn/core/node'
import { security, capsOf, clientOf, need, type SecurityOptions } from './security.js'
import { Workspaces, UserError, browse, type Handle } from './workspaces.js'
import { redactLesson, redactDoc, findDocWidget } from './redact.js'
import * as study from './study.js'
import { examPlan, examGrade } from './exam.js'
import { offlinePack, syncOffline, PACK_DAYS } from './offline.js'
import { today } from './today.js'
import { passageFor, addCard } from './cards.js'
import { notesStore, AnchorSchema, NoteColorSchema } from './notes.js'
import { ask, cancelAsk, EXPLAIN_QUESTION } from './ai/ask.js'
import { ollamaStatus, ollamaBusy, ollamaDelete, ollamaModels } from './ai/ollama.js'
import { MODEL_NAME, ModelDownloads, hardware, installedName, isEmbedding, localAi } from './ai/models.js'
import { judge } from './ai/judge.js'
import { teachBack, type OneShot } from './ai/teachback.js'
import { PyodideStore } from './python.js'
import { Knowledge } from './knowledge/index.js'
import { AskService } from './ask/service.js'
import { buildApkg, notesOf } from './export/anki.js'
import { sheetOf, startIdeas, ideaProgress } from './sheet.js'
import { createFile, listHistory, readFileInfo, readVersion, saveFile, MAX_FILE_CHARS } from './editor.js'
import { importWeb } from './import/web.js'
import { checkChat, importChat, MAX_CHAT_CHARS } from './import/chat.js'
import { importNotebook } from './import/notebook.js'
import { importPdfFast, pdfPageCount } from './import/pdf-fast.js'
import { importScinet } from './import/scinet.js'
import { findPapers, scinetMarkdown, scinetPaper, scinetPdf, scinetStatus, scinetUrl } from './integrations/scinet.js'
import { importAnki } from './import/anki.js'
import { IMPORT_DIR, MAX_IMPORT_BYTES, freePath, slugify, writeNew } from './import/common.js'
import { visualise } from './ai/visualise.js'
import { insertAfterQuote } from './insert.js'
import { capture, cardFromItem, listInbox, moveItem, settle } from './inbox.js'
import type { JobManager } from './ai/jobs.js'
import type { AiEngine } from './ai/engine.js'
import { changeCourse, classCourse, createCourse, improveLesson, customJob, importPdf, keptOut, topicCourse } from './ai/recipes.js'
import { courseInfo, letGo, moveLesson, pauseLesson, reconnect } from './course.js'
import { BatchRunner } from './ai/batch.js'
import type { EventBus, Envelope } from './bus.js'
import type { SettingsStore } from './settings.js'
import { Latex } from './latex.js'
import { TEX_FILE, texRoot } from './latex-files.js'
import type { SessionInfo, LessonResponse, CompileResponse, PreviewResponse, Integrations, MapNode, MapResponse, Hardware, ImportResult, LocalAiInfo, McpSetup, PreparedFolder, ClassFile, ClassUpload } from '../shared/types.js'

/** Languages with a translated help page (help.<lang>.md). */
const HELP_LANGS = new Set(['it', 'es', 'fr', 'ca'])

export interface Deps {
  version: string
  security: SecurityOptions
  settings: SettingsStore
  workspaces: Workspaces
  bus: EventBus
  serverId: string
  lanUrl?: string
  /** The network for web pictures (tests pass a stand-in). */
  pictureFetch?: PictureFetch
  /** Claude Code availability (set by the server; absent in tests). */
  claudeStatus?: () => Promise<{ available: boolean; version?: string; error?: string }>
  knowledge?: Knowledge
  ask?: AskService
  /** Model downloads through Ollama (shared by Settings and Ask's search model). */
  downloads?: ModelDownloads
  /** This computer's memory and graphics card (tests pass a fixed one). */
  hardware?: () => Promise<Hardware>
  /** How often a batch looks at its running job (tests make it short). */
  batchPollMs?: number
  /** Python-in-the-browser files (default: the installed pyodide package + download cache). */
  pyodide?: PyodideStore
  jobs?: JobManager
  /** The engine for course jobs (Claude Code, or the scripted demo engine). */
  engine?: () => AiEngine
  /** One short answer from Claude (teach-back feedback when Claude is chosen); absent without Claude. */
  claudeOnce?: OneShot
  latex?: Latex
}
const IMAGE_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }
const MAX_CAPTURE = 4000
const MAX_UPLOAD_FILES = 2000, MAX_UPLOAD_FILE = 2 * 1024 * 1024
const MAX_CLASS_FILES = 100, MAX_CLASS_UPLOAD = 400 * 1024 * 1024
const UPLOAD_TYPES = /\.(md|markdown|txt|png|jpe?g|gif|webp)$/i

export function createApp(deps: Deps): Hono {
  const app = new Hono()
  const o = deps.security
  app.use('*', security(o))
  app.use('/api/*', compress())
  // JSON requests are small; only uploads may be large (their own limit below)
  app.use('/api/*', async (c, next) => (c.req.path === '/api/workspaces/upload' || c.req.path === '/api/courses' || /^\/api\/w\/[^/]+\/(import\/file|pictures|sources)$/.test(c.req.path) ? next() : bodyLimit({ maxSize: 2 * 1024 * 1024, onError: (cx) => cx.json({ error: { code: 'too-large', message: 'Request too large.' } }, 413) })(c, next)))
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
  const CardBody = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('cloze'), text: z.string().min(3).max(6000), title: z.string().max(80).optional() }),
    z.object({ kind: z.literal('qa'), question: z.string().min(3).max(1000), answer: z.string().min(1).max(3000), title: z.string().max(80).optional() }),
  ])

  // ---- session & workspaces
  app.get('/api/session', (c) => c.json<SessionInfo>({ version: deps.version, client: clientOf(c), caps: capsOf(c, o), lan: { enabled: o.lan, ...(deps.lanUrl && clientOf(c) === 'local' ? { url: deps.lanUrl } : {}) } }))
  app.get('/api/workspaces', need('read', o), (c) => c.json(clientOf(c) === 'local' || o.lanFull ? deps.workspaces.list() : deps.workspaces.list().map(({ root: _r, ...w }) => ({ ...w, root: '' }))))
  app.post('/api/workspaces/open', need('fs', o), async (c) => {
    const { path } = z.object({ path: z.string().min(1).max(4096) }).parse(await c.req.json())
    const h = deps.workspaces.open(path)
    return c.json({ id: h.id, name: h.name, root: h.root })
  })
  app.post('/api/workspaces/imports', need('fs', o), (c) => { const h = deps.workspaces.importsFolder(); return c.json({ id: h.id, name: h.name, root: h.root }) })
  // ---- help: the welcome tour (shown once), the tutorial folder, the help page
  const pkgFile = (...p: string[]) => {
    const here = dirname(fileURLToPath(import.meta.url)) // dist/server (built) or server (tsx)
    return [join(here, '..', '..', ...p), join(here, '..', ...p)].find((f) => existsSync(f)) ?? join(here, '..', '..', ...p)
  }
  // a built package carries the tutorial in dist/; in the repository it is examples/showcase
  const tutorialSource = () => [pkgFile('dist', 'tutorial'), join(pkgFile('..', '..', 'examples'), 'showcase')].find((d) => existsSync(d)) ?? pkgFile('dist', 'tutorial')
  app.get('/api/onboarding', need('read', o), (c) => c.json(deps.settings.get().onboarding))
  app.post('/api/onboarding', need('notes', o), async (c) => {
    const { tourDone } = z.object({ tourDone: z.boolean() }).parse(await c.req.json())
    return c.json(deps.settings.update((s) => ({ ...s, onboarding: { ...s.onboarding, tourDone } })).onboarding)
  })
  app.post('/api/workspaces/tutorial', need('fs', o), async (c) => {
    const { reset } = z.object({ reset: z.boolean().optional() }).parse(await c.req.json().catch(() => ({})))
    const h = deps.workspaces.tutorial(tutorialSource(), reset)
    return c.json({ id: h.id, name: h.name, root: h.root })
  })
  app.get('/api/help', need('read', o), (c) => {
    // ?lang= picks a translated help page (a fixed list, never a path); English is the fallback
    const lang = c.req.query('lang')
    const translated = lang && HELP_LANGS.has(lang) ? pkgFile(`help.${lang}.md`) : null
    const file = translated && existsSync(translated) ? translated : pkgFile('help.md')
    if (!existsSync(file)) throw new UserError('not-found', 'Help is missing from this installation.')
    return c.json({ doc: parseDocument(readFileSync(file, 'utf8'), { path: 'help.md' }) })
  })
  // ---- MDlearn in other assistants (built by scripts/build-integrations.ts)
  const integration = (f: string) => pkgFile('dist', 'integrations', f)
  app.get('/api/integrations', need('read', o), (c) => {
    const prompt = integration('MDLEARN_PROMPT.md')
    if (!existsSync(prompt)) throw new UserError('not-found', 'The integrations are missing; run `npm run build -w @mdlearn/studio`.')
    const local = capsOf(c, o).includes('fs')
    return c.json<Integrations>({
      prompt: readFileSync(prompt, 'utf8'),
      ...(local ? { pluginDir: integration('claude-plugin') } : {}),
      skillZip: existsSync(integration('mdlearn-skill.zip')), guide: existsSync(integration('MDLEARN_GUIDE.md')),
    })
  })
  app.post('/api/integrations/mcp', need('fs', o), (c) => {
    const server = installMcp(integration('claude-plugin'))
    return c.json<McpSetup>({ server, commands: mcpCommands(server) })
  })
  app.post('/api/w/:ws/agents/prepare', need('write', o), (c) => c.json<PreparedFolder>(prepareFolder(ws(c).root, integration('agent-folder'))))
  app.get('/api/integrations/:file{mdlearn-skill\\.zip|MDLEARN_GUIDE\\.md}', need('read', o), (c) => {
    const name = c.req.param('file'), file = integration(name)
    if (!existsSync(file)) throw new UserError('not-found', 'Not built yet.')
    c.header('Content-Type', name.endsWith('.zip') ? 'application/zip' : 'text/markdown; charset=utf-8')
    c.header('Content-Disposition', `attachment; filename="${name}"`)
    return c.body(readFileSync(file))
  })
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

  // ---- a course from a class's files: a new folder, or more files for one that exists
  const classFiles = async (c: Context, h: Handle): Promise<ClassUpload> => {
    const body = await c.req.parseBody({ all: true })
    const raw = body['files'] ?? body['files[]']
    const files = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((f): f is File => typeof f === 'object' && 'arrayBuffer' in f)
    if (!files.length) throw new UserError('empty', 'No files were received.')
    if (files.length > MAX_CLASS_FILES) throw new UserError('too-many', 'At most 100 files at a time.')
    if (files.some((f) => f.size > MAX_IMPORT_BYTES)) throw new UserError('too-large', 'That file is larger than 100 MB.')
    const saved: ClassFile[] = []
    for (const f of files) saved.push(await addClassFile(h, f.name, new Uint8Array(await f.arrayBuffer())))
    return { id: h.id, name: h.name, root: h.root, files: saved }
  }
  const classLimit = bodyLimit({ maxSize: MAX_CLASS_UPLOAD, onError: (c) => c.json({ error: { code: 'too-large', message: 'At most 400 MB at a time.' } }, 413) })
  app.post('/api/courses', need('fs', o), classLimit, async (c) => {
    const name = z.string().trim().min(1).max(100).parse(c.req.query('name'))
    return c.json(await classFiles(c, deps.workspaces.course(name)))
  })
  app.post('/api/w/:ws/sources', need('write', o), classLimit, async (c) => c.json(await classFiles(c, ws(c))))

  // ---- a course you have started
  const docPath = z.string().min(1).max(1024)
  app.get('/api/w/:ws/course', need('read', o), (c) => c.json(courseInfo(ws(c), docPath.parse(c.req.query('doc')))))
  app.post('/api/w/:ws/course/move', need('write', o), async (c) => {
    const { doc, lesson, by } = z.object({ doc: docPath, lesson: docPath, by: z.union([z.literal(-1), z.literal(1)]) }).parse(await c.req.json())
    moveLesson(ws(c), doc, lesson, by)
    deps.bus.publish({ type: 'tree.changed', ws: ws(c).id })
    return c.json({ ok: true })
  })
  app.post('/api/w/:ws/course/pause', need('study', o), async (c) => {
    const { doc, lesson, paused } = z.object({ doc: docPath, lesson: docPath, paused: z.boolean() }).parse(await c.req.json())
    pauseLesson(ws(c), doc, lesson, paused)
    return c.json({ ok: true })
  })
  const cardKey = z.string().min(3).max(300)
  app.post('/api/w/:ws/course/reconnect', need('write', o), async (c) => {
    const { from, to } = z.object({ from: cardKey, to: cardKey }).parse(await c.req.json())
    reconnect(ws(c), from, to)
    deps.bus.publish({ type: 'progress.changed', ws: ws(c).id })
    return c.json({ ok: true })
  })
  app.post('/api/w/:ws/course/let-go', need('study', o), async (c) => {
    const { key } = z.object({ key: cardKey }).parse(await c.req.json())
    letGo(ws(c), key)
    return c.json({ ok: true })
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
    const body = z.object({ doc: z.string().min(1).max(1024), section: z.object({ num: z.string().nullable(), anchor: z.string() }).nullable().default(null), card: CardBody }).parse(await c.req.json())
    const r = await addCard(h, body.doc, deps.workspaces.resolve(h, body.doc), body.section, body.card)
    deps.bus.publish({ type: 'tree.changed', ws: h.id })
    return c.json(r)
  })
  // capture inbox: a phone may save and sort into cards; only this computer may write into a document
  app.get('/api/w/:ws/inbox', need('read', o), (c) => c.json(listInbox(ws(c))))
  app.post('/api/w/:ws/inbox', need('notes', o), async (c) => {
    const h = ws(c)
    const body = z.object({ text: z.string().max(MAX_CAPTURE).optional(), quote: z.string().max(MAX_CAPTURE).optional(), url: z.string().max(2000).regex(/^https?:\/\//i).optional(), doc: z.string().min(1).max(1024).optional(), section: z.string().max(300).nullable().optional() }).parse(await c.req.json())
    const item = await capture(h, { ...body, ...(body.doc ? { source: { doc: body.doc, abs: deps.workspaces.resolve(h, body.doc), section: body.section } } : {}) })
    deps.bus.publish({ type: 'tree.changed', ws: h.id })
    return c.json(item)
  })
  const InboxRef = z.object({ file: z.string().min(1).max(100), id: z.string().regex(/^[0-9a-f]{12}$/) })
  app.post('/api/w/:ws/inbox/done', need('notes', o), async (c) => {
    const h = ws(c), { file, id } = InboxRef.parse(await c.req.json())
    await settle(h, file, id)
    return c.json({ ok: true })
  })
  app.post('/api/w/:ws/inbox/card', need('notes', o), async (c) => {
    const h = ws(c), { file, id, card } = InboxRef.extend({ card: CardBody }).parse(await c.req.json())
    const r = await cardFromItem(h, file, id, card, (rel) => deps.workspaces.resolve(h, rel))
    deps.bus.publish({ type: 'tree.changed', ws: h.id })
    return c.json(r)
  })
  app.post('/api/w/:ws/inbox/move', need('write', o), async (c) => {
    const h = ws(c), { file, id, doc, section } = InboxRef.extend({ doc: z.string().min(1).max(1024), section: z.string().max(300).nullable().optional() }).parse(await c.req.json())
    await moveItem(h, file, id, { doc, abs: deps.workspaces.resolve(h, doc), section })
    return c.json({ ok: true })
  })
  app.get('/api/w/:ws/raw', need('read', o), (c) => {
    const h = ws(c), abs = deps.workspaces.resolve(h, pathParam(c))
    c.header('Content-Type', 'text/markdown; charset=utf-8')
    return c.body(readFileSync(abs, 'utf8'))
  })
  // images (read whole, ≤ 20 MB) and, since v1.4, video and caption files (streamed in ranges, any size)
  app.get('/api/w/:ws/asset', need('read', o), (c) => {
    const h = ws(c), abs = deps.workspaces.resolve(h, pathParam(c), /\.(png|jpe?g|gif|webp|mp4|m4v|webm|ogv|mov|vtt)$/i)
    const st = statSync(abs), ext = extname(abs).toLowerCase(), size = st.size
    if (!st.isFile()) throw new UserError('not-found', 'File not found.')
    c.header('Content-Security-Policy', "default-src 'none'; sandbox")
    c.header('Cache-Control', 'no-cache')
    if (MEDIA_TYPES[ext]) return mediaResponse(c, abs, size, MEDIA_TYPES[ext])
    if (size > 20 * 1024 * 1024) throw new UserError('too-large', 'Image too large.')
    c.header('Content-Type', IMAGE_TYPES[ext] ?? 'application/octet-stream')
    return c.body(readFileSync(abs))
  })
  app.get('/api/w/:ws/lesson', need('read', o), (c) => {
    const h = ws(c), rel = pathParam(c)
    const abs = deps.workspaces.resolve(h, rel, /\.learn\.md$/i)
    const hit = loadLessons(h.ws).find((l) => l.path === abs)
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
    widgets: c.req.query('widgets') ? z.array(z.string().min(1).max(300)).max(20).parse(c.req.query('widgets')!.split(',')) : undefined,
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
  // offline packs carry the answers: only for devices that may study here (the LAN default does)
  app.get('/api/w/:ws/study/pack', need('study', o), (c) => c.json(offlinePack(ws(c), z.coerce.number().int().refine((d) => (PACK_DAYS as readonly number[]).includes(d)).parse(c.req.query('days') ?? 3))))
  app.post('/api/w/:ws/study/sync', need('study', o), async (c) => {
    const id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    const t = z.number().int().nonnegative()
    const body = z.object({
      reviews: z.array(z.object({ id, t, key: z.string().min(1).max(300), rating: z.union([z.literal(1), z.literal(2), z.literal(3)]) })).max(2000),
      attempts: z.array(z.object({ id, t, widget: z.string().min(1).max(300), card: z.string().min(1).max(300), kind: z.enum(['attempt', 'hint', 'reveal']),
        correct: z.boolean().optional(), sure: z.boolean().optional(), answer: z.string().max(2000).optional() })).max(2000),
    }).parse(await c.req.json())
    return c.json(syncOffline(ws(c), body))
  })
  app.get('/api/w/:ws/exam/plan', need('study', o), (c) => c.json(examPlan(ws(c), {
    count: z.coerce.number().int().min(1).max(MAX_EXAM_QUESTIONS).parse(c.req.query('count') ?? 20), doc: c.req.query('doc') || undefined, lesson: c.req.query('lesson') || undefined,
  })))
  app.post('/api/w/:ws/exam/grade', need('study', o), async (c) => {
    const body = z.object({ id: z.string().uuid(), answers: z.array(z.object({ widgetId: z.string().min(1).max(300), answer: z.unknown(), sure: z.boolean().optional(), ms: z.number().int().min(0).max(4 * 3600_000) })).min(1).max(MAX_EXAM_QUESTIONS) }).parse(await c.req.json())
    return c.json(examGrade(ws(c), body.id, body.answers.map((a) => ({ ...a, answer: a.answer ?? null }))))
  })
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
    const node = (n: (typeof g.nodes)[number]): MapNode => {
      const row = rows.get(n.path)
      return { ...n, lessons: row?.lessons.length ?? 0, seen: row?.seen ?? 0, memory: row?.memory ?? null, lessonList: (row?.lessons ?? []).map((l) => ({ path: l.path, title: l.title })) }
    }
    return c.json({ status: idx.status(), edges: g.edges, nodes: g.nodes.map(node) } satisfies MapResponse)
  })

  // ---- importers: a web page, a notebook, an Anki deck, a PDF (read locally, or by Claude for formulas)
  app.post('/api/w/:ws/import/web', need('write', o), async (c) => {
    const { url } = z.object({ url: z.string().min(4).max(2000) }).parse(await c.req.json())
    return c.json(await importWeb(ws(c), url))
  })
  const chatBody = z.object({ text: z.string().min(1).max(MAX_CHAT_CHARS), folder: z.string().max(200).optional() })
  app.post('/api/w/:ws/import/chat/check', need('write', o), async (c) => { const b = chatBody.parse(await c.req.json()); return c.json(checkChat(ws(c), b.text, b.folder)) })
  app.post('/api/w/:ws/import/chat', need('write', o), async (c) => { const b = chatBody.parse(await c.req.json()); return c.json(importChat(ws(c), b.text, b.folder)) })
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
    return c.json(await readPdf(c, h, name, bytes))
  })
  // high quality: keep the PDF in the folder, then let Claude read it
  const readPdf = async (c: Context, h: Handle, name: string, bytes: Uint8Array): Promise<ImportResult> => {
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
    return { files: [{ path: pdfRel, kind: 'asset' }, { path: outRel, kind: 'document' }], warnings: [], summary: `Claude is reading ${pages ? `${pages} pages` : 'the PDF'}; the document appears when the job finishes.`, jobId: job.id }
  }

  // ---- SciNet, your paper library: only from this computer, so the library stays as private as SciNet keeps it
  const scinet = () => deps.settings.get().scinet.url
  const paperId = (c: Context) => z.coerce.number().int().positive().parse(c.req.param('id'))
  app.get('/api/scinet/status', need('write', o), async (c) => c.json(await scinetStatus(scinet())))
  app.post('/api/scinet/url', need('write', o), async (c) => {
    const url = scinetUrl(z.object({ url: z.string().max(200) }).parse(await c.req.json()).url).origin
    deps.settings.update((s) => ({ ...s, scinet: { url } }))
    return c.json(await scinetStatus(url))
  })
  app.get('/api/scinet/papers', need('write', o), async (c) => c.json(await findPapers(scinet(), c.req.query('q') ?? '', c.req.query('mode') === 'title' ? 'title' : 'meaning')))
  app.get('/api/scinet/papers/:id', need('write', o), async (c) => c.json(await scinetPaper(scinet(), paperId(c))))
  app.post('/api/w/:ws/import/scinet', need('write', o), async (c) => {
    const h = ws(c)
    const { paperId: id, reread } = z.object({ paperId: z.number().int().positive(), reread: z.boolean().default(false) }).parse(await c.req.json())
    const paper = await scinetPaper(scinet(), id)
    if (reread) return c.json(await readPdf(c, h, `${paper.title}.pdf`, await scinetPdf(scinet(), id)))
    return c.json(importScinet(h, paper, await scinetMarkdown(scinet(), id)))
  })

  // ---- editor: read with a version stamp, save without overwriting someone else's change, preview, history
  app.get('/api/w/:ws/file', need('read', o), (c) => c.json(readFileInfo(ws(c), deps.workspaces, pathParam(c))))
  // an <img> can't send the header, so a document can't reach this route by naming it as a picture
  app.get('/api/web-picture', need('read', o), async (c) => {
    if (c.req.header('x-mdl') !== '1') return c.json({ error: { code: 'header', message: 'Missing X-MDL header.' } }, 403)
    const { bytes, type } = await webPicture(c.req.query('url') ?? '', deps.pictureFetch ?? realPictureFetch)
    return c.body(bytes as Uint8Array<ArrayBuffer>, 200, { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400' })
  })

  app.post('/api/w/:ws/pictures', need('write', o), bodyLimit({ maxSize: MAX_PICTURE_BYTES, onError: (cx) => cx.json({ error: { code: 'too-large', message: 'That picture is larger than 20 MB.' } }, 413) }), async (c) => {
    const h = ws(c), body = await c.req.parseBody(), file = body['file']
    if (typeof file !== 'object' || !('arrayBuffer' in file)) throw new UserError('empty', 'No file was received.')
    const doc = z.string().max(1024).parse(body['doc'])
    deps.workspaces.resolve(h, doc)
    return c.json(savePicture(h, doc, new Uint8Array(await file.arrayBuffer())))
  })
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
  // ---- LaTeX: compile a .tex file with the engine on this computer; the PDF stays in the cache until saved next to it
  const latex = deps.latex ?? new Latex()
  /** The document to compile: the file itself, or the main file its "% !TEX root" names. */
  const texPath = (rel: string) => posix.normalize(rel.replace(/\\/g, '/')) // one spelling per file, one cached PDF
  const texTarget = (h: Handle, asked: string) => {
    const rel = texPath(asked)
    const abs = deps.workspaces.resolve(h, rel, TEX_FILE)
    const root = texRoot(readFileSync(abs, 'utf8'))
    if (!root) return { abs, rel }
    const target = posix.normalize(posix.join(posix.dirname(rel), root.replace(/\\/g, '/')))
    return { abs: deps.workspaces.resolve(h, target, TEX_FILE), rel: target }
  }
  // looking again runs the engines' --version: only from this computer, not on every phone refresh
  app.get('/api/latex/status', need('read', o), (c) => c.json(latex.status(c.req.query('fresh') === '1' && capsOf(c, o).includes('write'))))
  app.post('/api/w/:ws/latex/compile', need('write', o), async (c) => {
    const h = ws(c)
    const { path } = z.object({ path: z.string().min(1).max(1024) }).parse(await c.req.json())
    const t = texTarget(h, path)
    return c.json({ ...(await latex.compile(h, t.abs, t.rel)), target: t.rel })
  })
  app.get('/api/w/:ws/latex/pdf', need('read', o), (c) => {
    const h = ws(c)
    const rel = texPath(pathParam(c))
    deps.workspaces.resolve(h, rel, TEX_FILE)
    const pdf = latex.pdfOf(h, rel)
    if (!pdf) throw new UserError('not-found', 'Compile the document first.')
    const name = encodeURIComponent(posix.basename(rel).replace(TEX_FILE, '.pdf'))
    return c.body(readFileSync(pdf), 200, {
      'Content-Type': 'application/pdf', 'Cache-Control': 'no-store',
      'Content-Disposition': `${c.req.query('download') === '1' ? 'attachment' : 'inline'}; filename*=UTF-8''${name}`,
      // the browser's own PDF viewer is a plugin: allowed for this response only
      'Content-Security-Policy': "object-src 'self'; frame-ancestors 'self'",
    })
  })
  app.post('/api/w/:ws/latex/save-pdf', need('write', o), async (c) => {
    const h = ws(c)
    const path = texPath(z.object({ path: z.string().min(1).max(1024) }).parse(await c.req.json()).path)
    const abs = deps.workspaces.resolve(h, path, TEX_FILE)
    return c.json({ path: latex.savePdfNextTo(h, abs, path) })
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
  const downloads = deps.downloads ?? new ModelDownloads(() => deps.settings.get().ollama)
  const askSvc = deps.ask ?? new AskService(knowledge, deps.bus, deps.settings, downloads)
  app.get('/api/w/:ws/ask/status', need('askLocal', o), async (c) => c.json(await askSvc.status(ws(c))))
  app.get('/api/w/:ws/related', need('read', o), async (c) => c.json(await askSvc.related(ws(c), pathParam(c), z.string().max(300).optional().parse(c.req.query('section')))))
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
    const body = z.object({ doc: z.string().min(1).max(1024), anchor: AnchorSchema, body: z.string().max(20_000), color: NoteColorSchema.optional() }).parse(await c.req.json())
    deps.workspaces.resolve(h, body.doc)
    const note = await notesStore.create(h, body.doc, body.anchor, body.body, body.color)
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
  app.post('/api/w/:ws/teachback', need('askLocal', o), async (c) => {
    const h = ws(c)
    const body = z.object({ lesson: z.string().min(1).max(1024).optional(), doc: z.string().min(1).max(1024).optional(), section: z.string().min(1).max(300).optional(),
      text: z.string().trim().min(20).max(6000), lang: z.enum(['en', 'it', 'es', 'fr', 'ca']).default('en'), engine: z.enum(['local', 'claude']).default('local') }).parse(await c.req.json())
    // Claude runs on this computer's account: only from this computer (the 'ai' capability)
    if (body.engine === 'claude' && !capsOf(c, o).includes('ai')) throw new UserError('capability', 'Claude can be used only on the computer running MDlearn Studio.')
    return c.json(await teachBack(h, deps.workspaces, { local: deps.settings.get().ollama, ...(deps.claudeOnce ? { claude: deps.claudeOnce } : {}) }, body))
  })
  app.get('/api/engines', need('read', o), async (c) => {
    const local = await ollamaStatus(deps.settings.get().ollama)
    return c.json({ local: { ...local, busy: ollamaBusy() }, claude: deps.claudeStatus ? await deps.claudeStatus() : { available: false, error: 'Not configured.' } })
  })

  // ---- local AI models: what is installed, what this computer can run, downloads (changes only from this computer)
  app.get('/api/ai/local', need('read', o), async (c) => {
    const info = await localAi(deps.settings.get().ollama, downloads, await (deps.hardware ?? hardware)())
    const claude = deps.claudeStatus ? await deps.claudeStatus() : { available: false, error: 'Not configured.' }
    if (capsOf(c, o).includes('ai')) return c.json<LocalAiInfo>({ ...info, claude })
    // a phone sees which models there are, not this computer's hardware, system or where its programs are
    return c.json<LocalAiInfo>({ ...info, hardware: null, install: { command: null, then: null, url: 'https://ollama.com/download' }, claude: { available: claude.available } })
  })
  const modelBody = async (c: { req: { json(): Promise<unknown> } }) => z.object({ model: z.string().trim().regex(MODEL_NAME, 'Not a model name.') }).parse(await c.req.json()).model
  const installedModels = async () => {
    try { return await ollamaModels(deps.settings.get().ollama) } catch { throw new UserError('engine', 'Ollama is not running (start it with `ollama serve`).') }
  }
  app.post('/api/ai/local/pull', need('ai', o), async (c) => {
    const model = await modelBody(c)
    await installedModels()
    return c.json(downloads.start(model))
  })
  app.post('/api/ai/local/cancel', need('ai', o), (c) => { downloads.cancel(); return c.json({ ok: true }) })
  app.post('/api/ai/local/choose', need('ai', o), async (c) => {
    const models = await installedModels()
    const model = installedName(models, await modelBody(c))
    if (!model) throw new UserError('not-found', 'That model is not installed. Download it first.')
    if (isEmbedding(models.find((m) => m.name === model)!)) throw new UserError('invalid', 'That is a search model; it cannot write answers.')
    deps.settings.update((s) => ({ ...s, ollama: { ...s.ollama, model } }))
    return c.json({ chosen: model })
  })
  app.post('/api/ai/local/delete', need('ai', o), async (c) => {
    const cfg = deps.settings.get().ollama
    const model = installedName(await installedModels(), await modelBody(c))
    if (!model) throw new UserError('not-found', 'That model is not installed.')
    if (model === installedName([{ name: model }], cfg.model)) throw new UserError('in-use', 'Studio uses this model. Choose another one first.')
    if (model === installedName([{ name: model }], cfg.embedModel ?? 'embeddinggemma')) throw new UserError('in-use', 'Ask uses this model to search by meaning, so it stays.')
    if (downloads.running(model)) throw new UserError('busy', 'This model is still downloading.')
    await ollamaDelete(cfg, model)
    return c.json({ ok: true })
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
      z.object({ recipe: z.literal('lesson.improve'), lesson: z.string().min(1).max(1024), focus: z.enum(['questions', 'clarity', 'lint', 'marks', 'all', 'leech']).default('all'), note: z.string().max(2000).default(''),
        card: z.object({ key: z.string().max(300), title: z.string().max(200), wrong: z.array(z.string().max(300)).max(5).default([]) }).optional() }),
      z.object({ recipe: z.literal('course.change'), doc: z.string().min(1).max(1024), request: z.string().trim().min(2).max(2000) }),
      z.object({ recipe: z.literal('course.class'), name: z.string().trim().min(1).max(200), level: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'), language: z.string().max(40).optional(), request: z.string().max(2000).optional() }),
      z.object({ recipe: z.literal('custom'), request: z.string().min(3).max(4000), scope: z.string().max(512).default('learn') }),
      z.object({ recipe: z.literal('course.topic'), topic: z.string().trim().min(2).max(300), level: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
        language: z.string().max(40).optional(), minutes: z.number().int().min(5).max(600).default(45), notes: z.string().max(1024).optional() }),
    ]).parse(await c.req.json())
    if (deps.claudeStatus && deps.engine?.().name === 'Claude Code') {
      const st = await deps.claudeStatus()
      if (!st.available) throw new UserError('engine', st.error ?? 'Claude Code is not available.')
    }
    const r = body.recipe === 'course.change' ? changeCourse(h, body.doc, body.request) : body.recipe === 'course.class' ? classCourse(h, body) : body.recipe === 'course.topic' ? topicCourse(h, body) : body.recipe === 'course.create' ? createCourse(h, body.doc) : body.recipe === 'lesson.improve' ? improveLesson(h, body.lesson, body.focus, body.note, body.card ? { cardKey: body.card.key, title: body.card.title, wrong: body.card.wrong } : undefined) : customJob(h, body.request, body.scope)
    const { jobs: jm, engine } = jobs()
    return c.json(jm.start(h, engine, r.spec, { ...(r.preWrite ? { preWrite: r.preWrite } : {}), ...(r.after ? { after: r.after } : {}) }))
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
    return c.json(jm.start(h, engine, { ...r.spec, recipe: 'followup', title: request.slice(0, 80), writeScope: scope.map((s) => `${h.root}/${s}`), keepOut: keptOut(h.root), resume: prev.sessionId }, { parent: prev.id }))
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
  // author HTML (:::html): inline scripts and styles run, but nothing loads from the network and the frame has
  // an opaque origin (no cookies, no API, no access to the page); data: and blob: images only
  const HTML_CSP = "default-src 'none'; script-src 'self' 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; worker-src blob:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"
  for (const [file, type] of [['html.html', 'text/html'], ['html.js', 'text/javascript']] as const) {
    app.get(`/sandbox/${file}`, (c) => { c.header('Content-Security-Policy', HTML_CSP); c.header('Content-Type', `${type}; charset=utf-8`); c.header('Cache-Control', 'no-cache'); return c.body(sandboxFile(file)) })
  }

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
