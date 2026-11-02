// Contract between the MDlearn Studio server and web app (imported with `import type` on both sides).
import type { DocModel, DocOutline, Diagnostic, Lesson, Block, PosedWidget, QueueItem, Checked, ReadRef, MdNode, ExamAnswer, ExamSummary, ReviewEvent } from '@mdlearn/core'

export type Capability = 'read' | 'study' | 'notes' | 'askLocal' | 'write' | 'ai' | 'fs'
export interface SessionInfo {
  version: string
  /** `local`: this computer; `lan`: another device on the network (fewer capabilities). */
  client: 'local' | 'lan'
  caps: Capability[]
  lan: { enabled: boolean; url?: string }
}
export interface WorkspaceSummary { id: string; name: string; root: string; docs: number; lessons: number; lastOpened: number; inLibrary: boolean }
export interface BrowseEntry { name: string; path: string; mdFiles: number; hasLearn: boolean }
export interface BrowseResult { path: string; parent: string | null; entries: BrowseEntry[] }

export interface TreeDoc {
  path: string; title: string; kind: DocOutline['kind']; words: number; timeMin?: number
  lessons: { path: string; id: string; title: string; cards: number; errors: number; warnings: number }[]
  /** Studied notes this stands for: 1 for a note with `study: true`, all of them for the `course.md` beside them. */
  notes: number
  cards: number; seen: number; due: number
  /** Mean predicted recall of seen cards (FSRS), null when nothing has been studied. */
  memory: number | null
}
export interface Tree { root: string; name: string; docs: TreeDoc[]; orphanLessons: TreeDoc['lessons']; duplicateLessons: { id: string; paths: string[] }[]; latex: TexDoc[]; totals: { docs: number; lessons: number; cards: number; due: number; seen: number } }
/** A LaTeX document in the folder (opens in the LaTeX editor). */
export interface TexDoc { path: string; title: string }

// ---- LaTeX
export type TexEngineId = 'tectonic' | 'latexmk' | 'pdflatex' | 'xelatex' | 'lualatex'
export type TexProgram = 'pdflatex' | 'xelatex' | 'lualatex'
export interface TexEngine { id: TexEngineId; version: string }
/** What usually causes an error, for a sentence in the learner's language. */
export type TexHint = 'undefined-command' | 'math-mode' | 'missing-file' | 'braces' | 'undefined-environment' | 'begin-end' | 'alignment' | 'timeout'
export interface TexProblem { severity: 'error' | 'warning'; message: string; file?: string; line?: number; hint?: TexHint }
export interface TexResult { ok: boolean; engine: TexEngineId; program?: TexProgram; ms: number; pdf: { size: number; at: number } | null; problems: TexProblem[]; log: string }
export interface TexStatus { engines: TexEngine[]; chosen: string | null; install: { command: string | null; url: string } }

export type DocResponse = DocModel & { mtime: number }
/** Lesson as shown before answering: widgets are redacted (no keys). */
export type RedactedBlock = Exclude<Block, { type: 'quiz' | 'cloze' | 'order' | 'explain' | 'steps' | 'code' }> | PosedWidget
export interface LessonResponse {
  path: string
  lesson: (Omit<Lesson, 'intro' | 'cards'> & { intro: RedactedBlock[]; cards: { id: string; title: string; blocks: RedactedBlock[] }[] }) | null
  diagnostics: Diagnostic[]
}
export interface CompileResponse { diagnostics: Diagnostic[]; ok: boolean }
export interface SearchHit { doc: string; section: string; title: string; snippet: string; score: number }

// ---- study
export interface StudyPlan { items: QueueItem[]; due: number; fresh: number; minutes: number }
/** `video`: the video this question pauses at in the lesson (its title, the time, a link that starts there when online). */
export interface StudyItem { item: QueueItem; title: string; widget: PosedWidget; exposition: MdNode[]; reads: ReadRef[]; lessonPath: string; /** A question in a note: the section of the note it comes from. */ noteSection?: string; video?: { title: string; at: string; link?: string } }
export interface CheckResponse { checked: Checked }
/** Cards for a device with no connection to this computer: their lessons (trimmed to these cards, answers included,
 *  so the device can mark them), the study order, and their review history (to know when each is due). */
