// Contract between the MDlearn Studio server and web app (imported with `import type` on both sides).
import type { DocModel, DocOutline, Diagnostic, Lesson, Block, PosedWidget, QueueItem, Checked, ReadRef, MdNode } from '@mdlearn/core'

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
  cards: number; seen: number; due: number
  /** Mean predicted recall of seen cards (FSRS), null when nothing has been studied. */
  memory: number | null
}
export interface Tree { root: string; name: string; docs: TreeDoc[]; orphanLessons: TreeDoc['lessons']; totals: { docs: number; lessons: number; cards: number; due: number; seen: number } }

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
export interface StudyItem { item: QueueItem; title: string; widget: PosedWidget; exposition: MdNode[]; reads: ReadRef[]; lessonPath: string }
export interface CheckResponse { checked: Checked }
export interface RecordResponse { rating: 1 | 2 | 3; word: string; meaning: string; next: { due: string; when: string } | null }

// ---- events (SSE)
export type ServerEvent =
  | { type: 'hello'; serverId: string; ws: string | null }
  | { type: 'fs.changed'; ws: string; paths: { path: string; kind: 'doc' | 'lesson' | 'asset' | 'other'; change: 'add' | 'change' | 'unlink' }[] }
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
export interface NoteAnchor { section: string | null; quote: { exact: string; prefix: string; suffix: string } }
export interface NoteMessage { id: string; role: 'user' | 'ai'; text: string; engine?: string; at: number; error?: string; done: boolean }
export interface Note { id: string; doc: string; anchor: NoteAnchor; body: string; thread: NoteMessage[]; created: number; updated: number }
export interface EnginesInfo { local: { available: boolean; model: string; models: string[]; error?: string; busy: number }; claude: { available: boolean; version?: string; error?: string } }

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
export interface JobSummary {
  id: string; ws: string; recipe: string; title: string; status: JobStatus; engine: string
  created: number; finished?: number; summary?: string; error?: string
  files: { path: string; change: 'created' | 'modified' }[]
  lint: { path: string; errors: number; warnings: number }[]
  sessionId?: string; undone?: boolean; parent?: string
}

// ---- Today, goals, leeches
export interface PaceInfo { scope: string; label: string; status: 'on-track' | 'behind' | 'overdue' | 'done'; deadline: string; daysLeft: number; remaining: number; perDay: number; daysBehind: number | null; text: string }
export interface LeechInfo { key: string; title: string; lessonTitle: string; lessonPath: string; lapses: number; wrongAnswers: string[]; sourceDoc?: string; sourceSection?: string }
export interface TodayResponse {
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
export interface MapNode { path: string; title: string; words: number; lessons: number; seen: number; memory: number | null }
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
export interface AskEntry { id: string; question: string; answer: string; at: number; mode: 'meaning' | 'words'; notice?: string; error?: string; done: boolean; sources: AskSource[] }

// ---- cheat sheet
export interface SheetSection { num: string | null; anchor: string; title: string; depth: number; formulas: { tex: string; lead: string }[]; terms: { term: string; definition: string }[]; ideas?: string[] }
export interface SheetResponse {
  path: string; title: string; level?: string; timeMin?: number; objectives: string[]; sections: SheetSection[]; formulaCount: number; termCount: number
  ideas: { state: 'none' | 'running' | 'done' | 'error'; done: number; total: number; error?: string }
}

// ---- editor
export interface FileInfo { path: string; text: string; mtime: number; kind: 'doc' | 'lesson' }
export interface HistoryEntry { id: string; at: number; size: number }
export interface PreviewResponse { kind: 'doc' | 'lesson'; doc?: DocResponse; lesson?: LessonResponse; diagnostics: { code: string; line: number; message?: string }[] }

// ---- importers
export interface ImportedFile { path: string; kind: 'document' | 'lesson' | 'asset' | 'job' }
export interface ImportResult { files: ImportedFile[]; warnings: string[]; summary: string; /** A Claude job started for a high-quality import. */ jobId?: string }

// ---- course for a whole folder
export interface BatchCandidate { path: string; title: string; words: number; lessons: number }
export interface BatchDoc extends BatchCandidate { status: 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'cancelled'; jobId?: string | undefined; note?: string }
export interface Batch { id: string; created: number; model: string; status: 'running' | 'stopped' | 'done'; docs: BatchDoc[]; error?: string }