export interface OfflinePack {
  id: string; ws: string; name: string; createdAt: number; days: number; newPerDay: number
  lessons: Lesson[]
  cards: { cardKey: string; widgetId: string; isNew: boolean }[]
  reviews: ReviewEvent[]
}
export interface SyncResult { reviews: number; attempts: number; rejected: number }
/** Teach-back feedback: each key idea judged (from the lesson, or listed by the AI when the text has none), errors, one next question. */
export interface TeachResult {
  title: string
  ideas: { idea: string; verdict: 'covered' | 'partly' | 'missing'; evidence?: string }[]
  ideasFrom: 'lesson' | 'ai'
  misconceptions: { quote: string; correction: string }[]
  followUp: string
  feedback: string
}
/** A mock exam paper: the questions without their answers; `available` is how many studied cards could be asked. */
export interface ExamPlan { id: string; requested: number; available: number; items: { item: QueueItem; widget: PosedWidget; lessonPath: string }[] }
export interface ExamResult {
  summary: ExamSummary
  results: (ExamAnswer & { checked: Checked; rating?: 1 | 2 | 3; word?: string; next?: string })[]
}
/** The confidence check (Progress): sure/not sure × right/wrong, per week, and the cards you were sure about and missed. */
export interface ConfidenceInfo {
  split: { sureRight: number; sureWrong: number; unsureRight: number; unsureWrong: number; answered: number; sureAccuracy: number | null; unsureAccuracy: number | null }
  weeks: { start: string; sure: number; sureRight: number; unsure: number; unsureRight: number }[]
  overconfident: { card: string; widget: string; count: number; last: number; answers: string[]; lessonTitle: string; cardTitle: string; lessonPath: string }[]
}
export interface RecordResponse { rating: 1 | 2 | 3; word: string; meaning: string; next: { due: string; when: string } | null }

// ---- events (SSE)
export type ServerEvent =
  | { type: 'hello'; serverId: string; ws: string | null }
  | { type: 'fs.changed'; ws: string; paths: { path: string; kind: 'doc' | 'lesson' | 'latex' | 'asset' | 'other'; change: 'add' | 'change' | 'unlink' }[] }
  | { type: 'tree.changed'; ws: string }
  | { type: 'progress.changed'; ws: string }
  | { type: 'notes.changed'; ws: string; doc: string }
  | { type: 'ai.delta'; ws: string; doc: string; noteId: string; messageId: string; text: string }
  | { type: 'ai.done'; ws: string; doc: string; noteId: string; messageId: string; error?: string }
  | { type: 'job'; ws: string; job: JobSummary }
  | { type: 'job.event'; ws: string; jobId: string; event: JobEvent }
  | { type: 'resync' }

export interface ApiError { error: { code: string; message: string } }

// ---- notes & AI
/** `t`: a note on a moment of a video (seconds); the quote is then the video's label. */
export interface NoteAnchor { section: string | null; quote: { exact: string; prefix: string; suffix: string }; t?: number }
export interface NoteMessage { id: string; role: 'user' | 'ai'; text: string; engine?: string; at: number; error?: string; done: boolean }
export type NoteColor = 'important' | 'confusing' | 'exam'
export interface Note { id: string; doc: string; anchor: NoteAnchor; body: string; thread: NoteMessage[]; created: number; updated: number; color?: NoteColor }
export interface EnginesInfo { local: { available: boolean; model: string; models: string[]; error?: string; busy: number }; claude: { available: boolean; version?: string; path?: string; error?: string } }

// ---- local AI models (Ollama)
export type ModelFit = 'good' | 'slow' | 'too-big'
export type ModelPurpose = 'tiny' | 'light' | 'newer-light' | 'default' | 'newer' | 'languages' | 'strong' | 'large'
export interface Hardware { memoryGb: number; gpu: { name: string; memoryGb: number } | null; unified: boolean }
export interface LocalModel { name: string; sizeGb: number; parameters?: string; embedding: boolean; fit: ModelFit }
export interface CatalogModel { name: string; sizeGb: number; memoryGb: number; purpose: ModelPurpose; installed: boolean; fit: ModelFit }
export interface ModelDownload { model: string; status: string; completed?: number; total?: number; error?: string; done: boolean }
export interface LocalAiInfo {
  ollama: { running: boolean; installed: boolean; version: string | null }
  install: { command: string | null; then: string | null; url: string }
  /** Not shown to other devices on the network. */
  hardware: Hardware | null
  chosen: string
  embedModel: string
  models: LocalModel[]
  catalog: CatalogModel[]
  download: ModelDownload | null
  claude: { available: boolean; version?: string; path?: string; error?: string }
}

// ---- AI jobs
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
export type JobEvent =
  | { kind: 'status'; status: JobStatus; message?: string }
  | { kind: 'text'; text: string }
  | { kind: 'tool'; label: string; path?: string }
  | { kind: 'file'; path: string; change: 'created' | 'modified' }
  | { kind: 'lint'; path: string; errors: number; warnings: number }
  | { kind: 'denied'; tool: string; reason: string }
  | { kind: 'usage'; turns: number; costUsd?: number; durationMs: number }
  | { kind: 'session'; sessionId: string }
  | { kind: 'limit'; message: string }
import type { CourseChanges, LostCard } from '@mdlearn/core'
export interface JobSummary {
  id: string; ws: string; recipe: string; title: string; status: JobStatus; engine: string
  created: number; finished?: number; summary?: string; error?: string
  files: { path: string; change: 'created' | 'modified' }[]
  lint: { path: string; errors: number; warnings: number }[]
  sessionId?: string; undone?: boolean; parent?: string
  /** What a change to a started course did to its cards. */
  changes?: CourseChanges
}

// ---- a course you have started
export interface CourseLesson { path: string; title: string; cards: number; seen: number; memory: number | null; paused: boolean; numbered: boolean }
export type LostCardInfo = LostCard
export interface CourseInfo { doc: string; lessons: CourseLesson[]; lost: LostCard[] }

// ---- Today, goals, leeches
export interface PaceInfo { scope: string; label: string; status: 'on-track' | 'behind' | 'overdue' | 'done'; deadline: string; daysLeft: number; remaining: number; perDay: number; daysBehind: number | null; text: string }
export interface LeechInfo { key: string; title: string; lessonTitle: string; lessonPath: string; lapses: number; wrongAnswers: string[]; sourceDoc?: string; sourceSection?: string }
export interface ConfusingPassage { id: string; doc: string; anchor: NoteAnchor; explained: boolean }
export interface TodayResponse {
  /** Passages you marked as confusing, to look at again. */
  confusing: ConfusingPassage[]
  plan: StudyPlan
  goal: { daily: number; doneToday: number; percent: number }
  forecast: { date: string; count: number }[]
  heatmap: { days: { date: string; count: number; level: number }[]; total: number; max: number }
  time: { sessions: number; today: { minutes: number }; last7Days: { minutes: number } }
  calibration: { sureRight: number; sureWrong: number; unsureRight: number; unsureWrong: number; answered: number; sureAccuracy: number | null; unsureAccuracy: number | null }
  leeches: LeechInfo[]
  paces: PaceInfo[]
  streak: number
  totals: { cards: number; seen: number; due: number; reviews: number }
  nextDueText: string | null
  /** ISO time of the next review (the browser phrases it in the interface language). */
  nextDue: string | null
  suspended: number
}
export interface GoalsInfo { dailyGoal: number; deadlines: { scope: string; date: string; label?: string }[]; suspended: string[] }

// ---- knowledge (formulas, glossary, links, map)
export interface KnowledgeStatus { total: number; indexed: number; building: boolean }
export interface SectionRefInfo { num: string | null; anchor: string; title: string }
export interface FormulaItem { id: string; tex: string; doc: string; docTitle: string; section: SectionRefInfo | null; line: number; lead: string }
export interface FormulasResponse { status: KnowledgeStatus; total: number; items: FormulaItem[]; docs: { path: string; title: string; count: number }[] }
export interface TermSource { doc: string; docTitle: string; section: SectionRefInfo | null; line: number; definition: string }
export interface GlossaryTerm { term: string; definition: string; sources: TermSource[] }
export interface GlossaryResponse { status: KnowledgeStatus; terms: GlossaryTerm[] }
export interface LinkedDoc { path: string; title: string; kind: 'link' | 'prereq'; count: number; exists: boolean }
export interface LinksResponse { outgoing: LinkedDoc[]; backlinks: LinkedDoc[] }
export interface DocSummary { path: string; title: string; level?: string; timeMin?: number; words: number; objectives: string[]; intro: string; lessons: number; memory: number | null; seen: number }
export interface MapNode { path: string; title: string; words: number; lessons: number; seen: number; memory: number | null; lessonList: { path: string; title: string }[] }
export interface MapResponse { status: KnowledgeStatus; nodes: MapNode[]; edges: { from: string; to: string; kind: 'link' | 'prereq' }[] }

// ---- ask your whole folder
export interface AskStatus {
  model: string; ollama: boolean; chatReady: boolean; installed: boolean; size: string
  pulling: { status: string; percent?: number } | null
  indexed: number; total: number; building: boolean
  /** The folder's documents are still being read (before any passage exists). */
  reading: boolean; error?: string
}
export interface AskSource { n: number; doc: string; docTitle: string; section: SectionRefInfo | null; line: number; snippet: string }
export type RelatedPassage = Omit<AskSource, 'n'>
export interface RelatedResponse { mode: 'meaning' | 'words'; passages: RelatedPassage[] }
export interface AskEntry { id: string; question: string; answer: string; at: number; mode: 'meaning' | 'words'; notice?: string; error?: string; done: boolean; sources: AskSource[] }

// ---- capture inbox
export interface InboxSource { label: string; url: string | null; doc: string | null; section: string | null }
export interface InboxItem { id: string; file: string; line: number; date: string; time: string | null; text: string; quote: string | null; source: InboxSource | null }
export interface InboxList { total: number; items: InboxItem[] }

// ---- cheat sheet
export interface SheetSection { num: string | null; anchor: string; title: string; depth: number; formulas: { tex: string; lead: string }[]; terms: { term: string; definition: string }[]; ideas?: string[] }
export interface SheetResponse {
  path: string; title: string; level?: string; timeMin?: number; objectives: string[]; sections: SheetSection[]; formulaCount: number; termCount: number
  ideas: { state: 'none' | 'running' | 'done' | 'error'; done: number; total: number; error?: string }
}

// ---- editor
export interface FileInfo { path: string; text: string; mtime: number; kind: 'doc' | 'lesson' | 'latex' }
export interface HistoryEntry { id: string; at: number; size: number }
export interface PreviewResponse { kind: 'doc' | 'lesson'; doc?: DocResponse; lesson?: LessonResponse; diagnostics: { code: string; line: number; message?: string }[] }

// ---- importers
export interface ImportedFile { path: string; kind: 'document' | 'lesson' | 'asset' | 'job' }
export interface ImportResult { files: ImportedFile[]; warnings: string[]; summary: string; /** A Claude job started for a high-quality import. */ jobId?: string; /** For a chat import with errors: the message that asks the chat to fix them. */ fix?: string }
/** SciNet, a private map of your paper library, as a place to import from. */
export interface ScinetStatus { url: string; running: boolean; version?: string; papers?: number }
export interface ScinetPaper { id: number; title: string; year: number | null; snippet?: string }
export interface ScinetDetail extends ScinetPaper { authors: string[]; venue: string | null; abstract: string | null; doi: string | null; arxivId: string | null; pages: number | null; parsedBy: string | null; formulas: 'latex' | 'text' }
/** MDlearn for other assistants: the prompt for chats, where the Claude Code plugin is, what can be downloaded. */
export interface Integrations { prompt: string; pluginDir?: string; skillZip: boolean; guide: boolean }
/** One class file brought into a course: where it is, what text came out of it, and anything the person should know. */
export interface ClassFile {
  name: string; path: string; kind: 'word' | 'slides' | 'pdf' | 'picture' | 'text' | 'other'
  /** The Markdown made from it. */ text?: string
  slides?: number; pictures?: number; skipped?: number; equations?: number
  problem?: 'old-format' | 'unknown-type' | 'no-text' | 'unreadable'
}
export interface ClassUpload { id: string; name: string; root: string; files: ClassFile[] }
/** What getting a folder ready for coding assistants wrote, and which of the person's own files it left alone. */
export interface PreparedFolder { written: string[]; kept: string[] }
export interface McpSetup { server: string; commands: { codex: string; pi: string; opencode: string } }
/** A pasted chat answer, checked before anything is written. */
export interface ChatCheck {
  folder: string
  files: { path: string; kind: 'lesson' | 'document'; cards: number; errors: number; warnings: number; lines: string[]; exists: boolean }[]
  fix: string
}

// ---- course for a whole folder
export interface BatchCandidate { path: string; title: string; words: number; lessons: number }
export interface BatchDoc extends BatchCandidate { status: 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'cancelled'; jobId?: string | undefined; note?: string }
export interface Batch { id: string; created: number; model: string; status: 'running' | 'stopped' | 'done'; docs: BatchDoc[]; error?: string }
